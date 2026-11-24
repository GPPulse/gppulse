// sitemap.xml: the standing pages plus every issue that has gone out.

import { ISSUE_LIST, issuePath, sb, SITE } from "./_lib/core.js";

const PAGES = [["/", "daily", "1.0"], ["/archive", "daily", "0.9"], ["/deals", "daily", "0.9"], ["/sponsors", "daily", "0.8"], ["/comps", "daily", "0.8"], ["/pricing", "weekly", "0.8"], ["/funds", "daily", "0.8"], ["/people-moves", "daily", "0.7"], ["/deal-stats", "weekly", "0.6"], ["/about", "monthly", "0.6"], ["/tip", "monthly", "0.4"], ["/referrals", "monthly", "0.3"], ["/privacy", "yearly", "0.2"]];
const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sitemapXml(issues, today = new Date().toISOString().slice(0, 10)) {
  const latest = issues[0]?.sent_at?.slice(0, 10) ?? today;
  const urls = [
    ...PAGES.map(([p, freq, pri]) => `<url><loc>${x(SITE.url + p)}</loc>${freq === "daily" ? `<lastmod>${latest}</lastmod>` : ""}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`),
    ...issues.map((n) => `<url><loc>${x(SITE.url + issuePath(n))}</loc>${n.sent_at ? `<lastmod>${x((n.updated_at ?? n.sent_at).slice(0, 10))}</lastmod>` : ""}<priority>0.7</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export default async function handler(_req, res) {
  const issues = (await sb(`${ISSUE_LIST}&limit=5000`)) ?? [];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  res.status(200).send(sitemapXml(issues));
}
