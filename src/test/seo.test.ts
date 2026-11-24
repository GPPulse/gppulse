import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanDeals, document_, rankSponsors, splitSponsors as jsSplit, sponsorKey as jsKey } from "../../api/_lib/core.js";
import { render } from "../../api/_lib/pages.js";
import { FAQS, TITLES } from "../../api/_lib/copy.js";
import { sitemapXml } from "../../api/sitemap.js";
import { feedXml } from "../../api/feed.js";
import { llmsFullTxt, llmsTxt } from "../../api/llms.js";
import { splitSponsors, sponsorKey } from "../../supabase/functions/_shared/sponsor";

const SHELL = readFileSync("index.html", "utf8");

const ISSUE = {
  id: "0b0b0b0b-0000-4000-8000-000000000015", slug: "2026-11-23-15", issue_number: 15, edition: "daily",
  subject: `Falfurrias's second deal & a "quiet" one <b>`, preheader: "Plus three new names on sponsor portfolio pages.",
  sent_at: "2026-11-24T10:51:00Z", updated_at: "2026-11-24T10:51:00Z",
  content: {
    version: 2, edition: "daily",
    editors_note: { headline: "Falfurrias doubled up, and did it quietly", byline: "Carl Schlotman", paragraphs: ["Falfurrias Capital Partners took a majority stake in Freeman & Forrest.", "Second paragraph."] },
    market_data: [{ name: "S&P 500", unit: "index", price: 7237.17, change: 326.78, changePercent: 4.73 }, { name: "SOFR", unit: "percent", price: 3.92, change: 0.01, changePercent: 0 }],
    by_the_numbers: [{ value: "11 of 135", label: "deals with no press release", context: "Share of 30-day tracker." }],
    below_radar: [{ headline: "NLign is now on The Brydon Group's portfolio page", body: "We found no press release.", found_via: "Portfolio page", source: "The Brydon Group", source_url: "https://www.brydon.com/portfolio", confirmed: false }],
    deal_tracker: [
      { sponsor: "Renovus Capital Partners", target: "Mission Critical Partners", deal_type: "add-on", platform: "xFact", sector: "Business Services", enterprise_value_millions: null, ebitda_millions: null, ev_ebitda_multiple: null, figures_disclosed: false, summary: "xFact merged with Mission Critical Partners.", source: "Private Equity Professional", source_url: "https://peprofessional.com/x", editor_take: "First xFact add-on we've logged.", file: ["First xFact add-on we've logged"] },
      { sponsor: "Evil <script>alert(1)</script> Capital", target: "Acme", deal_type: "platform", sector: "Industrials", enterprise_value_millions: 120, ebitda_millions: 15, ev_ebitda_multiple: 8, figures_disclosed: true, summary: null, source: "x", source_url: "javascript:alert(1)" },
    ],
    fund_tracker: [{ firm: "Foundry Owners' Fund", fund_name: "Foundry Owners' Fund III", status: "final_close", raised_millions: 120, target_millions: null, summary: "Final close at $120 million.", source: "Pulse 2.0", source_url: null }],
    people_moves: [{ id: "1", title: "Karen Brown Garza", summary: "CFO at Chelsea Lighting.", source: "Web Search", source_url: null }],
    the_read: { title: "A piece", source: "RiverGlade Capital", url: "https://riverglade.com/a", take: "Read it." },
    closing_line: "Three portfolio pages changed before any press release did.",
  },
};
const DEALS = [
  { id: "1", sponsor: "Kian Capital", target: "Sun-Tech", deal_type: "platform", sector: "Industrials", announced_on: "2026-11-20", created_at: "2026-11-20T01:00:00Z", source: "Kian", source_url: "https://kian.com/news/sun-tech", below_radar: true, hidden: false },
  { id: "2", sponsor: "Kian Capital Partners, LLC", target: "Sun-Tech Holdings", deal_type: "platform", sector: "Industrials", announced_on: "2026-11-21", created_at: "2026-11-21T01:00:00Z", source: "wire", source_url: "https://wire.com/a", hidden: false },
  { id: "3", sponsor: "Seaport Capital", target: "OldCo", deal_type: "add-on", announced_on: "2026-11-21", created_at: "2026-11-21T01:00:00Z", source: "Seaport", source_url: "https://seaportcapital.com/news/2023/oldco", hidden: false },
  { id: "4", sponsor: "Branford Castle", target: "(unnamed)", deal_type: "add-on", announced_on: "2026-11-21", created_at: "2026-11-21T01:00:00Z", hidden: false },
  { id: "5", sponsor: "LFM Capital; Kian Capital", target: "Widgets Inc.", deal_type: "add-on", announced_on: "2026-11-22", created_at: "2026-11-22T01:00:00Z", ev_ebitda_multiple: 7.5, enterprise_value_millions: 60, ebitda_millions: 8, source: "PR", source_url: "https://pr.com/w", hidden: false, date_known: false },
  { id: "6", sponsor: "Dup Partners", target: "Twice", deal_type: "exit", announced_on: "2026-11-22", created_at: "2026-11-22T01:00:00Z", hidden: false, duplicate_of: "1" },
];

