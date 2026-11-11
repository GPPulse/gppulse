import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { renderWelcomeEmail } from "../_shared/email.ts";
import { CONFIG } from "../_shared/config.ts";

// Public actions (anyone):  add · unsubscribe-token · get-preferences · update-preferences · referral-dashboard
// Staff actions (admin JWT): list · stats · unsubscribe · reactivate · delete · bulk-import · export · add-role

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-pipeline-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SECTORS = ["Industrials", "Business Services", "Healthcare", "Technology", "Consumer", "Financial Services", "Energy", "Aerospace & Defense", "Infrastructure"];
const ROLES = ["gp", "lp", "lender", "banker", "independent_sponsor", "operator", "service_provider", "other"];
const MILESTONES = [
  { threshold: 3, label: "Early Advocate", reward: "Access to the searchable LMM deal database" },
  { threshold: 10, label: "Dealmaker", reward: "Quarterly LMM multiples & terms report" },
  { threshold: 25, label: "Rainmaker", reward: "Invite to the quarterly subscriber call with the editor" },
  { threshold: 50, label: "Founding Member", reward: "Permanent founding-member credit + first look at new products" },
];

const genCode = () => Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
const genToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const FREEMAIL = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"];

function cfg() {
  const siteUrl = (CONFIG.siteUrl);
  return {
    siteUrl,
    from: CONFIG.from,
    replyTo: CONFIG.replyTo,
    postalAddress: CONFIG.postalAddress,
    editorName: CONFIG.editorName,
    editorTitle: CONFIG.editorTitle,
  };
}

