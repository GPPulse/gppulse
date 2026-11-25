// RSS feed of sent issues, at /feed.xml. Feed readers, news aggregators and several AI search
// crawlers pick up new pages from a feed faster than from a sitemap.

import { ISSUE_LIST, issuePath, sb, SITE } from "./_lib/core.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = (s) => `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

export function feedXml(issues) {
  const items = issues.map((n) => {
    const url = SITE.url + issuePath(n);
    const lede = n.content?.editors_note;
    const body = [n.preheader ? `<p>${x(n.preheader)}</p>` : "", lede ? `<h3>${x(lede.headline)}</h3>${(lede.paragraphs ?? []).map((p) => `<p>${x(p)}</p>`).join("")}` : "", `<p><a href="${x(url)}">Read the full issue: deals, funds and people moves</a></p>`].join("");
    return `<item><title>${x(n.subject)}</title><link>${x(url)}</link><guid isPermaLink="true">${x(url)}</guid><pubDate>${new Date(n.sent_at).toUTCString()}</pubDate><dc:creator>${x(lede?.byline || SITE.editor.name)}</dc:creator><description>${x(n.preheader || lede?.paragraphs?.[0] || "")}</description><content:encoded>${cdata(body)}</content:encoded></item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${x(SITE.name)}</title>
<link>${SITE.url}</link>
<atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
<description>${x(SITE.description)}</description>
<language>en-us</language>
<image><url>${SITE.image}</url><title>${x(SITE.name)}</title><link>${SITE.url}</link></image>
${issues[0]?.sent_at ? `<lastBuildDate>${new Date(issues[0].sent_at).toUTCString()}</lastBuildDate>\n` : ""}${items.join("\n")}
</channel>
</rss>
`;
}

export default async function handler(_req, res) {
  const issues = (await sb(`${ISSUE_LIST.replace("updated_at", "updated_at,content")}&limit=30`)) ?? [];
  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  res.status(200).send(feedXml(issues));
}
