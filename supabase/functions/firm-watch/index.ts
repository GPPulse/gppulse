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
//   subscribed  -> { firms: [{ id, status, note }] }   one mailing-list sign-up attempt per firm
//   portfolio   -> { firms: [{ id, portfolio_url, names }], signals: [{ headline, body, url }] }
//   bdc         -> { holdings: [...] } BDC schedule-of-investments rows (firm-watch/src/bdc.mjs)
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
        const base = "id, name, website_url, domain, firm_type, watchlist, source_kind, watch_tier, news_url, feed_url, deals_url, portfolio_url, portfolio_names, portfolio_checked_at, discovered_at, last_scraped_at, linkedin_url, signup_page, signup_provider, subscribed_at, discovery_note";
        // signup_status arrives with migration 20261124060000; until it is applied, read without it.
        let cols = `${base}, signup_status`;
        for (let from = 0; ; from += 1000) {
          let { data, error } = await supabase.from("pe_firm_sources").select(cols)
            .or("watchlist.eq.true,source_kind.in.(advisor,lender,trade)").eq("is_active", true).order("watch_tier").order("name").range(from, from + 999);
          if (error && cols !== base && /signup_status/.test(error.message)) {
            cols = base;
            ({ data, error } = await supabase.from("pe_firm_sources").select(cols)
              .or("watchlist.eq.true,source_kind.in.(advisor,lender,trade)").eq("is_active", true).order("watch_tier").order("name").range(from, from + 999));
          }
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        return json({ firms: rows, signup_tracking: cols !== base });
      }

      case "seed": {
        // Idempotent load of firm-watch/data/firms.json. Firms already tracked are matched on
        // domain and flagged; new ones are inserted. Discovery state is only reset the first
        // time a firm joins the watchlist.
        const list = ((body.firms ?? []) as Array<{ name: string; website: string; domain: string; hq?: string; type?: string; tier?: number; kind?: string }>).filter((f) => f?.name && f?.website && f?.domain);
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
          const kind = f.kind === "advisor" || f.kind === "lender" || f.kind === "trade" ? f.kind : "sponsor";
          if (!hit) { fresh.push({ name: f.name, website_url: f.website, domain: f.domain, headquarters: f.hq ?? null, firm_type: f.type ?? null, watchlist: kind === "sponsor", watch_tier: kind === "sponsor" ? f.tier ?? 4 : null, source_kind: kind }); continue; }
          if (kind !== "sponsor") continue; // an advisor, lender or trade source already tracked is left as it is
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
            signup_page: f.signup_page ?? null, signup_provider: f.signup_provider ?? null, deals_url: f.deals_url ?? null,
            discovered_at: new Date().toISOString(), discovery_note: (f.note ?? "").slice(0, 300),
          }).eq("id", f.id);
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

      case "subscribed": {
        // Outcome of one mailing-list sign-up attempt per firm (firm-watch/src/subscribe.mjs).
        const firms = (body.firms ?? []) as Array<{ id: string; status: string; note?: string }>;
        const now = new Date().toISOString();
        let updated = 0;
        for (const f of firms) {
          if (!f.id || !f.status) continue;
          const patch: Record<string, unknown> = { signup_status: f.status.slice(0, 30), signup_note: (f.note ?? "").slice(0, 300), signup_attempted_at: now };
          if (f.status === "subscribed") patch.subscribed_at = now;
          const { error } = await supabase.from("pe_firm_sources").update(patch).eq("id", f.id);
          if (error) return json({ error: `could not record sign-ups (is migration 20261124060000 applied?): ${error.message}` }, 500);
          updated++;
        }
        return json({ updated });
      }

      case "portfolio": {
        // Daily portfolio-page comparison. `firms` carries the list of company names to store for
        // each sponsor; `signals` are additions worth an editor's eye. Signals are inferences, so
        // they go to the Editor's Desk as submitted items and are never published automatically.
        const firms = (body.firms ?? []) as Array<{ id: string; portfolio_url?: string | null; names?: string[] | null }>;
        const now = new Date().toISOString();
        for (const f of firms) {
          if (!f.id) continue;
          const patch: Record<string, unknown> = { portfolio_checked_at: now };
          if (f.portfolio_url !== undefined) patch.portfolio_url = f.portfolio_url;
          if (Array.isArray(f.names)) patch.portfolio_names = f.names.slice(0, 600);
          await supabase.from("pe_firm_sources").update(patch).eq("id", f.id);
        }
        const signals = (body.signals ?? []) as Array<{ headline: string; body: string; url: string }>;
        let filed = 0;
        for (const sig of signals.slice(0, 50)) {
          if (!sig?.headline) continue;
          const { data: dup } = await supabase.from("editor_items").select("id").eq("headline", sig.headline.slice(0, 200)).limit(1);
          if (dup?.length) continue;
          const { error } = await supabase.from("editor_items").insert({ kind: "overheard", headline: sig.headline.slice(0, 200), body: (sig.body ?? "").slice(0, 1000), url: sig.url ?? null, attribution: "GP Pulse firm watch", status: "submitted" });
          if (error) console.error("firm-watch portfolio signal", error.message); else filed++;
        }
        return json({ updated: firms.length, filed });
      }

      case "bdc": {
        // BDC schedule-of-investments rows from firm-watch/src/bdc.mjs.
        const rows = ((body.holdings ?? []) as Record<string, unknown>[]).filter((r) => r.bdc_ticker && r.accession && r.issuer_key);
        let saved = 0;
        for (const part of chunk(rows, 400)) {
          const { data, error } = await supabase.from("bdc_holdings").upsert(part, { onConflict: "bdc_ticker,accession,issuer_key", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(error.message);
          saved += (data ?? []).length;
        }
        return json({ saved });
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
