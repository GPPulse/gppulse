// Shared by the page, feed, sitemap and llms.txt functions.
//
// Why this exists: the site is a single-page app, so the HTML a crawler receives used to be an
// empty <div>. Google renders JavaScript eventually; Bing does sometimes; the crawlers behind
// ChatGPT, Claude and Perplexity do not at all. These functions put each page's real text, its
// title and description, its canonical address and its structured data into the HTML itself.
// Everyone gets the same document (no user-agent switching); the React app then takes over.

import builtShell from "./shell.generated.js";

export const SITE = {
  url: "https://thegppulse.com",
  name: "The GP Pulse",
  tagline: "The lower middle market, every weekday morning.",
  description:
    "A free weekday briefing for lower middle market private equity: the deals that never got a press release, announced deals with only the figures that were disclosed, sub-$1B funds in market, promotions and people moves. Written by a GP.",
  editor: { name: "Carl Schlotman", title: "Partner, Eaglehead Capital Management" },
  image: "https://thegppulse.com/og.png",
  // Add the X, LinkedIn and Instagram profile addresses here once they exist; they go into the
  // organization's structured data so search engines tie the accounts to the site.
  sameAs: [],
};

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only http(s) links from the database are printed as links. */
export const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

/** JSON-LD for a <script> tag: "<" escaped so a value can never close the tag. */
export const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

export const fmtMillions = (m) => {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return "n/d";
  const n = Number(m);
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}B` : `$${Math.round(n)}M`;
};
export const fmtMultiple = (x) => (x === null || x === undefined || Number.isNaN(Number(x)) ? "n/d" : `${Number(x).toFixed(1)}x`);

export const DEAL_TYPE = { platform: "Platform", "add-on": "Add-on", exit: "Exit", recap: "Recap", growth: "Growth", "carve-out": "Carve-out", secondary: "Secondary", other: "Deal" };
export const FUND_STATUS = { launched: "In market", first_close: "First close", final_close: "Final close", oversubscribed: "Oversubscribed", other: "Update" };

/** "2026-11-23" or an ISO timestamp → "November 23, 2026" (calendar dates are not shifted by time zone). */
export function longDate(v, opts = { month: "long", day: "numeric", year: "numeric" }) {
  if (!v) return "";
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { ...opts, timeZone: /^\d{4}-\d{2}-\d{2}$/.test(s) ? "UTC" : "America/New_York" });
}
export const shortDate = (v) => longDate(v, { month: "short", day: "numeric", year: "numeric" });

// ---- Sponsor names. Mirror of supabase/functions/_shared/sponsor.ts; a test holds the two together.
export function splitSponsors(s) {
  return String(s ?? "").split(/\s*;\s*|\s+and\s+(?=[A-Z])|\s*\/\s*/).map((x) => x.replace(/\s*\(.*?\)\s*$/, "").trim()).filter((x) => x.length > 1);
}
export function sponsorKey(name) {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[.,]/g, " ")
    .replace(/\b(llc|l\.?p\.?|inc|the|partners|capital|equity|group|management|private|investments?|holdings|advisors|company|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim() || name.toLowerCase().trim();
}
const companyKey = (name) =>
  String(name ?? "").toLowerCase().replace(/&/g, " and ").replace(/\b(llc|l\.?p\.?|inc|corp|corporation|the|holdings|company|co|group)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Deals fit to print in a public table. The tracker has known problems until the integrity
 * migration is applied: undated links from a sponsor's news archive (address carries a past year)
 * and the same company entered twice. Drop the first, collapse the second, and say when a date is
 * not known instead of printing the day we happened to find it.
 */
export function cleanDeals(rows) {
  const seen = new Set();
  const out = [];
  for (const d of rows ?? []) {
    if (!d || d.hidden || d.duplicate_of) continue;
    if (!d.sponsor || !d.target || /^\(?unnamed\)?$/i.test(String(d.target).trim())) continue;
    const built = Number(String(d.created_at ?? "").slice(0, 4)) || new Date().getUTCFullYear();
    const inUrl = /\/(20\d{2})(?:\/|-)/.exec(d.source_url ?? "");
    if (inUrl && Number(inUrl[1]) < built) continue;
    const key = `${companyKey(d.target)}|${d.deal_type === "exit" ? "exit" : "in"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, date: d.date_known === false ? null : d.announced_on });
  }
  return out;
}

