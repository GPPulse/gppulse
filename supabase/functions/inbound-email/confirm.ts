// Double opt-in. After the watch inbox signs up to a firm's mailing list, most list tools send
// a "please confirm" email and add nobody until its link is opened. We open it, but only when
// the link plainly belongs to a mailing-list service or to the firm that the email is from.
// Anything else is logged with its link for a person to look at.

const LIST_HOSTS = [
  "list-manage.com", "mailchi.mp", "hubspotemail.net", "hubspotlinks.com", "hs-sites.com", "hubspot.com", "hsforms.com",
  "constantcontact.com", "rs6.net", "createsend.com", "cmail19.com", "cmail20.com", "mailerlite.com", "mlsend.com",
  "klaviyo.com", "klclick.com", "activehosted.com", "pardot.com", "beehiiv.com", "substack.com", "sendgrid.net",
  "campaign-archive.com", "ccsend.com", "mailgun.org", "sendinblue.com", "brevo.com", "convertkit.com", "kit.com",
];

const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** May we open this confirmation link on our own? `firmDomain` is the tracked firm the email matched, if any. */
export function mayAutoConfirm(link: string, firmDomain: string | null): boolean {
  let u: URL;
  try { u = new URL(link); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost" || !host.includes(".")) return false;
  if (/unsubscribe|opt-?out|remove|delete|preferences/i.test(u.pathname + u.search)) return false;
  if (LIST_HOSTS.some((d) => under(host, d))) return true;
  return Boolean(firmDomain && firmDomain.includes(".") && under(host, firmDomain.toLowerCase().replace(/^www\./, "")));
}

/** Open the link once. True when the list service answered with a normal page. */
export async function openConfirmLink(link: string): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(link, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "GPPulseBot/1.0 (+https://thegppulse.com/about; watch@in.thegppulse.com)", accept: "text/html,*/*;q=0.8" } });
    await r.body?.cancel();
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
