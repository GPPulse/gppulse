import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { aiConfigured, chat } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PeopleMove {
  name: string;
  title: string;
  firm: string;
  previousFirm?: string;
  moveType: string; // "promotion", "hire", "departure", "appointment"
  summary: string;
  sourceUrl: string;
  source: string;
}

// PE news sites known for people moves coverage
const PEOPLE_MOVES_SOURCES = [
  { url: "https://www.pehub.com/personnel-moves/", name: "PE Hub" },
  { url: "https://www.buyoutsinsider.com/people/", name: "Buyouts Insider" },
  { url: "https://www.prnewswire.com/news-releases/financial-services-latest-news/private-equity-list/", name: "PR Newswire" },
  { url: "https://www.businesswire.com/portal/site/home/news/", name: "BusinessWire" },
  { url: "https://pitchbook.com/news", name: "PitchBook News" },
  { url: "https://www.privateequitywire.co.uk/people-moves/", name: "PE Wire" },
];

// Broader search queries for better coverage
const SEARCH_QUERIES = [
  "North America private equity partner promotion hire appointment 2026 lower middle market",
  "US middle market PE firm managing director principal hire 2026",
  "North America private equity portfolio company CEO CFO appointment 2026",
];

async function scrapeWithFirecrawl(apiKey: string, url: string): Promise<string | null> {
  try {
    console.log(`[Firecrawl] Scraping: ${url}`);
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Firecrawl] Error scraping ${url}: ${response.status} - ${errText}`);
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || null;
    if (markdown) {
      console.log(`[Firecrawl] Got ${markdown.length} chars from ${url}`);
    }
    return markdown;
  } catch (error) {
    console.error(`[Firecrawl] Exception scraping ${url}:`, error);
    return null;
  }
}

async function searchWithFirecrawl(apiKey: string, query: string): Promise<Array<{ url: string; title: string; markdown?: string }>> {
  try {
    console.log(`[Firecrawl] Searching: "${query}"`);
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        tbs: "qdr:w", // Last week
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!response.ok) {
      console.error(`[Firecrawl] Search error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data.data || [];
    console.log(`[Firecrawl] Search returned ${results.length} results for "${query}"`);
    return results;
  } catch (error) {
    console.error(`[Firecrawl] Search exception:`, error);
    return [];
  }
}

