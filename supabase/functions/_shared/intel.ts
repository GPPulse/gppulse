// What makes an item ours: context from the archive and provenance.
//
// Every other newsletter reprints the press release. The GP Pulse carries what the release
// leaves out: how many deals this sponsor has done lately, how many add-ons the platform has
// stacked, which banks keep showing up on its closings, what fund it is investing from, and
// whether anyone else reported the deal at all. All of it comes from our own tables.
// deal_context() and market_intel() live in 20261118010000_trade_sources_intel.sql.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fmtMillions } from "./content.ts";

export type FoundVia = "press_release" | "wire" | "tombstone" | "trade_press" | "local_press" | "portfolio_page" | "sec_filing" | "news";

export const FOUND_VIA_LABEL: Record<FoundVia, string> = {
  press_release: "Sponsor release",
  wire: "Wire",
  tombstone: "Banker tombstone",
  trade_press: "Trade press",
  local_press: "Local press",
  portfolio_page: "Portfolio page",
  sec_filing: "SEC filing",
  news: "News",
};

/** "Kinderhook Industries" → "kinderhook"; "Southfield Capital" → "southfield". Short stems return the full name. */
export function sponsorStem(name: string): string {
  const full = name.toLowerCase().replace(/&amp;/g, "&").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const stem = full
    .replace(/\b(l\.?p\.?|llc|inc|co|company|corp(oration)?)\b/g, "")
    .replace(/\s+(capital|partners|equity|industries|group|management|holdings|investments?|advisors|private equity|growth)(\s+(capital|partners|equity|group|management|llc))*\s*$/g, "")
    .trim();
  // A one-word stem that is also an ordinary word ("prospect", "pivotal", "summit") matches every
  // tombstone that uses the word, so those keep the full firm name.
  if (!stem.includes(" ") && (stem.length < 7 || COMMON.has(stem))) return full;
  return stem.length >= 6 ? stem : full;
}
const COMMON = new Set(("prospect pivotal summit harbor harbour gateway keystone pinnacle frontier heritage legacy granite sterling capstone insight " +
  "horizon anchor bridge compass beacon cornerstone liberty freedom lincoln franklin madison monroe jefferson washington hamilton " +
  "trinity sentinel signal stellar meridian guardian pioneer patriot republic national american western eastern northern southern " +
  "central pacific atlantic mountain hillside lakeview riverside parkway highland benchmark landmark milestone momentum catalyst kinetic " +
  "evergreen everest ascent element integrity endeavor endurance tributary charter crestline northstar silverline platinum diamond emerald " +
  "sapphire cardinal phoenix trident mercury jupiter neptune apollo orion vanguard paragon spring summer autumn winter").split(/\s+/));

export interface DealContext {
  tracker: { target: string; announced_on: string; deal_type: string }[];
  platform_addons: { target: string; announced_on: string }[];
  tombstone_banks: { source_name: string; n: number }[];
  tombstone_total: number;
  fund: { fund_name: string; raised_millions: number | null; target_millions: number | null; status: string; announced_on: string } | null;
  press_mentions: number;
  /** The same deal, already in the tracker from an earlier day (migration 20261124070000). */
  prior_report?: { announced_on: string; first_seen_on: string | null; found_via: string | null; source: string | null } | null;
}

