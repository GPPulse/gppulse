// Inbound email intake for the firm watch.
// Resend receives mail sent to the watch inbox (watch@in.thegppulse.com) and calls this
// function. We fetch the message, match the sender to a watchlist firm, log it in
// watch_inbox, and copy announcements into scraped_content so the nightly classifier
// treats them like any other source. Subscription-confirmation emails are logged with
// their confirmation link and are not sent to the classifier.
//
// Secrets: RESEND_API_KEY, RESEND_INBOUND_WEBHOOK_SECRET (signing secret of the
// email.received webhook). verify_jwt is off; the Svix signature authenticates the call.

const env = (k: string) => Deno.env.get(k) ?? "";

async function verifySvix(req: Request, body: string): Promise<boolean> {
  const secret = env("RESEND_INBOUND_WEBHOOK_SECRET");
  const id = req.headers.get("svix-id"), ts = req.headers.get("svix-timestamp"), sig = req.headers.get("svix-signature");
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sig.split(" ").some((part) => {
    const got = part.split(",")[1] ?? "";
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

const stripHtml = (h: string) =>
  h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function db(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...((init.headers as Record<string, string>) ?? {}) },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.text();
  if (!(await verifySvix(req, body))) return new Response("bad signature", { status: 401 });

  const event = JSON.parse(body);
  if (event.type !== "email.received") return new Response("ignored", { status: 200 });

  const res = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
    headers: { authorization: `Bearer ${env("RESEND_API_KEY")}` },
  });
  if (!res.ok) return new Response(`could not fetch email: ${res.status}`, { status: 502 }); // Resend retries
  const email = await res.json();

  const fromHeader: string = email.headers?.from ?? email.from ?? "";
  const address: string = (fromHeader.match(/<([^>]+)>/)?.[1] ?? email.from ?? "").toLowerCase();
  const display = fromHeader.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
  const senderDomain = address.split("@")[1] ?? "";
  const subject: string = (email.subject ?? "(no subject)").trim();
  const html: string = email.html ?? "";
  const text: string = (email.text ?? stripHtml(html)).slice(0, 6000);
  const messageId: string = email.message_id ?? email.id;

  // Match the sender to a watchlist firm: exact domain, then parent domain (news.firm.com -> firm.com).
  const parts = senderDomain.split(".");
  const candidates = [senderDomain, parts.slice(-2).join(".")].filter((d, i, a) => d && a.indexOf(d) === i);
  let firm: { id: string; name: string } | null = null;
  if (candidates.length) {
    const r = await db(`pe_firm_sources?select=id,name&watchlist=is.true&domain=in.(${candidates.map((d) => `"${d}"`).join(",")})&limit=1`);
    firm = r.ok ? (await r.json())[0] ?? null : null;
  }
  // Mailing-list tools often send from their own domains; fall back to the display name.
  if (!firm && display.length >= 6) {
    const r = await db(`pe_firm_sources?select=id,name&watchlist=is.true&name=ilike.${encodeURIComponent(display.replace(/[*%,()]/g, " "))}&limit=1`);
    firm = r.ok ? (await r.json())[0] ?? null : null;
  }

  const isConfirm = /\b(confirm|verify|activate)\b.*\b(subscription|email|address|sign ?up)\b|please confirm|double opt/i.test(`${subject} ${text.slice(0, 400)}`);
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const confirmLink = links.find((l) => /confirm|verify|opt-?in|activate/i.test(l)) ?? null;
  const firstLink = links.find((l) => !/unsubscribe|preferences|facebook|twitter|\/\/x\.com|linkedin|instagram|youtube|list-manage\.com\/(profile|about)/i.test(l)) ?? null;

  const log = await db("watch_inbox?on_conflict=message_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ firm_id: firm?.id ?? null, message_id: messageId, from_address: address, from_name: display || null, subject: subject.slice(0, 300), kind: isConfirm ? "confirm" : "news", confirm_url: isConfirm ? confirmLink : null }),
  });
  if (!log.ok) return new Response(`log failed: ${await log.text()}`, { status: 500 });
  const isNew = ((await log.json()) as unknown[]).length > 0;

  // Only mail from a known firm goes to the classifier; anything else stays in the log for the editor.
  if (isNew && firm && !isConfirm) {
    await db("scraped_content?on_conflict=url", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        source_id: firm.id, url: firstLink ?? `https://thegppulse.com/inbox/${encodeURIComponent(messageId)}`,
        title: subject.slice(0, 300), raw_content: `${text}\n[Watchlist firm: ${firm.name}. Received on the firm's own mailing list.]`,
        source_name: firm.name, published_at: email.created_at ?? new Date().toISOString(), scraped_at: new Date().toISOString(),
      }),
    });
    // First real email from a firm proves the subscription is live.
    await db(`pe_firm_sources?id=eq.${firm.id}&subscribed_at=is.null`, { method: "PATCH", body: JSON.stringify({ subscribed_at: new Date().toISOString() }) });
  }
  return new Response(JSON.stringify({ ok: true, firm: firm?.name ?? null, kind: isConfirm ? "confirm" : "news" }), { headers: { "content-type": "application/json" } });
});
