// Inbound email intake for the firm watch.
// Resend receives mail sent to the watch inbox (watch@in.thegppulse.com) and calls this
// function. We fetch the message, match the sender to a watchlist firm, log it in
// watch_inbox, and copy announcements into scraped_content so the nightly classifier
// treats them like any other source. Subscription-confirmation emails are logged with
// their confirmation link and are not sent to the classifier.
//
// Forwards: a firm email forwarded from one of the editors' own inboxes (WATCH_FORWARDERS,
// comma-separated addresses or @domains; default cschlotman@littlejohncapital.com) is credited
// to the firm that originally sent it. Forwards from anyone else are logged but never treated
// as firm mail, so nobody can put words in a firm's mouth by mailing the inbox.
//
// Secrets: RESEND_API_KEY, RESEND_INBOUND_WEBHOOK_SECRET (signing secret of the
// email.received webhook). verify_jwt is off; the Svix signature authenticates the call.
// Webhook and receiving domain (in.thegppulse.com) were created in Resend on 2026-11-16.

import { cleanSubject, findForwarded } from "./forwarded.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const forwarders = (env("WATCH_FORWARDERS") || "cschlotman@littlejohncapital.com").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const isForwarder = (addr: string) => forwarders.some((f) => (f.startsWith("@") ? addr.endsWith(f) : addr === f));

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

// Strips HTML to text, keeping a line break at block tags, so forward header lines stay separate.
const stripHtmlLines = (h: string) =>
  h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

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
  const envelope: string = (fromHeader.match(/<([^>]+)>/)?.[1] ?? email.from ?? "").toLowerCase();
  let address = envelope;
  let display = fromHeader.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
  let subject: string = (email.subject ?? "(no subject)").trim();
  const html: string = email.html ?? "";
  // Stripped HTML keeps line breaks at block tags so forward headers stay on their own lines.
  const fullText: string = email.text ?? stripHtmlLines(html);
  let text: string = fullText.slice(0, 6000);
  const messageId: string = email.message_id ?? email.id;

  // A forward from an editor: use the original sender, subject and body.
  const fwd = isForwarder(envelope) ? findForwarded(subject, fullText) : null;
  const forwardedBy = fwd ? envelope : null;
  if (fwd) {
    address = fwd.address;
    display = fwd.display;
    subject = fwd.subject ?? cleanSubject(subject);
    text = fwd.body.slice(0, 6000);
  }
  const senderDomain = address.split("@")[1] ?? "";

  // Match the sender to a tracked firm (watchlist sponsor, advisor or lender): exact domain, then
  // parent domain (news.firm.com -> firm.com).
  const tracked = "or=(watchlist.eq.true,source_kind.in.(advisor,lender))&is_active=is.true";
  const parts = senderDomain.split(".");
  const candidates = [senderDomain, parts.slice(-2).join(".")].filter((d, i, a) => d && a.indexOf(d) === i);
  let firm: { id: string; name: string; source_kind: string } | null = null;
  if (candidates.length) {
    const r = await db(`pe_firm_sources?select=id,name,source_kind&${tracked}&domain=in.(${candidates.map((d) => `"${d}"`).join(",")})&limit=1`);
    firm = r.ok ? (await r.json())[0] ?? null : null;
  }
  // Mailing-list tools often send from their own domains; fall back to the display name.
  if (!firm && display.length >= 6 && !isForwarder(address)) {
    const r = await db(`pe_firm_sources?select=id,name,source_kind&${tracked}&name=ilike.${encodeURIComponent(display.replace(/[*%,()]/g, " "))}&limit=1`);
    firm = r.ok ? (await r.json())[0] ?? null : null;
  }

  const isConfirm = /\b(confirm|verify|activate)\b.*\b(subscription|email|address|sign ?up)\b|please confirm|double opt/i.test(`${subject} ${text.slice(0, 400)}`);
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const confirmLink = links.find((l) => /confirm|verify|opt-?in|activate/i.test(l)) ?? null;
  const firstLink = links.find((l) => !/unsubscribe|preferences|facebook|twitter|\/\/x\.com|linkedin|instagram|youtube|list-manage\.com\/(profile|about)/i.test(l)) ?? null;

  const log = await db("watch_inbox?on_conflict=message_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ firm_id: firm?.id ?? null, message_id: messageId, from_address: address, from_name: (forwardedBy ? `${display || address} (forwarded by ${forwardedBy})` : display) || null, subject: subject.slice(0, 300), kind: isConfirm ? "confirm" : "news", confirm_url: isConfirm ? confirmLink : null }),
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
        title: subject.slice(0, 300), raw_content: `${text}\n[${
          firm.source_kind === "advisor" || firm.source_kind === "lender"
            ? `Source: ${firm.name}, ${firm.source_kind === "lender" ? "a middle-market lender" : "an M&A advisor"}, from its own mailing list. ${firm.name} is the ${firm.source_kind} on any deal it announces, not the buyer.`
            : `Watchlist firm: ${firm.name}. Received on the firm's own mailing list.`
        }]`,
        source_name: firm.name, published_at: email.created_at ?? new Date().toISOString(), scraped_at: new Date().toISOString(),
      }),
    });
    // First real email from a firm proves the watch inbox's own subscription is live (a forward doesn't).
    if (!forwardedBy) await db(`pe_firm_sources?id=eq.${firm.id}&subscribed_at=is.null`, { method: "PATCH", body: JSON.stringify({ subscribed_at: new Date().toISOString() }) });
  }
  return new Response(JSON.stringify({ ok: true, firm: firm?.name ?? null, forwarded_by: forwardedBy, kind: isConfirm ? "confirm" : "news" }), { headers: { "content-type": "application/json" } });
});
