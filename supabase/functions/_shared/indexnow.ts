// IndexNow: tells Bing (which also feeds ChatGPT search and Copilot), Yandex, Naver and Seznam that
// pages changed, so a new issue is crawled within minutes instead of whenever they next come by.
// Google does not take part; it finds new issues through the sitemap and the RSS feed.
//
// The key is public by design: the same string is served at https://thegppulse.com/<key>.txt
// (public/<key>.txt in this repository), which is how the search engines check the sender.

export const INDEXNOW_KEY = "9a124f2599391ac95a320b0b8e8e2f76";
const HOST = "thegppulse.com";

export function indexNowBody(paths: string[]) {
  const urlList = [...new Set(paths)].filter((p) => p.startsWith("/")).map((p) => `https://${HOST}${p}`);
  return { host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList };
}

/** Never throws and never takes more than a few seconds: a failed ping must not hold up a send. */
export async function pingIndexNow(paths: string[]): Promise<number | null> {
  try {
    const body = indexNowBody(paths);
    if (!body.urlList.length) return null;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4000);
    const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: c.signal });
    clearTimeout(t);
    return r.status;
  } catch {
    return null;
  }
}
