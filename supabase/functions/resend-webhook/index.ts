import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Receives Resend events (Svix-signed). Point the Resend webhook at:
//   https://<project-ref>.supabase.co/functions/v1/resend-webhook
// and set RESEND_WEBHOOK_SECRET to the "whsec_..." value Resend gives you.
// Enable: email.delivered, email.opened, email.clicked, email.bounced, email.complained

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature" };

async function verifySvix(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  // Reject stale timestamps (5 min)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));
  return sigHeader.split(" ").some((part) => {
    const [, sig] = part.split(",");
    return sig === expected;
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (secret) {
    const ok = await verifySvix(req, raw, secret);
    if (!ok) return new Response("invalid signature", { status: 401 });
  } else {
    console.warn("RESEND_WEBHOOK_SECRET not set — accepting unsigned webhook (set it before going live)");
  }

  let evt: { type: string; created_at?: string; data: { email_id?: string; to?: string[]; click?: { link?: string }; bounce?: unknown; tags?: Record<string, string> } };
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const type = (evt.type ?? "").replace(/^email\./, "");
  const emailId = evt.data?.email_id ?? null;
  const to = (evt.data?.to?.[0] ?? "").toLowerCase();

  // Attribute to the send we logged
  let newsletterId: string | null = null, subscriberId: string | null = null;
  if (emailId) {
    const { data: sentRow } = await supabase.from("email_events").select("newsletter_id, subscriber_id").eq("resend_email_id", emailId).eq("event_type", "sent").maybeSingle();
    newsletterId = sentRow?.newsletter_id ?? null; subscriberId = sentRow?.subscriber_id ?? null;
  }
  if (!subscriberId && to) {
    const { data: s } = await supabase.from("subscribers").select("id").eq("email", to).maybeSingle();
    subscriberId = s?.id ?? null;
  }

  if (type === "sent") return new Response("ok"); // we log sends ourselves

  await supabase.from("email_events").insert({
    resend_email_id: emailId, event_type: type, email: to || null, newsletter_id: newsletterId, subscriber_id: subscriberId,
    link_url: evt.data?.click?.link ?? null, payload: evt.data ?? {}, occurred_at: evt.created_at ?? new Date().toISOString(),
  });

  const now = new Date().toISOString();
  if (type === "opened" && subscriberId) {
    // Count unique opens per issue on the newsletter; raw opens on the subscriber.
    const { data: prior } = newsletterId
      ? await supabase.from("email_events").select("id").eq("newsletter_id", newsletterId).eq("subscriber_id", subscriberId).eq("event_type", "opened").limit(2)
      : { data: [] };
    if (newsletterId && (prior?.length ?? 0) <= 1) await supabase.rpc("increment_counter", { table_name: "newsletters", row_id: newsletterId, column_name: "open_count" }).then(() => {}, () => {});
    await supabase.from("subscribers").update({ last_opened_at: now }).eq("id", subscriberId);
    await supabase.rpc("increment_counter", { table_name: "subscribers", row_id: subscriberId, column_name: "open_count" }).then(() => {}, () => {});
  }
  if (type === "clicked" && subscriberId) {
    if (newsletterId) await supabase.rpc("increment_counter", { table_name: "newsletters", row_id: newsletterId, column_name: "click_count" }).then(() => {}, () => {});
    await supabase.from("subscribers").update({ last_clicked_at: now }).eq("id", subscriberId);
    await supabase.rpc("increment_counter", { table_name: "subscribers", row_id: subscriberId, column_name: "click_count" }).then(() => {}, () => {});
  }
  if (type === "bounced" && subscriberId) {
    const hard = JSON.stringify(evt.data?.bounce ?? "").toLowerCase().includes("permanent") || !JSON.stringify(evt.data?.bounce ?? "").toLowerCase().includes("transient");
    if (hard) await supabase.from("subscribers").update({ status: "bounced" }).eq("id", subscriberId);
  }
  if (type === "complained" && subscriberId) {
    await supabase.from("subscribers").update({ status: "complained", unsubscribed_at: now }).eq("id", subscriberId);
  }

  return new Response("ok", { headers: corsHeaders });
});