// deno-lint-ignore no-explicit-any
async function sendWelcome(sub: { id: string; email: string; first_name: string | null; referral_code: string | null; unsubscribe_token: string | null }, supabase: SupabaseClient<any, any, any>) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const c = cfg();
  const { data: latest } = await supabase.from("newsletters").select("slug, id").eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const html = renderWelcomeEmail({
    siteUrl: c.siteUrl, firstName: sub.first_name,
    referralUrl: `${c.siteUrl}/?ref=${sub.referral_code ?? ""}`,
    latestIssueUrl: latest ? `${c.siteUrl}/archive/${latest.slug ?? latest.id}` : null,
    unsubscribeUrl: `${c.siteUrl}/unsubscribe?token=${sub.unsubscribe_token ?? ""}`,
    preferencesUrl: `${c.siteUrl}/preferences?token=${sub.unsubscribe_token ?? ""}`,
    postalAddress: c.postalAddress, editorName: c.editorName, editorTitle: c.editorTitle,
  });
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: c.from, to: [sub.email], reply_to: c.replyTo,
        subject: "Welcome to The GP Pulse (and what to expect tomorrow morning)", html,
        headers: { "List-Unsubscribe": `<${c.siteUrl}/unsubscribe?token=${sub.unsubscribe_token ?? ""}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "kind", value: "welcome" }],
      }),
    });
    if (r.ok) await supabase.from("subscribers").update({ welcome_sent_at: new Date().toISOString() }).eq("id", sub.id);
    else console.error("welcome email failed", r.status, await r.text());
  } catch (e) {
    console.error("welcome email error", e);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action: string = body.action ?? url.searchParams.get("action") ?? "list";

    // ------------------------------------------------------------------ public
    if (action === "referral-dashboard") {
      const code = body.code ?? url.searchParams.get("code");
      if (!code) return json({ error: "Referral code is required" }, 400);
      const { data: sub } = await supabase.from("subscribers").select("id, email, first_name, referral_code").eq("referral_code", code).maybeSingle();
      if (!sub) return json({ error: "Referral code not found" }, 404);
      const { data: referrals } = await supabase.from("referrals").select("id, created_at").eq("referrer_id", sub.id).order("created_at", { ascending: false });
      const count = referrals?.length ?? 0;
      const [local, domain] = sub.email.split("@");
      return json({
        referral_code: sub.referral_code, masked_email: `${local.slice(0, 2)}***@${domain}`, first_name: sub.first_name,
        referral_count: count, recent_referrals: (referrals ?? []).slice(0, 5).map((r) => ({ date: r.created_at })),
        earned_milestones: MILESTONES.filter((m) => count >= m.threshold), next_milestone: MILESTONES.find((m) => count < m.threshold) ?? null, milestones: MILESTONES,
      });
    }

    if (action === "add") {
      const email = String(body.email ?? "").toLowerCase().trim();
      if (!validEmail(email)) return json({ error: "Enter a valid email address" }, 400);
      const first_name = body.first_name ? String(body.first_name).trim().slice(0, 80) : null;
      const company = body.company ? String(body.company).trim().slice(0, 120) : null;
      const role = ROLES.includes(body.role) ? body.role : null;
      const source = body.source ? String(body.source).slice(0, 60) : "web";
      const refCode = body.referral_code ? String(body.referral_code).trim() : null;
      const domain = email.split("@")[1];
      const firm_type = FREEMAIL.includes(domain) ? "personal" : "firm";

      const { data: existing } = await supabase.from("subscribers").select("id, status, referral_code, unsubscribe_token").eq("email", email).maybeSingle();
      if (existing) {
        if (existing.status === "active") return json({ message: "Subscriber already exists", subscriber: { referral_code: existing.referral_code } }, 200);
        const { data, error } = await supabase.from("subscribers").update({ status: "active", unsubscribed_at: null, first_name: first_name ?? undefined, company: company ?? undefined, role: role ?? undefined }).eq("id", existing.id).select("id, email, first_name, referral_code, unsubscribe_token").single();
        if (error) throw error;
        return json({ message: "Subscriber reactivated", subscriber: { referral_code: data.referral_code, prefs_token: data.unsubscribe_token } });
      }

      const { data, error } = await supabase.from("subscribers").insert({
        email, first_name, company, role, firm_type, source, referral_code: genCode(), unsubscribe_token: genToken(),
      }).select("id, email, first_name, referral_code, unsubscribe_token").single();
      if (error) throw error;

      if (refCode) {
        const { data: referrer } = await supabase.from("subscribers").select("id").eq("referral_code", refCode).maybeSingle();
        if (referrer && referrer.id !== data.id) await supabase.from("referrals").insert({ referrer_id: referrer.id, referred_id: data.id });
      }
      // Fire-and-forget welcome; don't make the signup wait on Resend.
      sendWelcome(data, supabase);
      return json({ message: "Subscriber added", subscriber: { referral_code: data.referral_code, prefs_token: data.unsubscribe_token } }, 201);
    }

    if (action === "unsubscribe-token") {
      const token = body.token ?? url.searchParams.get("token");
      if (!token) return json({ error: "token required" }, 400);
      const { data, error } = await supabase.from("subscribers").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() }).eq("unsubscribe_token", token).select("email").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Link not recognized" }, 404);
      return json({ message: "Unsubscribed", email: data.email });
    }

    if (action === "get-preferences") {
      const token = body.token ?? url.searchParams.get("token");
      if (!token) return json({ error: "token required" }, 400);
      const { data } = await supabase.from("subscribers").select("email, first_name, company, role, status, referral_code, sectors").eq("unsubscribe_token", token).maybeSingle();
      if (!data) return json({ error: "Link not recognized" }, 404);
      return json({ subscriber: data, roles: ROLES, sectors: SECTORS });
    }

    if (action === "update-preferences") {
      const token = body.token;
      if (!token) return json({ error: "token required" }, 400);
      const patch: Record<string, unknown> = {};
      if (body.first_name !== undefined) patch.first_name = String(body.first_name).trim().slice(0, 80) || null;
      if (body.company !== undefined) patch.company = String(body.company).trim().slice(0, 120) || null;
      if (body.role !== undefined) patch.role = ROLES.includes(body.role) ? body.role : null;
      if (Array.isArray(body.sectors)) patch.sectors = body.sectors.filter((x: unknown) => typeof x === "string" && SECTORS.includes(x)).slice(0, 9);
      if (body.status === "active") { patch.status = "active"; patch.unsubscribed_at = null; }
      const { data, error } = await supabase.from("subscribers").update(patch).eq("unsubscribe_token", token).select("email, first_name, company, role, status, referral_code, sectors").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Link not recognized" }, 404);
      return json({ message: "Saved", subscriber: data });
    }

    // Reader tips → editor_items (status 'submitted', promoted to 'queued' by an editor)
    if (action === "submit-tip") {
      const email = String(body.email ?? "").toLowerCase().trim();
      if (!validEmail(email)) return json({ error: "Enter a valid email so we can follow up" }, 400);
      const kind = ["on_the_market", "overheard", "reader_question", "job", "event"].includes(body.kind) ? body.kind : "on_the_market";
      const headline = String(body.headline ?? "").trim().slice(0, 160);
      const detail = String(body.body ?? "").trim().slice(0, 1200);
      if (headline.length < 10) return json({ error: "Give us at least a line" }, 400);
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase.from("editor_items").select("id", { count: "exact", head: true }).eq("submitted_by_email", email).gte("created_at", dayAgo);
      if ((count ?? 0) >= 5) return json({ error: "That's plenty for one day — thank you. Reply to an issue if it's urgent." }, 429);
      const { error } = await supabase.from("editor_items").insert({
        kind, headline, body: detail || null, url: body.url ? String(body.url).trim().slice(0, 500) : null,
        attribution: body.attribution ? String(body.attribution).trim().slice(0, 120) : null,
        attribution_ok: Boolean(body.attribution_ok), status: "submitted",
        submitted_by_email: email, submitted_by_role: ROLES.includes(body.role) ? body.role : null,
      });
      if (error) throw error;
      // Subscribe the tipster if they aren't already — they clearly read it.
      const { data: existing } = await supabase.from("subscribers").select("id").eq("email", email).maybeSingle();
      if (!existing) {
        const { data: sub } = await supabase.from("subscribers").insert({ email, source: "tip", firm_type: FREEMAIL.includes(email.split("@")[1]) ? "personal" : "firm", referral_code: genCode(), unsubscribe_token: genToken() }).select("id, email, first_name, referral_code, unsubscribe_token").single();
        if (sub) sendWelcome(sub, supabase);
      }
      return json({ message: "Got it. An editor reads every one before anything runs." }, 201);
    }

    // ------------------------------------------------------------------ staff
    if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

    switch (action) {
      case "list": {
        const status = body.status ?? url.searchParams.get("status") ?? "all";
        const page = Number(body.page ?? url.searchParams.get("page") ?? 1);
        const perPage = Number(body.per_page ?? url.searchParams.get("per_page") ?? 50);
        const search = String(body.search ?? url.searchParams.get("search") ?? "");
        let q = supabase.from("subscribers").select("id, email, first_name, company, role, firm_type, source, status, subscribed_at, unsubscribed_at, referral_code, open_count, click_count, last_opened_at", { count: "exact" });
        if (status !== "all") q = q.eq("status", status);
        if (search) q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,company.ilike.%${search}%`);
        const { data, error, count } = await q.order("subscribed_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);
        if (error) throw error;
        const { data: all } = await supabase.from("subscribers").select("status, firm_type, role, subscribed_at");
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const stats = {
          total: all?.length ?? 0,
          active: all?.filter((s) => s.status === "active").length ?? 0,
          unsubscribed: all?.filter((s) => s.status === "unsubscribed").length ?? 0,
          bounced: all?.filter((s) => s.status === "bounced" || s.status === "complained").length ?? 0,
          firm_email_share: all?.length ? Math.round(100 * (all.filter((s) => s.firm_type === "firm").length / all.length)) : 0,
          new_this_week: all?.filter((s) => s.subscribed_at >= weekAgo).length ?? 0,
          by_role: ROLES.reduce((acc, r) => ({ ...acc, [r]: all?.filter((s) => s.role === r).length ?? 0 }), {} as Record<string, number>),
        };
        return json({ subscribers: data, total: count, page, per_page: perPage, stats });
      }
      case "unsubscribe": {
        const { email, subscriber_id } = body;
        let q = supabase.from("subscribers").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() });
        if (subscriber_id) q = q.eq("id", subscriber_id); else if (email) q = q.eq("email", String(email).toLowerCase()); else throw new Error("email or subscriber_id is required");
        const { error } = await q; if (error) throw error;
        return json({ message: "Subscriber unsubscribed" });
      }
      case "reactivate": {
        const { data, error } = await supabase.from("subscribers").update({ status: "active", unsubscribed_at: null }).eq("id", body.subscriber_id).select().single();
        if (error) throw error;
        return json({ message: "Subscriber reactivated", subscriber: data });
      }
      case "delete": {
        const { error } = await supabase.from("subscribers").delete().eq("id", body.subscriber_id);
        if (error) throw error;
        return json({ message: "Subscriber deleted" });
      }
      case "bulk-import": {
        const subs = Array.isArray(body.subscribers) ? body.subscribers : [];
        if (!subs.length) throw new Error("subscribers array is required");
        const rows = subs.filter((s: { email?: string }) => s.email && validEmail(String(s.email))).map((s: { email: string; first_name?: string; company?: string; role?: string }) => ({
          email: String(s.email).toLowerCase().trim(), first_name: s.first_name ?? null, company: s.company ?? null, role: ROLES.includes(s.role ?? "") ? s.role : null,
          firm_type: FREEMAIL.includes(String(s.email).split("@")[1]?.toLowerCase()) ? "personal" : "firm", source: "import", referral_code: genCode(), unsubscribe_token: genToken(),
        }));
        const { data, error } = await supabase.from("subscribers").upsert(rows, { onConflict: "email", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        return json({ message: `Imported ${data?.length ?? 0} subscribers`, imported: data?.length ?? 0 });
      }
      case "export": {
        const { data, error } = await supabase.from("subscribers").select("email, first_name, company, role, firm_type, source, status, subscribed_at, unsubscribed_at, referral_code, open_count, click_count").order("subscribed_at", { ascending: false });
        if (error) throw error;
        const headers = ["email", "first_name", "company", "role", "firm_type", "source", "status", "subscribed_at", "unsubscribed_at", "referral_code", "open_count", "click_count"];
        const csv = [headers.join(","), ...(data ?? []).map((row) => headers.map((h) => `"${String((row as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
        return new Response(csv, { headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="gp-pulse-subscribers-${new Date().toISOString().slice(0, 10)}.csv"` } });
      }
      case "resend-welcome": {
        const { data } = await supabase.from("subscribers").select("id, email, first_name, referral_code, unsubscribe_token").eq("id", body.subscriber_id).single();
        if (!data) return json({ error: "not found" }, 404);
        await sendWelcome(data, supabase);
        return json({ message: `Welcome email re-sent to ${data.email}` });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("manage-subscribers", error);
    return json({ error: String(error) }, 500);
  }
});
