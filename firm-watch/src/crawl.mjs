// Daily crawl of the watchlist. For every firm with a known news page or feed, read it,
// ask the database which links are new, pull the text of the new ones and queue them for
// the newsletter's classifier. Also runs a Google News search for the most active firms,
// which catches coverage of firms whose own sites lag or can't be read.
//
//   node src/crawl.mjs [--tier 2] [--limit 50] [--no-gnews] [--gnews-tier 2] [--render] [--dry]
//
// Firms below the Google News tier that have no news page or feed of their own are searched too,
// a dozen names to a query, so a firm with no readable site still gets its press coverage.
import { appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { get, pool, sleep, allowed, extractItems, extractTombstones, parseFeed, looksLikeFeed, classify, RELEVANT, nameMatcher, readSource, sourceKind, render, closeRenderer } from './lib.mjs';
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
//
// Undated links are the hard case. One or two new ones on a site we already read are news.
// More than `maxUndated` at once is the back catalogue arriving (a second page of the news
// list, a redesign): Seaport's 2023 deals went out as "this week" that way. Those are recorded
// as seen. A past year in the address (/news/2023/...) settles it for a single link.
export const urlYear = (url) => { const m = String(url || '').match(/\/(20\d{2})(?:\/|-)/); return m ? Number(m[1]) : null; };
export function triage(items, { firstCrawl, freshDays = 10, now = Date.now(), maxUndated = 2 }) {
  const queue = [], seenOnly = [];
  const thisYear = new Date(now).getUTCFullYear();
  const typed = items.map((it) => ({ ...it, kind: it.kind || classify(it.title, it.summary) }));
  const undatedNews = typed.filter((it) => !it.date && RELEVANT.has(it.kind) && (urlYear(it.url) ?? thisYear) >= thisYear).length;
  for (const it of typed) {
    const age = daysAgo(it.date, now);
    const y = urlYear(it.url);
    const stale = age === null && ((y !== null && y < thisYear) || undatedNews > maxUndated);
    const fresh = firstCrawl ? age !== null && age <= freshDays : (age === null ? !stale : age <= freshDays);
    (fresh && RELEVANT.has(it.kind) ? queue : seenOnly).push(it);
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
    const items = (await allowed(firm.feed_url)) ? await readSource(firm.feed_url) : null;
    const via = { feed: 'firm feed', wp: 'firm site (WordPress API)', sitemap: 'firm sitemap' }[sourceKind(firm.feed_url)];
    if (items) found.push(...items.slice(0, sourceKind(firm.feed_url) === 'sitemap' ? 60 : 40).map((i) => ({ ...i, via }))); else failed++;
  }
  if (firm.news_url && !found.length) {
    if (await allowed(firm.news_url)) {
      const shell = /rendered/.test(firm.discovery_note || '') && flag('render');
      const res = shell ? await render(firm.news_url) : await get(firm.news_url);
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
    const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { accept: 'application/rss+xml,application/xml,text/xml,*/*', gap: 0 });
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

// Firms with no site of their own to read: search a dozen names at a time. A result counts for a
// firm only if the whole name appears in the headline or snippet (short or common-word names also
// need a private-equity cue), so one query can safely cover several firms.
export function nameQueries(firms, size = 12, maxLen = 480) {
  const out = [];
  let cur = [];
  const q = (group) => `(${group.map((f) => `"${f.name.replace(/"/g, '')}"`).join(' OR ')}) when:3d`;
  for (const f of firms) {
    if (cur.length && (cur.length >= size || q([...cur, f]).length > maxLen)) { out.push({ q: q(cur), firms: cur }); cur = []; }
    cur.push(f);
  }
  if (cur.length) out.push({ q: q(cur), firms: cur });
  return out;
}

async function googleNewsBatched(firms) {
  const out = [];
  const statuses = {};
  for (const { q, firms: group } of nameQueries(firms)) {
    const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { accept: 'application/rss+xml,application/xml,text/xml,*/*', gap: 0 });
    statuses[res.status] = (statuses[res.status] || 0) + 1;
    await sleep(900);
    if (!looksLikeFeed(res)) continue;
    const match = nameMatcher(group);
    for (const it of parseFeed(res.body).slice(0, 40)) {
      const title = it.title.replace(/\s+-\s+[^-]+$/, '');
      if ((daysAgo(it.date) ?? 99) > 3) continue;
      // No cue added here: with twelve names in one query, a one-word name must earn its match.
      const [firm] = match(`${title} ${it.summary || ''}`);
      if (!firm) continue;
      const kind = classify(title, it.summary);
      if (RELEVANT.has(kind)) out.push({ ...it, title, kind, firm, via: `Google News${it.source ? ` — ${it.source}` : ''}` });
    }
  }
  console.log(`Google News name search for ${firms.length} firms with no site to read: HTTP ${JSON.stringify(statuses)}, ${out.length} hits`);
  return out;
}

