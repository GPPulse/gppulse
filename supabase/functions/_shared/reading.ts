// Weekend Reading intake. Mail sent to the reading address is a digest of long reads (an
// investing letter the editor subscribes to, or links the editor forwards). We keep the links
// worth queueing and nothing else: no text from the email is stored or reused.

export interface ReadLink { url: string; text: string }

const SKIP_HOST = /(^|\.)(facebook|twitter|x|linkedin|instagram|youtube|youtu|tiktok|threads|apple|spotify|google|gstatic|goo|bit|amzn|amazon|paypal|stripe|venmo|patreon|typeform|surveymonkey|calendly|zoom)\.(com|net|co|be|gl|ly|to|us)$/i;
const SKIP_URL = /unsubscribe|preferences|manage[-_]?(subscription|profile|email)|optout|opt-out|view[-_]?(in|online|email|as)|forward[-_]?to|mailto:|\/login|\/signin|\/sign-in|\/subscribe|\/account|\/privacy|\/terms|\/advertis|\/sponsor|\/about\/?$|\/contact|\/careers|\/jobs|\/shop|\/store|\/donate|\/tag\/|\/author\/|\.(png|jpe?g|gif|svg|webp|ics)(\?|$)/i;
const SKIP_TEXT = /^(read (more|on|online|in browser)|click here|here|view (in|online)|unsubscribe|subscribe|share|forward|tweet|like|comment|reply|sign up|log ?in|learn more|continue reading|listen|watch|website|home|archive|advertise|sponsor(ed)?|upgrade|refer|privacy|terms)\b/i;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#0?38;/g, "&").replace(/&nbsp;/g, " ").replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;|&#39;/g, "'");

/** The stable form of a link: no fragment, no tracking parameters. */
export function cleanUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|mc_|fbclid|gclid|ref$|ref_|source$|campaign|cmpid|sh_kit|r$|s$|publication_id|post_id|isFreemail|token|triedRedirect)/i.test(k)) u.searchParams.delete(k);
  const out = u.toString().replace(/\?$/, "");
  return out.length <= 600 ? out : null;
}

/**
 * Links in a digest that look like articles: anchor text long enough to be a title, on a host
 * that is not a social network, a shop or the newsletter's own housekeeping. Best 25, in order.
 */
export function extractReads(html: string, ownHosts: string[] = []): ReadLink[] {
  const out: ReadLink[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[1]);
    const text = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (SKIP_URL.test(href)) continue;
    let host: string;
    try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { continue; }
    if (SKIP_HOST.test(host) || ownHosts.some((h) => host === h || host.endsWith(`.${h}`))) continue;
    if (text.length < 18 || text.split(" ").length < 3 || SKIP_TEXT.test(text) || /^https?:\/\//i.test(text)) continue;
    const key = href.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: href, text: text.slice(0, 200) });
    if (out.length >= 25) break;
  }
  return out;
}

/** "ft.com" → "FT"-style names are not guessable; fall back to the bare host, title-cased. */
export function publisherFromHost(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const core = h.split(".").slice(0, -1).filter((p) => !/^(blog|news|m|en|insights|research|www\d?)$/.test(p)).pop() ?? h;
    return core.replace(/[-_]/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
  } catch { return ""; }
}

const meta = (html: string, key: string) =>
  (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i")) ?? [])[1];

/** What a page says about itself: title, site name, description and the opening of its text. */
export function pageFacts(html: string): { title: string | null; site: string | null; description: string | null; opening: string } {
  const title = meta(html, "og:title") ?? (html.match(/<title[^>]*>([^<]{3,300})<\/title>/i) ?? [])[1] ?? null;
  const text = html.replace(/<(script|style|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return {
    title: title ? decode(title).replace(/\s+/g, " ").trim() : null,
    site: meta(html, "og:site_name") ? decode(meta(html, "og:site_name")!).trim() : null,
    description: meta(html, "og:description") ?? meta(html, "description") ? decode((meta(html, "og:description") ?? meta(html, "description"))!).trim().slice(0, 500) : null,
    opening: decode(text).replace(/\s+/g, " ").trim().slice(0, 2500),
  };
}

/** Follows a tracking link to the page it lands on. Returns the final address and the page. */
export async function resolve(url: string, ms = 8000): Promise<{ url: string; html: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "GPPulseBot/1.0 (+https://thegppulse.com/about)", accept: "text/html,application/xhtml+xml" } });
    if (!r.ok || !/html/i.test(r.headers.get("content-type") ?? "")) return null;
    return { url: r.url || url, html: (await r.text()).slice(0, 400_000) };
  } catch { return null; } finally { clearTimeout(t); }
}
