import { describe, expect, it } from "vitest";
import { LeagueDeal, rankSponsors, splitSponsors, sponsorKey } from "@/lib/league";

const d = (sponsor: string, target: string, deal_type: string, extra: Partial<LeagueDeal> = {}) =>
  ({ id: target, sponsor, target, deal_type, sector: "Industrials", announced_on: "2026-11-10", below_radar: false, ...extra } as unknown as LeagueDeal);

describe("sponsor activity table", () => {
  it("splits co-sponsors and merges spellings of one firm", () => {
    expect(splitSponsors("Bisonti Partners; Bonaccord Capital Partners")).toEqual(["Bisonti Partners", "Bonaccord Capital Partners"]);
    expect(splitSponsors("Clayton, Dubilier & Rice")).toEqual(["Clayton, Dubilier & Rice"]);
    expect(sponsorKey("Kian Capital Partners, LLC")).toBe(sponsorKey("Kian Capital"));
    expect(sponsorKey("LFM Capital")).not.toBe(sponsorKey("MPE Partners"));
  });
  it("ranks by deal count and counts each type", () => {
    const lines = rankSponsors([
      d("Kian Capital", "A", "platform"), d("Kian Capital Partners, LLC", "B", "add-on", { below_radar: true, announced_on: "2026-11-20" }), d("Kian Capital", "C", "exit"),
      d("Seaport Capital; Kian Capital", "D", "add-on"), d("Seaport Capital", "E", "recap", { sector: "Technology" }),
    ]);
    expect(lines.map((l) => [l.sponsor, l.deals.length])).toEqual([["Kian Capital", 4], ["Seaport Capital", 2]]);
    const kian = lines[0];
    expect([kian.platforms, kian.addOns, kian.exits, kian.other, kian.quiet]).toEqual([1, 2, 1, 0, 1]);
    expect(kian.latest).toBe("2026-11-20");
    expect(kian.deals[0].target).toBe("B");
    expect(lines[1].other).toBe(1);
  });
});
