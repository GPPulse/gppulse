// Loads data/firms.json into pe_firm_sources. Safe to run every time; unchanged firms are skipped.
import { readFile } from 'node:fs/promises';
import { api, chunk } from './api.mjs';

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
// Sponsors (the watchlist), the advisors and lenders whose closed-deal pages we read, and the
// trade publications that cover lower-middle-market buy-and-builds the PE press never picks up.
const firms = [...(await load('firms.json')), ...(await load('advisors.json')), ...(await load('trade.json')).map((t) => ({ ...t, type: t.beat }))];
const total = { flagged: 0, inserted: 0, already: 0 };
for (const part of chunk(firms, 300)) {
  const r = await api('seed', { firms: part.map(({ name, website, domain, hq, type, tier, kind }) => ({ name, website, domain, hq, type, tier, kind })) });
  for (const k of Object.keys(total)) total[k] += r[k] ?? 0;
}
console.log(`Source sync: ${firms.length} firms in the lists. ${total.inserted} added, ${total.flagged} existing firms flagged, ${total.already} unchanged.`);
