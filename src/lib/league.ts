import type { DealRow } from "@/lib/newsletter-content";
import { splitSponsors, sponsorKey } from "../../supabase/functions/_shared/sponsor";

export { splitSponsors, sponsorKey };

export type LeagueDeal = DealRow & { id: string; announced_on: string | null };

export interface SponsorLine {
  sponsor: string;
  deals: LeagueDeal[];
  platforms: number;
  addOns: number;
  exits: number;
  other: number;
  quiet: number;          // found with no press release
  topSector: string | null;
  latest: string | null;
}

export function rankSponsors(deals: LeagueDeal[]): SponsorLine[] {
  const by = new Map<string, { names: Map<string, number>; deals: LeagueDeal[] }>();
  for (const d of deals) {
    for (const name of new Set(splitSponsors(d.sponsor ?? ""))) {
      const k = sponsorKey(name);
      const e = by.get(k) ?? { names: new Map(), deals: [] };
      e.names.set(name, (e.names.get(name) ?? 0) + 1);
      e.deals.push(d);
      by.set(k, e);
    }
  }
  const lines: SponsorLine[] = [];
  for (const e of by.values()) {
    // The spelling used most often; ties go to the shorter one.
    const sponsor = [...e.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    const sectors = new Map<string, number>();
    for (const d of e.deals) if (d.sector && d.sector !== "Other") sectors.set(d.sector, (sectors.get(d.sector) ?? 0) + 1);
    const ds = [...e.deals].sort((a, b) => (b.announced_on ?? "").localeCompare(a.announced_on ?? ""));
    const n = (t: (d: LeagueDeal) => boolean) => ds.filter(t).length;
    lines.push({
      sponsor, deals: ds,
      platforms: n((d) => d.deal_type === "platform" || d.deal_type === "carve-out"),
      addOns: n((d) => d.deal_type === "add-on"),
      exits: n((d) => d.deal_type === "exit"),
      other: n((d) => !["platform", "carve-out", "add-on", "exit"].includes(d.deal_type)),
      quiet: n((d) => Boolean(d.below_radar)),
      topSector: [...sectors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      latest: ds[0]?.announced_on ?? null,
    });
  }
  return lines.sort((a, b) => b.deals.length - a.deals.length || (b.latest ?? "").localeCompare(a.latest ?? "") || a.sponsor.localeCompare(b.sponsor));
}
