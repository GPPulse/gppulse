// Shared helpers for the GP Pulse firm watch: polite fetching, page parsing, classification.
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

export const UA = 'GPPulseBot/1.0 (+https://thegppulse.com/bot; newsletter firm watch)';
// ---------- fetching ----------

export async function get(url, { timeout = 15000, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept }, redirect: 'follow', signal: ctrl.signal });
    const type = res.headers.get('content-type') || '';
    if (!res.ok) return { ok: false, status: res.status, url: res.url, type, body: '' };
    if (!/text|xml|json|html/i.test(type)) return { ok: false, status: res.status, url: res.url, type, body: '' };
    const body = (await res.text()).slice(0, 2_000_000);
    return { ok: true, status: res.status, url: res.url, type, body };
  } catch (err) {
    return { ok: false, status: 0, url, type: '', body: '', error: String(err?.cause?.code || err?.name || err) };
  } finally {
    clearTimeout(timer);
  }
}

// Run `fn` over `items` with a fixed number of workers. Each firm is a different host,
// so concurrency across firms never stacks requests on one server.
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (err) { out[i] = { error: String(err) }; }
    }
  }));
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- robots.txt ----------

export function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'disallow' || key === 'allow') && cur) {
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const group = groups.find((g) => g.agents.includes('gppulsebot')) || groups.find((g) => g.agents.includes('*'));
  const rules = group ? group.rules : [];
  return (path) => {
    let best = null;
    for (const r of rules) {
      const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
      if (re.test(path) && (!best || r.path.length > best.path.length)) best = r;
    }
    return !best || best.allow;
  };
}

const robotsCache = new Map();
export async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const res = await get(u.origin + '/robots.txt', { timeout: 8000, accept: 'text/plain,*/*' });
    // No robots file, or one that is really an HTML page, means no restrictions.
    robotsCache.set(u.origin, res.ok && !/<html/i.test(res.body) ? parseRobots(res.body) : () => true);
  }
  return robotsCache.get(u.origin)(u.pathname + u.search);
}

// ---------- parsing ----------

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const NEWS_WORDS = /\b(news|press|media|announcements?|insights?|updates?|newsroom|in the news|what'?s new|recent transactions?)\b/i;
const NEWS_PATH = /\/(news|press|press-releases?|media|newsroom|news-and-insights|news-insights|insights|announcements|updates|whats-new|latest|blog)(\/|$|-)/i;
const SKIP_PATH = /\.(pdf|jpe?g|png|gif|svg|zip|mp4|docx?|xlsx?|pptx?)(\?|$)|^(mailto|tel|javascript):/i;

export const sameSite = (a, b) => {
  const strip = (h) => h.replace(/^www\./, '');
  try { return strip(new URL(a).hostname) === strip(new URL(b).hostname); } catch { return false; }
};

export function parseDate(text) {
  if (!text) return null;
  const t = clean(text);
  const m =
    t.match(/\b\d{4}-\d{2}-\d{2}(?!\d)/) ||
    t.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i) ||
    t.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})\b/i) ||
    t.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) ||
    t.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i);
  if (!m) return null;
  const raw = m[0].replace(/\bSept\b/i, 'Sep').replace(/(\w)\.(\s)/, '$1$2');
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00Z' : raw + ' 12:00:00 UTC');
  if (isNaN(d) || d.getUTCFullYear() < 2000 || d > new Date(Date.now() + 3 * 864e5)) return null;
  return d.toISOString().slice(0, 10);
}