/** Sponsors ranked by tracked deals; co-sponsors each get credit, spellings of one firm merge. */
export function rankSponsors(deals) {
  const by = new Map();
  for (const d of deals) {
    for (const name of new Set(splitSponsors(d.sponsor))) {
      const k = sponsorKey(name);
      const e = by.get(k) ?? { names: new Map(), deals: [] };
      e.names.set(name, (e.names.get(name) ?? 0) + 1);
      e.deals.push(d);
      by.set(k, e);
    }
  }
  const lines = [];
  for (const e of by.values()) {
    const sponsor = [...e.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    const n = (t) => e.deals.filter(t).length;
    lines.push({
      sponsor, deals: e.deals,
      platforms: n((d) => d.deal_type === "platform" || d.deal_type === "carve-out"),
      addOns: n((d) => d.deal_type === "add-on"),
      exits: n((d) => d.deal_type === "exit"),
      quiet: n((d) => Boolean(d.below_radar)),
    });
  }
  return lines.sort((a, b) => b.deals.length - a.deals.length || a.sponsor.localeCompare(b.sponsor));
}

/** An abort signal that fires after `ms`. */
export function deadline(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// ---- Database: read-only, with the site's public key, the same rows the pages themselves read.
export async function sb(query, { timeoutMs = 4500 } = {}) {
  const base = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return null;
  try {
    const r = await fetch(`${base}/rest/v1/${query}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: deadline(timeoutMs) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export const ISSUE_LIST = "newsletters?select=id,slug,subject,preheader,issue_number,edition,sent_at,updated_at&status=eq.sent&order=sent_at.desc";
export const issuePath = (n) => `/archive/${encodeURIComponent(n.slug ?? n.id)}`;

// ---- The app shell (the built index.html), with two marked slots we fill per page.
const HEAD = /<!--seo:head-->[\s\S]*?<!--\/seo:head-->/;
const BODY = /<!--seo:body-->[\s\S]*?<!--\/seo:body-->/;
let shellCache = null;

export async function loadShell(host) {
  if (shellCache) return shellCache;
  // 1) Written into the function bundle by scripts/postbuild.mjs during the Vercel build.
  if (typeof builtShell === "string" && HEAD.test(builtShell)) return (shellCache = builtShell);
  // 2) The same file as a static asset of this deployment.
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    try {
      const r = await fetch(`https://${host}/shell.html`, { signal: deadline(3000) });
      const t = r.ok ? await r.text() : "";
      if (HEAD.test(t)) return (shellCache = t);
    } catch { /* fall through */ }
  }
  return null;
}

/** For tests. */
export const _setShell = (s) => { shellCache = s; };

const NAV = [["/deals", "Deals"], ["/sponsors", "Sponsors"], ["/comps", "Comps"], ["/pricing", "Loan pricing"], ["/funds", "Funds"], ["/people-moves", "People"], ["/archive", "Archive"], ["/about", "About"]];
const FOOT = [["/deal-stats", "Index"], ["/tip", "Send a tip"], ["/referrals", "Referrals"], ["/privacy", "Privacy"], ["/feed.xml", "RSS"]];

// Shown until the app starts, and for good to readers and crawlers that do not run JavaScript.
// If the app has not started after four seconds (a blocked script, a failed download), it comes back.
const STYLE = `<style>#ssr{max-width:760px;margin:0 auto;padding:24px 16px 64px;font:16px/1.6 Georgia,"Times New Roman",serif;color:#000}#ssr nav{font:13px/1.8 ui-sans-serif,system-ui,sans-serif;margin:0 0 24px}#ssr nav a{margin-right:14px;color:#000}#ssr h1{font:700 30px/1.2 ui-sans-serif,system-ui,sans-serif;margin:16px 0}#ssr h2{font:700 20px/1.3 ui-sans-serif,system-ui,sans-serif;margin:32px 0 8px;border-top:2px solid #000;padding-top:12px}#ssr h3{font:700 16px/1.4 ui-sans-serif,system-ui,sans-serif;margin:18px 0 4px}#ssr table{border-collapse:collapse;width:100%;font:13px/1.4 ui-sans-serif,system-ui,sans-serif}#ssr th,#ssr td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}#ssr .k{font:700 11px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.12em}#ssr .m{color:#555;font-size:14px}#ssr a{color:#0f5c3e}.js #ssr{display:none}</style><script>(function(d){var e=d.documentElement;e.classList.add("js");setTimeout(function(){var r=d.getElementById("root");if(r&&d.getElementById("ssr"))e.classList.remove("js")},4000)})(document)</script>`;

function frame(main) {
  const nav = (items) => items.map(([h, l]) => `<a href="${h}">${l}</a>`).join("");
  return `<div id="ssr"><header><a href="/"><strong>THE GP PULSE</strong></a><nav aria-label="Sections">${nav(NAV)}<a href="/#subscribe"><strong>Subscribe</strong></a></nav></header><main>${main}</main><footer><h2>Get tomorrow's issue</h2><p>Free. Weekdays at 6:00am ET. <a href="/#subscribe">Subscribe to The GP Pulse</a>.</p><nav aria-label="More">${nav(FOOT)}</nav><p class="m">© ${new Date().getUTCFullYear()} The GP Pulse. Not investment advice. The editor's firm is excluded from coverage while its deals are live.</p></footer></div>`;
}

export const ORG = {
  "@type": "NewsMediaOrganization",
  "@id": `${SITE.url}/#org`,
  name: SITE.name,
  url: SITE.url,
  logo: { "@type": "ImageObject", url: SITE.image },
  description: SITE.description,
  founder: { "@type": "Person", "@id": `${SITE.url}/about#editor`, name: SITE.editor.name, jobTitle: SITE.editor.title },
  ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
};

export const crumbs = (items) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE.url + path })),
});

