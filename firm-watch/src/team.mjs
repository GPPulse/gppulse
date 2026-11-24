// Team-page watch. Most lower-middle-market promotions are never announced: the firm just edits
// a title on its website. This finds each sponsor's team page once, stores every name and title
// on it, and on later runs compares the page with the stored copy.
//
//   title moved up the ladder  -> promotion (VP and above goes to the People section)
//   new senior name            -> possible hire, sent to the Editor's Desk
//   senior name gone           -> possible departure, sent to the Editor's Desk, never published
//
// A big swing in one run means the page was redesigned or failed to load, so nothing is reported.
//
//   node src/team.mjs [--retry] [--tier 2] [--limit 50] [--discover-limit 400] [--render] [--dry] [--show 20]
import { appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import * as lib from './lib.mjs';
import { api, chunk } from './api.mjs';

const { get, pool, allowed, sameSite, findLinks } = lib;
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const clean = (s) => (s || '').replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- titles ----------

// Seniority ladder. Firms name the rungs differently (Principal at one is Director at another),
// so equal numbers mean "about the same level" and only a strictly higher number is a promotion.
// Checked in order; each match is removed before the next is tried, so "Vice President" is never
// read as "President" and "Associate Director" is never read as "Associate".
const LADDER = [
  [/\b(operating|venture|executive|industry|advisory|special|strategic|limited|of counsel)\s+(partner|advis[eo]r|director|executive)s?\b/, null],
  [/\b(senior |sr )?(advis[eo]r|executive[- ]in[- ]residence|entrepreneur[- ]in[- ]residence|board member|emeritus|retired|consultant)\b/, null],
  [/\b(chairman|chairwoman|chairperson|chair|(co[- ])?founder|founding partner|managing partner|senior partner|co[- ]managing partner)\b/, 60],
  [/\b(senior |sr )managing director\b/, 52],
  [/\bmanaging director\b/, 50],
  [/\b(associate|junior) partner\b/, 45],
  [/\b(general )?partner\b/, 55],
  [/\b(senior |sr )(principal|director)\b/, 45],
  [/\bassociate director\b/, 32],
  [/\b(assistant|associate) vice president\b/, 27],
  [/\b(executive|senior|sr) vice president\b/, 35],
  [/\bvice president\b/, 30],
  [/\b(co[- ])?(president|chief executive officer|ceo)\b/, 58],
  [/\bchief [a-z ]{3,30} officer\b|\b(cfo|coo|cco|cio|cto|cmo|chro|general counsel)\b/, 50],
  [/\bhead of\b/, 40],
  [/\b(executive )?director\b/, 40],
  [/\bprincipal\b/, 40],
  [/\bcontroller\b/, 35],
  [/\b(senior|sr) associate\b/, 25],
  [/\bassociate\b/, 20],
  [/\b(senior|sr) analyst\b/, 15],
  [/\banalyst\b/, 10],
  [/\b(intern|fellow)\b/, 0],
];

export const normTitle = (t) => clean(t).toLowerCase()
  .replace(/&/g, ' and ').replace(/\bsr\.?(?=\s)/g, 'senior').replace(/\bv\.?p\.?\b/g, 'vice president')
  .replace(/\bs\.?v\.?p\.?\b/g, 'senior vice president').replace(/\be\.?v\.?p\.?\b/g, 'executive vice president')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Highest rung named in a title, or null when the title is off the ladder (advisors, operating
// partners) or not recognised.
export function titleRank(title) {
  let rest = ` ${normTitle(title)} `;
  // "Former CFO, The Boeing Company" on an advisory board is a biography, not a job at this firm.
  if (/\b(former|formerly|retired|emeritus)\b/.test(rest)) return null;
  let best = null;
  for (const [re, rank] of LADDER) {
    const g = new RegExp(re.source, 'g');
    if (!g.test(rest)) continue;
    rest = rest.replace(g, ' ');
    if (rank != null && (best == null || rank > best)) best = rank;
  }
  return best;
}

const TITLE_WORD = /\b(partner|principal|director|president|associate|analyst|officer|chairman|chairwoman|chair|founder|controller|counsel|head of|manager|advis[eo]r|executive|administrator|assistant|accountant|treasurer|secretary|fellow|intern|specialist|coordinator|c[efoitm]o|cco|chro|vp|svp|evp)\b/i;
const NOT_TITLE = /\b(our|we|us|their|is|are|was|were|has|have|joined|joins|responsible|years?|experience|prior to|previously|read|view|learn|click|meet|contact|bio|linkedin|email|phone|your|seeking|businesses|that|who)\b/i;

export function looksLikeTitle(line) {
  const t = clean(line);
  if (t.length < 2 || t.length > 90 || /[.!?]$/.test(t) || t.split(' ').length > 12) return false;
  // "Jeff Rice, MD" under a company logo is a person, not a title.
  if (personName(t.replace(/,\s*(md|m\.d\.|pe)$/i, ''))) return false;
  return TITLE_WORD.test(t) && !NOT_TITLE.test(t);
}

// "Managing Directors" above a row of names: the heading is everyone's title.
const HEADING_TITLES = [
  [/^(the |our )?(managing |founding |senior |general )?partners$/i, (m) => `${m[2] ? m[2].trim() + ' ' : ''}Partner`],
  [/^(the |our )?(senior )?managing directors$/i, (m) => `${m[2] ? 'Senior ' : ''}Managing Director`],
  [/^(the |our )?(senior )?principals$/i, () => 'Principal'],
  [/^(the |our )?(senior )?directors$/i, () => 'Director'],
  [/^(the |our )?(senior )?vice presidents$/i, (m) => `${m[2] ? 'Senior ' : ''}Vice President`],
  [/^(the |our )?(senior )?associates$/i, (m) => `${m[2] ? 'Senior ' : ''}Associate`],
  [/^(the |our )?(senior )?analysts$/i, (m) => `${m[2] ? 'Senior ' : ''}Analyst`],
  [/^(the |our )?operating partners$/i, () => 'Operating Partner'],
  [/^(the |our )?(senior )?advis[eo]rs$/i, () => 'Senior Advisor'],
];
const SECTION_END = /^(operations|administration|finance( (and|&) operations)?|(the |our )?(investment|operating|operations|finance|leadership|advisory|executive) (team|board|council|committee)|board of (advisors|directors)|(our )?(portfolio|companies|investments)|news|contact( us)?|careers)$/i;
const headingTitle = (line) => {
  const t = clean(line).replace(/\b\w/g, (c) => c.toUpperCase());
  for (const [re, make] of HEADING_TITLES) { const m = t.match(re); if (m) return make(m).replace(/\b\w/g, (c) => c.toUpperCase()); }
  return null;
};

// ---------- names ----------

const CREDENTIALS = /,?\s+(cfa|cpa|mba|phd|ph\.d\.?|jd|j\.d\.?|esq\.?|caia|cpa\/abv|p\.e\.?|m\.d\.?|cma|cfp|frm)\b\.?/gi;
const SUFFIX = /,?\s+(jr|sr|ii|iii|iv)\b\.?/i;
const PARTICLE = /^(de|del|della|der|den|di|da|dos|du|la|le|van|von|bin|al|el|st\.?|mc|mac|o')$/i;
// Words that never appear in a person's name on a firm site. Place names are handled as whole
// phrases below, because Park, West, Lake, Virginia and the like are also people's names.
const NOT_NAME = new Set(('capital partners partner equity team our the investment investments management portfolio contact news about learn read view more group fund funds holdings llc inc lp advisors advisor advisory operating senior managing director directors principal principals associate associates analyst analysts vice president chief officer founder chairman privacy policy terms street avenue suite united states office offices headquarters board committee leadership professionals people staff executive executives administration finance accounting operations business development investor relations human resources marketing compliance legal firm company companies industries industry services solutions strategy approach criteria overview history values culture careers login search menu filter show load next previous back close skip follow share connect get started email phone download bio biography profile linkedin twitter buyout ventures meet who we what how why case studies study former association university college institute foundation society alliance council national independent sponsors evp svp vp ceo cfo coo cio cto cco md')
  .split(' '));
const PLACE = /^(new york|new york city|san francisco|los angeles|san diego|san antonio|san jose|san mateo|palm beach|west palm beach|north palm beach|fort worth|fort lauderdale|salt lake city|st\.? louis|st\.? paul|st\.? petersburg|kansas city|oklahoma city|park city|grand rapids|boca raton|las vegas|new orleans|new haven|new canaan|new jersey|des moines|baton rouge|santa monica|santa barbara|palo alto|menlo park|coral gables|winter park|long island|north carolina|south carolina|old greenwich|west hartford|ann arbor|el segundo|newport beach|laguna beach|beverly hills|overland park|highland park|oak brook|lake forest|chevy chase|bala cynwyd|west conshohocken|king of prussia|costa mesa|little rock|cedar rapids|sioux falls|colorado springs|bay area|twin cities|north america|united kingdom|hong kong|mexico city)$/i;

// A person's name as it appears on a team page, without credentials. null when the line is
// not a name.
export function personName(line) {
  let t = clean(line).replace(CREDENTIALS, '').replace(/["“”]/g, '"').replace(/\s+,/g, ',').replace(/,$/, '').trim();
  if (t.length < 5 || t.length > 45 || /[\d@:;!?/|()&]/.test(t.replace(/\([^)]{1,15}\)/g, '')) || t.includes(',') && !SUFFIX.test(t)) return null;
  t = t.replace(/\s*\([^)]{1,15}\)/g, '');
  const words = t.replace(SUFFIX, '').split(' ');
  // "General Counsel" and "Fund Accountant" are capitalised like names but are titles.
  if (words.length < 2 || words.length > 5 || PLACE.test(t) || TITLE_WORD.test(t)) return null;
  let caps = 0;
  for (const w of words) {
    const bare = w.replace(/^"|"$/g, '');
    if (PARTICLE.test(bare)) continue;
    if (/^[A-Z]\.?$/.test(bare)) continue; // middle initial
    if (!/^[A-Z][A-Za-zÀ-ÿ'’.-]*$/.test(bare)) return null;
    if (NOT_NAME.has(bare.toLowerCase().replace(/[.'’]/g, ''))) return null;
    caps++;
  }
  if (caps < 2) return null;
  // ALL-CAPS names are common in card designs; store them in ordinary case.
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s\-'’"])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
  return t;
}

// Same person across runs: lower case, no middle initials, suffixes, nicknames or punctuation.
export const personKey = (name) => clean(name).toLowerCase().replace(/"[^"]*"|\([^)]*\)/g, ' ').replace(SUFFIX, ' ')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s-]/g, '').split(/\s+/).filter((w) => w.length > 1).join(' ');

// ---------- team pages ----------

const INLINE = new Set(['b', 'strong', 'i', 'em', 'u', 'small', 'sup', 'sub', 'mark', 'font', 'abbr']);

// The page as an ordered list of short text lines. Every element boundary is a line break except
// pure formatting tags, so "<h3>Jane Doe</h3><p>Partner</p>" and "<b>Jane Doe</b><br>Partner"
// both come out as two lines, while "<strong>Jane Doe</strong>, Partner" stays as one.
export function pageLines(html) {
  const $ = cheerio.load(html);
  $('nav, header, footer, script, style, noscript, form, svg, select, [role="navigation"], .menu, .nav, .footer, .header, .pagination, .breadcrumb').remove();
  const lines = [];
  let buf = '';
  const flush = () => { const t = clean(buf); if (t) lines.push(t); buf = ''; };
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.type === 'text') buf += child.data;
      else if (child.type === 'tag') {
        const inline = INLINE.has(child.name);
        if (!inline) flush();
        if (child.name !== 'br') walk(child);
        if (!inline) flush();
      }
    }
  };
  walk($('body')[0] || $.root()[0]);
  flush();
  return lines;
}

// Everyone on a team page with a title. Three layouts cover nearly every firm site: a title on
// the line after the name, a title on the same line ("Jane Doe, Partner"), or a heading such as
// "Managing Directors" above a run of names.
export function extractTeam(html) {
  const lines = pageLines(html).slice(0, 4000);
  const people = new Map();
  const add = (name, title, how) => {
    const key = personKey(name);
    if (!key || !title) return;
    const prev = people.get(key);
    // The same person often appears twice (grid and bio). Keep the entry with a ranked title.
    if (prev && (titleRank(prev.title) != null || titleRank(title) == null)) return;
    let shown = clean(title).replace(/^[-–—|,:\s]+|[-–—|,:\s*]+$/g, '').slice(0, 90);
    // "VICE PRESIDENT" and "associate" are styling; store titles in ordinary case.
    if (shown === shown.toUpperCase() && shown.length > 4 || shown === shown.toLowerCase()) shown = shown.toLowerCase().replace(/(^|[\s\-/&(])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(And|Of|The|For|In)\b/g, (m) => m.toLowerCase()).replace(/\b(Ceo|Cfo|Coo|Cio|Cto|Cco|Vp|Svp|Evp|Hr|Ir|Ai|It)\b/g, (m) => m.toUpperCase());
    people.set(key, { name, title: shown, how });
  };

  // Does this page put titles above names? Mid-page both readings fit ("Partner / Jane / Principal
  // / John"), so the ends decide: a title before the first name and none after the last.
  const isTitle = (l) => Boolean(l) && looksLikeTitle(l) && !personName(l);
  const at = lines.map((l, i) => (personName(l.replace(CREDENTIALS, '')) ? i : -1)).filter((i) => i >= 0);
  const paired = at.filter((i) => isTitle(lines[i + 1]) || isTitle(lines[i - 1]));
  const titleFirst = paired.length >= 2 && isTitle(lines[paired[0] - 1]) && !isTitle(lines[paired[paired.length - 1] + 1]);

  let section = null;
  const underHeading = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(CREDENTIALS, '');
    const heading = headingTitle(line);
    if (heading) { section = heading; continue; }
    if (SECTION_END.test(line)) { section = null; continue; }

    // "Jane Doe, Partner" / "Jane Doe – Managing Director" / "Jane Doe | Principal"
    const split = line.match(/^(.{5,45}?)\s*(?:[,–—|]|\s-\s)\s*(.{3,80})$/);
    if (split && personName(split[1]) && looksLikeTitle(split[2])) { add(personName(split[1]), split[2], 'inline'); continue; }

    const name = personName(line);
    if (!name) continue;
    const near = titleFirst ? [lines[i - 1]] : [lines[i + 1], lines[i + 2]];
    let title = null;
    for (const cand of near) {
      if (!cand || personName(cand)) break;
      if (looksLikeTitle(cand)) { title = cand; break; }
    }
    if (title) add(name, title, 'adjacent');
    else if (section) underHeading.push([name, section]);
  }
  // Names grouped under "Managing Directors"-style headings only count on pages laid out that
  // way; on a page that pairs names with titles, a bare name under a heading is something else.
  if (people.size < 3) for (const [name, title] of underHeading) add(name, title, 'heading');
  return [...people.values()].map(({ name, title }) => ({ name, title }));
}

// Compare today's team page with the stored one.
export function diffTeam(oldTeam, newTeam) {
  if (!oldTeam || !oldTeam.length) return { store: newTeam, moves: [], reason: 'baseline' };
  if (newTeam.length < Math.max(2, oldTeam.length * 0.6)) return { store: oldTeam, moves: [], reason: 'page looked incomplete; kept previous list' };
  const before = new Map(oldTeam.map((p) => [personKey(p.name), p]));
  const now = new Map(newTeam.map((p) => [personKey(p.name), p]));
  const moves = [];
  let retitled = 0;
  for (const [key, p] of now) {
    const was = before.get(key);
    if (!was) { moves.push({ move_type: 'hire', person: p.name, person_key: key, old_title: null, new_title: p.title, old_rank: null, new_rank: titleRank(p.title) }); continue; }
    if (normTitle(was.title) === normTitle(p.title)) continue;
    retitled++;
    const a = titleRank(was.title), b = titleRank(p.title);
    moves.push({ move_type: a != null && b != null && b > a ? 'promotion' : 'title_change', person: p.name, person_key: key, old_title: was.title, new_title: p.title, old_rank: a, new_rank: b });
  }
  for (const [key, p] of before) if (!now.has(key)) moves.push({ move_type: 'departure', person: p.name, person_key: key, old_title: p.title, new_title: null, old_rank: titleRank(p.title), new_rank: null });
  if (!moves.length) return { store: oldTeam, moves: [], reason: 'unchanged' };
  const comeAndGo = moves.length - retitled;
  // Promotions come in batches at year end, so retitles get more room than arrivals and exits.
  if (comeAndGo > Math.max(4, oldTeam.length * 0.25) || retitled > Math.max(6, oldTeam.length * 0.5)) return { store: newTeam, moves: [], reason: 'large change; treated as a redesign' };
  return { store: newTeam, moves, reason: 'changed' };
}

const GUESS = ['/team', '/our-team', '/people', '/about/team', '/about-us/team', '/professionals', '/leadership', '/team-members', '/our-people', '/who-we-are', '/about', '/about-us'];
const TEXT = /^(our |the |meet (the|our) )?(team|people|professionals|leadership|who we are|our firm|about( us)?)$/i;
const PATH = /\/(team|our-team|people|professionals|leadership|who-we-are|about)/i;

const INVESTOR = /\b(partner|principal|managing director|vice president|vp|associate|analyst)\b/i;

async function read(url, render) {
  let res = await get(url);
  if (render && res.ok && lib.looksJsRendered?.(res.body)) {
    const shown = await lib.render(url).catch(() => null);
    if (shown?.ok) res = shown;
  }
  return res;
}

// Larger firms split the team over several pages: by group ("Investment Team", "Operations"),
// or by page number. Junior investment staff are often on the second one. These are the
// same-site links on a team page that lead to more of the team, not to one person's biography.
const SUBPAGE_TEXT = /^(all|next|\d{1,2}|view all|show all|load more|more|investment( team| professionals)?|investment staff|deal team|partners|principals|vice presidents|associates|senior (team|leadership)|leadership|management|executive team|operating (team|partners)|operations( team)?|portfolio operations|business development|finance( and operations)?|professionals|our team)$/i;
export function teamSubpages(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const here = base.pathname.replace(/\/$/, '');
  const out = new Set();
  $('a[href]').each((_, el) => {
    let u; try { u = new URL($(el).attr('href'), pageUrl); } catch { return; }
    if (u.origin !== base.origin) return;
    const path = u.pathname.replace(/\/$/, '');
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const paged = /\/(page|p)\/\d{1,2}$/.test(path) || /[?&](page|paged|pg)=\d{1,2}\b/.test(u.search);
    const grouped = SUBPAGE_TEXT.test(text) && (path.startsWith(`${here}/`) || (path === here && u.search && u.search !== base.search));
    if ((paged && path.startsWith(here)) || grouped) {
      const href = u.href.split('#')[0];
      if (href.replace(/\/$/, '') !== pageUrl.split('#')[0].replace(/\/$/, '')) out.add(href);
    }
  });
  return [...out].slice(0, 5);
}

// A firm's whole team: the team page plus any group or numbered pages it links to.
export async function readTeam(url, render) {
  const res = await read(url, render);
  if (!res.ok) return res;
  const members = extractTeam(res.body);
  const seen = new Set(members.map((m) => personKey(m.name)));
  for (const sub of teamSubpages(res.body, res.url)) {
    if (!(await allowed(sub))) continue;
    const more = await read(sub, render);
    if (!more.ok) return { ...res, ok: false, error: `sub-page unreadable: ${sub}` }; // a partial team would read as departures
    for (const m of extractTeam(more.body)) { const k = personKey(m.name); if (!seen.has(k)) { seen.add(k); members.push(m); } }
  }
  return { ...res, members };
}

// The page on a firm's site with the most titled people.
export async function findTeamPage(firm, { render = false } = {}) {
  const home = await read(firm.website_url, render);
  if (!home.ok) return null;
  const origin = new URL(home.url).origin;
  let best = null;
  const consider = (url, body) => {
    const members = extractTeam(body);
    // Two or more investment titles, so a home page of portfolio-CEO testimonials does not pass.
    if (members.length >= 2 && members.filter((m) => INVESTOR.test(m.title)).length >= 2 && (!best || members.length > best.members.length)) best = { url, members };
  };
  consider(home.url, home.body); // two-person firms often list themselves on the home page
  const tried = new Set([home.url.replace(/\/$/, '')]);
  let fetched = 0;
  for (const url of [...findLinks(home.body, home.url, TEXT, PATH), ...GUESS.map((p) => origin + p)]) {
    const key = url.replace(/\/$/, '');
    if (tried.has(key) || fetched >= 7) continue;
    tried.add(key);
    if (!(await allowed(url))) continue;
    const res = await read(url, render);
    fetched++;
    if (!res.ok || !sameSite(res.url, origin)) continue;
    const final = res.url.replace(/\/$/, '');
    if (final !== key) { if (tried.has(final)) continue; tried.add(final); }
    consider(res.url, res.body);
    if (best && best.members.length >= 8 && best.url === res.url) break;
  }
  // Store the whole team, sub-pages included, so tomorrow's read compares like with like.
  if (best) { const whole = await readTeam(best.url, render); if (whole.ok && whole.members.length >= best.members.length) best = { url: best.url, members: whole.members }; }
  return best;
}

const SENIOR = 40; // Director / Principal and up: worth an editor's eye when they arrive or leave
const PUBLISH = 25; // Senior Associate and up: promotions that go to the People section

export function describe(move, firm) {
  if (move.move_type === 'promotion') return `${move.person}: ${move.old_title} → ${move.new_title} at ${firm.name}`;
  if (move.move_type === 'hire') return `${move.person} now listed as ${move.new_title} at ${firm.name}`;
  if (move.move_type === 'departure') return `${move.person} (${move.old_title}) no longer listed at ${firm.name}`;
  return `${move.person}: title changed from ${move.old_title} to ${move.new_title} at ${firm.name}`;
}

async function main() {
  const render = flag('render') && typeof lib.render === 'function';
  let { firms, team_ready } = await api('firms');
  // Without its columns there is nowhere to keep a baseline, and every run would start over.
  if (team_ready === false && !flag('dry')) { console.log('Team watch: database migration 20261121150000_team_watch is not applied yet. Nothing to do.'); return; }
  firms = firms.filter((f) => f.watchlist && (f.watch_tier ?? 4) <= Number(opt('tier', 4))).slice(0, Number(opt('limit', 1e9)));
  // Finding a team page takes several requests per firm; spread the first pass over a few days.
  let budget = Number(opt('discover-limit', 400));
  const updates = [], moves = [], samples = [];
  const count = { found: 0, looked: 0, compared: 0, unreadable: 0, redesign: 0 };

  await pool(firms, 8, async (firm) => {
    if (!firm.team_url) {
      if ((firm.team_checked_at && !flag('retry')) || budget <= 0) return;
      budget--; count.looked++;
      const page = await findTeamPage(firm, { render });
      updates.push({ id: firm.id, team_url: page?.url ?? null, members: page?.members ?? null });
      if (page) { count.found++; samples.push({ firm: firm.name, url: page.url, members: page.members }); }
      return;
    }
    if (!(await allowed(firm.team_url))) return;
    const res = await readTeam(firm.team_url, render);
    if (!res.ok) { count.unreadable++; return; }
    count.compared++;
    const d = diffTeam(firm.team_members, res.members);
    if (d.reason === 'unchanged') return;
    if (d.reason.startsWith('page looked incomplete')) { count.unreadable++; return; }
    if (d.reason.startsWith('large change')) count.redesign++;
    updates.push({ id: firm.id, members: d.store });
    for (const m of d.moves) {
      const publish = m.move_type === 'promotion' && m.new_rank >= PUBLISH;
      const review = (m.move_type === 'hire' && (m.new_rank ?? 0) >= SENIOR) || (m.move_type === 'departure' && (m.old_rank ?? 0) >= SENIOR);
      moves.push({ ...m, firm_id: firm.id, firm_name: firm.name, url: firm.team_url, publish, review, line: describe(m, firm) });
    }
  });
  await lib.closeRenderer?.();

  const promos = moves.filter((m) => m.move_type === 'promotion');
  console.log(`Team watch: ${firms.length} sponsors. Looked for a team page at ${count.looked}, found ${count.found}. Compared ${count.compared} pages: ${promos.length} promotions, ${moves.filter((m) => m.move_type === 'hire').length} arrivals, ${moves.filter((m) => m.move_type === 'departure').length} departures, ${count.redesign} redesigns ignored, ${count.unreadable} unreadable today.`);
  for (const m of moves.slice(0, 60)) console.log(`  [${m.move_type}${m.publish ? ', People' : m.review ? ", Editor's Desk" : ''}] ${m.line}`);
  if (samples.length) {
    const sizes = samples.map((s) => s.members.length).sort((a, b) => a - b);
    console.log(`Team pages found: median ${sizes[Math.floor(sizes.length / 2)]} people, ${samples.filter((s) => s.members.length >= 5).length} with five or more.`);
    for (const s of samples.slice(0, Number(opt('show', 0)))) console.log(`\n${s.firm} — ${s.url}\n${s.members.map((m) => `  ${m.name} | ${m.title} | ${titleRank(m.title) ?? '-'}`).join('\n')}`);
  }
  if (flag('dry')) return;

  let saved = 0, published = 0, filed = 0;
  const parts = chunk(updates, 40);
  for (let i = 0; i < Math.max(parts.length, 1); i++) {
    const r = await api('team', { firms: parts[i] ?? [], moves: i === 0 ? moves : [] });
    saved += r.saved ?? 0; published += r.published ?? 0; filed += r.filed ?? 0;
  }
  console.log(`Saved ${saved} moves: ${published} promotions to People, ${filed} to the Editor's Desk.`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const have = firms.filter((f) => f.team_url).length + count.found;
    const lines = ['## Team watch', `${have} of ${firms.length} sponsors have a team page on file (${count.found} found today). **${promos.length} promotions**, ${moves.length - promos.length} other changes; ${published} sent to People, ${filed} to the Editor's Desk.`, '', ...moves.map((m) => `- ${m.line} ([team page](${m.url}))`)];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