function mockDb() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://db.example");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "k");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    let body: unknown = [];
    if (u.includes("/newsletters?")) body = u.includes("slug=eq.") || u.includes("id=eq.") ? (u.includes("2026-11-23-15") ? [ISSUE] : []) : [ISSUE];
    else if (u.includes("/deals?")) body = u.includes("ev_ebitda_multiple=not.is.null") ? DEALS.filter((d) => d.ev_ebitda_multiple) : DEALS;
    else if (u.includes("/rpc/")) body = { quarters: [], latest_quarter_end: null, buckets: [] };
    return { ok: true, json: async () => body, text: async () => "" } as Response;
  }));
}
const jsonld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe("page HTML for search engines and AI assistants", () => {
  beforeEach(mockDb);
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("fills the shell: one title, the canonical address, the text, and the app script left in place", async () => {
    const { status, page } = await render("/about");
    const html = document_(SHELL, page);
    expect(status).toBe(200);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain(`<title>${TITLES["/about"].replace(/'/g, "'")}</title>`);
    expect(html).toContain('<link rel="canonical" href="https://thegppulse.com/about">');
    expect(html).toContain('<div id="root"><div id="ssr">');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).toContain("does most of the deals and gets the least coverage");
    expect(html).not.toContain("<!--seo:");
  });

  it("home page carries the organization, the FAQ and the latest issue", async () => {
    const { page } = await render("/");
    const html = document_(SHELL, page);
    const types = jsonld(html).map((x) => x["@type"]);
    expect(types).toEqual(expect.arrayContaining(["NewsMediaOrganization", "WebSite", "Periodical", "FAQPage"]));
    expect(jsonld(html).find((x) => x["@type"] === "FAQPage").mainEntity).toHaveLength(FAQS.length);
    expect(html).toContain('<link rel="canonical" href="https://thegppulse.com/">');
    expect(html).toContain('href="/archive/2026-11-23-15"');
  });

  it("an issue page has the whole issue, escaped, as a NewsArticle", async () => {
    const { status, page } = await render("/archive/2026-11-23-15");
    const html = document_(SHELL, page);
    expect(status).toBe(200);
    const article = jsonld(html).find((x) => x["@type"] === "NewsArticle");
    expect(article.datePublished).toBe("2026-11-24T10:51:00Z");
    expect(article.author[0].name).toBe("Carl Schlotman");
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta property="og:title" content="Falfurrias\'s second deal &amp; a &quot;quiet&quot; one &lt;b&gt;">');
    expect(html).toContain("Falfurrias doubled up, and did it quietly");
    expect(html).toContain("unconfirmed signal");
    expect(html).toContain("EV $120M, EBITDA $15M, 8.0x EV/EBITDA");
    expect(html).toContain("Three portfolio pages changed");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("<b>");
  });

  it("an address that matches nothing is a real 404, not indexed", async () => {
    for (const p of ["/nope", "/archive/2020-01-01-1", "/archive/a/b"]) {
      const { status, page } = await render(p);
      expect(status).toBe(404);
      expect(document_(SHELL, page)).toContain('content="noindex, follow"');
      expect(document_(SHELL, page)).not.toContain('rel="canonical"');
    }
  });

  it("deal tables leave out archive links, duplicates and unnamed targets, and do not print a date we do not know", async () => {
    const rows = cleanDeals(DEALS);
    expect(rows.map((d) => d.id)).toEqual(["1", "5"]);
    expect(rows[1].date).toBeNull();
    const html = document_(SHELL, (await render("/deals")).page);
    expect(html).toContain("Sun-Tech");
    expect(html).not.toContain("OldCo");
    expect(jsonld(html).map((x) => x["@type"])).toContain("Dataset");
    const sponsors = rankSponsors(rows);
    expect(sponsors[0]).toMatchObject({ sponsor: "Kian Capital", addOns: 1, platforms: 1 });
  });

  it("every public page renders with a title under 70 characters and a description under 200", async () => {
    for (const p of Object.keys(TITLES)) {
      const { status, page } = await render(p);
      expect(status, p).toBe(200);
      expect(page.title.length, p).toBeLessThanOrEqual(70);
      expect(page.description.length, p).toBeGreaterThan(60);
      expect(page.description.length, p).toBeLessThanOrEqual(200);
      for (const x of jsonld(document_(SHELL, page))) expect(x["@context"]).toBe("https://schema.org");
    }
  });

  it("with the database unreachable, pages still render and an issue is not called missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await render("/")).status).toBe(200);
    expect((await render("/deals")).status).toBe(200);
    const r = await render("/archive/2026-11-23-15");
    expect(r.status).toBe(200);
    expect(r.page.robots).toContain("noindex");
  });
});

