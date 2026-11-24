// Keeping the tracker honest: one row per deal, a real date on it, and nothing from an archive
// passed off as today's news. The same rules live in the database (co_key, sponsor_key,
// same_company in 20261124090000_tracker_integrity.sql) so they hold for rows written by any
// version of the generator; these are the copies the generator uses before it writes.

/** "StationServ Holdings, LLC" → "stationserv". */
export function coKey(t: string | null | undefined): string {
  return (t ?? "").toLowerCase().replace(/&amp;/g, "&")
    .replace(/\b(the|inc|incorporated|llc|l\.l\.c|lp|l\.p|ltd|plc|corp|corporation|co|company|holdings|holding|group)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** "Falfurrias Capital Partners" and "Falfurrias Management Partners" → "falfurrias". First named sponsor only. */
export function sponsorKey(t: string | null | undefined): string {
  const full = coKey((t ?? "").split(";")[0].split("(")[0].split(/ and /i)[0]);
  const stem = full.replace(/(\s+(capital|partners|partner|equity|industries|management|investments|investment|investors|advisors|private|growth|fund|ventures|associates|i|ii|iii|iv|v|vi|vii))+$/g, "").trim();
  return stem.length >= 4 ? stem : full;
}

const trigrams = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const w of s.split(" ")) { const p = `  ${w} `; for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3)); }
  return out;
};
/** pg_trgm's similarity(): shared trigrams over all trigrams. */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a), tb = trigrams(b);
  let both = 0;
  for (const t of ta) if (tb.has(t)) both++;
  const all = ta.size + tb.size - both;
  return all ? both / all : 0;
}

/** Two names for one company: equal keys, one name whole inside the other, or nearly the same spelling. */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = coKey(a), kb = coKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length < 5 || kb.length < 5) return false;
  return ` ${ka} `.includes(` ${kb} `) || ` ${kb} `.includes(` ${ka} `) || similarity(ka, kb) >= 0.75;
}

export const sameDeal = (a: { sponsor: string; target: string }, b: { sponsor: string; target: string }) =>
  sponsorKey(a.sponsor) === sponsorKey(b.sponsor) && sameCompany(a.target, b.target);

/** The year in a news address: /news/2023/…, /2026/11/…, /2024-annual-…. Null when there is none. */
export function urlYear(url: string | null | undefined): number | null {
  const m = (url ?? "").match(/\/(20\d{2})(?:\/|-)/);
  return m ? Number(m[1]) : null;
}

/** Year and month from the address when both are there: /2026/11/renovus-… → 2026-11-15 (mid-month, day unknown). */
export function urlDate(url: string | null | undefined): string | null {
  const m = (url ?? "").match(/\/(20\d{2})\/(0[1-9]|1[0-2])(?:\/(0[1-9]|[12]\d|3[01]))?\//);
  return m ? `${m[1]}-${m[2]}-${m[3] ?? "15"}` : null;
}

export interface Dated { id: string; source: string; source_url: string | null; published_at: string | null }

/**
 * Items that are an archive, not news. Two tells:
 *  - the address carries a past year;
 *  - three or more undated items from one source in one night. A firm announces a deal or two
 *    at a time; ten at once is its back catalogue, read for the first time.
 */
export function archiveIds(items: Dated[], now = new Date(), maxUndated = 2): Set<string> {
  const out = new Set<string>();
  const undated = new Map<string, Dated[]>();
  for (const a of items) {
    const y = urlYear(a.source_url);
    if (y !== null && y < now.getUTCFullYear() && !a.published_at) { out.add(a.id); continue; }
    if (!a.published_at) undated.set(a.source, [...(undated.get(a.source) ?? []), a]);
  }
  for (const list of undated.values()) if (list.length > maxUndated) list.forEach((a) => out.add(a.id));
  return out;
}

/** A debt provider standing in the sponsor field: "NorthCoast Mezzanine" as sponsor and as lender. */
export function lenderAsSponsor(d: { sponsor: string; lender?: string | null }): boolean {
  const s = sponsorKey(d.sponsor);
  if (!s) return false;
  if (d.lender && coKey(d.lender).includes(s) && d.sponsor.split(/[;,]| and /i).filter((x) => x.trim()).length === 1) return true;
  return /\b(mezzanine|bdc|business development|credit partners|private credit|direct lending|senior lending|specialty finance|commercial finance|bank|bancorp)\b/i.test(d.sponsor);
}

/** The date a deal was announced, in New York, from the article when it has one. */
export function announcedOn(publishedAt: string | null | undefined, now = new Date()): { date: string; known: boolean } {
  const ny = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (publishedAt) {
    const p = new Date(publishedAt);
    if (!isNaN(p.getTime()) && p.getTime() <= now.getTime() + 864e5) return { date: ny(p) < ny(now) ? ny(p) : ny(now), known: true };
  }
  return { date: ny(now), known: false };
}
