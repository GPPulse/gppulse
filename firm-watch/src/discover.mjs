// Discovery: visit each watchlist firm's site once and record where its news lives.
// Finds RSS/Atom feeds, news/press listing pages, mailing-list signup forms and the
// firm's LinkedIn page, saves them to pe_firm_sources, and writes hand-off CSVs to out/.
//
//   node src/discover.mjs                 all firms not yet discovered
//   node src/discover.mjs --retry         also re-check firms where nothing was found
//   node src/discover.mjs --all           re-check every firm
//   node src/discover.mjs --tier 1        only firms with deals in the last 12 months
//   node src/discover.mjs --limit 25
//   node src/discover.mjs --render        render JavaScript-only sites in headless Chromium (needs Playwright)
import { writeFile, mkdir, appendFile } from 'node:fs/promises';
import { get, pool, allowed, scanHome, extractItems, extractTombstones, findLinks, parseFeed, looksLikeFeed, sameSite, WP_POSTS, parseWpPosts, parseSitemap, sourceKind, looksJsRendered, render, closeRenderer } from './lib.mjs';
import { api, chunk } from './api.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);

const GUESS_PAGES = ['/news', '/press', '/press-releases', '/news-insights', '/media', '/newsroom', '/insights', '/news-and-insights'];
// The Google News sweep is a search, not a site; crawl.mjs handles it.
export const isSweep = (f) => /\/lmm-sweep$/.test(f.website_url || '');
const GUESS_FEEDS = ['/feed/', '/rss.xml', '/news/feed/', '/feed.xml', '/atom.xml', '/index.xml', '/blog/feed/', '/press/feed/'];
const GUESS_SITEMAPS = ['/sitemap.xml', '/wp-sitemap.xml', '/sitemap_index.xml'];
const ARTICLE_SITEMAP = /post|news|press|article|blog|insight|announcement/i;
// Advisors and lenders list closed deals on a page of their own.
const GUESS_DEALS = ['/transactions', '/our-transactions', '/recent-transactions', '/closed-transactions', '/deals', '/experience', '/portfolio', '/investments', '/track-record'];
const DEALS_TEXT = /^(recent |our |closed |select(ed)? )?(transactions|deals|tombstones|track record|experience|portfolio|investments|closings)$/i;
const DEALS_PATH = /\/(transactions?|deals?|tombstones|experience|track-record|closed|closings|portfolio|investments)/i;

