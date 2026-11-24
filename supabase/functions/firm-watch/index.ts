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
//   portfolio   -> { firms: [{ id, portfolio_url, names }], signals: [{ headline, body, url, company?, sponsor? }] }
//   team        -> { firms: [{ id, team_url, members }], moves: [{ firm_id, firm_name, person, person_key, move_type,
//                  old_title, new_title, old_rank, new_rank, url, publish, review, line }] } (firm-watch/src/team.mjs)
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
        const base = "id, name, website_url, domain, firm_type, watchlist, source_kind, watch_tier, news_url, feed_url, deals_url, portfolio_url, portfolio_names, portfolio_checked_at, discovered_at, last_scraped_at, linkedin_url, signup_page, signup_provider, subscribed_at, discovery_note";
        // The team columns arrive with migration 20261121150000_team_watch. Until it is applied
        // the crawl carries on without them rather than failing.
        let columns = `${base}, team_url, team_members, team_checked_at`;
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          let { data, error } = await supabase.from("pe_firm_sources").select(columns)
            .or("watchlist.eq.true,source_kind.in.(advisor,lender,trade)").eq("is_active", true).order("watch_tier").order("name").range(from, from + 999);
          if (error && columns !== base && /team_/.test(error.message)) {
            columns = base;
            ({ data, error } = await supabase.from("pe_firm_sources").select(columns)
              .or("watchlist.eq.true,source_kind.in.(advisor,lender,trade)").eq("is_active", true).order("watch_tier").order("name").range(from, from + 999));
          }
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        return json({ firms: rows, team_ready: columns !== base });
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
        const signals = (body.signals ?? []) as Array<{ headline: string; body: string; url: string; company?: string; sponsor?: string }>;
        let filed = 0;
        for (const sig of signals.slice(0, 50)) {
          if (!sig?.headline) continue;
          const { data: dup } = await supabase.from("editor_items").select("id").eq("headline", sig.headline.slice(0, 200)).limit(1);
          if (dup?.length) continue;
          // Possible exits: add what our own tracker has on the company (entry date, add-ons since).
          if (sig.company && sig.sponsor && sig.headline.startsWith("Possible exit:")) {
            const like = (v: string) => `%${v.replace(/[%_,()]/g, " ").trim().slice(0, 60)}%`;
            const { data: hist } = await supabase.from("deals").select("target, platform, deal_type, announced_on")
              .ilike("sponsor", like(sig.sponsor)).or(`target.ilike.${like(sig.company)},platform.ilike.${like(sig.company)}`)
              .order("announced_on", { ascending: true }).limit(20);
            const rows = (hist ?? []) as { target: string; platform: string | null; deal_type: string; announced_on: string | null }[];
            const entry = rows.find((r) => r.deal_type !== "add-on" && r.deal_type !== "exit");
            const addOns = rows.filter((r) => r.deal_type === "add-on").length;
            const notes = [
              entry?.announced_on ? `Our tracker has the ${entry.deal_type} on ${entry.announced_on}.` : "",
              addOns ? `${addOns} add-on${addOns === 1 ? "" : "s"} tracked under it.` : "",
            ].filter(Boolean).join(" ");
            if (notes) sig.body = `${sig.body ?? ""} ${notes}`.trim();
          }
          const { error } = await supabase.from("editor_items").insert({ kind: "overheard", headline: sig.headline.slice(0, 200), body: (sig.body ?? "").slice(0, 1000), url: sig.url ?? null, attribution: "GP Pulse firm watch", status: "submitted" });
          if (error) console.error("firm-watch portfolio signal", error.message); else filed++;
        }
        return json({ updated: firms.length, filed });
      }

      case "team": {
        // Team-page comparison. `firms` carries the people to store for each sponsor; `moves` are the
        // changes since the last run. Every move is kept in people_moves. A promotion to vice
        // president or above also becomes a People item, worded as what the firm's own page shows.
        // Senior arrivals and departures are inferences about a person's job, so they wait on the
        // Editor's Desk and are never published from here.
        const firms = (body.firms ?? []) as Array<{ id: string; team_url?: string | null; members?: Array<{ name: string; title: string }> | null }>;
        const now = new Date().toISOString();
        for (const f of firms) {
          if (!f.id) continue;
          const patch: Record<string, unknown> = { team_checked_at: now };
          if (f.team_url !== undefined) patch.team_url = f.team_url;
          if (Array.isArray(f.members)) patch.team_members = f.members.slice(0, 400).map((m) => ({ name: String(m.name).slice(0, 80), title: String(m.title).slice(0, 90) }));
          await supabase.from("pe_firm_sources").update(patch).eq("id", f.id);
        }
        type Move = { firm_id: string; firm_name: string; person: string; person_key: string; move_type: string; old_title: string | null; new_title: string | null; old_rank: number | null; new_rank: number | null; url: string | null; publish?: boolean; review?: boolean; line?: string };
        const moves = ((body.moves ?? []) as Move[]).filter((m) => m?.firm_id && m?.person && m?.person_key && m?.move_type).slice(0, 300);
        let saved = 0, published = 0, filed = 0;
        const since = new Date(Date.now() - 60 * 864e5).toISOString();
        for (const m of moves) {
          const move_key = `${m.firm_id}|${m.person_key}|${m.move_type}|${(m.new_title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
          const { data: row, error } = await supabase.from("people_moves").upsert({
            firm_id: m.firm_id, firm_name: m.firm_name, person_name: m.person.slice(0, 80), person_key: m.person_key, move_type: m.move_type,
            old_title: m.old_title, new_title: m.new_title, old_rank: m.old_rank, new_rank: m.new_rank,
            source: "team_page", source_url: m.url, move_key, status: m.review ? "review" : "logged",
          }, { onConflict: "move_key", ignoreDuplicates: true }).select("id").maybeSingle();
          if (error) { console.error("firm-watch team move", error.message); continue; }
          if (!row) continue; // already recorded on an earlier run
          saved++;

          if (m.publish && m.move_type === "promotion") {
            // Skip when the firm already announced it and the release is in the tracker.
            const [{ data: announced }, { data: covered }] = await Promise.all([
              supabase.from("people_moves").select("id").eq("person_key", m.person_key).eq("source", "announcement").gte("detected_at", since).limit(1),
              supabase.from("articles").select("id").eq("category", "people_moves").ilike("title", `%${m.person.replace(/[%_]/g, " ")}%`).gte("created_at", since).limit(1),
            ]);
            if (announced?.length || covered?.length) continue;
            const { data: article, error: aErr } = await supabase.from("articles").insert({
              title: m.person, category: "people_moves", source: m.firm_name, source_url: m.url, watchlist_firm: m.firm_name,
              summary: `Promotion — ${m.new_title} at ${m.firm_name}, previously ${m.old_title}. The title changed on the firm's team page; we found no announcement.`,
              fund_size_relevant: true, relevance_score: 70, scraped_at: now, published_at: now,
            }).select("id").single();
            if (aErr) { console.error("firm-watch team article", aErr.message); continue; }
            await supabase.from("people_moves").update({ status: "published", article_id: article.id }).eq("id", row.id);
            published++;
          } else if (m.review) {
            const headline = `Team page: ${m.line ?? `${m.person} at ${m.firm_name}`}`.slice(0, 200);
            const note = m.move_type === "departure"
              ? "The name is no longer on the firm's team page. That can mean a departure, a retirement or a page edit. Confirm before running anything."
              : "The name is new on the firm's team page. Check whether this is a hire or someone the page left out before.";
            const { error: eErr } = await supabase.from("editor_items").insert({ kind: "overheard", headline, body: note, url: m.url ?? null, attribution: "GP Pulse firm watch", status: "submitted" });
            if (eErr) console.error("firm-watch team signal", eErr.message); else filed++;
          }
        }
        return json({ updated: firms.length, saved, published, filed });
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
