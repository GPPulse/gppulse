import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { normalizeContent } from "../_shared/content.ts";
import { renderIssueEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};

const BATCH = 100;           // Resend batch endpoint max
const CONCURRENT_BATCHES = 2;

interface Subscriber {
  id: string; email: string; first_name: string | null; referral_code: string | null; unsubscribe_token: string | null;
}

function config() {
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://thegppulse.com").replace(/\/$/, "");
  const from = Deno.env.get("NEWSLETTER_FROM") ?? "The GP Pulse <onboarding@resend.dev>";
  if (from.includes("resend.dev")) console.warn("NEWSLETTER_FROM is not set — sending from resend.dev will land in spam. Verify a domain in Resend and set NEWSLETTER_FROM.");
  return {
    siteUrl, from,
    replyTo: Deno.env.get("NEWSLETTER_REPLY_TO") ?? undefined,
    postalAddress: Deno.env.get("NEWSLETTER_POSTAL_ADDRESS") ?? "The GP Pulse · Austin, TX",
    editorName: Deno.env.get("NEWSLETTER_EDITOR_NAME") ?? "The GP Pulse",
    editorTitle: Deno.env.get("NEWSLETTER_EDITOR_TITLE") ?? "Editor",
    autoSend: (Deno.env.get("AUTO_SEND") ?? "false").toLowerCase() === "true",
  };
}