export async function discoverFirm(firm, { renderJs = false } = {}) {
  const out = { slug: firm.slug, checked: new Date().toISOString().slice(0, 10), status: 'ok', home: null, feeds: [], pages: [], deals: null, linkedin: null, signup: null };
  const host = new URL(firm.website).hostname;
  const candidates = [firm.website, host.startsWith('www.') ? `https://${host.slice(4)}` : `https://www.${host}`, `http://${host}`];
  let home = null;
  for (const url of candidates) {
    const res = await get(url);
    if (res.ok && res.body.length > 300) { home = res; break; }
    out.status = res.status ? `http ${res.status}` : `unreachable (${res.error || 'no response'})`;
  }
  if (!home) return out;
  out.status = 'ok';
  out.home = home.url;
  if (!sameSite(home.url, firm.website)) out.redirected = new URL(home.url).hostname; // firm renamed or was absorbed

  const scan = scanHome(home.body, home.url);
  out.linkedin = scan.linkedin[0] || null;
  out.signup = scan.signup;
  const origin = new URL(home.url).origin;

  // Feeds: declared ones first, then the usual WordPress-style locations.
  for (const url of [...scan.feeds, ...GUESS_FEEDS.map((p) => origin + p)]) {
    if (out.feeds.length) break;
    if (!(await allowed(url))) continue;
    const res = await get(url, { accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' });
    if (looksLikeFeed(res) && parseFeed(res.body).length) out.feeds.push(res.url);
  }
  // WordPress sites with the feed turned off usually still answer the REST API.
  if (!out.feeds.length && (await allowed(origin + WP_POSTS))) {
    const res = await get(origin + WP_POSTS, { accept: 'application/json' });
    if (res.ok && parseWpPosts(res.body).length >= 3) out.feeds.push(origin + WP_POSTS);
  }

  // News pages: links found on the home page first, then common paths.
  const tried = new Set();
  for (const url of [...scan.newsPages, ...GUESS_PAGES.map((p) => origin + p)]) {
    if (out.pages.length >= 2) break;
    const key = url.replace(/\/$/, '');
    if (tried.has(key)) continue;
    tried.add(key);
    if (!(await allowed(url))) continue;
    const res = await get(url);
    if (!res.ok || !sameSite(res.url, origin)) continue;
    const final = res.url.replace(/\/$/, '');
    if (final === origin || out.pages.some((p) => p.url.replace(/\/$/, '') === final)) continue; // soft 404 back to home, or a duplicate
    const items = extractItems(res.body, res.url);
    if (items.length >= 3) out.pages.push({ url: res.url, items: items.length, dated: items.filter((i) => i.date).length });
    if (!out.signup) out.signup = scanHome(res.body, res.url).signup;
    if (!out.linkedin) out.linkedin = scanHome(res.body, res.url).linkedin[0] || null;
  }
  if (firm.kind === 'advisor' || firm.kind === 'lender') {
    for (const url of [...findLinks(home.body, home.url, DEALS_TEXT, DEALS_PATH), ...GUESS_DEALS.map((p) => origin + p)]) {
      const key = url.replace(/\/$/, '');
      if (tried.has(key)) continue;
      tried.add(key);
      if (!(await allowed(url))) continue;
      const res = await get(url);
      if (!res.ok || !sameSite(res.url, origin) || res.url.replace(/\/$/, '') === origin) continue;
      const n = extractTombstones(res.body, res.url).length;
      if (n >= 3) { out.deals = { url: res.url, items: n }; break; }
    }
  }
  // Last resort before giving up: the site's XML sitemap, if it lists news or post URLs.
  if (!out.feeds.length && !out.pages.length && !out.deals) {
    const sm = await findSitemap(origin);
    if (sm) out.feeds.push(sm);
  }
  // A page built entirely in the browser: render it, then look again.
  if (!out.feeds.length && !out.pages.length && !out.deals && renderJs && looksJsRendered(home.body)) {
    const shown = await render(home.url);
    if (shown.ok) {
      const scan2 = scanHome(shown.body, shown.url);
      out.linkedin ||= scan2.linkedin[0] || null;
      out.signup ||= scan2.signup;
      for (const url of [...scan2.newsPages, ...GUESS_PAGES.slice(0, 4).map((p) => origin + p)]) {
        if (out.pages.length) break;
        if (!(await allowed(url))) continue;
        const res = await render(url);
        if (!res.ok || !sameSite(res.url, origin) || res.url.replace(/\/$/, '') === origin) continue;
        const items = extractItems(res.body, res.url);
        if (items.length >= 3) out.pages.push({ url: res.url, items: items.length, dated: items.filter((i) => i.date).length, rendered: true });
      }
    }
  }
  if (!out.feeds.length && !out.pages.length && !out.deals) out.status = 'no news source found';
  return out;
}

// The sitemap (or the posts sitemap inside a sitemap index) that lists at least three articles.
export async function findSitemap(origin) {
  const accept = 'application/xml,text/xml,*/*';
  for (const path of GUESS_SITEMAPS) {
    const url = origin + path;
    if (!(await allowed(url))) continue;
    const res = await get(url, { accept });
    if (!res.ok || !/<(urlset|sitemapindex)[\s>]/i.test(res.body.slice(0, 3000))) continue;
    const top = parseSitemap(res.body, res.url);
    if (top.items.length >= 3) return res.url;
    const kids = top.children.filter((c) => ARTICLE_SITEMAP.test(c) && sameSite(c, origin)).slice(0, 3);
    for (const kid of kids) {
      if (!(await allowed(kid))) continue;
      const r = await get(kid, { accept });
      if (r.ok && parseSitemap(r.body, r.url).items.length >= 3) return r.url;
    }
    return null; // one sitemap per site is enough to know
  }
  return null;
}

const SOURCE_LABEL = { feed: 'feed', wp: 'WordPress API', sitemap: 'sitemap' };

const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';

async function main() {
  let { firms } = await api('firms');
  firms = firms.filter((f) => !isSweep(f));
  let todo = firms.filter((f) => flag('all') || !f.discovered_at || (flag('retry') && !f.news_url && !f.feed_url && !f.deals_url));
  if (opt('tier')) todo = todo.filter((f) => (f.watch_tier ?? 4) <= Number(opt('tier')));
  if (opt('limit')) todo = todo.slice(0, Number(opt('limit')));
  console.log(`Discovering sources for ${todo.length} of ${firms.length} watchlist firms`);

  const results = [];
  for (const batch of chunk(todo, 48)) {
    // 16 firms at a time; each firm is its own host, and requests to any one host are spaced in get().
    const found = await pool(batch, 16, async (firm) => ({ firm, d: await discoverFirm({ slug: firm.id, name: firm.name, website: firm.website_url, kind: firm.source_kind }, { renderJs: flag('render') }) }));
    await api('discovered', { firms: found.filter((r) => r?.d).map(({ firm, d }) => ({
      id: firm.id, news_url: d.pages[0]?.url ?? null, feed_url: d.feeds[0] ?? null, deals_url: d.deals?.url ?? null, linkedin_url: d.linkedin,
      signup_page: d.signup?.page ?? null, signup_provider: d.signup?.provider ?? null,
      note: d.status !== 'ok' ? d.status : d.redirected ? `ok; site now redirects to ${d.redirected}` : `ok; ${[d.feeds.length ? SOURCE_LABEL[sourceKind(d.feeds[0])] : '', d.pages.length ? `news page (${d.pages[0].items} items${d.pages[0].rendered ? ', rendered' : ''})` : '', d.deals ? `transactions page (${d.deals.items} tombstones)` : ''].filter(Boolean).join(' + ')}`,
    })) });
    results.push(...found.filter((r) => r?.d));
    console.log(`  ${results.length}/${todo.length}`);
  }

  await closeRenderer();

  // Full picture after this run, for the summary and the two hand-off lists.
  ({ firms } = await api('firms'));
  const n = (fn) => firms.filter(fn).length;
  const summary = [
    `## Firm watch discovery`,
    `Checked ${results.length} firms this run. **${n((f) => f.news_url || f.feed_url || f.deals_url)} of ${firms.length}** sources are readable (${n((f) => f.feed_url)} feeds, ${n((f) => f.news_url)} news pages, ${n((f) => f.deals_url)} advisor/lender transactions pages).`,
    `${n((f) => f.linkedin_url)} LinkedIn pages found, ${n((f) => f.signup_page)} mailing-list forms found, ${n((f) => f.discovered_at && !f.news_url && !f.feed_url && !f.deals_url)} firms with nothing readable.`,
  ].join('\n\n');
  console.log('\n' + summary);
  await mkdir(new URL('../out/', import.meta.url), { recursive: true });
  const out = (name, rows) => writeFile(new URL(`../out/${name}`, import.meta.url), csv(rows));
  await out('linkedin-pages.csv', [['firm', 'tier', 'linkedin_url'], ...firms.filter((f) => f.linkedin_url).map((f) => [f.name, f.watch_tier, f.linkedin_url])]);
  await out('signup-forms.csv', [['firm', 'tier', 'signup_page', 'provider', 'subscribed'], ...firms.filter((f) => f.signup_page).map((f) => [f.name, f.watch_tier, f.signup_page, f.signup_provider || '', f.subscribed_at ? 'yes' : ''])]);
  await out('needs-review.csv', [['firm', 'tier', 'website', 'note'], ...firms.filter((f) => f.discovered_at && !f.news_url && !f.feed_url && !f.deals_url).map((f) => [f.name, f.watch_tier, f.website_url, f.discovery_note || ''])]);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
