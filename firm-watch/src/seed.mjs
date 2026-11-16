// Loads data/firms.json into pe_firm_sources. Safe to run every time; unchanged firms are skipped.
import { readFile } from 'node:fs/promises';
import { api, chunk } from './api.mjs';

const firms = JSON.parse(await readFile(new URL('../data/firms.json', import.meta.url), 'utf8'));
const total = { flagged: 0, inserted: 0, already: 0 };
for (const part of chunk(firms, 300)) {
  const r = await api('seed', { firms: part.map(({ name, website, domain, hq, type, tier }) => ({ name, website, domain, hq, type, tier })) });
  for (const k of Object.keys(total)) total[k] += r[k] ?? 0;
}
console.log(`Watchlist sync: ${firms.length} firms in the list. ${total.inserted} added, ${total.flagged} existing firms flagged, ${total.already} unchanged.`);
