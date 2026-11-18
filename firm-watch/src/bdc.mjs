// BDC filings watch. Business development companies must list every loan and equity stake
// they hold, quarterly, with the borrower's name, the instrument, the spread and the fair
// value. Lower-middle-market BDCs (Main Street, Capital Southwest, Fidus, Saratoga, Monroe,
// Gladstone...) lend to exactly the companies our readers buy, and most of those LBOs and
// refinancings are never announced. A name that is in this quarter's schedule and not last
// quarter's is a new financing: usually a new sponsor deal, an add-on or a recap.
//
// We read the XBRL instance EDGAR extracts from each 10-Q/10-K (`*_htm.xml`), where every
// holding is tagged on the InvestmentIdentifierAxis. No HTML table parsing.
//
//   node src/bdc.mjs [--only MAIN,CSWC] [--dry]
//
// EDGAR wants a descriptive User-Agent with contact details and no more than 10 requests a second.
import { appendFile } from 'node:fs/promises';
import { api, chunk } from './api.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const UA = process.env.SEC_USER_AGENT || 'TheGPPulse/1.0 (newsletter research; editor@thegppulse.com)';

// Lower-middle-market and core-middle-market lenders. Tickers are resolved to CIKs from EDGAR.
export const BDCS = ['MAIN', 'CSWC', 'FDUS', 'SAR', 'MRCC', 'GAIN', 'GLAD', 'SCM', 'WHF', 'OFS', 'PNNT', 'PFLT', 'GECC', 'ICMB', 'PTMN', 'CCAP', 'TCPC', 'GBDC', 'BBDC', 'NCDL', 'CGBD', 'SLRC', 'MSIF', 'TPVG', 'HRZN'];
// Venture lenders are tracked but their borrowers are VC-backed, not sponsor deals.
const VENTURE = new Set(['TPVG', 'HRZN']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function sec(url, accept = 'application/json') {
  const wait = 130 - (Date.now() - last); // ~7 requests a second
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept, 'accept-encoding': 'gzip, deflate' } }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) return accept.includes('json') ? res.json() : res.text();
    if (res.status === 404) return null;
    await sleep(attempt * 1500);
  }
  return null;
}

// ---------- parsing ----------

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

// Instrument words: where the issuer name ends and the security description starts.
const INSTRUMENT = /(?:,|\s-\s|\s–\s|\|)\s*(?=(?:first|second|1st|2nd|senior|junior|sub(?:ordinated)?|secured|unsecured|term|delayed|ddtl|revolv|revolver|unitranche|preferred|common|class\s|series\s|warrant|member|membership|llc units|lp units|units|equity|notes?\b|loan|debt|stock|shares|interest|options?|convertible|promissory|incremental|capex|acquisition|last out|first out|structured|total)\b)/i;
const LEGAL = /,?\s*\b(inc|llc|l\.l\.c|lp|l\.p|ltd|corp|corporation|co|company|holdings?|holdco|intermediate|parent|topco|buyer|acquisition(?:co| corp)?|midco|group|opco|bidco|purchaser|borrower|investco|investors|aggregator|blocker)\b\.?/gi;

/** "Acme Industrial Holdings, LLC, First Lien Term Loan, SOFR+6.00%" → "Acme Industrial Holdings, LLC" */
export function issuerOf(identifier) {
  let s = decode(identifier).replace(/^investment,?\s*identifier\s*\[axis\]\s*:?\s*/i, '').replace(/\s+/g, ' ').trim();
  // Some filers prefix the industry or the investment type: "Debt Investments - Acme Corp ..." / "Non-control/Non-affiliate investments ..."
  s = s.replace(/^(?:(?:non-?)?(?:control|affiliate)[^,:]*[,:]\s*|(?:debt|equity|first lien|second lien) investments?\s*[-–:]\s*)/i, '');
  const cut = s.search(INSTRUMENT);
  let name = cut > 2 ? s.slice(0, cut) : s.split(/\s[-–|]\s|,\s(?=\d)|\s\(/)[0];
  name = name.replace(/\s*\((?:[^)]*)\)\s*$/, '').replace(/[,;:\s]+$/, '').trim();
  if (name.length < 3 || /^(total|subtotal|cash|money market|short[- ]term|u\.?s\.? treasury|other|investments?|portfolio)\b/i.test(name)) return null;
  return name.slice(0, 120);
}

/** Explicit members are QNames like main:AcmeIndustrialHoldingsLLCMember → "Acme Industrial Holdings LLC". */
export function issuerOfMember(qname) {
  const local = qname.split(':').pop().replace(/Member$/, '');
  const words = local.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ');
  return issuerOf(words);
}

export const normIssuer = (s) => decode(s).toLowerCase().replace(/&/g, ' and ').replace(LEGAL, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|and)\b/g, ' ').replace(/\s+/g, ' ').trim();