async function extractPeopleMoves(content: string, sourceName: string, sourceUrl: string, aiApiKey: string): Promise<PeopleMove[]> {
  try {
    // Log preview of content for debugging
    console.log(`[AI] Extracting from ${sourceName}, content preview: ${content.slice(0, 300)}...`);

    const response = await (async () => {
      const __text = await chat("", `You are a private equity industry analyst specializing in tracking personnel changes at NORTH AMERICAN (US and Canada) firms only. Your task is to extract people moves from the content below. Look for:

- New hires, promotions, appointments at North American PE firms, growth equity firms, investment banks, or PE-backed portfolio companies
- Managing directors, partners, principals, VPs, associates joining or leaving PE or investment banking firms
- C-suite changes (CEO, CFO, COO, CTO) at PE-backed companies in the US or Canada
- Board appointments at North American PE firms or portfolio companies

STRICTLY EXCLUDE — do NOT extract moves for:
- Lawyers, attorneys, legal counsel, law firms, or anyone at an LLP
- Accountants, auditors, or accounting firms (Deloitte, KPMG, PwC, EY)
- Management consultants or consulting firms (McKinsey, Bain & Company, BCG)
- Recruiters, staffing firms, or HR professionals
- Public company executives NOT backed by PE
- Authors, journalists, academics, or non-industry professionals

ONLY include moves at North American (US/Canada) firms. Exclude any European, Asian, Latin American, or other non-North American firms entirely.

Return a JSON array. Each item:
{
  "name": "Person Full Name",
  "title": "New Title or Role",
  "firm": "Company/Firm Name",
  "previousFirm": "Previous Firm if mentioned or null",
  "moveType": "promotion" | "hire" | "departure" | "appointment",
  "summary": "Brief one-line description of the move"
}

Extract as many North American PE/investment banking moves as you can find. Skip any non-PE, non-investment-banking, and non-North American firms.
Respond with ONLY the JSON array.`, content.slice(0, 12000), { temperature: 0.1, maxTokens: 4000 });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: __text } }] }), text: async () => "" };
    })();

    if (!response.ok) {
      const errText = await response.text();
      console.error("[AI] Extract failed:", errText);
      return [];
    }

    const data = await response.json();
    const text = data.choices[0]?.message?.content || "[]";
    console.log(`[AI] Response from ${sourceName}: ${text.slice(0, 500)}`);
    
    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const moves = JSON.parse(jsonMatch[0]) as PeopleMove[];
      return moves.map(m => ({
        ...m,
        sourceUrl: sourceUrl,
        source: sourceName,
      }));
    }

    console.log(`[AI] No JSON array found in response from ${sourceName}`);
    return [];
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
      throw new Error("FIRECRAWL_API_KEY not configured. Connect Firecrawl in Settings → Connectors.");
    }

    const lovableApiKey = aiConfigured() ? "configured" : "";
    if (!lovableApiKey) {
      throw new Error("No AI provider configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const allMoves: PeopleMove[] = [];

    // --- Strategy 1: Scrape known PE people-moves pages with Firecrawl ---
    console.log("=== Strategy 1: Scraping PE news sites ===");
    const scrapePromises = PEOPLE_MOVES_SOURCES.map(async (source) => {
      try {
        const markdown = await scrapeWithFirecrawl(firecrawlKey, source.url);
        if (markdown && markdown.length > 100) {
          const moves = await extractPeopleMoves(markdown, source.name, source.url, lovableApiKey);
          console.log(`[${source.name}] Found ${moves.length} people moves`);
          return moves;
        }
        return [];
      } catch (error) {
        console.error(`Error scraping ${source.name}:`, error);
        return [];
      }
    });

    const scrapeResults = await Promise.all(scrapePromises);
    scrapeResults.forEach(moves => allMoves.push(...moves));

    // --- Strategy 2: AI-powered web search for recent moves ---
    console.log("=== Strategy 2: AI-powered web search ===");
    // Run search queries in parallel for speed
    const searchPromises = SEARCH_QUERIES.map(async (query) => {
      try {
        const results = await searchWithFirecrawl(firecrawlKey, query);
        const queryMoves: PeopleMove[] = [];
        for (const result of results.slice(0, 3)) {
          if (result.markdown && result.markdown.length > 100) {
            const moves = await extractPeopleMoves(
              result.markdown,
              "Web Search",
              result.url,
              lovableApiKey
            );
            queryMoves.push(...moves);
          }
        }
        return queryMoves;
      } catch (error) {
        console.error(`Error searching "${query}":`, error);
        return [];
      }
    });

    const searchResults = await Promise.all(searchPromises);
    searchResults.forEach(moves => allMoves.push(...moves));

    console.log(`Total raw people moves found: ${allMoves.length}`);

    // Filter out invalid entries and deduplicate by person name + firm
    const validMoves = allMoves.filter(m => m.name && m.firm && typeof m.name === 'string' && typeof m.firm === 'string');
    const seen = new Set<string>();
    const uniqueMoves = validMoves.filter(m => {
      const key = `${m.name.toLowerCase()}|${m.firm.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Unique people moves after dedup: ${uniqueMoves.length}`);

    // Store as articles in the database
    let articlesCreated = 0;
    for (const move of uniqueMoves) {
      try {
        // Check if this person+firm combo already exists
        const { data: existing } = await supabase
          .from("articles")
          .select("id")
          .eq("category", "people_moves")
          .ilike("title", `%${move.name}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`Skipping duplicate: ${move.name}`);
          continue;
        }

        const title = move.name;
        const summary = move.previousFirm
          ? `${move.moveType} — ${move.title} at ${move.firm}, previously at ${move.previousFirm}. ${move.summary}`
          : `${move.moveType} — ${move.title} at ${move.firm}. ${move.summary}`;

        const { error: insertError } = await supabase
          .from("articles")
          .insert({
            title,
            summary,
            category: "people_moves",
            source: move.source,
            source_url: move.sourceUrl,
            fund_size_relevant: true,
            relevance_score: 55,
            scraped_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`Failed to insert move for ${move.name}:`, insertError.message);
        } else {
          articlesCreated++;
        }
      } catch (error) {
        console.error(`Error storing move ${move.name}:`, error);
      }
    }

    console.log(`People moves articles created: ${articlesCreated}`);

    return new Response(
      JSON.stringify({
        message: `Found ${uniqueMoves.length} people moves, created ${articlesCreated} articles`,
        total_found: allMoves.length,
        unique: uniqueMoves.length,
        articles_created: articlesCreated,
        moves: uniqueMoves.slice(0, 10), // Preview first 10
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("People moves scraping error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
