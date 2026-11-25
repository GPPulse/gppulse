// The rules an issue has to pass before it may go out unattended. With AUTO_SEND on nobody
// reads the draft first, so the generator checks its own work: it reads the parts a subscriber
// sees first (subject, Lede, the three numbers, the sign-off) and returns what is wrong.
// One rewrite is attempted; an issue that still fails is held for the editor.

export interface LintInput {
  subject: string;
  preheader?: string | null;
  headline?: string | null;
  paragraphs?: string[];
  numbers?: { value: string; label: string; context?: string }[];
  closing?: string | null;
  /** Names of lenders whose filings fed this issue, e.g. "GOLUB CAPITAL BDC, Inc." */
  lenders?: string[];
}

const MARKETS = /\b(s&p|s&p 500|nasdaq|dow|djia|russell( 2000)?|10[- ]?year|ten[- ]year|treasur(y|ies)|sofr|yields?|stocks?|equities|the fed)\b/i;
const BDC = /\b(bdcs?|business development compan(y|ies))\b/i;
const FILLER = /\b(terms (were |are )?(not |un)disclosed|undisclosed terms|pricing (was |is )?(not |un)disclosed|financial terms were not)\b/i;

const GENERIC_FIRST = new Set(["main", "first", "new", "blue", "black", "golden", "great", "north", "south", "east", "west", "american", "national", "united", "capital", "prospect", "barings", "saratoga", "monroe", "carlyle"]);
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "GOLUB CAPITAL BDC, Inc." → "golub": the word a writer would use for the lender. One word
 * when it is distinctive, otherwise the first two ("main street", "blue owl").
 */
