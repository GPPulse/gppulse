import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { aiConfigured, chat } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Firecrawl search queries grouped by newsletter section — kept lean for speed
const SECTION_QUERIES: { section: string; queries: string[] }[] = [
  {
    section: "headline",
    queries: [
      "North America private equity lower middle market fund deal announcement 2026",
    ],
  },
  {
    section: "fund_tracker",
    queries: [
      "North America private equity fund raise close under 1 billion middle market 2026",
    ],
  },
  {
    section: "market_insight",
    queries: [
      "North America private equity market trends outlook lower middle market 2026",
    ],
  },
  {
    section: "deal_flow",
    queries: [
      "North America private equity acquisition platform add-on middle market deal 2026",
    ],
  },
];

interface ArticleCandidate {
  title: string;
  summary: string;
  category: string;
  source: string;
  source_url: string;
  relevance_score: number;
  fund_size_relevant: boolean;
}

async function searchFirecrawl(
  apiKey: string,
  query: string
): Promise<Array<{ url: string; title: string; markdown?: string }>> {
  try {
    console.log(`[Firecrawl] Searching: "${query}"`);
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        tbs: "qdr:d3", // Last 3 days
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!response.ok) {
      console.error(`[Firecrawl] Search error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data.data || [];
    console.log(`[Firecrawl] Got ${results.length} results for "${query}"`);
    return results;
  } catch (error) {
    console.error(`[Firecrawl] Search exception:`, error);
    return [];
  }
}

async function extractArticles(
  content: string,
  sourceUrl: string,
  sourceName: string,
  targetSection: string,
  aiApiKey: string
): Promise<ArticleCandidate[]> {
  try {
    const response = await (async () => {
      const __text = await chat("", `You are a private equity news analyst for a North American lower middle market (funds < $1B) newsletter called "The GP Pulse". Today is ${new Date().toISOString().split("T")[0]}.

Analyze the content and extract DISTINCT news items relevant to the "${targetSection}" section.

Section definitions:
- headline: Major PE buyouts, exits, add-on acquisitions, fund closings. NOT partnerships, vendor deals, or strategic alliances without equity change.
- fund_tracker: New fund launches, first/final closes, capital raises, LP commitments — MUST include a dollar amount AND be under $1B.
- market_insight: Trends, analysis pieces, valuation environment, fundraising climate, sector outlooks
- deal_flow: PE-sponsored acquisitions, add-ons, platform investments, exits, recapitalizations. MUST involve equity ownership change. NOT cybersecurity partnerships, technology vendor partnerships, marketing partnerships, or channel partnerships.

CRITICAL RULES — EXCLUDE (score 0) if ANY apply:
- Non-North American (non-US/Canada) content
- Mega-cap PE firms: Apollo, Blackstone, KKR, Carlyle, TPG, Ares, Bain Capital, Warburg Pincus, Advent International, Thoma Bravo, Vista Equity, Silver Lake, Hellman & Friedman, Leonard Green, General Atlantic, CVC, EQT, Permira, Cinven, Apax, Brookfield, Blue Owl
- Fund raises over $1B
- "Partnerships" without equity ownership change (cybersecurity, technology, marketing, vendor, channel partnerships)
- Law firms, accounting firms, consulting firms, investment banks
- Articles older than 5 days
- Generic business news not specifically about PE transactions or fundraising

Return a JSON array:
[{
  "title": "Concise headline (max 15 words)",
  "summary": "2-3 sentence summary of the key details",
  "relevance_score": 0-100,
  "fund_size_relevant": true/false
}]

Return ONLY the JSON array.`, content.slice(0, 10000), { temperature: 0.2, maxTokens: 3000 });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: __text } }] }), text: async () => "" };
    })();

    if (!response.ok) {
      console.error("[AI] Extract failed:", response.status);
      return [];
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const items = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      summary: string;
      relevance_score: number;
      fund_size_relevant: boolean;
    }>;

    return items
      .filter((i) => i.relevance_score >= 25)
      .map((i) => ({
        title: i.title,
        summary: i.summary,
        category: targetSection,
        source: sourceName,
        source_url: sourceUrl,
        relevance_score: Math.min(100, Math.max(0, i.relevance_score)),
        fund_size_relevant: i.fund_size_relevant,
      }));
  } catch (error) {
    console.error("[AI] Extract exception:", error);
    return [];
  }
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
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      throw new Error("FIRECRAWL_API_KEY not configured");
    }

    const lovableApiKey = aiConfigured() ? "configured" : "";
    if (!lovableApiKey) {
      throw new Error("No AI provider configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const allCandidates: ArticleCandidate[] = [];
    const sectionCounts: Record<string, number> = {};

    // Process ALL sections in parallel for speed
    const sectionResults = await Promise.all(
      SECTION_QUERIES.map(async ({ section, queries }) => {
        console.log(`\n=== Searching for ${section} content ===`);
        let sectionArticles: ArticleCandidate[] = [];

        for (const query of queries) {
          if (sectionArticles.length >= 5) break;

          const results = await searchFirecrawl(firecrawlKey, query);

          // Process top 2 results per query for speed
          for (const result of results.slice(0, 2)) {
            if (!result.markdown || result.markdown.length < 100) continue;

            const sourceName = extractSourceName(result.url);
            const articles = await extractArticles(
              result.markdown,
              result.url,
              sourceName,
              section,
              lovableApiKey
            );
            sectionArticles.push(...articles);
          }
        }

        const uniqueArticles = deduplicateByTitle(sectionArticles);
        console.log(`[${section}] Found ${uniqueArticles.length} unique articles`);
        return { section, articles: uniqueArticles };
      })
    );

    for (const { section, articles } of sectionResults) {
      sectionCounts[section] = articles.length;
      allCandidates.push(...articles);
    }

    // Store articles in the database
    let articlesCreated = 0;
    for (const candidate of allCandidates) {
      try {
        // Check for existing similar title
        const { data: existing } = await supabase
          .from("articles")
          .select("id")
          .eq("category", candidate.category)
          .ilike("title", `%${candidate.title.split(" ").slice(0, 4).join(" ")}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`Skipping duplicate: ${candidate.title}`);
          continue;
        }

        const { error: insertError } = await supabase.from("articles").insert({
          title: candidate.title,
          summary: candidate.summary,
          category: candidate.category,
          source: candidate.source,
          source_url: candidate.source_url,
          fund_size_relevant: candidate.fund_size_relevant,
          relevance_score: candidate.relevance_score,
          scraped_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error(`Insert error: ${insertError.message}`);
        } else {
          articlesCreated++;
        }
      } catch (error) {
        console.error(`Error storing article:`, error);
      }
    }

    console.log(`\nTotal articles created: ${articlesCreated}`);

    return new Response(
      JSON.stringify({
        message: `Industry news scrape complete: ${articlesCreated} articles created`,
        total_found: allCandidates.length,
        articles_created: articlesCreated,
        by_section: sectionCounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Industry news scraping error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    const nameMap: Record<string, string> = {
      "pehub.com": "PE Hub",
      "pitchbook.com": "PitchBook",
      "buyoutsinsider.com": "Buyouts Insider",
      "middlemarketgrowth.org": "Middle Market Growth",
      "themiddlemarket.com": "Mergers & Acquisitions",
      "privateequityinternational.com": "PEI",
      "reuters.com": "Reuters",
      "bloomberg.com": "Bloomberg",
      "wsj.com": "Wall Street Journal",
      "ft.com": "Financial Times",
      "prnewswire.com": "PR Newswire",
      "businesswire.com": "BusinessWire",
      "globenewswire.com": "GlobeNewswire",
      "privateequitywire.co.uk": "PE Wire",
      "axios.com": "Axios",
      "fortune.com": "Fortune",
      "mckinsey.com": "McKinsey",
      "bain.com": "Bain & Company",
    };
    return nameMap[hostname] || hostname;
  } catch {
    return "Web";
  }
}

function deduplicateByTitle(articles: ArticleCandidate[]): ArticleCandidate[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    // Normalize: lowercase, remove common words
    const normalized = a.title
      .toLowerCase()
      .replace(/\b(the|a|an|and|or|for|in|of|to|with)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalized.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
