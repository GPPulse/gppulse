// Fetch politeness (spacing, retry, backoff) and the extra places discovery now looks:
// the WordPress REST API, XML sitemaps, JavaScript-only pages, and batched name searches.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { get, retryDelay, parseWpPosts, parseSitemap, titleFromSlug, sourceKind, readSource, looksJsRendered, UA } from '../src/lib.mjs';
import { discoverFirm } from '../src/discover.mjs';
import { nameQueries } from '../src/crawl.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const today = new Date().toISOString().slice(0, 10);

test('Retry-After is honoured in seconds or as a date; otherwise exponential backoff', () => {
  assert.equal(retryDelay(0, '3'), 3000);
  assert.equal(retryDelay(0, new Date(Date.now() + 5000).toUTCString(), Date.now()) > 3000, true);
  const d0 = retryDelay(0, null), d1 = retryDelay(1, null);
  assert.ok(d0 >= 2000 && d0 < 3000 && d1 >= 4000 && d1 < 5000);
});

test('get: identifies itself, retries 429 and 503, does not retry 403, spaces requests to one host', async () => {
  const hits = { flaky: 0, blocked: 0, slow: 0 };
  const times = [];
  const s = await listen((req, res) => {
    assert.equal(req.headers['user-agent'], UA);
    if (req.url === '/flaky') { hits.flaky++; if (hits.flaky < 3) { res.writeHead(hits.flaky === 1 ? 429 : 503, { 'retry-after': '0' }); return res.end(); } }
    if (req.url === '/blocked') { hits.blocked++; res.writeHead(403); return res.end(); }
    if (req.url === '/later') { res.writeHead(429, { 'retry-after': '3600' }); return res.end(); }
    if (req.url === '/spaced') times.push(Date.now());
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>ok</html>');
  });
  const o = `http://127.0.0.1:${s.address().port}`;
  try {
    const flaky = await get(`${o}/flaky`, { gap: 0 });
    assert.equal(flaky.ok, true); assert.equal(hits.flaky, 3);
    const blocked = await get(`${o}/blocked`, { gap: 0 });
    assert.equal(blocked.status, 403); assert.equal(hits.blocked, 1);
    const t = Date.now();
    const later = await get(`${o}/later`, { gap: 0 });
    assert.equal(later.status, 429); assert.ok(Date.now() - t < 1000, 'a long Retry-After is a reason to stop, not to wait');
    await Promise.all([get(`${o}/spaced`, { gap: 150 }), get(`${o}/spaced`, { gap: 150 }), get(`${o}/spaced`, { gap: 150 })]);
    times.sort();
    assert.ok(times[1] - times[0] >= 130 && times[2] - times[1] >= 130, `requests to one host were spaced (${times[1] - times[0]}ms, ${times[2] - times[1]}ms)`);
  } finally { s.close(); }
});

test('WordPress REST API posts become feed items', () => {
  const body = JSON.stringify([
    { link: 'https://x.com/acme-acquires-widget/', date: '2026-11-18T09:00:00', title: { rendered: 'Acme Capital Acquires Widget Co&#8217;s Assets' }, excerpt: { rendered: '<p>Acme Capital today&nbsp;announced&#8230;</p>' } },
    { link: 'not a url', title: { rendered: 'x' } },
  ]);
  assert.deepEqual(parseWpPosts(body), [{ url: 'https://x.com/acme-acquires-widget/', title: "Acme Capital Acquires Widget Co's Assets", date: '2026-11-18', summary: 'Acme Capital today announced&#8230;' }]);
  assert.deepEqual(parseWpPosts('<html>'), []);
  assert.equal(sourceKind('https://x.com/wp-json/wp/v2/posts?per_page=20'), 'wp');
  assert.equal(sourceKind('https://x.com/post-sitemap.xml'), 'sitemap');
  assert.equal(sourceKind('https://x.com/feed/'), 'feed');
});

test('sitemaps: article URLs only, newest first, index children listed', () => {
  assert.equal(titleFromSlug('https://x.com/news/acme-capital-acquires-widget-co-llc/'), 'Acme Capital Acquires Widget Co LLC');
  assert.equal(titleFromSlug('https://x.com/news/12345'), '');
  const set = `<?xml version="1.0"?><urlset>
    <url><loc>https://x.com/</loc></url>
    <url><loc>https://x.com/team/jane-doe-partner/</loc></url>
    <url><loc>https://x.com/news/</loc></url>
    <url><loc>https://x.com/news/acme-invests-in-widget-co/</loc><lastmod>2026-10-01</lastmod></url>
    <url><loc>https://x.com/news/acme-promotes-jane-doe-to-partner/</loc><lastmod>2026-11-10T08:00:00+00:00</lastmod></url>
    <url><loc>https://x.com/news/report.pdf</loc></url></urlset>`;
  const { items } = parseSitemap(set, 'https://x.com/sitemap.xml');
  assert.deepEqual(items.map((i) => [i.title, i.date]), [['Acme Promotes Jane Doe To Partner', '2026-11-10'], ['Acme Invests In Widget Co', '2026-10-01']]);
  // A posts sitemap counts every URL, whatever the path.
  assert.equal(parseSitemap('<urlset><url><loc>https://x.com/acme-invests-in-widget-co/</loc></url></urlset>', 'https://x.com/post-sitemap.xml').items.length, 1);
  const idx = parseSitemap('<sitemapindex><sitemap><loc>https://x.com/page-sitemap.xml</loc></sitemap><sitemap><loc>https://x.com/post-sitemap.xml</loc></sitemap></sitemapindex>', 'https://x.com/sitemap_index.xml');
  assert.deepEqual(idx.children, ['https://x.com/page-sitemap.xml', 'https://x.com/post-sitemap.xml']);
});