describe("sitemap, feed and llms.txt", () => {
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  it("sitemap lists the standing pages and each sent issue", () => {
    const doc = xml(sitemapXml([ISSUE]));
    expect(doc.querySelector("parsererror")).toBeNull();
    const locs = [...doc.querySelectorAll("loc")].map((n) => n.textContent);
    expect(locs).toContain("https://thegppulse.com/");
    expect(locs).toContain("https://thegppulse.com/sponsors");
    expect(locs).toContain("https://thegppulse.com/archive/2026-11-23-15");
    expect(locs.some((l) => /admin|preferences|unsubscribe/.test(l ?? ""))).toBe(false);
  });
  it("feed is well-formed and links each issue", () => {
    const doc = xml(feedXml([ISSUE]));
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("item > link")?.textContent).toBe("https://thegppulse.com/archive/2026-11-23-15");
    expect(doc.querySelector("item > title")?.textContent).toBe(ISSUE.subject);
  });
  it("llms.txt maps the site; the full version adds the FAQ, deals and issues", () => {
    const short = llmsTxt([ISSUE]);
    expect(short.startsWith("# The GP Pulse\n\n> ")).toBe(true);
    expect(short).toContain("](https://thegppulse.com/deals)");
    expect(short).toContain("](https://thegppulse.com/archive/2026-11-23-15)");
    const full = llmsFullTxt([ISSUE], cleanDeals(DEALS));
    expect(full).toContain("Q: Is it free?");
    expect(full).toContain("Kian Capital / Sun-Tech");
    expect(full).toContain("The Lede: Falfurrias doubled up");
  });
});

describe("plumbing", () => {
  it("sponsor names are split and matched the same way here as in the alerts and the Sponsors page", () => {
    for (const s of ["Bisonti Partners; Bonaccord Capital Partners", "Kian Capital Partners, LLC", "J.F. Lehman & Company", "Clayton, Dubilier & Rice and Stone Point", "A / B (minority)", "The Riverside Company"]) {
      expect(jsSplit(s)).toEqual(splitSponsors(s));
      for (const n of splitSponsors(s)) expect(jsKey(n)).toBe(sponsorKey(n));
    }
  });
  it("routing: feeds and private pages are matched before the catch-all, which comes last", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    const sources = v.rewrites.map((r: { source: string }) => r.source);
    expect(sources[sources.length - 1]).toBe("/(.*)");
    expect(v.rewrites[v.rewrites.length - 1].destination).toBe("/api/page?p=$1");
    expect(v.rewrites.find((r: { source: string }) => r.source.includes("admin")).destination).toBe("/shell.html");
    expect(v.buildCommand).toContain("scripts/postbuild.mjs");
  });
  it("robots.txt points at the sitemap, keeps private pages out, and names the AI crawlers", () => {
    const r = readFileSync("public/robots.txt", "utf8");
    expect(r).toContain("Sitemap: https://thegppulse.com/sitemap.xml");
    for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) expect(r).toContain(`User-agent: ${bot}`);
    expect(r).toContain("Disallow: /admin");
    expect(r).not.toMatch(/^Disallow: \/$/m);
  });
});