// How a non-sponsor source relates to the deals it posts.
export const roleOf = (firm) => firm.source_kind === 'lender' ? { a: 'a middle-market lender', the: 'the lender' }
  : /counsel/i.test(firm.firm_type || '') ? { a: 'a law firm that acts as deal counsel', the: 'legal counsel to one side' }
  : /diligence/i.test(firm.firm_type || '') ? { a: 'an accounting and diligence firm', the: 'a diligence adviser to one side' }
  : { a: 'an M&A advisor', the: 'the advisor' };

// ---------- platform companies ----------
// Add-ons are announced by the platform, on its own site or in its local paper, and almost never
// by the sponsor. We already hold each sponsor's portfolio list, so every night a fifth of those
// company names is searched for acquisition news. A company comes round once every five days and
// the search looks back seven, so nothing falls between passes.
const GENERIC_NAME = /^(the |a )?(group|holdings|partners|capital|solutions|services|systems|technologies|industries|company|enterprises|international|global|america|american|national|united|premier|summit|apex|pinnacle|alliance|legacy|heritage|frontier|horizon|vertex|catalyst|momentum|elevate|evergreen|keystone|cornerstone|benchmark|landmark)( (group|holdings|partners|solutions|services|systems|company|inc|llc|corp))*\.?$/i;
const DEAL_VERB = /\b(acquir(es|ed|ing)|acquisition|merg(es|ed|er)|add-?on|tuck-?in|joins forces|purchas(es|ed)|buys|bought|expands (with|through)|welcomes)\b/i;
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/** The portfolio companies due for a search today: [{ name, firm }], firm being the sponsor. */
export function platformsDue(firms, dayIndex, cycle = 5) {
  const out = [];
  const seen = new Set();
  for (const f of firms) {
    if (!f.watchlist || !Array.isArray(f.portfolio_names)) continue;
    for (const raw of f.portfolio_names) {
      const name = String(raw || '').replace(/\s+/g, ' ').replace(/[,.]? (inc|llc|l\.l\.c|corp|corporation|co|ltd|lp)\.?$/i, '').trim();
      const key = name.toLowerCase();
      // A short or one-common-word name matches half the internet; those are left to the sponsor's own news.
      if (name.length < 6 || name.length > 60 || GENERIC_NAME.test(name) || !/[a-z]/i.test(name) || /["()]/.test(name)) continue;
      if (name.split(' ').length === 1 && name.length < 9) continue;
      if (seen.has(key) || hash(key) % cycle !== dayIndex % cycle) continue;
      seen.add(key);
      out.push({ name, firm: f });
    }
  }
  return out;
}

/** Which of the searched companies a headline is about. Case-sensitive, whole name, with a deal verb. */
export function platformIn(title, group) {
  if (!DEAL_VERB.test(title)) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return group.find((p) => new RegExp(`(^|[^A-Za-z0-9])${esc(p.name).replace(/\s+/g, '\\s+')}([^A-Za-z0-9]|$)`).test(title)) ?? null;
}

export function platformQueries(platforms, size = 10, maxLen = 430) {
  const out = [];
  let cur = [];
  const q = (g) => `(${g.map((p) => `"${p.name}"`).join(' OR ')}) (acquires OR acquired OR acquisition OR merger OR "add-on") when:7d`;
  for (const p of platforms) {
    if (cur.length && (cur.length >= size || q([...cur, p]).length > maxLen)) { out.push({ q: q(cur), group: cur }); cur = []; }
    cur.push(p);
  }
  if (cur.length) out.push({ q: q(cur), group: cur });
  return out;
}

async function platformSweep(firms, { max = 320, cap = 150 } = {}) {
  const due = platformsDue(firms, Math.floor(Date.now() / 864e5));
  const queries = platformQueries(due).slice(0, max);
  const out = [];
  const statuses = {};
  for (const { q, group } of queries) {
    const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { accept: 'application/rss+xml,application/xml,text/xml,*/*', gap: 0 });
    statuses[res.status] = (statuses[res.status] || 0) + 1;
    await sleep(900);
    if (res.status === 429) { console.log('Platform sweep: rate limited, stopping for today'); break; }
    if (!looksLikeFeed(res)) continue;
    for (const it of parseFeed(res.body).slice(0, 20)) {
      const title = it.title.replace(/\s+-\s+[^-]+$/, '');
      if ((daysAgo(it.date) ?? 99) > 7) continue;
      const hit = platformIn(title, group);
      if (!hit) continue;
      out.push({ ...it, title, kind: 'add_on', firm: hit.firm, platform: hit.name, via: `Google News — ${it.source || 'local press'}` });
    }
  }
  console.log(`Platform sweep: ${due.length} portfolio companies due, ${queries.length} searches, HTTP ${JSON.stringify(statuses)}, ${out.length} hits`);
  const seen = new Set();
  return out.filter((i) => { const k = `${i.platform}|${i.title.toLowerCase().slice(0, 50)}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, cap);
}

// Phrases that only show up in lower-middle-market deal coverage. Local business journals,
// small-town papers and trade sites write these up; the PE trade press mostly does not.
export const SWEEP_QUERIES = [
  '"a portfolio company of" acquires',
  '"a portfolio company of" acquired',
  '"add-on acquisition" private equity',
  '"family-owned" acquired "private equity"',
  '"founder-owned" "private equity" partnership',
  '"recapitalization" "private equity" company',
  '"independent sponsor" acquisition',
  '"lower middle market" acquisition',
  '"strategic partnership with" "private equity firm"',
  '"majority investment" "private equity" company',
  '"growth investment from" private equity',
  '"has been acquired by" "backed by"',
  // Promotions and senior hires. Year-end promotion releases rarely reach the PE trade press.
  '"promoted to partner" "private equity"',
  '"promoted to managing director" "private equity"',
  '"promoted to principal" "private equity"',
  '"announces promotions" "private equity"',
  '"joins as" partner "private equity firm"',
  '"promoted to vice president" "private equity"',
  '"promoted to senior associate" "private equity"',
  '"promoted to director" "private equity firm"',
  '"named partner" "private equity firm"',
  '"promotions" "private equity firm" "vice president" "senior associate"',
  '"joins" "private equity" as "managing director"',
  '"joins" "private equity" as principal',
  // More ways a lower-middle-market deal gets announced, usually by the company, not the sponsor.
  '"has acquired" "a portfolio company of"',
  '"announces acquisition of" "backed by"',
  '"completes acquisition of" "private equity"',
  '"announces the sale of" "private equity"',
  '"has been sold to" "private equity"',
  '"partners with" founders "private equity" investment',
  '"new platform investment" "private equity"',
  '"announces investment in" "private equity firm"',
  '"completed the recapitalization of"',
  '"served as exclusive financial advisor" acquisition',
  '"acted as exclusive financial advisor" sale',
  '"advised" "on its sale to" "private equity"',
  '"provided senior debt" acquisition "private equity"',
  '"unitranche" "to support" acquisition sponsor',
  '"search fund" acquisition completed',
  '"family office" acquires company majority',
  '"employee-owned" acquired "private equity"',
  // Roll-up sectors where most deals are small and announced only locally or by the platform.
  'acquires HVAC plumbing "backed by" OR "portfolio company"',
  'acquires roofing OR landscaping "backed by" OR "portfolio company"',
  'acquires "pest control" OR "lawn care" "private equity" OR "portfolio company"',
  'acquires dental OR veterinary OR dermatology practice "backed by" OR "portfolio company"',
  'acquires "managed services provider" OR MSP "backed by" OR "portfolio company"',
  'acquires "insurance agency" OR "wealth management" "backed by" OR "portfolio company"',
  'acquires "accounting firm" OR "CPA firm" "private equity"',
  'acquires "precision machining" OR "metal fabrication" "backed by" OR "portfolio company"',
  'acquires packaging OR "specialty distribution" "backed by" OR "portfolio company"',
  'acquires "auto repair" OR "collision" OR "car wash" "backed by" OR "portfolio company"',
  'acquires "fire protection" OR "electrical contractor" OR "mechanical contractor" "backed by" OR "portfolio company"',
  'acquires "environmental services" OR "waste" OR "testing and inspection" "backed by" OR "portfolio company"',
  'acquires "home health" OR "behavioral health" OR "physical therapy" "backed by" OR "portfolio company"',
  'acquires "aerospace" OR "defense" supplier "backed by" OR "portfolio company"',
  'acquires "food manufacturer" OR "food distributor" "backed by" OR "portfolio company"',
  'acquires "logistics" OR "freight" OR "trucking" "backed by" OR "portfolio company"',
  'acquires "staffing" OR "engineering firm" OR "consulting firm" "backed by" OR "portfolio company"',
  'acquires "software" company "backed by" "lower middle market"',
];
const PE_WORDS = /(private equity|portfolio company|capital partners|equity partners|independent sponsor|recapitali[sz]|backed by|investment firm|growth investment|majority investment|add-on)/i;

async function sweep(firm, days = 2) {
  const out = [];
  const statuses = {};
  let raw = 0;
  // The original phrases are precise and get 25 results each. The later, broader ones (extra
  // announcement wordings and roll-up sectors) get 12, so the classifier's nightly budget goes
  // to the likeliest items first.
  const BROAD_FROM = SWEEP_QUERIES.indexOf('"has acquired" "a portfolio company of"');
  for (const [qi, q] of SWEEP_QUERIES.entries()) {
    const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=en-US&gl=US&ceid=US:en`, { accept: 'application/rss+xml,application/xml,text/xml,*/*', gap: 0 });
    await sleep(900);
    statuses[res.status] = (statuses[res.status] || 0) + 1;
    if (!looksLikeFeed(res)) continue;
    for (const it of parseFeed(res.body).slice(0, BROAD_FROM >= 0 && qi >= BROAD_FROM ? 12 : 25)) {
      raw++;
      const title = it.title.replace(/\s+-\s+[^-]+$/, '');
      if ((daysAgo(it.date) ?? 99) > days + 1) continue;
      if (!PE_WORDS.test(`${title} ${it.summary || ''}`) && !PE_WORDS.test(q)) continue;
      const kind = classify(title, it.summary);
      if (RELEVANT.has(kind) || /acqui|invest|recapitali|partnership/i.test(title)) out.push({ ...it, title, kind: RELEVANT.has(kind) ? kind : 'platform', firm, via: `Google News — ${it.source || 'local press'}` });
    }
  }
  console.log(`LMM phrase sweep: HTTP ${JSON.stringify(statuses)}, ${raw} feed items read`);
  const seen = new Set();
  return out.filter((i) => { const k = i.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 260);
}

async function main() {
  let { firms } = await api('firms');
  firms = firms.filter((f) => (f.watch_tier ?? 4) <= Number(opt('tier', 4)));
  const crawlable = firms.filter((f) => (f.news_url || f.feed_url || f.deals_url) && !/\/lmm-sweep$/.test(f.website_url || '')).slice(0, Number(opt('limit', 1e9)));
  console.log(`${firms.filter((f) => f.watchlist).length} watchlist sponsors, ${firms.filter((f) => f.source_kind === 'advisor' || f.source_kind === 'lender').length} advisors/lenders, ${firms.filter((f) => f.source_kind === 'trade').length} trade sources; ${crawlable.length} with something to read`);

  const read = (await pool(crawlable, 8, readFirm)).filter((r) => r?.firm);
  const failing = read.filter((r) => r.failed).map((r) => r.firm.name);

  // Which of these links has the database never seen?
  const allUrls = [...new Set(read.flatMap((r) => r.found.map((i) => i.url)))];
  const unknown = new Set();
  for (const part of chunk(allUrls, 200)) (await api('check', { urls: part })).unknown.forEach((u) => unknown.add(u));

  const queue = [], seenOnly = [];
  for (const r of read) {
    const fresh = [...new Map(r.found.filter((i) => unknown.has(i.url)).map((i) => [i.url, i])).values()];
    // Trade publications: deals only (their people moves are not PE news).
    const t = triage(fresh, { firstCrawl: !r.firm.last_scraped_at });
    if (r.firm.source_kind === 'trade') { t.seenOnly.push(...t.queue.filter((i) => i.kind === 'people' || i.kind === 'fund')); t.queue = t.queue.filter((i) => i.kind !== 'people' && i.kind !== 'fund'); }
    queue.push(...t.queue.map((i) => ({ ...i, firm: r.firm })));
    seenOnly.push(...t.seenOnly.map((i) => ({ ...i, firm: r.firm })));
  }

  // Phrase sweep across local and trade press, filed under the sweep source.
  const sweepFirm = firms.find((f) => f.source_kind === 'trade' && /\/lmm-sweep$/.test(f.website_url || ''));
  if (sweepFirm && !flag('no-gnews')) {
    const found = await sweep(sweepFirm);
    const fresh = new Set();
    for (const part of chunk([...new Set(found.map((i) => i.url))], 200)) (await api('check', { urls: part })).unknown.forEach((u) => fresh.add(u));
    const have = new Set(queue.map((i) => i.title.toLowerCase().slice(0, 50)));
    let n = 0;
    for (const it of found) if (fresh.has(it.url) && !have.has(it.title.toLowerCase().slice(0, 50))) { have.add(it.title.toLowerCase().slice(0, 50)); queue.push(it); n++; }
    console.log(`LMM phrase sweep: ${found.length} hits, ${n} new`);
  }

  if (!flag('no-gnews')) {
    const active = firms.filter((f) => f.watchlist && (f.watch_tier ?? 4) <= Number(opt('gnews-tier', 2)));
    const unread = firms.filter((f) => f.watchlist && (f.watch_tier ?? 4) > Number(opt('gnews-tier', 2)) && !f.news_url && !f.feed_url);
    console.log(`Searching Google News for the ${active.length} most active firms`);
    const news = [...(await googleNews(active)), ...(await googleNewsBatched(unread))];
    const fresh = new Set();
    for (const part of chunk([...new Set(news.map((i) => i.url))], 200)) (await api('check', { urls: part })).unknown.forEach((u) => fresh.add(u));
    // Skip coverage of a headline the firm's own site already gave us this run.
    const have = new Set(queue.map((i) => `${i.firm.id}|${i.title.toLowerCase().slice(0, 50)}`));
    for (const it of news) if (fresh.has(it.url) && !have.has(`${it.firm.id}|${it.title.toLowerCase().slice(0, 50)}`)) { have.add(`${it.firm.id}|${it.title.toLowerCase().slice(0, 50)}`); queue.push(it); }
  }

  // Portfolio companies: add-ons the platform announced and the sponsor did not.
  if (!flag('no-gnews') && !flag('no-platforms')) {
    const found = await platformSweep(firms);
    const fresh = new Set();
    for (const part of chunk([...new Set(found.map((i) => i.url))], 200)) (await api('check', { urls: part })).unknown.forEach((u) => fresh.add(u));
    const have = new Set(queue.map((i) => i.title.toLowerCase().slice(0, 50)));
    let n = 0;
    for (const it of found) if (fresh.has(it.url) && !have.has(it.title.toLowerCase().slice(0, 50))) { have.add(it.title.toLowerCase().slice(0, 50)); queue.push(it); n++; }
    console.log(`Platform sweep: ${n} new items`);
  }

  // Full text for what is going to the classifier, so it has more than a headline to read.
  await pool(queue.filter((i) => i.via !== undefined && !i.via.startsWith('Google News') && !i.url.includes('#t-')), 6, async (it) => {
    if (!(await allowed(it.url))) return;
    const res = await get(it.url);
    if (res.ok) it.content = articleText(res.body);
  });

  await closeRenderer();

  const counts = queue.reduce((c, r) => ((c[r.kind] = (c[r.kind] || 0) + 1), c), {});
  console.log(`\n${queue.length} new items for the classifier:`, counts, `| ${seenOnly.length} recorded as already seen`);
  for (const r of queue.slice(0, 60)) console.log(`  [${r.kind}] ${r.firm.name}: ${r.title}`);
  if (failing.length) console.log(`\n${failing.length} firm sites could not be read this run (first few: ${failing.slice(0, 8).join(', ')})`);
  if (flag('dry')) return;

  const row = (i, seen_only) => ({
    firm_id: i.firm.id, url: i.url, title: i.title, seen_only,
    content: seen_only ? null : [i.content || i.summary || i.title, i.firm.watchlist
      ? `\n[Watchlist firm: ${i.firm.name}. Found via ${i.via}.${i.platform ? ` ${i.platform} is a portfolio company of ${i.firm.name}; if it is the buyer, this is an add-on with ${i.platform} as the platform and ${i.firm.name} as the sponsor.` : ''}]`
      : i.firm.source_kind === 'trade'
        ? `\n[Source: ${i.via?.startsWith('Google News') ? i.via.replace(/^Google News — /, '') : `${i.firm.name}, a trade publication covering ${i.firm.firm_type || 'one industry'}`}. Trade and local press cover lower-middle-market deals the PE press misses. Name the buyer and the target from the text; ${i.firm.name.startsWith('Google News') ? 'the search engine' : 'the publication'} is not a party to the deal. If no private equity firm, independent sponsor or PE-backed company is a party, this is not a PE deal.]`
        : `\n[Source: ${i.firm.name}, ${roleOf(i.firm).a}, from its own ${i.via === 'tombstone' ? 'list of closed transactions' : 'site'}. ${i.firm.name} is ${roleOf(i.firm).the} on the deal, not the buyer. Name the buyer, its private equity owner if any, and the target from the text.]`].join(''),
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
