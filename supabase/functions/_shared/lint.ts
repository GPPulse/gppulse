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