export function lenderKey(name: string): string {
  const words = name.toLowerCase().replace(/[.,]/g, " ").replace(/\b(bdc|inc|corp|corporation|llc|lp|fund|trust|lending|specialty|finance|investment|investments|the)\b/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return words[0] && words[0].length >= 5 && !GENERIC_FIRST.has(words[0]) ? words[0] : words.slice(0, 2).join(" ");
}

export function lintIssue(i: LintInput): string[] {
  const problems: string[] = [];
  const lenders = [...new Set((i.lenders ?? []).map(lenderKey).filter((k) => k.length >= 4))];
  const namesLender = (t: string) => lenders.find((k) => new RegExp(`\\b${esc(k)}\\b`, "i").test(t)) ?? null;
  const aboutLender = (t: string | null | undefined) => (t ? BDC.test(t) || Boolean(namesLender(t)) : false);

  const subject = (i.subject ?? "").trim();
  if (!subject) problems.push("There is no subject line.");
  if (subject.length > 90) problems.push(`The subject is ${subject.length} characters; keep it under 90.`);
  if (MARKETS.test(subject)) problems.push("The subject leads with public markets or rates. It must name a company, sponsor, platform or a count from our tracker.");
  if (aboutLender(subject)) problems.push("The subject names a lender or BDC. Our readers are sponsors; build it on a deal or a pattern.");

  const paragraphs = i.paragraphs ?? [];
  if (!paragraphs.length) problems.push("There is no Lede.");
  if (aboutLender(i.headline)) problems.push("The Lede headline is about a lender or BDC.");
  if (paragraphs[0] && aboutLender(paragraphs[0])) problems.push("The Lede opens on a lender's filing. Lead with a deal, a sponsor or a pattern from the tracker.");
  if (paragraphs[0] && MARKETS.test(paragraphs[0].split(/(?<=[.!?])\s/)[0] ?? "")) problems.push("The Lede's first sentence is about public markets or rates.");
  const lenderParas = paragraphs.filter(aboutLender).length;
  if (paragraphs.length && lenderParas > paragraphs.length / 2) problems.push("Most of the Lede is about lender filings.");

  for (const n of i.numbers ?? []) if (aboutLender(`${n.label} ${n.context ?? ""}`)) problems.push(`By the numbers: "${n.label}" is built on a lender or BDC.`);
  if ((i.numbers ?? []).length && (i.numbers ?? []).length !== 3) problems.push(`By the numbers has ${(i.numbers ?? []).length} entries; it needs exactly 3.`);
  if (aboutLender(i.closing)) problems.push("The sign-off is about a lender or BDC.");

  const all = [subject, i.preheader ?? "", i.headline ?? "", ...paragraphs, i.closing ?? ""].join(" ");
  if (FILLER.test(all)) problems.push('Filler about missing numbers ("terms undisclosed"). Say something only when there is something to say.');
  return problems;
}

// ---------------------------------------------------------------------------
// Desk voice. These never hold an issue; they send the draft back for one rewrite, and
// tidy() removes what a rewrite still leaves behind. Two things are checked: the tells of
// generated copy, and any mention of how a deal was found (readers get the deal, not the trail).
// ---------------------------------------------------------------------------
const TRAIL = /\b(tombstones?|portfolio (page|list)s?|schedule of investments|10-[QK]s?|sec filings?|form d|(its|their|the firm'?s|the sponsor'?s) (web)?site|(no|without a) (press release|wire story)|press release (was|has been) (issued|found)|we found no|found (on|via|in) (a|an|the)|scraped?|crawl(ed|er)?)\b/i;
const TELL_WORDS = /\b(landscape|robust|poised|synerg(y|ies)|ecosystem|transformative|game-?changer|delve|tapestry|testament|underscores?|showcases?|bolsters?|moreover|furthermore|at its core|the takeaway|the bottom line|it'?s worth noting|notably|importantly)\b/i;
const NOT_BUT = /\b(is|are|was|were|isn'?t|aren'?t|wasn'?t)\s+not\s+(just|only|merely|simply)\b|\b(isn'?t|aren'?t|wasn'?t)\s+(just|only|merely|simply)\b|\bnot\s+(just|only|merely)\b[^.]{0,80}\bbut\b/i;
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export interface StyleInput {
  subject?: string | null;
  headline?: string | null;
  paragraphs?: string[];
  closing?: string | null;
  /** Every deal take, radar take and why-it-matters line. */
  takes?: string[];
}

export function lintStyle(i: StyleInput): string[] {
  const problems: string[] = [];
  const takes = (i.takes ?? []).filter(Boolean);
  const front = [i.subject ?? "", i.headline ?? "", ...(i.paragraphs ?? []), i.closing ?? ""];
  const all = [...front, ...takes];
  const joined = all.join(" ");

  const trail = all.find((t) => TRAIL.test(t));
  if (trail) problems.push(`Says how a deal was found ("${(trail.match(TRAIL) ?? [""])[0]}"). Report the deal itself; never the tombstone, page, filing or missing press release.`);
  const tell = joined.match(TELL_WORDS);
  if (tell) problems.push(`Uses "${tell[0]}", a banned word.`);
  const dashes = (joined.match(/—|\s–\s|\s--\s/g) ?? []).length;
  if (dashes) problems.push(`${dashes} dash${dashes === 1 ? "" : "es"} used as punctuation. Use a period or a comma.`);
  if (NOT_BUT.test(joined)) problems.push('A "not just X, but Y" construction. Say what it is.');
  if (/\?/.test(front.join(" "))) problems.push("A question in the Lede, subject or sign-off. State it.");
  if (/!/.test(joined)) problems.push("An exclamation point.");

  // Uniform blocks are the giveaway: every take the same length, every take opening the same way.
  if (takes.length >= 4) {
    const counts = takes.map(words);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const spread = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length) / (mean || 1);
    if (spread < 0.25) problems.push(`The ${takes.length} takes are all about ${Math.round(mean)} words. Vary them: some one short sentence, one or two that run three or four sentences, and skip the deals with nothing to say.`);
    const firsts = takes.map((t) => (t.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    const top = Math.max(...[...new Set(firsts)].map((f) => firsts.filter((x) => x === f).length));
    if (top >= Math.max(3, Math.ceil(takes.length / 2))) problems.push("Too many takes open with the same word. Vary how they start.");
  }
  for (const p of i.paragraphs ?? []) {
    const s = sentences(p).map(words);
    if (s.length >= 4 && Math.max(...s) - Math.min(...s) < 6) { problems.push("A Lede paragraph has sentences of nearly identical length. Mix a long one with a short one."); break; }
  }
  return problems;
}

/** Last pass over reader copy: the marks a rewrite sometimes still leaves in. */
export function tidy(t: string): string;
export function tidy(t: null | undefined): null;
export function tidy(t: string | null | undefined): string | null;
export function tidy(t: string | null | undefined): string | null {
  if (t == null) return null;
  return t
    .replace(/\s*(—|\s–\s|\s--\s)\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.;:])/g, "$1")
    .replace(/!+/g, ".")
    .replace(/\.\.+(?!\.)/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}
