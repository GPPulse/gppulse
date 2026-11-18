// Finds the original sender inside a forwarded email, so a firm newsletter forwarded from
// Carl's inbox is credited to the firm that sent it rather than to Carl.
// Handles the forward headers written by Gmail, Outlook (desktop, web and "[mailto:]" style)
// and Apple Mail. Works on plain text; callers pass the HTML stripped to text when there is
// no text part.

export type Forwarded = { address: string; display: string; subject: string | null; body: string };

const FWD_SUBJECT = /^\s*((fwd?|fw|wg|tr|rv)\s*:\s*)+/i;
const MARKERS = [
  /-{2,}\s*forwarded message\s*-{2,}/i, // Gmail
  /begin forwarded message\s*:/i, // Apple Mail
  /-{2,}\s*original message\s*-{2,}/i, // older Outlook
  /_{8,}/, // Outlook desktop / web divider line
];

export const isForwardSubject = (s: string) => FWD_SUBJECT.test(s);
export const cleanSubject = (s: string) => s.replace(FWD_SUBJECT, "").trim() || s.trim();

// Pulls "Name" and "a@b.com" out of a header value such as
//   Name <a@b.com>   |   "Name" <a@b.com>   |   Name [mailto:a@b.com]   |   Name &lt;a@b.com&gt;   |   a@b.com
function parseAddress(v: string): { address: string; display: string } | null {
  const s = v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
  const m = s.match(/[<\[](?:mailto:)?\s*([^\s<>\[\]]+@[^\s<>\[\]]+?)\s*[>\]]/i) ?? s.match(/([^\s<>"'\[\]:]+@[^\s<>"'\[\]]+\.[a-z]{2,})/i);
  if (!m) return null;
  const address = m[1].toLowerCase().replace(/[.,;]+$/, "");
  const display = s.slice(0, m.index).replace(/["']/g, "").replace(/\s+/g, " ").trim();
  return { address, display };
}

// Returns the sender of the first forwarded header block (the message that was forwarded; any
// older quoted replies sit further down), or null when the email is not a forward.
export function findForwarded(subject: string, text: string): Forwarded | null {
  const t = text.replace(/\r\n?/g, "\n");
  let start = -1;
  for (const re of MARKERS) {
    const m = re.exec(t);
    if (m && (start === -1 || m.index < start)) start = m.index;
  }
  // Outlook often writes no marker line at all, just a header block; only trust that on a Fwd subject.
  const fromRe = /(?:^|\n|\s)(?:\*\*|\*)?(?:from|von|de|da)(?:\*\*|\*)?\s*:\s*(?:\*\*|\*)?\s*([^\n]+?)(?=\n|\s+(?:sent|date|to|subject|cc|gesendet|envoy[ée]|enviado)\s*:|$)/i;
  const region = start >= 0 ? t.slice(start) : isForwardSubject(subject) ? t : null;
  if (region === null) return null;
  const fm = fromRe.exec(region);
  if (!fm) return null;
  const who = parseAddress(fm[1]);
  if (!who) return null;

  const afterFrom = region.slice(fm.index + fm[0].length);
  const subj = afterFrom.slice(0, 600).match(/(?:^|\n|\s)(?:\*\*)?(?:subject|betreff|objet|asunto)(?:\*\*)?\s*:\s*([^\n]+?)(?=\n|\s+(?:to|cc|date|sent|from)\s*:|$)/i)?.[1]?.trim() ?? null;
  // The forwarded message starts after the header block: the first blank line after From:,
  // or, when stripped HTML has flattened everything onto one line, right after the Subject value.
  let body = afterFrom;
  const blank = afterFrom.search(/\n\s*\n/);
  if (blank >= 0 && blank < 800) body = afterFrom.slice(blank);
  else if (subj) body = afterFrom.slice(afterFrom.indexOf(subj) + subj.length);
  return { address: who.address, display: who.display, subject: subj ? cleanSubject(subj) : null, body: body.trim() };
}
