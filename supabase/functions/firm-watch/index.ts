import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

// Database side of the firm watch. The crawler itself runs in GitHub Actions
// (firm-watch/src, .github/workflows/firm-watch.yml) because walking 860 firm sites does
// not fit in an edge-function invocation. It talks to the database only through this
// function, so the service-role key never leaves Supabase.
//
// Body: { action, ... }
//   seed        -> { firms: [...] } loads the watchlist from firm-watch/data/firms.json
//   firms       -> watchlist rows the crawler needs
//   discovered  -> { firms: [{ id, news_url, feed_url, linkedin_url, signup_page, signup_provider, note }] }
//   check       -> { urls: [...] } returns the ones not yet in scraped_content
//   items       -> { items: [{ firm_id, url, title, content, published_at, source_name, category_hint, seen_only }] }
//                  seen_only rows are archive entries recorded so they are never reported as new;
//                  they skip the classifier.
//   crawled     -> { firm_ids: [...] } stamps last_scraped_at

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const chunk = <T>(arr: T[], n: number): T[][] => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

interface IncomingItem { firm_id?: string | null; url: string; title: string; content?: string | null; published_at?: string | null; source_name?: string | null; category_hint?: string | null; seen_only?: boolean }

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

  try {
    const body = await req.json().catch(() => ({}));
    switch (String(body.action ?? "")) {
      case "firms": {
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from("pe_firm_sources")
            .select("id, name, website_url, domain, watch_tier, news_url, feed_url, discovered_at, last_scraped_at, linkedin_url, signup_page, signup_provider, subscribed_at, discovery_note")
            .eq("watchlist", true).eq("is_active", true).order("watch_tier").order("name").range(from, from + 999);
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        return json({ firms: rows });
      }

      case "seed": {
        // Idempotent load of firm-watch/data/firms.json. Firms already tracked are matched on
        // domain and flagged; new ones are inserted. Discovery state is only reset the first
        // time a firm joins the watchlist.
        const list = ((body.firms ?? []) as Array<{ name: string; website: string; domain: string; hq?: string; type?: string; tier?: number }>).filter((f) => f?.name && f?.website && f?.domain);
        const existing = new Map<string, { id: string; watchlist: boolean; watch_tier: number | null }>();
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from("pe_firm_sources").select("id, domain, watchlist, watch_tier").range(from, from + 999);
          if (error) throw new Error(error.message);
          (data ?? []).forEach((r: { id: string; domain: string | null; watchlist: boolean; watch_tier: number | null }) => { if (r.domain) existing.set(r.domain, r); });
          if ((data ?? []).length < 1000) break;
        }
        let flagged = 0, inserted = 0;
        const fresh: Record<string, unknown>[] = [];
        for (const f of list) {
          const hit = existing.get(f.domain);
          if (!hit) { fresh.push({ name: f.name, website_url: f.website, domain: f.domain, headquarters: f.hq ?? null, firm_type: f.type ?? null, watchlist: true, watch_tier: f.tier ?? 4 }); continue; }
          if (hit.watchlist && hit.watch_tier === (f.tier ?? 4)) continue;
          const patch: Record<string, unknown> = { watchlist: true, watch_tier: f.tier ?? 4, firm_type: f.type ?? null };
          if (!hit.watchlist) patch.discovered_at = null;
          const { error } = await supabase.from("pe_firm_sources").update(patch).eq("id", hit.id);
          if (!error) flagged++;
        }
        for (const part of chunk(fresh, 200)) {
          const { data, error } = await supabase.from("pe_firm_sources").upsert(part, { onConflict: "website_url", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(error.message);
          inserted += (data ?? []).length;
        }
        return json({ flagged, inserted, already: list.length - flagged - fresh.length });
      }

      case "discovered": {
        const firms = (body.firms ?? []) as Array<Record<string, string | null>>;
        let updated = 0;
        for (const f of firms) {
          if (!f.id) continue;
          const news_path = f.news_url ? (() => { try { return new URL(f.news_url!).pathname; } catch { return null; } })() : null;
          const { error } = await supabase.from("pe_firm_sources").update({
            news_url: f.news_url ?? null, news_path, feed_url: f.feed_url ?? null, linkedin_url: f.linkedin_url ?? null,
            signup_page: f.signup_page ?? null, signup_provider: f.signup_provider ?? null,
            discovered_at: new Date().toISOString(), discovery_note: (f.note ?? "").slice(0, 300),
          }).eq("id", f.id).eq("watchlist", true);
          if (!error) updated++;
        }
        return json({ updated });
      }

      case "check": {
        const urls = [...new Set((body.urls ?? []) as string[])].filter((u) => typeof u === "string" && u.length < 2000);
        const known = new Set<string>();
        // The lookup travels in a query string, so batch by encoded length, not by count:
        // a hundred long URLs overflow the request line.
        const parts: string[][] = [[]];
        let size = 0;
        for (const u of urls) {
          const len = encodeURIComponent(u).length + 6;
          if (size + len > 3000 && parts[parts.length - 1].length) { parts.push([]); size = 0; }
          parts[parts.length - 1].push(u);
          size += len;
        }
        for (const group of chunk(parts.filter((p) => p.length), 6)) {
          await Promise.all(group.map(async (part) => {
            const { data, error } = await supabase.from("scraped_content").select("url").in("url", part);
            if (error) throw new Error(error.message);
            (data ?? []).forEach((r: { url: string }) => known.add(r.url));
          }));
        }
        return json({ unknown: urls.filter((u) => !known.has(u)) });
      }

      case "items": {
        const items = ((body.items ?? []) as IncomingItem[]).filter((i) => i?.url && i?.title);
        const now = new Date().toISOString();
        let created = 0, queued = 0;
        for (const part of chunk(items, 200)) {
          const rows = part.map((i) => ({
            source_id: i.firm_id ?? null, url: i.url.slice(0, 2000), title: i.title.slice(0, 300),
            raw_content: (i.content ?? i.title).slice(0, 6000), source_name: i.source_name ?? null,
            published_at: i.published_at ?? null, category_hint: i.category_hint ?? null, scraped_at: now,
            processed: Boolean(i.seen_only), processed_at: i.seen_only ? now : null,
          }));
          const { data, error } = await supabase.from("scraped_content").upsert(rows, { onConflict: "url", ignoreDuplicates: true }).select("id, processed");
          if (error) throw new Error(error.message);
          created += (data ?? []).length;
          queued += (data ?? []).filter((r: { processed: boolean }) => !r.processed).length;
        }
        return json({ created, queued });
      }

      case "crawled": {
        const ids = (body.firm_ids ?? []) as string[];
        for (const part of chunk(ids, 200)) await supabase.from("pe_firm_sources").update({ last_scraped_at: new Date().toISOString() }).in("id", part);
        return json({ stamped: ids.length });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (error) {
    console.error("firm-watch", error);
    return json({ error: String(error) }, 500);
  }
});
