// Runs the real discover and crawl scripts against a local firm site and a stand-in for
// the firm-watch edge function, to check the two halves agree on the contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });

test('discover then crawl, end to end', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const site = await listen((req, res) => {
    const origin = `http://127.0.0.1:${site.address().port}`;
    const html = (b) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(b.replaceAll('https://www.huroncapital.com', origin)); };
    if (req.url === '/') return html(fx('home.html'));
    if (req.url === '/news/') return html(fx('news.html').replace('11/02/2026', `${today.slice(5, 7)}/${today.slice(8)}/${today.slice(0, 4)}`));
    if (req.url === '/news/huron-capital-promotes-two/') return html(`<html><body><article><p>${'Huron Capital today announced the promotion of Jane Doe to Partner and John Roe to Principal, effective immediately. '.repeat(3)}</p></article></body></html>`);
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>nope</html>');
  });
  const db = { firm: { id: 'f1', name: 'Huron Capital', website_url: `http://127.0.0.1:${site.address().port}`, watch_tier: 1, news_url: null, feed_url: null, discovered_at: null, last_scraped_at: null }, content: new Map() };
  const fn = await listen((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      assert.equal(req.headers['x-pipeline-secret'], 's3cret');
      const b = JSON.parse(raw); let out = {};
      if (b.action === 'firms') out = { firms: [db.firm] };
      if (b.action === 'discovered') { Object.assign(db.firm, b.firms[0], { discovered_at: 'now' }); out = { updated: 1 }; }
      if (b.action === 'check') out = { unknown: b.urls.filter((u) => !db.content.has(u)) };
      if (b.action === 'items') { let queued = 0; for (const i of b.items) if (!db.content.has(i.url)) { db.content.set(i.url, i); if (!i.seen_only) queued++; } out = { created: b.items.length, queued }; }
      if (b.action === 'crawled') { db.firm.last_scraped_at = 'now'; out = { stamped: 1 }; }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
  });
  const env = { ...process.env, FIRM_WATCH_URL: `http://127.0.0.1:${fn.address().port}`, PIPELINE_SECRET: 's3cret', GITHUB_STEP_SUMMARY: '' };
  try {
    await run('node', ['src/discover.mjs'], { env, cwd: new URL('..', import.meta.url).pathname });
    assert.ok(db.firm.news_url.endsWith('/news/'));
    assert.equal(db.firm.linkedin_url, 'https://www.linkedin.com/company/huron-capital-partners');
    assert.ok(db.firm.signup_page);

    await run('node', ['src/crawl.mjs', '--no-gnews'], { env, cwd: new URL('..', import.meta.url).pathname });
    const rows = [...db.content.values()];
    assert.equal(rows.length, 4, 'whole archive recorded');
    const queued = rows.filter((r) => !r.seen_only);
    assert.equal(queued.length, 1, 'only the item dated today goes to the classifier');
    assert.match(queued[0].title, /Promotes Jane Doe/);
    assert.equal(queued[0].category_hint, 'people_moves');
    assert.match(queued[0].content, /promotion of Jane Doe[\s\S]*Watchlist firm: Huron Capital/);
    assert.equal(queued[0].firm_id, 'f1');

    const again = await run('node', ['src/crawl.mjs', '--no-gnews'], { env, cwd: new URL('..', import.meta.url).pathname });
    assert.match(again.stdout, /0 new items for the classifier/);
  } finally { site.close(); fn.close(); }
});
