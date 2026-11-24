import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { aiConfigured, chat } from "../_shared/ai.ts";
import { urlDate } from "../_shared/tracker.ts";

/** A publish date for an item the crawler could not date. Null when nothing says. Never today by default. */
function publishedFrom(estimated: string | null, url: string): string | null {
  for (const d of [estimated, urlDate(url)]) {
    if (!d) continue;
    const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d);
    if (!isNaN(t.getTime()) && t.getTime() < Date.now() + 864e5 && t.getUTCFullYear() >= 2000) return t.toISOString();
  }
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessedArticle {
  title: string;
  summary: string;
  category: string;
  fund_size_relevant: boolean;
  relevance_score: number;
  estimated_publish_date: string | null;
  moves: PersonMove[];
}

// One person's move read out of a people item. A release that names six promotions gives six.
interface PersonMove { person: string; firm: string; move_type: string; new_title: string | null; old_title: string | null }

const MOVE_TYPES = new Set(["promotion", "hire", "departure"]);
function cleanMoves(raw: unknown): PersonMove[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return raw.slice(0, 25).map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    return { person: str(r.person, 80) ?? "", firm: str(r.firm, 120) ?? "", move_type: String(r.move_type ?? "").toLowerCase(), new_title: str(r.new_title, 90), old_title: str(r.old_title, 90) };
  }).filter((m) => m.person.split(/\s+/).length >= 2 && m.firm && MOVE_TYPES.has(m.move_type));
}
// Same key the team-page watch uses (firm-watch/src/team.mjs), so the two routes meet on one person.
const personKey = (name: string) => name.toLowerCase().replace(/"[^"]*"|\([^)]*\)/g, " ").replace(/,?\s+(jr|sr|ii|iii|iv)\b\.?/i, " ")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s-]/g, "").split(/\s+/).filter((w) => w.length > 1).join(" ");

// Whole-phrase match of watchlist firm names in a headline or release. Names that are a single
// word or very short only count next to a private-equity cue, to keep false matches out.
function buildWatchlistMatcher(names: string[]): (text: string) => string | null {
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entries = names.map((name) => {
    const weak = name.trim().split(/\s+/).length === 1 || name.length < 9 || !/(capital|partners|equity|group|holdings|investments?|ventures|management|advisors|associates|industries|fund|company|&)/i.test(name);
    return { name, weak, re: new RegExp(`(^|[^A-Za-z0-9])${esc(name).replace(/\\?&/g, "(&|and)").replace(/\s+/g, "\\s+")}([^A-Za-z0-9]|$)`, weak ? "" : "i") };
  });
  const cue = /private equity|investment firm|portfolio company|buyout|middle[- ]market|backed by|family office|private investment/i;
  return (text) => entries.find((e) => e.re.test(text) && (!e.weak || cue.test(text)))?.name ?? null;
}