async function resendBatch(apiKey: string, emails: unknown[]): Promise<{ id: string }[]> {
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (!r.ok) throw new Error(`Resend batch ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return d.data ?? [];
}

async function resendOne(apiKey: string, email: unknown): Promise<{ id: string }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(email),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cfg = config();

    const internal = isInternalCall(req);
    const staff = internal ? null : await getStaff(req, supabase);
    if (!internal && !staff) return unauthorized(corsHeaders);

    const body = await req.json().catch(() => ({}));
    const { newsletter_id, test_email, force } = body as { newsletter_id?: string; test_email?: string; force?: boolean };
    if (!newsletter_id) throw new Error("newsletter_id is required");

    const { data: nl, error: nlErr } = await supabase.from("newsletters").select("*").eq("id", newsletter_id).single();
    if (nlErr || !nl) throw new Error(`Newsletter not found: ${nlErr?.message}`);

    const content = normalizeContent(nl.content);
    const issueDate = nl.sent_at ? new Date(nl.sent_at) : new Date();
    const webUrl = `${cfg.siteUrl}/archive/${nl.slug ?? nl.id}`;

    const render = (s: Subscriber, referralCount: number) =>
      renderIssueEmail(content, {
        siteUrl: cfg.siteUrl, issueNumber: nl.issue_number, issueDate, subject: nl.subject, preheader: nl.preheader,
        webUrl,
        unsubscribeUrl: `${cfg.siteUrl}/unsubscribe?token=${s.unsubscribe_token ?? ""}`,
        preferencesUrl: `${cfg.siteUrl}/preferences?token=${s.unsubscribe_token ?? ""}`,
        referralUrl: `${cfg.siteUrl}/?ref=${s.referral_code ?? ""}`,
        referralCount, firstName: s.first_name,
        postalAddress: cfg.postalAddress, editorName: cfg.editorName, editorTitle: cfg.editorTitle,
      });

    const unsubHeaders = (s: Subscriber) => ({
      "List-Unsubscribe": `<${cfg.siteUrl}/unsubscribe?token=${s.unsubscribe_token ?? ""}>, <mailto:${(cfg.replyTo ?? "unsubscribe@example.com")}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });

    // ---- test send -------------------------------------------------------
    if (test_email) {
      const { data: sub } = await supabase.from("subscribers").select("id, email, first_name, referral_code, unsubscribe_token").eq("email", test_email.toLowerCase()).maybeSingle();
      const s: Subscriber = sub ?? { id: "test", email: test_email, first_name: "Test", referral_code: "preview", unsubscribe_token: "preview" };
      const html = render(s, 0);
      const result = await resendOne(resendKey, {
        from: cfg.from, to: [test_email], reply_to: cfg.replyTo, subject: `[TEST] ${nl.subject}`, html,
        headers: unsubHeaders(s), tags: [{ name: "kind", value: "test" }],
      });
      return new Response(JSON.stringify({ message: `Test sent to ${test_email}`, email_id: result.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- gating ----------------------------------------------------------
    if (nl.status === "sent" || nl.status === "sending") {
      return new Response(JSON.stringify({ message: `Issue #${nl.issue_number} is already ${nl.status}`, skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const approved = nl.status === "approved" || nl.status === "scheduled";
    if (!approved && !force && !(internal && cfg.autoSend)) {
      return new Response(JSON.stringify({ message: `Issue #${nl.issue_number} is a draft. Approve it in the Editor's Desk first (or set AUTO_SEND=true for unattended sends).`, skipped: true }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim the send so a concurrent cron/manual call can't double-send.
    const { data: claimed } = await supabase.from("newsletters").update({ status: "sending" }).eq("id", nl.id).in("status", ["draft", "approved", "scheduled"]).select("id");
    if (!claimed?.length) {
      return new Response(JSON.stringify({ message: "Another send is already in progress", skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- recipients -------------------------------------------------------
    const [{ data: subs, error: subErr }, { data: refs }] = await Promise.all([
      supabase.from("subscribers").select("id, email, first_name, referral_code, unsubscribe_token").eq("status", "active"),
      supabase.from("referrals").select("referrer_id"),
    ]);
    if (subErr) throw new Error(subErr.message);
    const refCounts = new Map<string, number>();
    for (const r of refs ?? []) refCounts.set(r.referrer_id, (refCounts.get(r.referrer_id) ?? 0) + 1);

    const recipients = (subs ?? []) as Subscriber[];
    if (!recipients.length) {
      await supabase.from("newsletters").update({ status: nl.status }).eq("id", nl.id);
      return new Response(JSON.stringify({ message: "No active subscribers", sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Archive copy (no personal links)
    const archiveHtml = render({ id: "", email: "", first_name: null, referral_code: "", unsubscribe_token: "" }, 0);
    await supabase.from("newsletters").update({ html_content: archiveHtml }).eq("id", nl.id);

    // ---- send -------------------------------------------------------------
    let sent = 0, failed = 0;
    const errors: string[] = [];
    const batches: Subscriber[][] = [];
    for (let i = 0; i < recipients.length; i += BATCH) batches.push(recipients.slice(i, i + BATCH));

    for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
      const group = batches.slice(i, i + CONCURRENT_BATCHES);
      await Promise.all(group.map(async (batch) => {
        const payload = batch.map((s) => ({
          from: cfg.from, to: [s.email], reply_to: cfg.replyTo, subject: nl.subject,
          html: render(s, refCounts.get(s.id) ?? 0), headers: unsubHeaders(s),
        }));
        try {
          const ids = await resendBatch(resendKey, payload);
          sent += batch.length;
          // Map Resend ids back to subscribers so webhook events can be attributed.
          const rows = batch.map((s, idx) => ({ resend_email_id: ids[idx]?.id ?? null, event_type: "sent", email: s.email, newsletter_id: nl.id, subscriber_id: s.id }));
          await supabase.from("email_events").insert(rows);
        } catch (e) {
          failed += batch.length;
          errors.push(String(e));
        }
      }));
      if (i + CONCURRENT_BATCHES < batches.length) await new Promise((r) => setTimeout(r, 600));
    }

    await supabase.from("newsletters").update({
      status: "sent", sent_at: new Date().toISOString(), recipient_count: sent,
      send_log: { sent, failed, errors: errors.slice(0, 10), by: staff?.email ?? "pipeline", at: new Date().toISOString() },
    }).eq("id", nl.id);

    return new Response(JSON.stringify({ message: `Issue #${nl.issue_number} sent to ${sent} subscribers${failed ? ` (${failed} failed)` : ""}`, sent, failed, errors: errors.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-newsletter", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