// Everything discovery needs from a firm's home page.
export function scanHome(html, baseUrl) {
  const $ = cheerio.load(html);
  const abs = (href) => { try { return new URL(href, baseUrl).href.split('#')[0]; } catch { return null; } };
  const feeds = [], newsPages = new Map(), linkedin = new Set();

  $('link[rel="alternate"]').each((_, el) => {
    const type = ($(el).attr('type') || '').toLowerCase(), href = abs($(el).attr('href'));
    if (href && /(rss|atom)\+xml/.test(type) && !/comments/i.test(href)) feeds.push(href);
  });

  $('a[href]').each((_, el) => {
    const href = abs($(el).attr('href'));
    if (!href || SKIP_PATH.test(href)) return;
    const text = clean($(el).text());
    const li = href.match(/^https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(company|school|showcase)\/([^/?#]+)/i);
    if (li) { linkedin.add(`https://www.linkedin.com/${li[1].toLowerCase()}/${li[2]}`); return; }
    if (!sameSite(href, baseUrl)) return;
    const path = new URL(href).pathname;
    if (path === '/' || path.split('/').filter(Boolean).length > 2) return;
    let score = 0;
    if (NEWS_PATH.test(path)) score += 2;
    if (text.length <= 40 && NEWS_WORDS.test(text)) score += 2;
    if (/press|news/i.test(path + ' ' + text)) score += 1;
    if (/portfolio|team|contact|careers?|about|privacy|terms|login/i.test(path)) score -= 3;
    if (score >= 2 && (newsPages.get(href) || 0) < score) newsPages.set(href, score);
  });

  // Newsletter / mailing-list signup detection.
  const lower = html.toLowerCase();
  const providers = [
    ['Mailchimp', /list-manage\.com|mc-embedded-subscribe|mailchimp/], ['HubSpot', /hsforms|hs-form|hubspot/],
    ['Constant Contact', /constantcontact|ctctcdn/], ['Campaign Monitor', /createsend|cmail\d*\.com/],
    ['ActiveCampaign', /activehosted|activecampaign/], ['Klaviyo', /klaviyo/], ['Pardot', /pardot|pi\.pardot/],
    ['Substack', /substack\.com/], ['Beehiiv', /beehiiv/], ['Mailerlite', /mailerlite/],
  ];
  const provider = (providers.find(([, re]) => re.test(lower)) || [null])[0];
  const signupText = /(join|sign up for|subscribe to)\s+(our|the)\s+(mailing list|newsletter|email list|updates|distribution list|insights)|stay (informed|connected|up to date)|newsletter sign ?up|email updates/i;
  let signup = null;
  $('form').each((_, el) => {
    if (signup) return;
    const f = $(el);
    const hasEmail = f.find('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').length > 0;
    const hasPassword = f.find('input[type="password"]').length > 0;
    const isSearch = f.find('input[type="search"]').length > 0 || /search/i.test(f.attr('role') || '');
    const hasMessage = f.find('textarea').length > 0; // contact forms
    if (!hasEmail || hasPassword || isSearch || hasMessage) return;
    const context = clean(f.text() + ' ' + f.prevAll().slice(0, 2).text() + ' ' + f.parent().children('h1,h2,h3,h4,h5,p,label').text());
    if (signupText.test(context) || provider || /subscribe|sign ?up|join/i.test(context)) {
      signup = { page: baseUrl, provider, action: abs(f.attr('action') || '') };
    }
  });
  if (!signup) {
    $('a[href]').each((_, el) => {
      if (signup) return;
      const text = clean($(el).text());
      if (text.length <= 50 && /^(subscribe|sign ?up|join (our|the) (mailing|email) list|newsletter( sign ?up)?|email (alerts|updates))$/i.test(text)) {
        const href = abs($(el).attr('href'));
        if (href && !SKIP_PATH.test(href)) signup = { page: href, provider, action: null };
      }
    });
  }

  const pages = [...newsPages.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([u]) => u);
  return { feeds: [...new Set(feeds)], newsPages: pages.slice(0, 3), linkedin: [...linkedin], signup };
}

// Pull headline links off a news/press listing page. Works without per-site selectors:
// a headline is a same-site link with sentence-length text that isn't site navigation.
export function extractItems(html, pageUrl) {
  const $ = cheerio.load(html);
  $('nav, header, footer, script, style, noscript, form, [role="navigation"], .menu, .nav, .footer, .header, .pagination, .breadcrumb').remove();
  const pagePath = new URL(pageUrl).pathname.replace(/\/$/, '');
  const items = new Map();

  $('a[href]').each((_, el) => {
    let href;
    try { href = new URL($(el).attr('href'), pageUrl).href.split('#')[0]; } catch { return; }
    if (SKIP_PATH.test(href)) return;
    const external = !sameSite(href, pageUrl);
    const path = new URL(href).pathname.replace(/\/$/, '');
    if (!external && (path === pagePath || path === '' || /\/(page|category|tag|author)\/[^/]*$/i.test(path) || /\/page\/\d+$/i.test(path))) return;

    const a = $(el);
    // Prefer a heading inside or wrapping the link; fall back to the link text.
    let title = clean(a.find('h1,h2,h3,h4,h5').first().text()) || clean(a.closest('h1,h2,h3,h4,h5').text()) || clean(a.text());
    const box = a.closest('article, li, .post, .card, .item, .entry, .news-item, [class*="news"], [class*="press"], [class*="post"]').first();
    if (/^(read more|continue reading|learn more|view|more|read article|read the (article|release)|press release|download)\b/i.test(title) || title.length < 25) {
      const alt = clean(box.find('h1,h2,h3,h4,h5').first().text());
      if (alt.length >= 25) title = alt; else return;
    }
    title = title.replace(/\s*(continue reading|read more|learn more)\s*$/i, '').trim();
    // Some sites put the date inside the link text ("May 1, 2018 Firm Invests in ..."). That date
    // is the item's own, so it wins over anything else found nearby, and comes off the headline.
    const lead = title.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*[-–—|:]?\s*/i);
    const titleDate = lead ? parseDate(lead[1]) : null;
    if (lead) title = title.slice(lead[0].length).trim();
    if (title.length < 25 || title.length > 300 || title.split(' ').length < 4) return;
    // External links only count if they look like press coverage of a transaction.
    if (external && !/prnewswire|businesswire|globenewswire|newswire|accesswire|pehub|wsj\.com|bizjournals/i.test(href)) return;

    const scope = box.length ? box : a.parent();
    const date = titleDate || parseDate(scope.find('time').attr('datetime')) || parseDate(scope.find('time, .date, [class*="date"]').first().text()) || parseDate(clean(scope.text()).replace(title, ' ').slice(0, 200)) || parseDate(href.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//)?.slice(1).join('-'));
    const prev = items.get(href);
    if (!prev || (!prev.date && date)) items.set(href, { url: href, title, date });
  });
  return [...items.values()].slice(0, 60);
}

export function parseFeed(xml) {
  let doc;
  try { doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', processEntities: true, htmlEntities: true }).parse(xml); } catch { return []; }
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const txt = (v) => clean(typeof v === 'object' && v ? v['#text'] ?? '' : String(v ?? '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  for (const it of arr(doc?.rss?.channel?.item)) {
    const d = new Date(txt(it.pubDate || it['dc:date']));
    out.push({ url: txt(it.link) || txt(it.guid), title: txt(it.title), date: isNaN(d) ? null : d.toISOString().slice(0, 10), summary: txt(it.description).slice(0, 500), source: txt(it.source) });
  }
  for (const e of arr(doc?.feed?.entry)) {
    const link = arr(e.link).find((l) => !l['@rel'] || l['@rel'] === 'alternate') || arr(e.link)[0];
    const d = new Date(txt(e.published || e.updated));
    out.push({ url: link?.['@href'] || txt(link), title: txt(e.title), date: isNaN(d) ? null : d.toISOString().slice(0, 10), summary: txt(e.summary || e.content).slice(0, 500), source: '' });
  }
  return out.filter((i) => i.url && i.title);
}

export const looksLikeFeed = (res) => res.ok && /<(rss|feed)[\s>]/i.test(res.body.slice(0, 2000));

// ---------- classification ----------

const RULES = [
  ['fund', /\b(final clos(e|ing)|first clos(e|ing)|closes? (its |on )?(\w+ ){0,4}fund|fund (i{1,3}|iv|v|vi{0,3}|ix|x|\d+)\b.*\b(clos|rais)|raises? \$[\d.,]+ ?(m|mm|million|b|bn|billion)\b.*\bfund|oversubscribed|hard cap|continuation (fund|vehicle))/i],
  ['exit', /\b(sale of|sells?|sold|exits?|exited|divest(s|ed|iture)?|completes? (the )?(sale|exit)|agree[sd]? to sell|realization|successful exit)\b/i],
  ['add_on', /\b(add-?on|bolt-?on|tuck-?in|portfolio company)\b|[’']s? (the )?[A-Z][\w&.\- ]{2,50} (acquires?|completes? acquisition|partners? with|merges? with|adds)\b|\b(backed|supported)\b.*\b(acquires?|acquisition)\b/i],
  ['platform', /\b(acquires?|acquired|acquisition of|completes? (the )?acquisition|invests? in|investment in|makes? (a )?(majority|strategic|growth|minority)? ?investment|recapitaliz(es|ation|ed)|partners? with|partnership with|majority (stake|investment|interest)|buys?|to acquire|forms? new platform|new platform|launches? .* platform|merges? with)\b/i],
  ['people', /\b(promot(es|ed|ion|ions)|joins?|joined|names?|named|appoints?|appointed|hires?|hired|welcomes?|adds? .* (to (its )?team|as)|elevat(es|ed)|new (partner|principal|managing director|vice president|operating partner|cfo|ceo|chief)|year-?end promotions|team (update|expansion|additions?))\b/i],
];

export function classify(title, summary = '') {
  const text = `${title} ${summary}`.slice(0, 600);
  for (const [kind, re] of RULES) {
    // People news often mentions deals in the summary; decide those on the headline alone.
    if (kind === 'people') { if (re.test(title) && /\b(partner|principal|managing director|director|vice president|vp|associate|analyst|cfo|ceo|coo|chief|officer|president|chairman|advisor|team|promotions?)\b/i.test(title)) return kind; continue; }
    if (re.test(kind === 'add_on' ? title : text)) {
      if (kind === 'exit' && /\b(acquires?|acquisition of)\b/i.test(title) && !/\b(sale|sells?|sold|exit)/i.test(title)) continue;
      return kind;
    }
  }
  return 'other';
}

export const RELEVANT = new Set(['platform', 'add_on', 'exit', 'fund', 'people']);

// Whole-phrase firm-name matcher for wire feeds. Names that are also ordinary words or
// very short only count next to a private-equity cue, to keep false matches out.
export function nameMatcher(firms) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entries = firms.map((f) => {
    const words = f.name.trim().split(/\s+/);
    const weak = words.length === 1 || f.name.length < 9 || !/(capital|partners|equity|group|holdings|investments?|ventures|management|advisors|associates|industries|fund|company|&)/i.test(f.name);
    return { firm: f, weak, re: new RegExp(`(^|[^A-Za-z0-9])${esc(f.name).replace(/\\?&/g, '(&|and)').replace(/\s+/g, '\\s+')}([^A-Za-z0-9]|$)`, weak ? '' : 'i') };
  });
  const cue = /private equity|investment firm|portfolio company|buyout|middle[- ]market|backed by|family office|private investment/i;
  return (text) => entries.filter((e) => e.re.test(text) && (!e.weak || cue.test(text))).map((e) => e.firm);
}

export const itemKey = (firmSlug, title) => `${firmSlug}|${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 12).join(' ')}`;

// ---------- tombstones (advisor and lender "closed transactions" pages) ----------

const DEAL_RE = /\b(has|have) been (acquired|sold|recapitalized)|\b(was|were) (acquired|sold|recapitalized)|\bacquired by\b|\bsold to\b|\bsale (of|to)\b|\brecapitaliz|\bportfolio company of\b|\bmerged with\b|\bmerger with\b|\bacquisition of\b|\bhas acquired\b|\bhas (completed|received|closed|partnered)\b|\b(investment|financing|refinancing|credit facility|unitranche|senior debt|growth capital|majority investment|minority investment) (from|by|for|to|in)\b|\b(sell|buy)-?side advis|\badvis[eo]r to\b|\bled by\b|\bagent\b.*\b(acquisition|buyout|recapitalization)\b/i;

const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// A tombstone is a small repeated block ("Acme has been acquired by Beta, a portfolio company
// of Gamma"). They often have no link of their own and use logos for the names, so image alt
// text is folded into the wording and each block gets a stable address derived from its text.
export function extractTombstones(html, pageUrl) {
  const $ = cheerio.load(html);
  $('nav, header, footer, script, style, noscript, form, [role="navigation"], .menu, .nav, .footer, .header, .pagination, .breadcrumb').remove();
  $('img[alt]').each((_, el) => { const alt = clean($(el).attr('alt')).replace(/\s*logo\s*$/i, ''); if (alt.length >= 2 && alt.length <= 80) $(el).replaceWith(` ${alt} `); });
  // Block elements run together once tags are stripped; keep a space between them.
  $('p, div, li, h1, h2, h3, h4, h5, h6, span, td, br, figcaption').each((_, el) => { $(el).append(' '); });
  const out = new Map();
  const taken = new Set();
  const says = (node) => { const t = clean($(node).text()); return t.length >= 25 && t.length <= 320 && DEAL_RE.test(t); };
  for (const el of $('body *').toArray().slice(0, 6000)) {
    if (taken.has(el) || !says(el)) continue;
    const text = clean($(el).text());
    if (/\b(we|our|us)\b/i.test(text)) continue; // prose about the firm, not a transaction
    // Several deal statements inside means this is the grid, not a tombstone; go deeper.
    if ($(el).children().toArray().filter(says).length >= 2) continue;
    $(el).find('*').each((_, d) => { taken.add(d); });
    let url = null;
    const a = el.tagName === 'a' ? $(el) : $(el).find('a[href]').first().length ? $(el).find('a[href]').first() : $(el).closest('a[href]');
    if (a.length) { try { const u = new URL(a.attr('href'), pageUrl).href.split('#')[0]; if (sameSite(u, pageUrl) && u.replace(/\/$/, '') !== pageUrl.replace(/\/$/, '') && !SKIP_PATH.test(u)) url = u; } catch { /* no usable link */ } }
    const title = text.replace(/\s*(view (details|transaction|case study)|read more|learn more|details)\s*$/i, '').slice(0, 220);
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!url) url = `${pageUrl.split('#')[0]}#t-${fnv(key)}`;
    if (![...out.values()].some((o) => o.key === key)) out.set(url, { url, title, date: parseDate(text.match(/\b(20\d{2}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i)?.[0]), key });
  }
  return [...out.values()].map(({ key, ...rest }) => rest).slice(0, 200);
}

// ---------- portfolio pages ----------

const NOT_A_COMPANY = /^(portfolio|current|realized|exited|active|prior|past|all|view|learn|read|more|industr|sector|filter|our|home|about|team|contact|news|investments?|companies|status|website|visit|search|menu|close|back|next|previous|select|show|load|see|click|skip|privacy|terms|careers?|login|log in|subscribe|follow|share|linkedin|twitter|facebook|criteria|strategy|approach|overview|headquarters|year|acquired|invested|sold|platform|add-?on|category|type|fund|page|image|photo|icon|logo|arrow|placeholder)\b/i;

export const normName = (s) => s.toLowerCase().replace(/&amp;/g, '&').replace(/\b(inc|llc|l\.l\.c|corp|corporation|co|company|ltd|lp|holdings|group)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// Company names on a sponsor's portfolio page: logo alt text, card headings, and links out to
// company sites or to per-company pages. Deliberately broad; the daily comparison is what matters.
export function extractPortfolio(html, pageUrl) {
  const $ = cheerio.load(html);
  $('nav, header, footer, script, style, noscript, form, [role="navigation"], .menu, .nav, .footer, .header, .pagination, .breadcrumb').remove();
  const names = new Map();
  const add = (raw) => {
    const name = clean(raw).replace(/\s*(logo|website|\(opens in a new (tab|window)\))\s*$/i, '').replace(/^logo (of|for)\s+/i, '').trim();
    if (name.length < 2 || name.length > 60 || !/[A-Za-z]/.test(name) || name.split(' ').length > 6 || NOT_A_COMPANY.test(name) || /[.!?:]$/.test(name) || /^\d+$/.test(name)) return;
    const key = normName(name);
    if (key.length >= 2 && !names.has(key)) names.set(key, name);
  };
  const pagePath = new URL(pageUrl).pathname.replace(/\/$/, '');
  $('img[alt]').each((_, el) => add($(el).attr('alt')));
  $('h2, h3, h4, h5').each((_, el) => add($(el).text()));
  $('a[href]').each((_, el) => {
    let u; try { u = new URL($(el).attr('href'), pageUrl); } catch { return; }
    const external = !sameSite(u.href, pageUrl) && !/linkedin|twitter|facebook|instagram|youtube|x\.com|google\.|vimeo/i.test(u.hostname);
    const child = sameSite(u.href, pageUrl) && pagePath && u.pathname.startsWith(pagePath + '/') && u.pathname.replace(/\/$/, '') !== pagePath;
    if (external || child) add($(el).text() || $(el).attr('title') || $(el).attr('aria-label') || '');
  });
  return [...names.values()];
}

// Compare today's portfolio names with the stored ones. Returns what to store and which
// additions are worth showing an editor. A big swing means the page was redesigned or failed
// to load, not that the firm did ten deals overnight.
export function diffPortfolio(oldNames, newNames) {
  if (!oldNames || !oldNames.length) return { store: newNames, added: [], reason: 'baseline' };
  if (newNames.length < Math.max(3, oldNames.length * 0.5)) return { store: oldNames, added: [], reason: 'page looked incomplete; kept previous list' };
  const oldKeys = new Set(oldNames.map(normName));
  const newKeys = new Set(newNames.map(normName));
  const added = newNames.filter((n) => !oldKeys.has(normName(n)));
  const removed = oldNames.filter((n) => !newKeys.has(normName(n)));
  if (!added.length && !removed.length) return { store: oldNames, added: [], reason: 'unchanged' };
  if (added.length > 3 || added.length + removed.length > Math.max(4, oldNames.length * 0.2)) return { store: newNames, added: [], reason: 'large change; treated as a redesign' };
  return { store: newNames, added, removed, reason: 'changed' };
}

// Links on a home page that look like the page we want (by link text or path).
export function findLinks(html, baseUrl, textRe, pathRe) {
  const $ = cheerio.load(html);
  const hits = new Map();
  $('a[href]').each((_, el) => {
    let u; try { u = new URL($(el).attr('href'), baseUrl); } catch { return; }
    const href = u.href.split('#')[0];
    if (!sameSite(href, baseUrl) || SKIP_PATH.test(href) || u.pathname === '/' || u.pathname.split('/').filter(Boolean).length > 2) return;
    const text = clean($(el).text());
    let score = 0;
    if (pathRe.test(u.pathname)) score += 2;
    if (text.length <= 40 && textRe.test(text)) score += 2;
    if (score >= 2 && (hits.get(href) || 0) < score) hits.set(href, score);
  });
  return [...hits.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([u]) => u).slice(0, 4);
}
