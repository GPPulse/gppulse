// Runs discovery against a local copy of a firm site, over real HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { discoverFirm } from '../src/discover.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('discovery over HTTP: finds the news page, respects robots, ignores soft 404s', async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const html = (body) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body.replaceAll('https://www.huroncapital.com', origin)); };
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /press\n'); }
    if (req.url === '/') return html(fx('home.html'));
    if (req.url === '/news/') return html(fx('news.html'));
    if (req.url === '/insights') { res.writeHead(302, { location: '/' }); return res.end(); }
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>not found</html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const out = await discoverFirm({ slug: 'huron-capital', name: 'Huron Capital', website: origin });
    assert.equal(out.status, 'ok');
    assert.deepEqual(out.pages, [{ url: `${origin}/news/`, items: 4, dated: 4 }]);
    assert.deepEqual(out.feeds, []);
    assert.equal(out.linkedin, 'https://www.linkedin.com/company/huron-capital-partners');
    assert.equal(out.signup.page, `${origin}/`);
    assert.ok(!hits.includes('/press') && !hits.includes('/press-releases'), 'disallowed paths were not requested');
  } finally { server.close(); }
});