/**
 * page: { path, title, description, main, type?, robots?, jsonld?, published?, modified?, image? }
 * Returns the full HTML document.
 */
export function document_(shell, page) {
  const url = SITE.url + (page.path === "/" ? "/" : page.path);
  const image = page.image ?? SITE.image;
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<meta name="robots" content="${page.robots ?? "index, follow, max-image-preview:large, max-snippet:-1"}">`,
    page.robots?.includes("noindex") ? "" : `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(SITE.name)}">`,
    `<meta property="og:type" content="${page.type ?? "website"}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(page.ogTitle ?? page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="en_US">`,
    page.published ? `<meta property="article:published_time" content="${esc(page.published)}">` : "",
    page.modified ? `<meta property="article:modified_time" content="${esc(page.modified)}">` : "",
    page.type === "article" ? `<meta property="article:author" content="${esc(SITE.editor.name)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(page.ogTitle ?? page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    ...(page.jsonld ?? []).map(ld),
    STYLE,
  ].filter(Boolean).join("\n    ");
  const body = frame(page.main);
  if (!shell) {
    // No shell to be had (should not happen in production): a plain, complete page beats an error.
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head.replace(/\.js #ssr\{display:none\}/, "").replace(/<script>\(function[\s\S]*?<\/script>/, "")}</head><body>${body}</body></html>`;
  }
  return shell.replace(HEAD, () => head).replace(BODY, () => body);
}
