import { announcedOn, archiveIds, coKey, lenderAsSponsor, sameCompany, sameDeal, sponsorKey, urlDate, urlYear } from "../tracker.ts";

const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

Deno.test("company keys drop legal suffixes", () => {
  eq(coKey("StationServ Holdings, LLC"), "stationserv", "holdings");
  eq(coKey("The Riverside Company"), "riverside", "the/company");
  eq(coKey("J.F. Lehman &amp; Company"), "j f lehman", "amp");
});

Deno.test("one sponsor under its several names", () => {
  eq(sponsorKey("Falfurrias Capital Partners"), sponsorKey("Falfurrias Management Partners"), "falfurrias");
  eq(sponsorKey("Gladstone Investment Corporation"), sponsorKey("Gladstone Investment"), "gladstone");
  eq(sponsorKey("Stonehenge Capital"), sponsorKey("Stonehenge Partners"), "stonehenge");
  eq(sponsorKey("Novacap; Fonds de solidarité FTQ"), "novacap", "first named");
  eq(sponsorKey("TJC"), "tjc", "short names keep the whole key");
  if (sponsorKey("Blue Point Capital Partners") === sponsorKey("Blue Sage Capital")) throw new Error("Blue Point is not Blue Sage");
});

Deno.test("the same deal seen twice", () => {
  // Every pair below was two or three rows in the tracker on Nov 23, 2026.
  if (!sameDeal({ sponsor: "Rosewood Private Investments", target: "StationServ" }, { sponsor: "Rosewood Private Investments", target: "StationServ Holdings" })) throw new Error("StationServ");
  if (!sameDeal({ sponsor: "MPE Partners", target: "Sun-Tech (Sunrise Technologies)" }, { sponsor: "MPE Partners", target: "Sun-Tech" })) throw new Error("Sun-Tech");
  if (!sameDeal({ sponsor: "MPE Partners", target: "Sunrise Technologies (Sun-Tech)" }, { sponsor: "MPE Partners", target: "Sun-Tech (Sunrise Technologies)" })) throw new Error("Sunrise");
  if (!sameDeal({ sponsor: "Gladstone Investment", target: "McFarlane Toys" }, { sponsor: "Gladstone Investment Corporation", target: "McFarlane Toys" })) throw new Error("McFarlane");
  if (!sameCompany("Chroma Color", "Chroma Color Corporation")) throw new Error("Chroma");
});

Deno.test("different deals stay different", () => {
  if (sameDeal({ sponsor: "Kian Capital", target: "Allen Supply" }, { sponsor: "Kian Capital", target: "Christensen Landscape Services" })) throw new Error("Kian");
  if (sameDeal({ sponsor: "J.F. Lehman & Company", target: "Insta-Clean" }, { sponsor: "J.F. Lehman & Company", target: "Green Site Services" })) throw new Error("Lehman");
  if (sameDeal({ sponsor: "TJC", target: "HMP Global" }, { sponsor: "Susquehanna Growth Equity", target: "HMP Global" })) throw new Error("two sides of one sale are two sponsors");
  if (sameCompany("SRM", "SRM Concrete")) throw new Error("short keys never match on containment");
  if (sameCompany("Precision Science", "Precision Mobile Care")) throw new Error("Precision");
});

Deno.test("the year in the address", () => {
  eq(urlYear("https://www.seaportcapital.com/news/2023/seaport-capital-completes-acquisition-of-cyberlinkasp"), 2023, "seaport");
  eq(urlYear("https://www.lfmcapital.com/news/lfmaddspowerbuilt"), null, "none");
  eq(urlDate("https://peprofessional.com/2026/11/renovus-xfact-merges-with-mission-critical-partners/"), "2026-11-15", "year/month");
  eq(urlDate("https://www.globenewswire.com/news-release/2026/11/23/3408489/0/en/x.html"), "2026-11-23", "year/month/day");
  eq(urlDate("https://www.seaportcapital.com/news/2023/all-traffic-data"), null, "year alone is not a date");
});

Deno.test("an archive is not news", () => {
  const now = new Date("2026-11-16T22:00:00Z");
  const a = (id: string, source: string, source_url: string, published_at: string | null = null) => ({ id, source, source_url, published_at });
  const ids = archiveIds([
    a("1", "Seaport Capital", "https://www.seaportcapital.com/news/2023/seaport-capital-completes-acquisition-of-cyberlinkasp"),
    a("2", "Seaport Capital", "https://www.seaportcapital.com/news/2026/cyberlinkasp-completes-acquisition-of-fresh-managed-it"),
    a("3", "Cortec Group", "https://cortecgroup.com/cortec-group-announces-acquisition-of-mplt-healthcare/"),
    a("4", "Cortec Group", "https://cortecgroup.com/cortec-announces-growth-capital-partnership-with-duggal-visual-solutions/"),
    a("5", "Cortec Group", "https://cortecgroup.com/cortec-group-announces-the-sale-of-rotating-machinery-services/"),
    a("6", "LFM Capital", "https://www.lfmcapital.com/news/lfm-capital-sells-diamabrush", "2026-11-05T12:00:00Z"),
    a("7", "LFM Capital", "https://www.lfmcapital.com/news/lfmaddspowerbuilt"),
  ], now);
  eq([...ids].sort(), ["1", "3", "4", "5"], "past-year address, and three undated from one firm");
});

Deno.test("a lender is not the sponsor", () => {
  eq(lenderAsSponsor({ sponsor: "NorthCoast Mezzanine", lender: "NorthCoast Mezzanine (subordinated debt and equity co-investment)" }), true, "named as both");
  eq(lenderAsSponsor({ sponsor: "Golub Capital BDC" }), true, "bdc");
  eq(lenderAsSponsor({ sponsor: "Kinderhook Industries", lender: "o15 Capital (unitranche)" }), false, "sponsor with a lender");
  eq(lenderAsSponsor({ sponsor: "Tecum Capital Partners", lender: null }), false, "no lender");
});

Deno.test("the announcement date comes from the article", () => {
  const now = new Date("2026-11-24T02:50:00Z"); // 9:50pm Nov 23 in New York
  eq(announcedOn("2026-11-18T12:00:00Z", now), { date: "2026-11-18", known: true }, "dated");
  eq(announcedOn(null, now), { date: "2026-11-23", known: false }, "undated: build day in New York, flagged");
  eq(announcedOn("2027-03-01T00:00:00Z", now), { date: "2026-11-23", known: false }, "a date in the future is not a date");
});
