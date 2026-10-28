import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScrapedItem {
  title: string;
  url: string;
  content: string;
  date?: string;
}

// Common selectors for press release pages
const pressReleaseSelectors = [
  { containerSelector: 'article', titleSelector: 'h1, h2, h3', linkSelector: 'a' },
  { containerSelector: '.press-release', titleSelector: 'h1, h2, h3', linkSelector: 'a' },
  { containerSelector: '.news-item', titleSelector: 'h1, h2, h3', linkSelector: 'a' },
  { containerSelector: '.post', titleSelector: 'h1, h2, h3', linkSelector: 'a' },
];

async function fetchAndParseWebsite(url: string): Promise<ScrapedItem[]> {
  console.log(`Fetching: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return [];
    }

    const html = await response.text();
    
    // Extract potential press release/news items using regex patterns
    const items: ScrapedItem[] = [];
    
    // Pattern to find article-like content with links
    const linkPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    const titlePattern = /<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi;
    
    // Find all links that might be news/press releases
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].trim();
      
      // Filter for relevant content
      if (text.length > 20 && text.length < 300) {
        // Check if it looks like a news/press release link
        const relevantKeywords = ['announce', 'acquisition', 'invest', 'fund', 'partner', 'deal', 'close', 'raise', 'portfolio', 'transaction', 'growth', 'equity', 'capital'];
        const isRelevant = relevantKeywords.some(keyword => 
          text.toLowerCase().includes(keyword) || href.toLowerCase().includes(keyword)
        );
        
        if (isRelevant || href.includes('/news') || href.includes('/press') || href.includes('/announcement')) {
          // Construct full URL if relative
          let fullUrl = href;
          if (href.startsWith('/')) {
            const baseUrl = new URL(url);
            fullUrl = `${baseUrl.origin}${href}`;
          } else if (!href.startsWith('http')) {
            fullUrl = `${url.replace(/\/$/, '')}/${href}`;
          }
          
          items.push({
            title: text,
            url: fullUrl,
            content: text,
          });
        }
      }
    }
    
    // Deduplicate by URL
    const uniqueItems = items.reduce((acc: ScrapedItem[], item) => {
      if (!acc.find(i => i.url === item.url)) {
        acc.push(item);
      }
      return acc;
    }, []);
    
    console.log(`Found ${uniqueItems.length} potential items from ${url}`);
    return uniqueItems.slice(0, 10); // Limit to 10 items per source
    
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body for optional filtering
    let sourceIds: string[] | undefined;
    let limit = 10; // Default to 10 sources per run
    
    try {
      const body = await req.json();
      sourceIds = body.source_ids;
      limit = body.limit || 10;
    } catch {
      // No body provided, use defaults
    }

    // Fetch active PE firm sources
    let query = supabase
      .from("pe_firm_sources")
      .select("*")
      .eq("is_active", true)
      .order("last_scraped_at", { ascending: true, nullsFirst: true })
      .limit(limit);

    if (sourceIds && sourceIds.length > 0) {
      query = query.in("id", sourceIds);
    }

    const { data: sources, error: sourcesError } = await query;

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ message: "No sources to scrape", scraped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Scraping ${sources.length} sources`);

    let totalScraped = 0;
    const results: { source: string; items: number; error?: string }[] = [];

    for (const source of sources) {
      try {
        // Determine the URL to scrape
        let scrapeUrl = source.website_url;
        if (source.press_release_path) {
          scrapeUrl = `${source.website_url.replace(/\/$/, '')}${source.press_release_path}`;
        } else if (source.news_path) {
          scrapeUrl = `${source.website_url.replace(/\/$/, '')}${source.news_path}`;
        } else {
          // Try common paths
          const commonPaths = ['/news', '/press', '/press-releases', '/announcements', '/insights'];
          for (const path of commonPaths) {
            try {
              const testUrl = `${source.website_url.replace(/\/$/, '')}${path}`;
              const testResponse = await fetch(testUrl, { method: 'HEAD' });
              if (testResponse.ok) {
                scrapeUrl = testUrl;
                break;
              }
            } catch {
              // Continue to next path
            }
          }
        }

        const items = await fetchAndParseWebsite(scrapeUrl);

        // Save scraped content — skip URLs already in the database
        if (items.length > 0) {
          // Check which URLs already exist
          const urls = items.map(i => i.url);
          const { data: existingUrls } = await supabase
            .from("scraped_content")
            .select("url")
            .in("url", urls);
          
          const existingUrlSet = new Set((existingUrls || []).map(r => r.url));
          const newItems = items.filter(i => !existingUrlSet.has(i.url));

          if (newItems.length > 0) {
            const { error: insertError } = await supabase
              .from("scraped_content")
              .insert(
                newItems.map(item => ({
                  source_id: source.id,
                  url: item.url,
                  title: item.title,
                  raw_content: item.content,
                  processed: false,
                }))
              );

            if (insertError) {
              console.error(`Failed to insert scraped content for ${source.name}:`, insertError);
            } else {
              totalScraped += newItems.length;
            }
          }
          
          console.log(`${source.name}: ${items.length} found, ${items.length - newItems.length} duplicates skipped, ${newItems.length} new`);
        }

        // Update last_scraped_at
        await supabase
          .from("pe_firm_sources")
          .update({ last_scraped_at: new Date().toISOString() })
          .eq("id", source.id);

        results.push({ source: source.name, items: items.length });

      } catch (error) {
        console.error(`Error processing source ${source.name}:`, error);
        results.push({ source: source.name, items: 0, error: String(error) });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Scraped ${totalScraped} items from ${sources.length} sources`,
        scraped: totalScraped,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Scraping error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