const FACTS = {
  fair_value: /^(?:us-gaap:)?InvestmentOwnedAtFairValue$/,
  cost: /^(?:us-gaap:)?InvestmentOwnedAtCost$/,
  principal: /^(?:us-gaap:)?InvestmentOwnedBalancePrincipalAmount$/,
  spread: /^(?:us-gaap:)?InvestmentBasisSpreadVariableRate$/,
  rate: /^(?:us-gaap:)?InvestmentInterestRate$/,
  maturity: /^(?:us-gaap:)?InvestmentMaturityDate$/,
};

/**
 * Holdings from an XBRL instance, one row per issuer: summed fair value and cost, the widest
 * spread and latest maturity across its instruments, and the instruments themselves.
 * Only contexts at the period's end date count (prior-period comparatives are dropped).
 */
export function parseHoldings(xml) {
  const periodEnd = (xml.match(/<dei:DocumentPeriodEndDate[^>]*>([^<]+)</) || [])[1]?.trim() || null;
  const ctx = new Map(); // context id -> identifier text
  const ctxRe = /<(?:xbrli:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:xbrli:)?context>/g;
  let m;
  while ((m = ctxRe.exec(xml))) {
    const [, id, inner] = m;
    const instant = (inner.match(/<(?:xbrli:)?instant>([^<]+)</) || [])[1]?.trim();
    const end = (inner.match(/<(?:xbrli:)?endDate>([^<]+)</) || [])[1]?.trim();
    if (periodEnd && (instant || end) && (instant || end) !== periodEnd) continue;
    const typed = inner.match(/<xbrldi:typedMember[^>]*dimension="[^"]*InvestmentIdentifierAxis"[^>]*>\s*<[^>]+>([\s\S]*?)<\/[^>]+>\s*<\/xbrldi:typedMember>/);
    const explicit = inner.match(/<xbrldi:explicitMember[^>]*dimension="[^"]*InvestmentIdentifierAxis"[^>]*>([^<]+)<\/xbrldi:explicitMember>/);
    // Extra dimensions (affiliation, industry) on top of the identifier are fine; the identifier is what we key on.
    if (typed) ctx.set(id, { text: typed[1].trim(), issuer: issuerOf(typed[1]) });
    else if (explicit) ctx.set(id, { text: explicit[1].trim(), issuer: issuerOfMember(explicit[1].trim()) });
  }
  const byIssuer = new Map();
  const factRe = /<([a-zA-Z-]+:[A-Za-z]+)\b([^>]*\bcontextRef="([^"]+)"[^>]*)>([^<]*)<\/\1>/g;
  while ((m = factRe.exec(xml))) {
    const [, name, , ref, raw] = m;
    const c = ctx.get(ref);
    if (!c?.issuer) continue;
    const field = Object.keys(FACTS).find((k) => FACTS[k].test(name));
    if (!field) continue;
    const key = normIssuer(c.issuer);
    if (!key) continue;
    const row = byIssuer.get(key) || { issuer: c.issuer, key, fair_value: 0, cost: 0, principal: 0, spread: null, rate: null, maturity: null, instruments: new Set() };
    row.instruments.add(c.text.slice(0, 200));
    const v = raw.trim();
    if (field === 'maturity') { if (!row.maturity || v > row.maturity) row.maturity = v; }
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (field === 'spread' || field === 'rate') { const pct = n < 1 ? n * 100 : n; if (row[field] === null || pct > row[field]) row[field] = Math.round(pct * 100) / 100; }
      else row[field] += n;
    }
    byIssuer.set(key, row);
  }
  const holdings = [...byIssuer.values()].map((r) => ({ ...r, instruments: [...r.instruments].slice(0, 6), first_lien: [...r.instruments].some((t) => /first lien|1st lien|senior secured|unitranche/i.test(t)) }));
  return { periodEnd, holdings };
}

/** Names in `now` that were not in `before`. Ignores tiny positions (< $250k) so warrants and stub equity don't count. */
export function newBorrowers(before, now, minFair = 250_000) {
  const had = new Set(before.map((h) => h.key));
  return now.filter((h) => !had.has(h.key) && (h.fair_value >= minFair || h.principal >= minFair));
}

// ---------- EDGAR ----------

async function cikMap() {
  const j = await sec('https://www.sec.gov/files/company_tickers.json');
  const out = new Map();
  for (const v of Object.values(j || {})) out.set(String(v.ticker).toUpperCase(), { cik: String(v.cik_str).padStart(10, '0'), name: v.title });
  return out;
}

