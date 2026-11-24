// Link-preview card for one issue.
//
// The site is a single-page app, so a link to /archive/<slug> looks the same to X, LinkedIn,
// Slack or iMessage as a link to the home page. vercel.json sends those services (matched by
// user agent) here instead. They get a small HTML page whose title and description are that
// issue's subject line and preheader. People never see this page: browsers are not rewritten,
// and the page itself forwards to the real one.
//
// Reads only issues that have been sent, with the site's public key.

const SITE = "https://thegppulse.com";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/i;

export function cardHtml(issue, slug) {
  const url = `${SITE}/archive/${encodeURIComponent(slug)}`;
  const date = issue?.sent_at ? new Date(issue.sent_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : null;
  const title = issue ? `${issue.subject} | The GP Pulse` : "The GP Pulse: the lower middle market, every weekday morning";
  const description = issue
    ? (issue.preheader || `Issue #${issue.issue_number} of The GP Pulse${date ? `, ${date}` : ""}. The lower middle market, every weekday morning.`)
    : "The deals nobody announced, the sub-$1B funds in market, who moved where. Written by a GP. Free, weekday mornings.";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="The GP Pulse">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(issue ? issue.subject : title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og.png">
${issue?.sent_at ? `<meta property="article:published_time" content="${esc(issue.sent_at)}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(issue ? issue.subject : title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og.png">
</head><body>
<h1>${esc(issue ? issue.subject : "The GP Pulse")}</h1>
<p>${esc(description)}</p>
<p><a href="${esc(url)}">Read the issue</a></p>
</body></html>`;
}

export default async function handler(req, res) {
  const slug = String(req.query?.slug ?? "").trim();
  let issue = null;
  const base = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (base && key && (UUID.test(slug) || SLUG.test(slug))) {
    try {
      const filter = UUID.test(slug) ? `id=eq.${slug}` : `slug=eq.${encodeURIComponent(slug)}`;
      const r = await fetch(`${base}/rest/v1/newsletters?select=subject,preheader,issue_number,sent_at&status=eq.sent&${filter}&limit=1`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
      if (r.ok) issue = (await r.json())[0] ?? null;
    } catch { /* fall through to the generic card */ }
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", issue ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300");
  res.status(200).send(cardHtml(issue, SLUG.test(slug) || UUID.test(slug) ? slug : ""));
}
