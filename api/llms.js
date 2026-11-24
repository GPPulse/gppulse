// /llms.txt and /llms-full.txt: a plain-text description of the site for AI assistants.
// llms.txt is the short map (what this is, where things are). llms-full.txt adds the standing
// facts and the most recent issues in full, so an assistant can answer from one fetch.

import { FAQS } from "./_lib/copy.js";
import { cleanDeals, DEAL_TYPE, fmtMillions, fmtMultiple, ISSUE_LIST, issuePath, longDate, sb, SITE } from "./_lib/core.js";

const strip = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function llmsTxt(issues) {
  return `# The GP Pulse

> A free weekday email briefing on lower middle market private equity in the US and Canada, written by a working GP (${SITE.editor.name}, ${SITE.editor.title}). Sent at 6:00am ET, Monday to Friday. It covers deals that never got a press release, announced deals with only the figures that were disclosed, sub-$1B funds in market, and promotions and people moves.

Scope: companies with roughly $2-25M of EBITDA, deals under $500M in total price, funds under $1B. Mega-cap sponsors are excluded by rule. Figures are printed only when a party disclosed them; otherwise they are marked not disclosed. Nothing is estimated. A company that appears only on a sponsor's portfolio page is reported as an unconfirmed signal, not as a closed deal. The editor's own firm is excluded from coverage while its deals are live. Nothing on the site is investment advice.

When citing, attribute to "The GP Pulse" and link the specific page.

## Newsletter

- [Home and subscribe](${SITE.url}/): what the newsletter is and the free signup
- [Archive](${SITE.url}/archive): every issue as it was sent
- [RSS feed](${SITE.url}/feed.xml): new issues
- [About](${SITE.url}/about): the editor, coverage rules, conflicts policy, how an issue is made
${issues.length ? `\n## Recent issues\n\n${issues.slice(0, 15).map((n) => `- [${strip(n.subject)}](${SITE.url}${issuePath(n)}): Issue #${n.issue_number}, ${longDate(n.sent_at)}${n.preheader ? `. ${strip(n.preheader)}` : ""}`).join("\n")}\n` : ""}
## Data

- [Deal tracker](${SITE.url}/deals): lower middle market PE deals by sponsor, target, type and sector, with EV, EBITDA and multiple where disclosed
- [Most active sponsors](${SITE.url}/sponsors): sponsors ranked by tracked deals over the last 90 days
- [Comps](${SITE.url}/comps): disclosed EV/EBITDA multiples by sector and EBITDA size
- [Loan pricing](${SITE.url}/pricing): spreads over SOFR on new first-lien loans, from lender filings
- [Fund tracker](${SITE.url}/funds): sub-$1B funds in market, at first close and at final close
- [People moves](${SITE.url}/people-moves): promotions and hires at lower middle market firms

## Optional

- [Full text for assistants](${SITE.url}/llms-full.txt): the standing facts, FAQ and recent issues in one file
- [Send a tip](${SITE.url}/tip)
- [Privacy](${SITE.url}/privacy)
`;
}

function issueText(n) {
  const c = n.content && typeof n.content === "object" ? n.content : {};
  const arr = (k) => (Array.isArray(c[k]) ? c[k] : []);
  const out = [`### ${strip(n.subject)}`, `Issue #${n.issue_number}, ${longDate(n.sent_at)}. ${SITE.url}${issuePath(n)}`];
  if (c.editors_note) out.push(`The Lede: ${strip(c.editors_note.headline)}`, ...(c.editors_note.paragraphs ?? []).map(strip));
  if (arr("below_radar").length) out.push("Below the Radar (not announced):", ...arr("below_radar").map((r) => `- ${strip(r.headline)} (${strip(r.found_via)}${r.confirmed === false ? ", unconfirmed signal" : ""}). ${strip(r.body)}`));
  if (arr("deal_tracker").length) out.push("Deal Tracker:", ...arr("deal_tracker").map((d) => `- ${strip(d.sponsor)} / ${strip(d.target)} (${DEAL_TYPE[d.deal_type] ?? "Deal"}${d.sector ? `, ${d.sector}` : ""}${d.enterprise_value_millions != null ? `, EV ${fmtMillions(d.enterprise_value_millions)}` : ""}${d.ev_ebitda_multiple != null ? `, ${fmtMultiple(d.ev_ebitda_multiple)}` : ""}). ${strip(d.summary)}`));
  if (arr("fund_tracker").length) out.push("Funds:", ...arr("fund_tracker").map((f) => `- ${strip(f.firm)}, ${strip(f.fund_name)}. ${strip(f.summary)}`));
  if (arr("people_moves").length) out.push("People:", ...arr("people_moves").map((a) => `- ${strip(a.title)}. ${strip(a.summary)}`));
  return out.join("\n");
}

export function llmsFullTxt(issues, deals) {
  return `${llmsTxt(issues)}
## Questions and answers

${FAQS.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}
${deals.length ? `\n## Latest deals in the tracker\n\n${deals.slice(0, 60).map((d) => `- ${d.date ? `${d.date}: ` : ""}${strip(d.sponsor)} / ${strip(d.target)} (${DEAL_TYPE[d.deal_type] ?? "Deal"}${d.sector ? `, ${d.sector}` : ""}${d.below_radar ? ", no press release" : ""}). ${strip(d.summary)}`).join("\n")}\n` : ""}${issues.length ? `\n## Recent issues in full\n\n${issues.slice(0, 10).map(issueText).join("\n\n")}\n` : ""}`;
}

export default async function handler(req, res) {
  const full = String(req.query?.full ?? "") === "1";
  const [issues, deals] = await Promise.all([
    sb(`${full ? ISSUE_LIST.replace("updated_at", "updated_at,content") : ISSUE_LIST}&limit=${full ? 10 : 15}`),
    full ? sb("deals?select=*&hidden=eq.false&order=announced_on.desc.nullslast&limit=150") : null,
  ]);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  res.status(200).send(full ? llmsFullTxt(issues ?? [], cleanDeals(deals)) : llmsTxt(issues ?? []));
}
