// Portfolio-page watch. Each sponsor's site lists the companies it owns; a new name there is
// often the first public sign of a deal that was never announced. This finds each sponsor's
// portfolio page once, stores the names on it, and on later runs sends new names to the
// Editor's Desk as unconfirmed signals. Nothing from here is published without an editor.
//
// Exit watch: a name that leaves the page is often the first sign of a sale, again with no
// announcement. Those go to the Editor's Desk too, as "Possible exit", after a second read of
// the page confirms the name is gone from the text and not just from one load.
//
//   node src/portfolio.mjs [--retry] [--tier 2] [--limit 50] [--dry]
import { appendFile } from 'node:fs/promises';
import { get, pool, allowed, sameSite, findLinks, extractPortfolio, diffPortfolio, stillOnPage } from './lib.mjs';
import { api, chunk } from './api.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const GUESS = ['/portfolio', '/investments', '/companies', '/our-companies', '/portfolio-companies', '/our-portfolio', '/our-investments'];
const TEXT = /^(our |current )?(portfolio|investments|companies|portfolio companies|partner companies)$/i;
const PATH = /\/(portfolio|investments|companies)/i;

export async function findPortfolioPage(firm) {
  const home = await get(firm.website_url);
  if (!home.ok) return null;
  const origin = new URL(home.url).origin;
  const tried = new Set();
  for (const url of [...findLinks(home.body, home.url, TEXT, PATH), ...GUESS.map((p) => origin + p)]) {
    const key = url.replace(/\/$/, '');
    if (tried.has(key)) continue;
    tried.add(key);
    if (!(await allowed(url))) continue;
    const res = await get(url);
    if (!res.ok || !sameSite(res.url, origin) || res.url.replace(/\/$/, '') === origin) continue;
    const names = extractPortfolio(res.body, res.url);
    if (names.length >= 5) return { url: res.url, names };
  }
  return null;
}

async function main() {
  let { firms } = await api('firms');
  firms = firms.filter((f) => f.watchlist && (f.watch_tier ?? 4) <= Number(opt('tier', 4))).slice(0, Number(opt('limit', 1e9)));
  const updates = [], signals = [];
  let found = 0, baselined = 0, changed = 0, skipped = 0, exits = 0;

  await pool(firms, 8, async (firm) => {
    if (!firm.portfolio_url) {
      if (firm.portfolio_checked_at && !flag('retry')) return;
      const page = await findPortfolioPage(firm);
      updates.push({ id: firm.id, portfolio_url: page?.url ?? null, names: page?.names ?? null });
      if (page) { found++; baselined++; }
      return;
    }
    if (!(await allowed(firm.portfolio_url))) return;
    const res = await get(firm.portfolio_url);
    if (!res.ok) { skipped++; return; }
    const d = diffPortfolio(firm.portfolio_names, extractPortfolio(res.body, res.url));
    if (d.reason === 'unchanged') return;
    if (d.reason === 'page looked incomplete; kept previous list') { skipped++; return; }
    updates.push({ id: firm.id, names: d.store });
    if (d.reason === 'baseline') baselined++;
    for (const company of d.added) {
      changed++;
      signals.push({
        headline: `First spotted: ${company} now on ${firm.name}'s portfolio page`,
        body: `${firm.name} added "${company}" to its portfolio page. No announcement found. Unconfirmed: the page may also have been reorganised. Check before running.`,
        url: firm.portfolio_url,
      });
    }
    // Exits: at most two names leaving at once, and only if a second read agrees.
    const removed = d.removed ?? [];
    if (removed.length && removed.length <= 2) {
      const again = await get(firm.portfolio_url);
      for (const company of removed) {
        if (!again.ok || stillOnPage(company, res.body) || stillOnPage(company, again.body)) continue;
        exits++;
        signals.push({
          headline: `Possible exit: ${company} no longer on ${firm.name}'s portfolio page`,
          body: `${firm.name} removed "${company}" from its portfolio page. No announcement found. Unconfirmed: it may have moved to a realized-investments page or been renamed. Check before running.`,
          url: firm.portfolio_url,
          company, sponsor: firm.name,
        });
      }
    }
  });

  console.log(`Portfolio watch: ${firms.length} sponsors. ${found} new portfolio pages found, ${baselined} lists stored for the first time, ${changed} new-company signals, ${exits} possible exits, ${skipped} pages unreadable today.`);
  for (const s of signals.slice(0, 40)) console.log(`  ${s.headline}`);
  if (flag('dry')) return;

  let filed = 0;
  const parts = chunk(updates, 40);
  for (let i = 0; i < Math.max(parts.length, 1); i++) {
    const r = await api('portfolio', { firms: parts[i] ?? [], signals: i === 0 ? signals : [] });
    filed += r.filed ?? 0;
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## Portfolio watch', `${firms.filter((f) => f.portfolio_url).length + found} of ${firms.length} sponsors have a portfolio page on file. **${filed} signals** sent to the Editor's Desk (${changed} new companies, ${exits} possible exits).`, '', ...signals.map((s) => `- [${s.headline}](${s.url})`)];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
