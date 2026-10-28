import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { aiConfigured, chat } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SectorEntry {
  sector: string;
  count: number;
  percentage: number;
}

interface DealTypeEntry {
  type: string;
  count: number;
  percentage: number;
}

interface TrendSignal {
  direction: "up" | "down" | "neutral";
  metric: string;
  description: string;
}

interface AIExtractedMetrics {
  deals: Array<{
    deal_value_millions?: number;
    ev_ebitda_multiple?: number;
    sector?: string;
    deal_type?: string;
  }>;
  funds: Array<{
    target_size_millions?: number;
    close_timeline_months?: number;
  }>;
  sectors: string[];
  trend_signals: TrendSignal[];
  narrative_summary: string;
}

async function extractMetricsWithAI(
  articles: Array<{ title: string; summary: string | null; category: string | null; source: string }>,
  apiKey: string
): Promise<AIExtractedMetrics> {
  const articlesText = articles
    .map((a, i) => `[${i + 1}] [${a.category}] ${a.title}\n${a.summary || ""}`)
    .join("\n\n");

  try {
    const response = await (async () => {
      const __text = await chat("", `You are a quantitative PE analyst. Extract structured deal metrics from these PE industry articles for the "GP Pulse Index" — a proprietary weekly tracker of lower middle market private equity activity.

From the articles, extract:
1. **deals**: Any mentioned acquisitions, exits, or investments. For each, estimate deal_value_millions (if mentioned or can be inferred), ev_ebitda_multiple (if mentioned), sector (e.g., "Technology", "Healthcare", "Industrials", "Business Services", "Consumer", "Financial Services", "Energy"), and deal_type ("buyout", "add-on", "growth_equity", "exit", "recapitalization", "carve-out").
2. **funds**: Any fund raises or closings. For each, estimate target_size_millions and close_timeline_months (if mentioned).
3. **sectors**: List of all PE-relevant sectors mentioned across articles.
4. **trend_signals**: 2-4 key trends observed (direction: "up"/"down"/"neutral", metric name, and brief description).
5. **narrative_summary**: A 3-4 sentence executive summary of this week's LMM PE market activity. Be data-driven, cite specific numbers where possible, and note notable shifts. This should read like a Bloomberg brief.

Use ONLY figures explicitly stated in the articles. If a deal value, multiple, or fund size is not stated, return null for that field. Never estimate or infer numbers — readers are practitioners who will spot invented multiples, and the index's credibility depends on it. Counts (deal_count, funds_in_market) and sector/deal-type classifications are fine to populate from every article; dollar figures and multiples are not. In narrative_summary, describe the sample honestly ("of 14 deals tracked, 3 disclosed EV").

Respond ONLY with valid JSON matching this schema:
{
  "deals": [{"deal_value_millions": number|null, "ev_ebitda_multiple": number|null, "sector": string, "deal_type": string}],
  "funds": [{"target_size_millions": number|null, "close_timeline_months": number|null}],
  "sectors": [string],
  "trend_signals": [{"direction": "up"|"down"|"neutral", "metric": string, "description": string}],
  "narrative_summary": string
}`, `Extract GP Pulse Index metrics from these ${articles.length} articles:\n\n${articlesText}`, { temperature: 0.3, maxTokens: 2000 });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: __text } }] }), text: async () => "" };
    })();

    if (!response.ok) {
      console.error("AI metrics extraction failed:", response.status);
      return { deals: [], funds: [], sectors: [], trend_signals: [], narrative_summary: "" };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("Metrics extraction error:", error);
  }

  return { deals: [], funds: [], sectors: [], trend_signals: [], narrative_summary: "" };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  {
    const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!isInternalCall(req) && !(await getStaff(req, _sb))) return unauthorized(corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = aiConfigured() ? "configured" : "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine the current week (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    console.log(`Generating GP Pulse Index for week: ${weekStartStr} to ${weekEndStr}`);

    // Fetch articles from this week
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("title, summary, category, source, relevance_score, created_at")
      .gte("scraped_at", weekStart.toISOString())
      .lte("scraped_at", weekEnd.toISOString() + "T23:59:59Z")
      .order("relevance_score", { ascending: false })
      .limit(100);

    if (articlesError) {
      throw new Error(`Failed to fetch articles: ${articlesError.message}`);
    }

    if (!articles || articles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No articles found for this week", week: weekStartStr }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${articles.length} articles for index generation`);

    // Extract metrics using AI
    const metrics = await extractMetricsWithAI(articles, lovableApiKey);

    // Calculate aggregated stats
    const dealCount = metrics.deals.length;
    const dealsWithValue = metrics.deals.filter((d) => d.deal_value_millions != null);
    const totalDealValue = dealsWithValue.reduce((sum, d) => sum + (d.deal_value_millions || 0), 0);
    const avgDealSize = dealsWithValue.length > 0 ? totalDealValue / dealsWithValue.length : null;

    const dealsWithMultiple = metrics.deals.filter((d) => d.ev_ebitda_multiple != null);
    const multiples = dealsWithMultiple.map((d) => d.ev_ebitda_multiple!).sort((a, b) => a - b);
    const avgMultiple = multiples.length > 0 ? multiples.reduce((a, b) => a + b, 0) / multiples.length : null;
    const medianMultiple =
      multiples.length > 0
        ? multiples.length % 2 === 0
          ? (multiples[multiples.length / 2 - 1] + multiples[multiples.length / 2]) / 2
          : multiples[Math.floor(multiples.length / 2)]
        : null;

    const fundsInMarket = metrics.funds.length;
    const fundsWithTarget = metrics.funds.filter((f) => f.target_size_millions != null);
    const totalFundTarget = fundsWithTarget.reduce((sum, f) => sum + (f.target_size_millions || 0), 0);
    const fundsWithTimeline = metrics.funds.filter((f) => f.close_timeline_months != null);
    const avgCloseMonths =
      fundsWithTimeline.length > 0
        ? fundsWithTimeline.reduce((sum, f) => sum + (f.close_timeline_months || 0), 0) / fundsWithTimeline.length
        : null;

    // Sector breakdown
    const sectorCounts: Record<string, number> = {};
    for (const deal of metrics.deals) {
      if (deal.sector) {
        sectorCounts[deal.sector] = (sectorCounts[deal.sector] || 0) + 1;
      }
    }
    const sectorBreakdown: SectorEntry[] = Object.entries(sectorCounts)
      .map(([sector, count]) => ({
        sector,
        count,
        percentage: dealCount > 0 ? Math.round((count / dealCount) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Deal type breakdown
    const typeCounts: Record<string, number> = {};
    for (const deal of metrics.deals) {
      if (deal.deal_type) {
        typeCounts[deal.deal_type] = (typeCounts[deal.deal_type] || 0) + 1;
      }
    }
    const dealTypeBreakdown: DealTypeEntry[] = Object.entries(typeCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: dealCount > 0 ? Math.round((count / dealCount) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Get previous week's data for WoW changes
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().split("T")[0];

    const { data: prevIndex } = await supabase
      .from("gp_pulse_index")
      .select("deal_count, total_deal_value_millions")
      .eq("week_start", prevWeekStartStr)
      .maybeSingle();

    const dealCountWow =
      prevIndex && prevIndex.deal_count > 0
        ? Math.round(((dealCount - prevIndex.deal_count) / prevIndex.deal_count) * 100)
        : null;
    const dealValueWow =
      prevIndex && prevIndex.total_deal_value_millions && prevIndex.total_deal_value_millions > 0 && totalDealValue > 0
        ? Math.round(((totalDealValue - Number(prevIndex.total_deal_value_millions)) / Number(prevIndex.total_deal_value_millions)) * 100)
        : null;

    // Upsert the index
    const indexData = {
      week_start: weekStartStr,
      week_end: weekEndStr,
      deal_count: dealCount,
      total_deal_value_millions: totalDealValue > 0 ? totalDealValue : null,
      avg_deal_size_millions: avgDealSize ? Math.round(avgDealSize * 10) / 10 : null,
      avg_ev_ebitda_multiple: avgMultiple ? Math.round(avgMultiple * 10) / 10 : null,
      median_ev_ebitda_multiple: medianMultiple ? Math.round(medianMultiple * 10) / 10 : null,
      funds_in_market: fundsInMarket,
      total_fund_target_millions: totalFundTarget > 0 ? totalFundTarget : null,
      avg_fund_close_months: avgCloseMonths ? Math.round(avgCloseMonths * 10) / 10 : null,
      sector_breakdown: sectorBreakdown,
      deal_type_breakdown: dealTypeBreakdown,
      deal_count_wow_change: dealCountWow,
      deal_value_wow_change: dealValueWow,
      narrative_summary: metrics.narrative_summary || null,
      trend_signals: metrics.trend_signals || [],
      source_article_count: articles.length,
    };

    const { data: index, error: indexError } = await supabase
      .from("gp_pulse_index")
      .upsert(indexData, { onConflict: "week_start" })
      .select()
      .single();

    if (indexError) {
      throw new Error(`Failed to upsert index: ${indexError.message}`);
    }

    console.log(`GP Pulse Index generated: ${dealCount} deals, ${fundsInMarket} funds, ${sectorBreakdown.length} sectors`);

    return new Response(
      JSON.stringify({
        message: `GP Pulse Index generated for week of ${weekStartStr}`,
        index_id: index.id,
        deal_count: dealCount,
        funds_in_market: fundsInMarket,
        sectors: sectorBreakdown.length,
        source_articles: articles.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("GP Pulse Index error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
