import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

// Credit-free content source. Reads every active feed in rss_feeds, pulls items from the
// last N days, optionally fetches the linked page for fuller text, and drops new URLs into
// scraped_content for process-content to classify. No third-party scraping service involved.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};
// Several wires and trade sites 403 anything that looks like a bot. A plain browser UA gets the same public RSS.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const UA_ALT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";
const MAX_AGE_DAYS = 3;
const MAX_ITEMS_PER_FEED = 40;
const MAX_ARTICLE_FETCHES = 60;   // across all feeds per run; keeps the run under the function timeout
const ARTICLE_CHARS = 6000;

interface Feed { id: string; name: string; url: string; category_hint: string | null; fetch_article: boolean; consecutive_failures: number }
interface Item { title: string; link: string; published: Date | null; summary: string }

// ---- tiny RSS/Atom parser (regex-based; standard feeds only, which is all we read) -----------
const pick = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
};
const decode = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
// CDATA → decode entities (feeds often embed escaped HTML) → strip tags → decode once more for the text itself
const unwrap = (s: string | null): string =>
  decode(decode((s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function parseFeed(xml: string): Item[] {
  const items: Item[] = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks) {
    const title = unwrap(pick(b, "title"));
    let link = "";
    if (isAtom) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ?? b.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = alt?.[1] ?? "";
    } else {
      link = unwrap(pick(b, "link")) || (b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? "") || unwrap(pick(b, "guid"));
    }
    const dateRaw = pick(b, "pubDate") ?? pick(b, "published") ?? pick(b, "updated") ?? pick(b, "dc:date");
    const published = dateRaw ? new Date(unwrap(dateRaw)) : null;
    const summary = unwrap(pick(b, "content:encoded") ?? pick(b, "description") ?? pick(b, "summary") ?? pick(b, "content")).slice(0, 3000);
    if (title && link.startsWith("http")) items.push({ title, link, published: published && !isNaN(published.getTime()) ? published : null, summary });
  }
  return items;
}

async function fetchWithTimeout(url: string, ms: number, ua = UA): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": ua, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5", "Accept-Language": "en-US,en;q=0.9", "Cache-Control": "no-cache" },
      signal: ctl.signal, redirect: "follow",
    });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch a feed; on 403/406/429 or an HTML challenge page, retry once with a different UA. */
async function fetchFeed(url: string): Promise<{ status: string; xml: string }> {
  const attempt = async (ua: string) => {
    const r = await fetchWithTimeout(url, 12000, ua);
    const text = r.ok ? await r.text() : "";
    const looksLikeFeed = /<rss|<feed|<rdf:RDF|<channel/i.test(text.slice(0, 4000));
    return { ok: r.ok && looksLikeFeed, status: r.ok ? (looksLikeFeed ? "ok" : "not a feed") : `http ${r.status}`, xml: text };
  };
  let res = await attempt(UA);
  if (!res.ok) { const retry = await attempt(UA_ALT); if (retry.ok || retry.status !== res.status) res = retry; }
  return { status: res.status, xml: res.ok ? res.xml : "" };
}

/** Plain-fetch the article and strip it to readable text. Many sites allow this; those that don't just return null. */
async function fetchArticleText(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, 8000);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    const html = await r.text();
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<nav[\s\S]*?<\/nav>/gi, " ").replace(/<header[\s\S]*?<\/header>/gi, " ").replace(/<footer[\s\S]*?<\/footer>/gi, " ");
    // Prefer <article> or the densest <p> run
    const article = body.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? body;
    const paras = (article.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []).map((p) => unwrap(p)).filter((p) => p.length > 40);
    const text = paras.join("\n").slice(0, ARTICLE_CHARS);
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

  try {
    const { data: feeds, error } = await supabase.from("rss_feeds").select("id, name, url, category_hint, fetch_article, consecutive_failures").eq("is_active", true);
    if (error) throw new Error(error.message);
    if (!feeds?.length) return new Response(JSON.stringify({ message: "No active feeds", created: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
    let articleFetches = 0;
    const report: Record<string, { status: string; items: number; new: number }> = {};
    let totalNew = 0;

    // Feeds in parallel; article fetches inside each feed sequential to be polite.
    await Promise.all((feeds as Feed[]).map(async (feed) => {
      let status = "ok", items: Item[] = [], created = 0;
      try {
        const r = await fetchFeed(feed.url);
        status = r.status;
        if (r.xml) { items = parseFeed(r.xml); if (!items.length) status = "empty"; }
      } catch (e) {
        status = `fetch error: ${String(e).slice(0, 80)}`;
      }

      const recent = items.filter((i) => !i.published || i.published.getTime() >= cutoff).slice(0, MAX_ITEMS_PER_FEED);
      if (recent.length) {
        const urls = recent.map((i) => i.link);
        const { data: existing } = await supabase.from("scraped_content").select("url").in("url", urls);
        const seen = new Set((existing ?? []).map((x: { url: string }) => x.url));
        for (const it of recent) {
          if (seen.has(it.link)) continue;
          let content = it.summary;
          if (feed.fetch_article && articleFetches < MAX_ARTICLE_FETCHES) {
            articleFetches++;
            const full = await fetchArticleText(it.link);
            if (full && full.length > content.length) content = full;
          }
          const { error: insErr } = await supabase.from("scraped_content").insert({
            url: it.link, title: it.title.slice(0, 300), raw_content: content, source_name: feed.name, feed_id: feed.id,
            published_at: it.published?.toISOString() ?? null, category_hint: feed.category_hint, scraped_at: new Date().toISOString(),
          });
          if (!insErr) created++;
          else if (!/duplicate/i.test(insErr.message)) console.error(`[rss] insert ${feed.name}: ${insErr.message}`);
        }
      }

      totalNew += created;
      report[feed.name] = { status, items: items.length, new: created };
      await supabase.from("rss_feeds").update({
        last_fetched_at: new Date().toISOString(), last_status: status, last_item_count: items.length, last_new_count: created,
        consecutive_failures: status === "ok" ? 0 : (feed.consecutive_failures ?? 0) + 1,
      }).eq("id", feed.id);
      console.log(`[rss] ${feed.name}: ${status}, ${items.length} items, ${created} new`);
    }));

    const failing = Object.entries(report).filter(([, r]) => r.status !== "ok").map(([n, r]) => `${n} (${r.status})`);
    return new Response(JSON.stringify({ message: `RSS: ${totalNew} new items from ${feeds.length} feeds${failing.length ? `; ${failing.length} feed(s) failing` : ""}`, created: totalNew, feeds: report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scrape-rss", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
