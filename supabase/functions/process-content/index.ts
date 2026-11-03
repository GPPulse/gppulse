import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { aiConfigured, chat } from "../_shared/ai.ts";

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
}

async function processWithAI(content: string, title: string, apiKey: string): Promise<ProcessedArticle | null> {
  try {
    const response = await (async () => {
      const __text = await chat("", `You are a private equity news analyst focused on NORTH AMERICAN LOWER MIDDLE MARKET (US and Canada, funds/deals under $1B) only. Today's date is ${new Date().toISOString().split('T')[0]}. Analyze the following article and provide:
1. A concise 2-3 sentence summary focused on the key PE-relevant details
2. A category (MUST be one of these exact values: "headline", "fund_tracker", "people_moves", "deal_flow", "market_insight")
   - headline: Major PE buyouts, exits, add-on acquisitions, fund closings involving lower middle market firms
   - fund_tracker: New fund raises, fund closings, capital commitments — MUST be under $1B
   - people_moves: Partner promotions, key hires, team changes ONLY at private equity firms, growth equity firms, investment banks, or PE-backed portfolio companies. NOT law firms, lawyers, accounting firms, consulting firms, recruiters, or other professional services.
   - deal_flow: PE-sponsored acquisitions, exits, add-on acquisitions, recapitalizations, platform investments. NOT generic partnerships, vendor agreements, technology integrations, cybersecurity deals, or marketing partnerships.
   - market_insight: Market trends, analysis, economic impact on PE
3. Whether this is relevant to lower middle market PE (funds under $1B) - true/false. Set FALSE for mega-cap PE firms.
4. A relevance score from 0-100 based on how valuable this is for North American LMM PE professionals
5. The estimated publication date of this article in YYYY-MM-DD format. Look for dates in the URL, content, or any date indicators. If you cannot determine the date, return null.

CRITICAL FILTERING RULES — score 0 if ANY apply:
- Non-North American firm, fund, or deal (European, Asian, Latin American, Middle Eastern, African)
- Latin America, Europe, Asia, Africa, or any non-US/Canada geography is the primary focus
- People moves at law firms, lawyers, accounting firms, consulting firms, recruiters, or ANY non-PE/non-investment-banking firm
- "Partnerships" that are NOT equity transactions (cybersecurity partnerships, technology vendor partnerships, marketing partnerships, channel partnerships, strategic alliances that don't involve equity ownership)
- Article is more than 7 days old
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
  "estimated_publish_date": "YYYY-MM-DD" or null
}`, `Title: ${title}\n\nContent: ${content}`, { temperature: 0.3, maxTokens: 500 });
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
      .select("*, pe_firm_sources(name, website_url)")
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

    for (const item of content) {
      try {
        // Process with AI
        const result = await processWithAI(
          item.raw_content || item.title || "",
          item.title || "Untitled",
          lovableApiKey
        );

        console.log(`AI result for "${item.title}": score=${result?.relevance_score}, category=${result?.category}`);
        
        if (result && result.relevance_score >= 20) {
          // Check for duplicate articles from the same source/firm
          // Check for duplicate articles across ALL articles (including previously sent newsletters)
          const sourceName = item.pe_firm_sources?.name || "Unknown";
          const dupCutoff = new Date();
          dupCutoff.setDate(dupCutoff.getDate() - 14); // Check last 14 days for duplicates
          const { data: existingArticles } = await supabase
            .from("articles")
            .select("id, title")
            .eq("source", sourceName)
            .gte("created_at", dupCutoff.toISOString())
            .limit(100);

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
              source: item.pe_firm_sources?.name || "Unknown",
              source_url: item.url,
              original_content: item.raw_content,
              scraped_at: item.scraped_at,
              published_at: result.estimated_publish_date ? new Date(result.estimated_publish_date).toISOString() : null,
            })
            .select()
            .single();

          if (articleError) {
            console.error(`Failed to insert article: ${articleError.message}`);
          }

          if (!articleError && article) {
            console.log(`Article created: ${article.id}`);
            articlesCreated++;
            
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
        } else {
          // Mark as processed but don't create article (low relevance)
          await supabase
            .from("scraped_content")
            .update({ 
              processed: true, 
              processed_at: new Date().toISOString() 
            })
            .eq("id", item.id);
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
