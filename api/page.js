// Every public page. vercel.json sends all page requests here; this fills the app shell's two
// slots (head and body) with that page's own title, description, structured data and text.
// Private pages (/admin, /preferences, /unsubscribe, /vote) skip this and get the bare shell.

import { document_, loadShell } from "./_lib/core.js";
import { render } from "./_lib/pages.js";

export default async function handler(req, res) {
  let path = "/" + String(req.query?.p ?? "").replace(/^\/+/, "");
  if (path.length > 200 || /[\u0000-\u001f<>"]/.test(path)) path = "/__invalid";
  let status = 200, html, cache = 0;
  try {
    const [shell, out] = await Promise.all([loadShell(req.headers["x-forwarded-host"] || req.headers.host), render(path)]);
    status = out.status;
    cache = shell ? out.page.cache ?? 300 : 0;
    html = document_(shell, out.page);
    res.setHeader("X-Shell", shell ? "ok" : "missing");
  } catch (e) {
    // Never let a rendering fault take the site down: fall back to the bare app.
    console.error("page render failed", path, e);
    const shell = await loadShell(req.headers["x-forwarded-host"] || req.headers.host).catch(() => null);
    html = shell ?? `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The GP Pulse</title></head><body><p>The GP Pulse is having trouble loading. Please try again in a minute.</p></body></html>`;
    status = shell ? 200 : 503;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // A page that exists may be served a little stale while it refreshes. A 404 may not: an issue's
  // address is a 404 until the moment it sends, and must turn into the issue straight away.
  res.setHeader("Cache-Control", cache <= 0 ? "no-store" : status === 200 ? `public, max-age=0, s-maxage=${cache}, stale-while-revalidate=86400` : `public, max-age=0, s-maxage=${cache}`);
  if (status === 404) res.setHeader("X-Robots-Tag", "noindex");
  res.status(status).send(html);
}