async function lastTwoReports(cik) {
  const sub = await sec(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const r = sub?.filings?.recent;
  if (!r) return [];
  const out = [];
  for (let i = 0; i < r.form.length && out.length < 2; i++) {
    if (!/^10-[QK]$/.test(r.form[i])) continue;
    out.push({ form: r.form[i], accession: r.accessionNumber[i], filed: r.filingDate[i], period: r.reportDate[i], primary: r.primaryDocument[i] });
  }
  return out;
}

async function instanceFor(cik, filing) {
  const dir = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replace(/-/g, '')}`;
  const idx = await sec(`${dir}/index.json`);
  const files = (idx?.directory?.item || []).map((f) => f.name);
  const name = files.find((f) => /_htm\.xml$/i.test(f)) || files.find((f) => /\.xml$/i.test(f) && !/^(filingsummary|metalink|financial_report)/i.test(f) && !/_(cal|def|lab|pre)\.xml$/i.test(f));
  if (!name) return null;
  return { url: `${dir}/${name}`, xml: await sec(`${dir}/${name}`, 'application/xml,text/xml') , doc: `${dir}/${filing.primary}` };
}

async function main() {
  const only = opt('only', '') ? opt('only').split(',').map((t) => t.trim().toUpperCase()) : null;
  const tickers = only || BDCS;
  const ciks = await cikMap();
  const summary = [];
  const holdingsRows = [];
  const signals = [];

  for (const t of tickers) {
    const c = ciks.get(t);
    if (!c) { summary.push({ t, note: 'ticker not on EDGAR' }); continue; }
    const reports = await lastTwoReports(c.cik);
    if (reports.length < 2) { summary.push({ t, note: 'fewer than two periodic reports' }); continue; }
    const [cur, prev] = reports;
    const [a, b] = [await instanceFor(c.cik, cur), await instanceFor(c.cik, prev)];
    if (!a?.xml || !b?.xml) { summary.push({ t, note: 'no XBRL instance found' }); continue; }
    const now = parseHoldings(a.xml), before = parseHoldings(b.xml);
    if (now.holdings.length < 10 || before.holdings.length < 10) { summary.push({ t, note: `schedule not tagged on InvestmentIdentifierAxis (${now.holdings.length}/${before.holdings.length} issuers)` }); continue; }
    const fresh = newBorrowers(before.holdings, now.holdings);
    // A redesign of the tags would make everything look new; treat a >40% turnover as a parse change.
    const suspect = fresh.length > now.holdings.length * 0.4;
    summary.push({ t, name: c.name, period: now.periodEnd || cur.period, filed: cur.filed, issuers: now.holdings.length, new: suspect ? 0 : fresh.length, note: suspect ? 'turnover too high; tags changed?' : '' });
    for (const h of now.holdings) holdingsRows.push({ bdc_ticker: t, bdc_name: c.name, period_end: now.periodEnd || cur.period, filed_on: cur.filed, accession: cur.accession, issuer: h.issuer, issuer_key: h.key, fair_value: Math.round(h.fair_value), cost: Math.round(h.cost), principal: Math.round(h.principal), spread_pct: h.spread, rate_pct: h.rate, maturity: h.maturity, first_lien: h.first_lien, instruments: h.instruments, is_new: !suspect && fresh.includes(h), venture: VENTURE.has(t), source_url: a.doc });
    if (!suspect && !VENTURE.has(t)) for (const h of fresh) signals.push({ t, bdc: c.name, h, filed: cur.filed, url: a.doc });
  }

  console.table(summary);
  const pricing = signals.filter((s) => s.h.first_lien && s.h.spread).map((s) => s.h.spread).sort((x, y) => x - y);
  if (pricing.length) console.log(`New first-lien loans with a tagged spread: ${pricing.length}, median ${pricing[Math.floor(pricing.length / 2)].toFixed(2)}%`);
  console.log(`${signals.length} new borrowers across ${summary.filter((s) => s.new).length} BDCs`);
  for (const s of signals.slice(0, 40)) console.log(`  ${s.t}: ${s.h.issuer}  FV $${(s.h.fair_value / 1e6).toFixed(1)}M  ${s.h.spread ? `S+${s.h.spread}%` : ''}`);
  if (flag('dry')) return;

  let saved = 0;
  for (const part of chunk(holdingsRows, 400)) saved += (await api('bdc', { holdings: part })).saved ?? 0;
  console.log(`Saved ${saved} holdings rows`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## BDC filings watch', `${signals.length} new borrowers in the latest 10-Q/10-K vs the one before.`, '', '| BDC | Period | Issuers | New | Note |', '|---|---|---|---|---|',
      ...summary.map((s) => `| ${s.t} | ${s.period ?? ''} | ${s.issuers ?? ''} | ${s.new ?? ''} | ${s.note ?? ''} |`), '', '| BDC | New borrower | Fair value | Spread |', '|---|---|---|---|',
      ...signals.map((s) => `| ${s.t} | ${s.h.issuer.replace(/\|/g, '/')} | $${(s.h.fair_value / 1e6).toFixed(1)}M | ${s.h.spread ?? ''} |`)];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
