import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanHome, extractItems, parseFeed, parseDate, parseRobots, classify, nameMatcher, itemKey } from '../src/lib.mjs';
import { triage, articleText } from '../src/crawl.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('home page scan finds news page, LinkedIn and the mailing-list form', () => {
  const s = scanHome(fx('home.html'), 'https://www.huroncapital.com/');
  assert.deepEqual(s.newsPages, ['https://www.huroncapital.com/news/']);
  assert.deepEqual(s.linkedin, ['https://www.linkedin.com/company/huron-capital-partners']);
  assert.equal(s.signup.page, 'https://www.huroncapital.com/');
  assert.deepEqual(s.feeds, [], 'comment feeds are ignored');
});

test('contact and search forms are not mistaken for a mailing list', () => {
  const html = '<form role="search"><input type="email"></form><form><input type="email"><textarea></textarea>Subscribe</form>';
  assert.equal(scanHome(html, 'https://x.com/').signup, null);
});

test('news page extraction returns headlines only, with dates', () => {
  const items = extractItems(fx('news.html'), 'https://www.huroncapital.com/news/');
  assert.equal(items.length, 4);
  assert.equal(items[0].title, 'Huron Capital Completes Sale of Horsepower Automotive Group to River Associates');
  assert.equal(items[0].date, '2026-07-01');
  assert.equal(items[2].date, '2026-06-03');
  const promo = items.find((i) => i.url.endsWith('/huron-capital-promotes-two/'));
  assert.equal(promo.title, 'Huron Capital Promotes Jane Doe to Partner and John Roe to Principal');
  assert.equal(promo.date, '2026-11-02');
  assert.ok(!items.some((i) => /page\/|privacy|portfolio|\.pdf/.test(i.url)));
});

test('a date inside the link text is used as the item date and removed from the headline', () => {
  const html = `<main><div class="news-list"><span class="date">November 16, 2026</span>
    <a href="/news/pod-pack/">May 1, 2018 LongueVue Capital Invests in Pod Pack International</a>
    <a href="/news/traco/">June 24, 2021 LongueVue Capital Completes Investment in Traco Manufacturing, LLC</a></div></main>`;
  const items = extractItems(html, 'https://www.lvcpartners.com/news/');
  assert.deepEqual(items.map((i) => [i.title, i.date]), [
    ['LongueVue Capital Invests in Pod Pack International', '2018-05-01'],
    ['LongueVue Capital Completes Investment in Traco Manufacturing, LLC', '2021-06-24'],
  ]);
});

test('dates', () => {
  assert.equal(parseDate('Posted Nov. 3, 2026 by staff'), '2026-11-03');
  assert.equal(parseDate('3 November 2026'), '2026-11-03');
  assert.equal(parseDate('2026-11-03T08:00:00'), '2026-11-03');
  assert.equal(parseDate('no date here 12345'), null);
});

test('classification', () => {
  const cases = {
    'Huron Capital Completes Sale of Horsepower Automotive Group to River Associates': 'exit',
    'Huron Capital’s the Exigent Group Acquires Superior Building Services in Ohio': 'add_on',
    'Huron Capital’s Rampart Exterior Services Partners With Colorado Moisture Control': 'add_on',
    'Align Capital Partners Invests in Precision Calibration Co.': 'platform',
    'Centre Partners Acquires Majority Stake in Acme Foods': 'platform',
    'Trivest Announces Final Close of Fund VII at $1.2 Billion': 'fund',
    'Huron Capital Promotes Jane Doe to Partner and John Roe to Principal': 'people',
    'Jane Doe Joins LongWater Opportunities as Managing Director': 'people',
    'Our Thoughts on the 2027 Outlook for Industrial Services': 'other',
    'Acme Foods Launches New Line of Frozen Entrees': 'other',
  };
  for (const [title, kind] of Object.entries(cases)) assert.equal(classify(title), kind, title);
});

test('wire feed matching on firm names', () => {
  const firms = [{ slug: 'centre-partners', name: 'Centre Partners' }, { slug: 'align-capital-partners', name: 'Align Capital Partners' }, { slug: 'trive', name: 'Trive' }];
  const match = nameMatcher(firms);
  const hits = parseFeed(fx('feed.xml')).map((i) => match(`${i.title} ${i.summary}`).map((f) => f.slug));
  assert.deepEqual(hits, [['centre-partners'], ['align-capital-partners'], []]);
  assert.equal(match('Trive, a private equity firm, acquires Foo').length, 1, 'short names need a PE cue');
});

test('robots.txt', () => {
  const ok = parseRobots('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /private*\n');
  assert.equal(ok('/news/'), true);
  assert.equal(ok('/wp-admin/x'), false);
  assert.equal(ok('/wp-admin/admin-ajax.php'), true);
  assert.equal(ok('/private-area'), false);
  assert.equal(parseRobots('User-agent: *\nDisallow:\n')('/anything'), true);
  assert.equal(parseRobots('User-agent: GPPulseBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n')('/news'), false);
});

test('first crawl records the archive as seen; later crawls queue new deal news only', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const items = [
    { url: 'a', title: 'Huron Capital Acquires Acme Industrial Services', date: '2026-11-14' },
    { url: 'b', title: 'Huron Capital Acquires Older Company From Last Summer', date: '2026-06-01' },
    { url: 'c', title: 'Huron Capital Invests in Undated Company Holdings', date: null },
    { url: 'd', title: 'Our Thoughts on the 2027 Outlook for Industrial Services', date: '2026-11-15' },
  ];
  const first = triage(items, { firstCrawl: true, now });
  assert.deepEqual(first.queue.map((i) => i.url), ['a']);
  assert.deepEqual(first.seenOnly.map((i) => i.url), ['b', 'c', 'd']);
  const later = triage(items, { firstCrawl: false, now });
  assert.deepEqual(later.queue.map((i) => i.url), ['a', 'c'], 'undated links are new once the archive is known');
  assert.equal(later.queue[0].kind, 'platform');
});

test('article text extraction', () => {
  const p = 'Huron Capital announced today that it has completed the sale of its portfolio company to a strategic buyer. ';
  const html = `<html><body><nav><p>${p}${p}</p></nav><article><h1>T</h1><p>${p}${p}</p><p>short</p><p>${p}</p></article><footer><p>${p}</p></footer></body></html>`;
  const text = articleText(html);
  assert.equal(text.split('\n').length, 2);
  assert.equal(articleText('<html><body><p>too short</p></body></html>'), null);
});

test('same headline from site and wire collapses to one key', () => {
  assert.equal(itemKey('x', 'Centre Partners Acquires Acme Foods'), itemKey('x', 'Centre Partners acquires Acme Foods!'));
});
