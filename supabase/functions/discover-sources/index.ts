import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

// Turns PE firm websites into feeds. For each pe_firm_sources row that hasn't been
// discovered yet: fetch the homepage, look for <link rel="alternate" type="application/rss+xml">,
// then try the usual WordPress/news paths. A working feed is registered in rss_feeds so the
// nightly RSS run picks it up like any other source. Firms with no feed keep working through
// the HTML scraper (scrape-pe-sources) using news_path.
//
// Body: { limit?: number (default 25), redo?: boolean (re-check already-discovered firms) }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CANDIDATE_PATHS = ["/feed/", "/feed", "/news/feed/", "/news/feed", "/press/feed/", "/press-releases/feed/", "/insights/feed/", "/blog/feed/", "/rss", "/rss.xml", "/feed.xml", "/news/rss", "/news/rss.xml", "/category/news/feed/", "/category/press-releases/feed/", "/portfolio-news/feed/", "/media/feed/"];
const NEWS_PATHS = ["/news", "/news/", "/press", "/press-releases", "/insights", "/media", "/newsroom", "/announcements", "/portfolio-news"];

async function get(url: string, ms = 10000): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, signal: ctl.signal, redirect: "follow" });
    const text = r.ok ? (await r.text()).slice(0, 400_000) : "";
    return { ok: r.ok, status: r.status, text, finalUrl: r.url };
  } catch {
    return { ok: false, status: 0, text: "", finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

const isFeed = (text: string) => /<rss|<feed[\s>]|<rdf:RDF/i.test(text.slice(0, 4000)) && /<item[\s>]|<entry[\s>]/i.test(text);
const itemCount = (text: string) => (text.match(/<item[\s>]|<entry[\s>]/gi) ?? []).length;

async function discover(site: string): Promise<{ feed_url: string | null; news_path: string | null; note: string }> {
  const base = site.replace(/\/$/, "");
  const home = await get(base);
  if (!home.ok) return { feed_url: null, news_path: null, note: `homepage http ${home.status}` };
  const origin = new URL(home.finalUrl).origin;

  // 1. Declared feeds
  const declared = [...home.text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter((h): h is string => Boolean(h))
    .map((h) => (h.startsWith("http") ? h : new URL(h, origin).href))
    .filter((h) => !/comments/i.test(h));
  for (const url of declared) {
    const r = await get(url);
    if (r.ok && isFeed(r.text)) return { feed_url: r.finalUrl, news_path: null, note: `declared feed, ${itemCount(r.text)} items` };
  }

  // 2. Conventional paths
  for (const p of CANDIDATE_PATHS) {
    const r = await get(origin + p, 7000);
    if (r.ok && isFeed(r.text) && itemCount(r.text) > 0) return { feed_url: r.finalUrl, news_path: null, note: `path ${p}, ${itemCount(r.text)} items` };
  }

  // 3. No feed; find a news page for the HTML scraper
  const linkedNews = home.text.match(/href=["']([^"']*(?:\/news|\/press|\/insights|\/newsroom|\/announcements)[^"']*)["']/i)?.[1];
  const candidates = [linkedNews, ...NEWS_PATHS.map((p) => origin + p)].filter(Boolean) as string[];
  for (const c of candidates) {
    const url = c.startsWith("http") ? c : new URL(c, origin).href;
    const r = await get(url, 7000);
    if (r.ok && r.text.length > 5000) return { feed_url: null, news_path: new URL(r.finalUrl).pathname, note: "news page, no feed" };
  }
  return { feed_url: null, news_path: null, note: "nothing found" };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

  const body = await req.json().catch(() => ({}));
  const limit = Number(body.limit ?? 25);
  let q = supabase.from("pe_firm_sources").select("id, name, website_url, feed_url, news_path").eq("is_active", true).order("name").limit(limit);
  if (!body.redo) q = q.is("discovered_at", null);
  const { data: firms, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  const results: Record<string, string> = {};
  let feeds = 0, newsPages = 0;
  // 5 at a time: each discovery can make a dozen requests
  for (let i = 0; i < (firms ?? []).length; i += 5) {
    await Promise.all((firms ?? []).slice(i, i + 5).map(async (f) => {
      const d = await discover(f.website_url);
      results[f.name] = d.note;
      await supabase.from("pe_firm_sources").update({ feed_url: d.feed_url, news_path: d.news_path ?? f.news_path, discovered_at: new Date().toISOString(), discovery_note: d.note }).eq("id", f.id);
      if (d.feed_url) {
        feeds++;
        await supabase.from("rss_feeds").upsert({ name: f.name, url: d.feed_url, category_hint: null, fetch_article: true, firm_id: f.id }, { onConflict: "url", ignoreDuplicates: true });
      } else if (d.news_path) newsPages++;
    }));
  }
  return new Response(JSON.stringify({ message: `Discovered ${feeds} feeds and ${newsPages} news pages across ${(firms ?? []).length} firms`, remaining_hint: (firms ?? []).length === limit ? "run again for more" : "done", results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
