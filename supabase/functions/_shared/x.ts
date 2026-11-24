// Posting to X (Twitter) with the account's own keys: OAuth 1.0a user context, POST /2/tweets.
// No SDK; the signature is HMAC-SHA1 over the method, URL and OAuth parameters (RFC 5849).

export interface XKeys { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }

/** Percent-encoding as OAuth wants it (RFC 3986 unreserved characters only). */
export const pct = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function hmacSha1(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * The Authorization header for one request. `params` are query or form parameters that take
 * part in the signature; a JSON body does not, so for POST /2/tweets it is empty.
 */
export async function oauthHeader(
  method: string, url: string, keys: XKeys, params: Record<string, string> = {},
  nonce: string = crypto.randomUUID().replace(/-/g, ""), timestamp: string = String(Math.floor(Date.now() / 1000)),
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.apiKey, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp, oauth_token: keys.accessToken, oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join("&");
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join("&");
  const signature = await hmacSha1(`${pct(keys.apiSecret)}&${pct(keys.accessSecret)}`, base);
  const header = { ...oauth, oauth_signature: signature };
  return "OAuth " + Object.keys(header).sort().map((k) => `${pct(k)}="${pct(header[k as keyof typeof header])}"`).join(", ");
}

export type PostResult = { ok: true; id: string } | { ok: false; status: number; error: string; retry: boolean };

/** Publish one post. Never throws; the caller records the outcome. */
export async function publishPost(text: string, keys: XKeys): Promise<PostResult> {
  const url = "https://api.x.com/2/tweets";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: await oauthHeader("POST", url, keys), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = await r.text();
    if (r.ok) {
      const id = (JSON.parse(body) as { data?: { id?: string } })?.data?.id;
      return id ? { ok: true, id } : { ok: false, status: r.status, error: `no id in response: ${body.slice(0, 200)}`, retry: false };
    }
    // 429 and 5xx are worth another try later; 4xx (duplicate text, bad keys, no credits) are not.
    return { ok: false, status: r.status, error: body.slice(0, 300), retry: r.status === 429 || r.status >= 500 };
  } catch (e) {
    return { ok: false, status: 0, error: String(e), retry: true };
  }
}

/**
 * X counts every link as 23 characters and most other characters as one. This is the
 * conservative count we hold posts to (limit 280).
 */
export function xLength(text: string): number {
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  return [...text.replace(/https?:\/\/\S+/g, "")].length + links.length * 23;
}

/** Rules every generated post has to pass before it is queued. Returns the reason it fails, or null. */
export function rejectPost(text: string): string | null {
  const t = text.trim();
  if (t.length < 40) return "too short";
  if (xLength(t) > 270) return "too long";
  if (/\b(BDC|business development compan(y|ies))\b/i.test(t)) return "names a BDC";
  if ((t.match(/#\w+/g) ?? []).length > 1) return "more than one hashtag";
  if (/\p{Extended_Pictographic}/u.test(t)) return "emoji";
  if (/@\w+/.test(t)) return "mentions an account";
  if (/\b(guaranteed|will (surge|soar|crash)|buy now|sell now|price target)\b/i.test(t)) return "reads as advice or a prediction";
  return null;
}