export async function dealContext(
  supabase: SupabaseClient,
  d: { sponsor: string; target: string; platform?: string | null },
): Promise<DealContext | null> {
  const { data, error } = await supabase.rpc("deal_context", {
    p_sponsor: d.sponsor, p_stem: sponsorStem(d.sponsor), p_target: d.target, p_platform: d.platform ?? null,
  });
  if (error) { console.warn("deal_context unavailable:", error.message); return null; }
  return data as DealContext;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const shortDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Turns the archive lookup into the "The file" facts printed under a deal. Facts only, no adjectives. */
export function fileLines(d: { sponsor: string; deal_type: string; platform?: string | null }, ctx: DealContext | null): string[] {
  if (!ctx) return [];
  const out: string[] = [];
  const pr = ctx.prior_report;
  if (pr) {
    const how = pr.found_via && QUIET.has(pr.found_via) ? `, from ${HOW[pr.found_via]}${pr.source && pr.found_via === "tombstone" ? ` (${pr.source})` : ""}` : "";
    out.push(`In our tracker since ${shortDate(pr.first_seen_on ?? pr.announced_on)}${how}`);
  }
  const prior = ctx.tracker ?? [];
  if (prior.length) {
    const since = shortDate(prior[prior.length - 1].announced_on);
    const names = prior.slice(0, 3).map((p) => p.target).join(", ");
    out.push(`${ordinal(prior.length + 1)} ${d.sponsor} deal in our tracker since ${since} (also ${names})`);
  }
  if (d.deal_type === "add-on" && d.platform) {
    const n = (ctx.platform_addons ?? []).length;
    out.push(n ? `Add-on #${n + 1} to ${d.platform} that we've logged` : `First ${d.platform} add-on we've logged`);
  }
  if (ctx.tombstone_total >= 2) {
    const banks = (ctx.tombstone_banks ?? []).slice(0, 3).map((b) => b.source_name).join(", ");
    out.push(`Named on ${ctx.tombstone_total} banker tombstones in our archive (${banks})`);
  }
  if (ctx.fund) {
    const f = ctx.fund;
    const size = f.raised_millions ? fmtMillions(f.raised_millions) : f.target_millions ? `${fmtMillions(f.target_millions)} target` : null;
    out.push(`Latest fund on file: ${f.fund_name}${size ? `, ${size}` : ""} (${f.status.replace("_", " ")}, ${shortDate(f.announced_on)})`);
  }
  return out.slice(0, 3);
}

const QUIET = new Set(["tombstone", "trade_press", "local_press", "portfolio_page", "sec_filing"]);
const HOW: Record<string, string> = { tombstone: "a banker tombstone", trade_press: "the trade press", local_press: "local press", portfolio_page: "a portfolio page", sec_filing: "an SEC filing" };

/** We had it quietly and today a release, a wire or the PE press reported it. */
export function isCaughtUp(via: FoundVia, prior: NonNullable<DealContext["prior_report"]>): boolean {
  return Boolean(prior.found_via && QUIET.has(prior.found_via)) && ["press_release", "wire", "news"].includes(via);
}

/** Below the radar: we found it somewhere other than a release, and no release or wire story turned up. */
export function isBelowRadar(via: FoundVia, ctx: DealContext | null): boolean {
  if (!["tombstone", "trade_press", "local_press", "portfolio_page", "sec_filing"].includes(via)) return false;
  return !ctx || (ctx.press_mentions ?? 0) === 0;
}

export interface MarketIntel {
  banks: { name: string; source_kind: string; n: number; latest: string }[];
  platforms: { platform: string; sponsor: string; n: number; latest: string[] }[];
  sponsors: { sponsor: string; n: number }[];
  sectors: { sector: string; this_week: number; weekly_avg: number }[];
  sellers: { seller_type: string; n: number }[];
  radar: { below: number; total: number } | null;
}

export async function marketIntel(supabase: SupabaseClient, days = 30): Promise<MarketIntel | null> {
  const { data, error } = await supabase.rpc("market_intel", { p_days: days });
  if (error) { console.warn("market_intel unavailable:", error.message); return null; }
  return data as MarketIntel;
}

/** Compact text version for the editorial prompt. */
export function intelText(m: MarketIntel | null): string {
  if (!m) return "";
  const lines: string[] = [];
  if (m.radar?.total) lines.push(`Deals tracked last 30 days: ${m.radar.total}; ${m.radar.below} of them had no press release or wire story (found via banker tombstones, trade/local press, portfolio pages or filings).`);
  if (m.sponsors?.length) lines.push(`Most active sponsors (30d): ${m.sponsors.map((s) => `${s.sponsor} ${s.n}`).join(", ")}`);
  if (m.banks?.length) lines.push(`Banks/lenders posting new closings (30d): ${m.banks.map((b) => `${b.name} ${b.n}`).join(", ")}`);
  if (m.platforms?.length) lines.push(`Platforms stacking add-ons: ${m.platforms.map((p) => `${p.platform} (${p.sponsor}) ${p.n}`).join(", ")}`);
  if (m.sectors?.length) lines.push(`Sector pace, this week vs prior 4-week avg: ${m.sectors.map((s) => `${s.sector} ${s.this_week} vs ${s.weekly_avg}`).join(", ")}`);
  if (m.sellers?.length) lines.push(`Who sold (30d, platforms/add-ons/recaps): ${m.sellers.map((s) => `${s.seller_type} ${s.n}`).join(", ")}`);
  return lines.join("\n");
}
