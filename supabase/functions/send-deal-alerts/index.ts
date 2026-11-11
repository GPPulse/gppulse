import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { DEAL_TYPE_LABEL, fmtMillions, fmtMultiple } from "../_shared/content.ts";
import { escapeHtml } from "../_shared/email.ts";
import { CONFIG } from "../_shared/config.ts";

// Sector deal alerts. Fires when an editor approves an issue: every deal in that
// issue with a disclosed multiple goes, as a one-paragraph email, to subscribers
// who picked that sector in preferences. One alert per deal, ever (deals.alerted_at).
//
// Body: { newsletter_id } — alert the disclosed deals in that issue
//       { deal_id }       — alert one specific deal (manual)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Deal {
  id: string; sponsor: string; target: string; deal_type: keyof typeof DEAL_TYPE_LABEL; sector: string | null;
  enterprise_value_millions: number | null; ebitda_millions: number | null; ev_ebitda_multiple: number | null;
  summary: string | null; editor_take: string | null; source: string | null; source_url: string | null;
}
interface Sub { id: string; email: string; first_name: string | null; unsubscribe_token: string | null }

const INK = "#0b0b0b", MUTED = "#5f6368", ACCENT = "#0f5c3a";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, monospace";

function render(d: Deal, siteUrl: string, token: string, issueUrl: string | null): string {
  const verb = d.deal_type === "exit" ? "exits" : d.deal_type === "add-on" ? "adds on" : d.deal_type === "recap" ? "recaps" : "acquires";
  const facts = [d.sector, d.enterprise_value_millions ? `EV ${fmtMillions(d.enterprise_value_millions)}` : null, d.ebitda_millions ? `EBITDA ${fmtMillions(d.ebitda_millions)}` : null, fmtMultiple(d.ev_ebitda_multiple)].filter(Boolean).join("  ·  ");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e9e9e6;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:18px 8px;">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="width:560px;max-width:560px;background:#fff;border:2px solid ${INK};">
  <tr><td style="padding:14px 24px;border-bottom:2px solid ${INK};">
    <span style="font-family:${SANS};font-size:16px;font-weight:800;letter-spacing:-0.02em;">THE GP PULSE</span>
    <span style="font-family:${MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-left:10px;">Deal alert · ${escapeHtml(d.sector ?? "")}</span>
  </td></tr>
  <tr><td style="padding:22px 24px 8px 24px;">
    <div style="font-family:${SANS};font-size:30px;font-weight:800;letter-spacing:-0.02em;line-height:1;color:${INK};">${fmtMultiple(d.ev_ebitda_multiple)}</div>
    <div style="font-family:${SANS};font-size:17px;line-height:1.4;color:${INK};margin-top:10px;"><strong>${escapeHtml(d.sponsor)}</strong> ${verb} ${d.source_url ? `<a href="${escapeHtml(d.source_url)}" style="color:${INK};font-weight:700;">${escapeHtml(d.target)}</a>` : `<strong>${escapeHtml(d.target)}</strong>`}</div>
    <div style="font-family:${MONO};font-size:11px;color:${MUTED};margin-top:4px;">${escapeHtml(DEAL_TYPE_LABEL[d.deal_type] ?? "Deal")}  ·  ${escapeHtml(facts)}</div>
    ${d.summary ? `<p style="font-family:${SANS};font-size:14px;line-height:1.55;color:#333;margin:12px 0 0 0;">${escapeHtml(d.summary)}</p>` : ""}
    ${d.editor_take ? `<table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;"><tr><td style="border-left:3px solid ${ACCENT};padding:2px 0 2px 12px;font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};"><span style="font-family:${MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:700;">Our read</span><br>${escapeHtml(d.editor_take)}</td></tr></table>` : ""}
    <p style="font-family:${SANS};font-size:12px;color:${MUTED};margin:16px 0 0 0;">Disclosed figures only. ${issueUrl ? `Full issue in the morning, or <a href="${escapeHtml(issueUrl)}" style="color:${MUTED};">read it now</a>.` : ""} Compare: <a href="${siteUrl}/deals" style="color:${MUTED};">deal tracker</a>.</p>
  </td></tr>
  <tr><td style="padding:14px 24px 18px 24px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #d9d9d6;"><tr><td style="padding-top:10px;font-family:${SANS};font-size:11px;line-height:1.6;color:${MUTED};">
    You get these because you picked ${escapeHtml(d.sector ?? "this sector")} in your preferences. <a href="${siteUrl}/preferences?token=${token}" style="color:${MUTED};">Change sectors</a> · <a href="${siteUrl}/unsubscribe?token=${token}" style="color:${MUTED};">Unsubscribe</a>
  </td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");
    const siteUrl = (CONFIG.siteUrl);
    const from = CONFIG.from;
    const replyTo = CONFIG.replyTo;

    const body = await req.json().catch(() => ({}));
    let deals: Deal[] = [];
    let issueUrl: string | null = null;

    if (body.deal_id) {
      const { data } = await supabase.from("deals").select("*").eq("id", body.deal_id).is("alerted_at", null).maybeSingle();
      if (data) deals = [data as Deal];
    } else if (body.newsletter_id) {
      const { data: nl } = await supabase.from("newsletters").select("content, slug, id, status").eq("id", body.newsletter_id).single();
      if (!nl) return json({ error: "newsletter not found" }, 404);
      const content = nl.content as { deal_tracker?: { sponsor: string; target: string; ev_ebitda_multiple: number | null }[] };
      const keys = (content.deal_tracker ?? []).filter((d) => d.ev_ebitda_multiple).map((d) => [d.sponsor, d.target]);
      if (keys.length) {
        const { data } = await supabase.from("deals").select("*").eq("hidden", false).is("alerted_at", null).not("ev_ebitda_multiple", "is", null)
          .in("sponsor", keys.map((k) => k[0])).in("target", keys.map((k) => k[1]));
        deals = (data ?? []) as Deal[];
      }
      if (nl.status === "sent") issueUrl = `${siteUrl}/archive/${nl.slug ?? nl.id}`;
    } else {
      return json({ error: "newsletter_id or deal_id required" }, 400);
    }

    deals = deals.filter((d) => d.sector && d.ev_ebitda_multiple);
    if (!deals.length) return json({ message: "No un-alerted deals with disclosed multiples", sent: 0 });

    let totalSent = 0;
    const perDeal: Record<string, number> = {};
    for (const d of deals) {
      const { data: subs } = await supabase.from("subscribers").select("id, email, first_name, unsubscribe_token").eq("status", "active").contains("sectors", [d.sector!]);
      const recipients = (subs ?? []) as Sub[];
      let sent = 0;
      for (let i = 0; i < recipients.length; i += 100) {
        const batch = recipients.slice(i, i + 100).map((s) => ({
          from, to: [s.email], reply_to: replyTo,
          subject: `${fmtMultiple(d.ev_ebitda_multiple)} · ${d.sponsor} ${d.deal_type === "exit" ? "exits" : "buys"} ${d.target}`,
          html: render(d, siteUrl, s.unsubscribe_token ?? "", issueUrl),
          headers: { "List-Unsubscribe": `<${siteUrl}/unsubscribe?token=${s.unsubscribe_token ?? ""}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }));
        if (!batch.length) break;
        const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${resendKey.trim()}`, "Content-Type": "application/json" }, body: JSON.stringify(batch) });
        if (r.ok) {
          const ids = ((await r.json()).data ?? []) as { id: string }[];
          sent += batch.length;
          await supabase.from("email_events").insert(recipients.slice(i, i + 100).map((s, idx) => ({ resend_email_id: ids[idx]?.id ?? null, event_type: "sent", email: s.email, subscriber_id: s.id, payload: { kind: "deal_alert", deal_id: d.id } })));
        } else {
          console.error("alert batch failed", r.status, await r.text());
        }
      }
      await supabase.from("deals").update({ alerted_at: new Date().toISOString(), alert_recipients: sent }).eq("id", d.id);
      perDeal[`${d.sponsor} → ${d.target}`] = sent;
      totalSent += sent;
    }
    return json({ message: `${deals.length} alert${deals.length === 1 ? "" : "s"} sent to ${totalSent} subscriber${totalSent === 1 ? "" : "s"}`, sent: totalSent, per_deal: perDeal });
  } catch (error) {
    console.error("send-deal-alerts", error);
    return json({ error: String(error) }, 500);
  }
});
