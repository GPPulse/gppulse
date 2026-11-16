// Daily crawl of the watchlist. For every firm with a known news page or feed, read it,
// ask the database which links are new, pull the text of the new ones and queue them for
// the newsletter's classifier. Also runs a Google News search for the most active firms,
// which catches coverage of firms whose own sites lag or can't be read.
//
//   node src/crawl.mjs [--tier 2] [--limit 50] [--no-gnews] [--gnews-tier 2] [--dry]
import { appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { get, pool, sleep, allowed, extractItems, extractTombstones, parseFeed, looksLikeFeed, classify, RELEVANT, nameMatcher } from './lib.mjs';
import { api, chunk } from './api.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const daysAgo = (d, now = Date.now()) => (d ? Math.round((now - new Date(d.length === 10 ? d + 'T12:00:00Z' : d)) / 864e5) : null);

const HINT = { platform: 'deal_flow', add_on: 'deal_flow', exit: 'deal_flow', fund: 'fund_tracker', people: 'people_moves' };

// Sort a firm's unseen links into "send to the classifier" and "record as already seen".
// The first time a firm is crawled its whole archive is unseen; only items dated in the
// last `freshDays` are news. After that, anything unseen is news unless it is plainly old
// (a site redesign re-listing old posts) or not about a deal, fund or person.
export function triage(items, { firstCrawl, freshDays = 10, now = Date.now() }) {
  const queue = [], seenOnly = [];
  for (const it of items) {
    const age = daysAgo(it.date, now);
    const kind = it.kind || classify(it.title, it.summary);
    const fresh = firstCrawl ? age !== null && age <= freshDays : age === null || age <= freshDays;
    (fresh && RELEVANT.has(kind) ? queue : seenOnly).push({ ...it, kind });
  }
  return { queue, seenOnly };
}

export function articleText(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, form, aside, noscript').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  const paras = root.find('p').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get().filter((p) => p.length > 40);
  const text = paras.join('\n').slice(0, 6000);
  return text.length > 200 ? text : null;
}

async function readFirm(firm) {
  const found = [];
  let failed = 0;
  if (firm.feed_url) {
    const res = await get(firm.feed_url, { accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' });
    if (looksLikeFeed(res)) found.push(...parseFeed(res.body).slice(0, 40).map((i) => ({ ...i, via: 'firm feed' }))); else failed++;
  }
  if (firm.news_url && !found.length) {
    if (await allowed(firm.news_url)) {
      const res = await get(firm.news_url);
      if (res.ok) found.push(...extractItems(res.body, res.url).map((i) => ({ ...i, via: 'firm site' }))); else failed++;
    }
  }
  // Advisors and lenders: every block on the closed-transactions page is a deal by definition.
  if (firm.deals_url && (await allowed(firm.deals_url))) {
    const res = await get(firm.deals_url);
    if (res.ok) found.push(...extractTombstones(res.body, res.url).map((i) => { const k = classify(i.title); return { ...i, kind: RELEVANT.has(k) ? k : 'platform', via: 'tombstone' }; })); else failed++;
  }
  return { firm, found, failed: failed > 0 && !found.length };
}

async function googleNews(firms) {
  const out = [];
  await pool(firms, 2, async (firm) => {
    const q = `"${firm.name}" (acquires OR acquisition OR "invests in" OR recapitalization OR promotes OR "private equity") when:5d`;
    const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { accept: 'application/rss+xml,application/xml,text/xml,*/*' });
    await sleep(700);
    if (!looksLikeFeed(res)) return;
    const match = nameMatcher([firm]);
    for (const it of parseFeed(res.body).slice(0, 12)) {
      const title = it.title.replace(/\s+-\s+[^-]+$/, '');
      if ((daysAgo(it.date) ?? 99) > 4 || !match(`${title} private equity`).length) continue;
      const kind = classify(title);
      if (RELEVANT.has(kind)) out.push({ ...it, title, kind, firm, via: `Google News${it.source ? ` — ${it.source}` : ''}` });
    }
  });
  return out;
}

async function main() {
  let { firms } = await api('firms');
  firms = firms.filter((f) => (f.watch_tier ?? 4) <= Number(opt('tier', 4)));
  const crawlable = firms.filter((f) => f.news_url || f.feed_url || f.deals_url).slice(0, Number(opt('limit', 1e9)));
  console.log(`${firms.filter((f) => f.watchlist).length} watchlist sponsors and ${firms.filter((f) => !f.watchlist).length} advisors/lenders; ${crawlable.length} with something to read`);

  const read = (await pool(crawlable, 8, readFirm)).filter((r) => r?.firm);
  const failing = read.filter((r) => r.failed).map((r) => r.firm.name);

  // Which of these links has the database never seen?
  const allUrls = [...new Set(read.flatMap((r) => r.found.map((i) => i.url)))];
  const unknown = new Set();
  for (const part of chunk(allUrls, 200)) (await api('check', { urls: part })).unknown.forEach((u) => unknown.add(u));

  const queue = [], seenOnly = [];
  for (const r of read) {
    const fresh = [...new Map(r.found.filter((i) => unknown.has(i.url)).map((i) => [i.url, i])).values()];
    const t = triage(fresh, { firstCrawl: !r.firm.last_scraped_at });
    queue.push(...t.queue.map((i) => ({ ...i, firm: r.firm })));
    seenOnly.push(...t.seenOnly.map((i) => ({ ...i, firm: r.firm })));
  }

  if (!flag('no-gnews')) {
    const active = firms.filter((f) => f.watchlist && (f.watch_tier ?? 4) <= Number(opt('gnews-tier', 2)));
    console.log(`Searching Google News for the ${active.length} most active firms`);
    const news = await googleNews(active);
    const fresh = new Set();
    for (const part of chunk([...new Set(news.map((i) => i.url))], 200)) (await api('check', { urls: part })).unknown.forEach((u) => fresh.add(u));
    // Skip coverage of a headline the firm's own site already gave us this run.
    const have = new Set(queue.map((i) => `${i.firm.id}|${i.title.toLowerCase().slice(0, 50)}`));
    for (const it of news) if (fresh.has(it.url) && !have.has(`${it.firm.id}|${it.title.toLowerCase().slice(0, 50)}`)) { have.add(`${it.firm.id}|${it.title.toLowerCase().slice(0, 50)}`); queue.push(it); }
  }

  // Full text for what is going to the classifier, so it has more than a headline to read.
  await pool(queue.filter((i) => i.via !== undefined && !i.via.startsWith('Google News') && !i.url.includes('#t-')), 6, async (it) => {
    if (!(await allowed(it.url))) return;
    const res = await get(it.url);
    if (res.ok) it.content = articleText(res.body);
  });

  const counts = queue.reduce((c, r) => ((c[r.kind] = (c[r.kind] || 0) + 1), c), {});
  console.log(`\n${queue.length} new items for the classifier:`, counts, `| ${seenOnly.length} recorded as already seen`);
  for (const r of queue.slice(0, 60)) console.log(`  [${r.kind}] ${r.firm.name}: ${r.title}`);
  if (failing.length) console.log(`\n${failing.length} firm sites could not be read this run (first few: ${failing.slice(0, 8).join(', ')})`);
  if (flag('dry')) return;

  const row = (i, seen_only) => ({
    firm_id: i.firm.id, url: i.url, title: i.title, seen_only,
    content: seen_only ? null : [i.content || i.summary || i.title, i.firm.watchlist
      ? `\n[Watchlist firm: ${i.firm.name}. Found via ${i.via}.]`
      : `\n[Source: ${i.firm.name}, ${i.firm.source_kind === 'lender' ? 'a middle-market lender' : 'an M&A advisor'}, from its own ${i.via === 'tombstone' ? 'list of closed transactions' : 'site'}. ${i.firm.name} is the ${i.firm.source_kind === 'lender' ? 'lender' : 'advisor'} on the deal, not the buyer.]`].join(''),
    published_at: i.date ? new Date(i.date.length === 10 ? i.date + 'T12:00:00Z' : i.date).toISOString() : null,
    source_name: i.firm.name, category_hint: HINT[i.kind] || null,
  });
  let created = 0, queued = 0;
  for (const part of chunk([...queue.map((i) => row(i, false)), ...seenOnly.map((i) => row(i, true))], 200)) {
    const r = await api('items', { items: part });
    created += r.created; queued += r.queued;
  }
  await api('crawled', { firm_ids: read.filter((r) => r.found.length).map((r) => r.firm.id) });
  console.log(`Saved ${created} rows, ${queued} queued for the classifier`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`## Firm watch crawl`, `${crawlable.length} firm sites read, ${failing.length} unreadable. **${queued} new items** queued for tonight's issue.`, '', '| Type | Firm | Headline | Source |', '|---|---|---|---|',
      ...queue.map((r) => `| ${r.kind} | ${r.firm.name} | [${r.title.replace(/\|/g, '/')}](${r.url}) | ${r.via} |`)];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
