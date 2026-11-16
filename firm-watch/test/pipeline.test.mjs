// Runs the real discover, crawl and portfolio scripts against local stand-ins for a sponsor
// site, an advisor site and the firm-watch edge function, to check they agree on the contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const cwd = new URL('..', import.meta.url).pathname;

test('discover, crawl and portfolio watch, end to end', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const state = { extraTombstone: '', extraCompany: '' };
  const site = await listen((req, res) => {
    const origin = `http://127.0.0.1:${site.address().port}`;
    const html = (b) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(b.replaceAll('https://www.huroncapital.com', origin)); };
    if (req.url === '/') return html(fx('home.html').replace('<a href="/portfolio/">Portfolio</a>', `<a href="${origin}/portfolio/">Portfolio</a>`));
    if (req.url === '/news/') return html(fx('news.html').replace('11/02/2026', `${today.slice(5, 7)}/${today.slice(8)}/${today.slice(0, 4)}`));
    if (req.url === '/news/huron-capital-promotes-two/') return html(`<html><body><article><p>${'Huron Capital today announced the promotion of Jane Doe to Partner and John Roe to Principal, effective immediately. '.repeat(3)}</p></article></body></html>`);
    if (req.url === '/portfolio/') return html(fx('portfolio.html').replace('<div class="card"><img src="5.png"', `${state.extraCompany}<div class="card"><img src="5.png"`));
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>nope</html>');
  });
  const bank = await listen((req, res) => {
    const html = (b) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(b); };
    if (req.url === '/') return html('<html><body><nav><a href="/transactions/">Transactions</a></nav><main><h1>An M&amp;A advisor to the middle market, with a long record of closed deals for founders.</h1><p>' + 'x'.repeat(300) + '</p></main></body></html>');
    if (req.url === '/transactions/') return html(fx('tombstones.html').replace('<div class="tombstone"><h3>Team outing', `${state.extraTombstone}<div class="tombstone"><h3>Team outing`));
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>nope</html>');
  });
  const base = { watch_tier: 1, news_url: null, feed_url: null, deals_url: null, portfolio_url: null, portfolio_names: null, portfolio_checked_at: null, discovered_at: null, last_scraped_at: null };
  const db = {
    firms: [
      { ...base, id: 'f1', name: 'Huron Capital', website_url: `http://127.0.0.1:${site.address().port}`, watchlist: true, source_kind: 'sponsor' },
      { ...base, id: 'a1', name: 'Example Advisors', website_url: `http://127.0.0.1:${bank.address().port}`, watchlist: false, source_kind: 'advisor', watch_tier: null },
    ],
    content: new Map(), desk: [],
  };
  const byId = (id) => db.firms.find((f) => f.id === id);
  const fn = await listen((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      assert.equal(req.headers['x-pipeline-secret'], 's3cret');
      const b = JSON.parse(raw); let out = {};
      if (b.action === 'firms') out = { firms: db.firms };
      if (b.action === 'discovered') { for (const f of b.firms) Object.assign(byId(f.id), f, { discovered_at: 'now' }); out = { updated: b.firms.length }; }
      if (b.action === 'check') out = { unknown: b.urls.filter((u) => !db.content.has(u)) };
      if (b.action === 'items') { let queued = 0; for (const i of b.items) if (!db.content.has(i.url)) { db.content.set(i.url, i); if (!i.seen_only) queued++; } out = { created: b.items.length, queued }; }
      if (b.action === 'crawled') { for (const id of b.firm_ids) byId(id).last_scraped_at = 'now'; out = { stamped: b.firm_ids.length }; }
      if (b.action === 'portfolio') {
        for (const f of b.firms) { const row = byId(f.id); row.portfolio_checked_at = 'now'; if (f.portfolio_url !== undefined) row.portfolio_url = f.portfolio_url; if (Array.isArray(f.names)) row.portfolio_names = f.names; }
        db.desk.push(...b.signals); out = { updated: b.firms.length, filed: b.signals.length };
      }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
  });
  const env = { ...process.env, FIRM_WATCH_URL: `http://127.0.0.1:${fn.address().port}`, PIPELINE_SECRET: 's3cret', GITHUB_STEP_SUMMARY: '' };
  const node = (...a) => run('node', a, { env, cwd });
  try {
    await node('src/discover.mjs');
    assert.ok(byId('f1').news_url.endsWith('/news/'));
    assert.equal(byId('f1').linkedin_url, 'https://www.linkedin.com/company/huron-capital-partners');
    assert.ok(byId('f1').signup_page);
    assert.ok(byId('a1').deals_url.endsWith('/transactions/'), 'advisor transactions page found');

    // First crawl: archives recorded, only today's dated news queued.
    await node('src/crawl.mjs', '--no-gnews');
    const queued = () => [...db.content.values()].filter((r) => !r.seen_only);
    assert.equal([...db.content.values()].length, 7, '4 news links + 3 tombstones recorded');
    assert.equal(queued().length, 1);
    assert.match(queued()[0].title, /Promotes Jane Doe/);
    assert.equal(queued()[0].category_hint, 'people_moves');
    assert.match(queued()[0].content, /promotion of Jane Doe[\s\S]*Watchlist firm: Huron Capital/);

    // A new tombstone appears on the advisor's page: it is queued, and labelled as the advisor's.
    state.extraTombstone = '<div class="tombstone"><h3>Omega Valve</h3><p>has been acquired by Huron Capital</p></div>';
    const second = await node('src/crawl.mjs', '--no-gnews');
    assert.match(second.stdout, /1 new items for the classifier/);
    const tomb = queued().find((r) => /Omega Valve/.test(r.title));
    assert.equal(tomb.firm_id, 'a1');
    assert.equal(tomb.category_hint, 'deal_flow');
    assert.match(tomb.content, /Example Advisors is the advisor on the deal, not the buyer/);
    assert.match((await node('src/crawl.mjs', '--no-gnews')).stdout, /0 new items for the classifier/);

    // Portfolio watch: first run stores the list, a later new company becomes a Desk signal.
    await node('src/portfolio.mjs');
    assert.ok(byId('f1').portfolio_url.endsWith('/portfolio/'));
    assert.equal(byId('f1').portfolio_names.length, 5);
    assert.equal(db.desk.length, 0);
    await node('src/portfolio.mjs');
    assert.equal(db.desk.length, 0, 'no change, no signal');
    state.extraCompany = '<div class="card"><h3>Delta Flow Controls</h3></div>';
    await node('src/portfolio.mjs');
    assert.deepEqual(db.desk.map((s) => s.headline), ["First spotted: Delta Flow Controls now on Huron Capital's portfolio page"]);
    assert.equal(byId('f1').portfolio_names.length, 6);
    await node('src/portfolio.mjs');
    assert.equal(db.desk.length, 1, 'not reported twice');
  } finally { site.close(); bank.close(); fn.close(); }
});