async function processWithAI(content: string, title: string, apiKey: string, watchlistFirm: string | null = null): Promise<ProcessedArticle | null> {
  try {
    const response = await (async () => {
      const __text = await chat("", `You are a private equity news analyst focused on NORTH AMERICAN LOWER MIDDLE MARKET (US and Canada, funds/deals under $1B) only. Today's date is ${new Date().toISOString().split('T')[0]}. Analyze the following article and provide:
1. A concise 2-3 sentence summary focused on the key PE-relevant details
2. A category (MUST be one of these exact values: "headline", "fund_tracker", "people_moves", "deal_flow", "market_insight")
   - headline: Major PE buyouts, exits, add-on acquisitions, fund closings involving lower middle market firms
   - fund_tracker: New fund raises, fund closings, capital commitments — MUST be under $1B
   - people_moves: Promotions to Senior Associate, Vice President, Principal, Director, Managing Director or Partner, hires and departures at those levels, and team changes ONLY at private equity firms, growth equity firms, investment banks, or PE-backed portfolio companies. NOT law firms, lawyers, accounting firms, consulting firms, recruiters, or other professional services.
   - deal_flow: PE-sponsored acquisitions, exits, add-on acquisitions, recapitalizations, platform investments. NOT generic partnerships, vendor agreements, technology integrations, cybersecurity deals, or marketing partnerships.
   - market_insight: Market trends, analysis, economic impact on PE
3. Whether this is relevant to lower middle market PE (funds under $1B) - true/false. Set FALSE for mega-cap PE firms.
4. A relevance score from 0-100 based on how valuable this is for North American LMM PE professionals
5. The estimated publication date of this article in YYYY-MM-DD format. Look for dates in the URL, content, or any date indicators. If you cannot determine the date, return null.
6. ONLY when the category is people_moves: a "moves" list with one entry for EVERY person the article says was promoted, hired or has left, at a private equity firm or investment bank. Use the titles exactly as written. old_title is the title held before the move at the same firm (null if not stated). For every other category return an empty list. Never guess a person or a title that is not in the text.

CRITICAL FILTERING RULES — score 0 if ANY apply:
- Non-North American firm, fund, or deal (European, Asian, Latin American, Middle Eastern, African)
- Latin America, Europe, Asia, Africa, or any non-US/Canada geography is the primary focus
- People moves at law firms, lawyers, accounting firms, consulting firms, recruiters, or ANY non-PE/non-investment-banking firm
- "Partnerships" that are NOT equity transactions (cybersecurity partnerships, technology vendor partnerships, marketing partnerships, channel partnerships, strategic alliances that don't involve equity ownership)
- Article is more than 7 days old
- LARGE SPONSORS: if the sponsor's flagship fund is over $2B (upper middle market and up — e.g. Genstar, Audax, H.I.G., Clayton Dubilier & Rice, Platinum Equity, Clearlake, New Mountain, American Securities, Madison Dearborn, GTCR, Veritas) and no smaller sponsor is the buyer or seller, cap the relevance score at 35. Our readers run funds under $2B.
- MEGA-CAP PE FIRMS (these are NOT lower middle market): Apollo, Blackstone, KKR, Carlyle, TPG, Ares, Bain Capital, Warburg Pincus, Advent International, Thoma Bravo, Vista Equity, Silver Lake, Hellman & Friedman, Leonard Green, General Atlantic, CVC Capital, EQT, Permira, Cinven, Apax, Brookfield Asset Management, Blue Owl. Score these 0 for fund_tracker and headline; may score >0 for market_insight only if the insight is broadly applicable.

DEAL vs PARTNERSHIP distinction:
- A "deal" involves equity ownership change: acquisition, buyout, exit, recapitalization, add-on, platform investment
- A "partnership" without equity change is NOT a deal — score 0 for headline and deal_flow categories

Respond in JSON format only:
{
  "summary": "...",
  "category": "headline" | "fund_tracker" | "people_moves" | "deal_flow" | "market_insight",
  "fund_size_relevant": true/false,
  "relevance_score": 0-100,
  "estimated_publish_date": "YYYY-MM-DD" or null,
  "moves": [{ "person": "Full Name", "firm": "Firm name", "move_type": "promotion" | "hire" | "departure", "new_title": "..." or null, "old_title": "..." or null }]
}`, `Title: ${title}\n\nContent: ${content}${watchlistFirm ? `\n\nEditor's note: ${watchlistFirm} is on our watchlist of US middle-market private equity firms (AUM under $2B). News about its deals, exits, fund closes and promotions is core coverage: set fund_size_relevant true, and score a genuine transaction, fund close or senior promotion at this firm 75 or higher.` : ""}`, { temperature: 0.3, maxTokens: 1200 });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: __text } }] }), text: async () => "" };
    })();

    if (!response.ok) {
      console.error("AI processing failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const responseText = data.choices[0]?.message?.content || "";
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.relevance_score) || 0;
      // Ensure category is valid
      const validCategories = ['headline', 'fund_tracker', 'people_moves', 'deal_flow', 'market_insight'];
      let category = (parsed.category || 'headline').toLowerCase().replace(/\s+/g, '_');
      if (!validCategories.includes(category)) {
        // Map common AI responses to valid categories
        if (category.includes('exit') || category.includes('deal') || category.includes('acquisition') || category.includes('portfolio')) {
          category = 'deal_flow';
        } else if (category.includes('fund') || category.includes('raise')) {
          category = 'fund_tracker';
        } else if (category.includes('people') || category.includes('hire') || category.includes('move')) {
          category = 'people_moves';
        } else if (category.includes('market') || category.includes('insight')) {
          category = 'market_insight';
        } else {
          category = 'headline';
        }
      }
      return {
        title,
        summary: parsed.summary || "No summary available.",
        category,
        fund_size_relevant: Boolean(parsed.fund_size_relevant),
        relevance_score: Math.min(100, Math.max(0, Math.round(score))),
        estimated_publish_date: parsed.estimated_publish_date || null,
        moves: category === "people_moves" ? cleanMoves(parsed.moves) : [],
      };
    }
    
    return null;
  } catch (error) {
    console.error("AI processing error:", error);
    return null;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = aiConfigured() ? "configured" : "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let limit = 20; // Process 20 items per run
    
    try {
      const body = await req.json();
      limit = body.limit || 20;
    } catch {
      // No body provided
    }

    // Fetch unprocessed scraped content
    const { data: content, error: contentError } = await supabase
      .from("scraped_content")
      .select("*, pe_firm_sources(name, website_url, watchlist)")
      .eq("processed", false)
      .order("scraped_at", { ascending: true })
      .limit(limit);

    if (contentError) {
      throw new Error(`Failed to fetch content: ${contentError.message}`);
    }

    if (!content || content.length === 0) {
      return new Response(
        JSON.stringify({ message: "No content to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${content.length} items`);

    let processed = 0;
    let articlesCreated = 0;

    // Watchlist firm names, for spotting them in wire releases and news-search items.
    // Paged: the API returns at most 1,000 rows per request, and the watchlist is past 1,500.
    const watchNames: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase.from("pe_firm_sources").select("name").eq("watchlist", true).eq("is_active", true).order("id").range(from, from + 999);
      watchNames.push(...(page ?? []).map((r: { name: string }) => r.name));
      if ((page ?? []).length < 1000) break;
    }
    const matchWatchlist = buildWatchlistMatcher(watchNames);

    for (const item of content) {
      try {
        // Cheap pre-check: if a near-identical title already became an article, skip the AI call entirely.
        {
          const preCutoff = new Date(); preCutoff.setDate(preCutoff.getDate() - 7);
          const { data: recent } = await supabase.from("articles").select("title").gte("created_at", preCutoff.toISOString()).order("created_at", { ascending: false }).limit(400);
          const nw = (item.title ?? "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
          const dup = nw.length >= 4 && (recent ?? []).some((r: { title: string }) => {
            const ew = new Set(r.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
            return nw.filter((w: string) => ew.has(w)).length / nw.length > 0.7;
          });
          if (dup) {
            await supabase.from("scraped_content").update({ processed: true, processed_at: new Date().toISOString() }).eq("id", item.id);
            processed++;
            continue;
          }
        }
        // Process with AI
        const watchlistFirm: string | null = item.pe_firm_sources?.watchlist
          ? item.pe_firm_sources.name
          : matchWatchlist(`${item.title ?? ""} ${(item.raw_content ?? "").slice(0, 1500)}`);
        const result = await processWithAI(
          item.raw_content || item.title || "",
          item.title || "Untitled",
          lovableApiKey,
          watchlistFirm
        );

        console.log(`AI result for "${item.title}": score=${result?.relevance_score}, category=${result?.category}`);
        
        if (result && result.relevance_score >= 20) {
          // Check for duplicate articles from the same source/firm
          // Check for duplicate articles across ALL articles (including previously sent newsletters)
          const sourceName = item.pe_firm_sources?.name || item.source_name || (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return "Unknown"; } })();
          const dupCutoff = new Date();
          dupCutoff.setDate(dupCutoff.getDate() - 14); // Check last 14 days for duplicates
          // Across ALL sources: the same press release arrives from the wire, a news search and the firm's own feed.
          const { data: existingArticles } = await supabase
            .from("articles")
            .select("id, title")
            .gte("created_at", dupCutoff.toISOString())
            .order("created_at", { ascending: false })
            .limit(400);

          // Skip if a similar title from the same firm already exists
          const isDuplicate = existingArticles?.some(existing => {
            const existingLower = existing.title.toLowerCase();
            const newLower = result.title.toLowerCase();
            // Check for exact match or high overlap (>70% of words shared)
            if (existingLower === newLower) return true;
            const existingWords = new Set(existingLower.split(/\s+/).filter((w: string) => w.length > 3));
            const newWords = newLower.split(/\s+/).filter((w: string) => w.length > 3);
            if (newWords.length === 0) return false;
            const overlap = newWords.filter((w: string) => existingWords.has(w)).length;
            return overlap / newWords.length > 0.7;
          });

          if (isDuplicate) {
            console.log(`Skipping duplicate from ${sourceName}: ${result.title}`);
            // Mark as processed but don't create article
            await supabase
              .from("scraped_content")
              .update({ processed: true, processed_at: new Date().toISOString() })
              .eq("id", item.id);
            processed++;
            continue;
          }

          // Create article record
          console.log(`Creating article for: ${result.title}`);
          const { data: article, error: articleError } = await supabase
            .from("articles")
            .insert({
              title: result.title,
              summary: result.summary,
              category: result.category,
              fund_size_relevant: result.fund_size_relevant,
              relevance_score: result.relevance_score,
              watchlist_firm: watchlistFirm,
              source: sourceName,
              source_url: item.url,
              original_content: item.raw_content,
              scraped_at: item.scraped_at,
              // The crawler's date, else the classifier's reading of the text, else the date in the address.
              published_at: item.published_at ?? publishedFrom(result.estimated_publish_date, item.url),
            })
            .select()
            .single();

          if (articleError) {
            console.error(`Failed to insert article: ${articleError.message}`);
          }

          if (!articleError && article) {
            console.log(`Article created: ${article.id}`);
            articlesCreated++;
            
            // Keep each named person as a row of their own. The team-page watch checks these
            // before reporting a promotion, so an announced move is not reported twice.
            if (result.moves.length) {
              const rows = result.moves.map((m) => ({
                firm_id: item.pe_firm_sources?.watchlist && item.pe_firm_sources.name.toLowerCase() === m.firm.toLowerCase() ? item.source_id : null,
                firm_name: m.firm, person_name: m.person, person_key: personKey(m.person), move_type: m.move_type,
                old_title: m.old_title, new_title: m.new_title, source: "announcement", source_url: item.url, status: "published", article_id: article.id,
                move_key: `${m.firm.toLowerCase()}|${personKey(m.person)}|${m.move_type}|${(m.new_title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`,
              })).filter((r) => r.person_key);
              const { error: movesError } = await supabase.from("people_moves").upsert(rows, { onConflict: "move_key", ignoreDuplicates: true });
              if (movesError) console.error(`people_moves insert failed: ${movesError.message}`);
            }

            // Link scraped content to article
            await supabase
              .from("scraped_content")
              .update({ 
                processed: true, 
                processed_at: new Date().toISOString(),
                article_id: article.id 
              })
              .eq("id", item.id);
          }
        } else if (result) {
          // Low relevance: mark as processed, no article
          await supabase
            .from("scraped_content")
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq("id", item.id);
        } else {
          // AI call failed: leave unprocessed so the next run retries it
          console.warn(`AI unavailable for "${item.title}" — will retry next run`);
          continue;
        }

        processed++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${processed} items, created ${articlesCreated} articles`,
        processed,
        articles_created: articlesCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Processing error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