test('discovery falls back to the WordPress API, then the sitemap; the crawl reads both', async () => {
  const home = '<html><body><nav><a href="/about">About</a><a href="/team">Team</a><a href="/portfolio">Portfolio</a><a href="/contact">Contact</a></nav><main><h1>Acme Capital invests in founder-owned lower middle market businesses.</h1><p>' + 'x'.repeat(400) + '</p></main></body></html>';
  const wp = await listen((req, res) => {
    const o = `http://127.0.0.1:${wp.address().port}`;
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(home); }
    if (req.url.startsWith('/wp-json/wp/v2/posts')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify([1, 2, 3].map((n) => ({ link: `${o}/deal-${n}/`, date: `${today}T10:00:00`, title: { rendered: `Acme Capital Acquires Widget Company Number ${n}` } }))));
    }
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>nope</html>');
  });
  let wpHit = false;
  const sm = await listen((req, res) => {
    const o = `http://127.0.0.1:${sm.address().port}`;
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(home); }
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /wp-json/\n'); }
    if (req.url === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<sitemapindex><sitemap><loc>${o}/page-sitemap.xml</loc></sitemap><sitemap><loc>${o}/post-sitemap.xml</loc></sitemap></sitemapindex>`); }
    if (req.url === '/post-sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<urlset>${[1, 2, 3].map((n) => `<url><loc>${o}/acme-capital-acquires-widget-company-${n}/</loc><lastmod>${today}</lastmod></url>`).join('')}</urlset>`); }
    if (req.url.startsWith('/wp-json')) wpHit = true;
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>nope</html>');
  });
  try {
    const a = await discoverFirm({ slug: 'a', name: 'Acme', website: `http://127.0.0.1:${wp.address().port}` });
    assert.equal(a.status, 'ok');
    assert.match(a.feeds[0], /\/wp-json\/wp\/v2\/posts/);
    assert.equal((await readSource(a.feeds[0])).length, 3);

    const b = await discoverFirm({ slug: 'b', name: 'Acme', website: `http://127.0.0.1:${sm.address().port}` });
    assert.equal(b.status, 'ok');
    assert.match(b.feeds[0], /post-sitemap\.xml$/);
    assert.equal(wpHit, false, 'robots.txt disallowed the API, so it was not asked');
    const items = await readSource(b.feeds[0]);
    assert.deepEqual(items.map((i) => i.date), [today, today, today]);
    assert.match(items[0].title, /^Acme Capital Acquires Widget Company \d$/);
  } finally { wp.close(); sm.close(); }
});

test('only empty JavaScript shells are flagged for rendering', () => {
  assert.equal(looksJsRendered('<html><body><div id="root"></div><script src="a.js"></script></body></html>'), true);
  assert.equal(looksJsRendered('<html><body><script></script><script></script><script></script><a href="/">Home</a></body></html>'), true);
  assert.equal(looksJsRendered(fx('home.html')), false);
});

test('name searches pack a dozen firms per query and stay under the length cap', () => {
  const firms = Array.from({ length: 30 }, (_, i) => ({ name: `Example Capital Partners ${i}` }));
  const qs = nameQueries(firms);
  assert.equal(qs.length, 3);
  assert.deepEqual(qs.map((q) => q.firms.length), [12, 12, 6]);
  assert.match(qs[0].q, /^\("Example Capital Partners 0" OR "Example Capital Partners 1" OR .*\) when:3d$/);
  const long = nameQueries(Array.from({ length: 12 }, (_, i) => ({ name: `A Very Long Firm Name That Goes On And On Holdings ${i}` })));
  assert.ok(long.length > 1 && long.every((q) => q.q.length <= 480));
});

test('a JavaScript-only news page is found when rendering is on', async (t) => {
  const { render, closeRenderer } = await import('../src/lib.mjs');
  const probe = await render('about:blank').catch(() => ({ error: 'no' }));
  if (/not installed|no browser/.test(probe.error || '')) return t.skip('no headless browser here');
  const shell = (data) => `<html><body><div id="root"></div><script>const d=${JSON.stringify(data)};document.getElementById('root').innerHTML=d;</script><script></script><script></script></body></html>`;
  const s = await listen((req, res) => {
    res.writeHead(req.url === '/' || req.url === '/news' ? 200 : 404, { 'content-type': 'text/html' });
    if (req.url === '/') return res.end(shell('<a href="/news">News</a><p>' + 'Acme Capital partners with founders. '.repeat(20) + '</p>'));
    if (req.url === '/news') return res.end(shell([1, 2, 3].map((n) => `<article><h3><a href="/news/deal-${n}">Acme Capital Acquires Widget Company Number ${n}</a></h3><time datetime="${today}">${today}</time></article>`).join('')));
    res.end('<html>nope</html>');
  });
  try {
    const o = `http://127.0.0.1:${s.address().port}`;
    const plain = await discoverFirm({ slug: 'js', name: 'Acme', website: o });
    assert.equal(plain.status, 'no news source found');
    const shown = await discoverFirm({ slug: 'js', name: 'Acme', website: o }, { renderJs: true });
    assert.equal(shown.status, 'ok');
    assert.deepEqual(shown.pages, [{ url: `${o}/news`, items: 3, dated: 3, rendered: true }]);
  } finally { s.close(); await closeRenderer(); }
});
