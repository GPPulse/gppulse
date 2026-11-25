import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiConfigured, chat, HOUSE_STYLE, parseJSON } from "../_shared/ai.ts";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { CONFIG } from "../_shared/config.ts";
import { normalizeContent } from "../_shared/content.ts";
import { publishPost, rejectPost, XKeys } from "../_shared/x.ts";

// The newsletter's X account, run from the issue itself.
//
//   { action: "generate" }  Write the day's posts from the latest sent issue and queue them,
//                           spread across the working day. Once per issue. Also emails the
//                           editor one LinkedIn post to paste himself (LINKEDIN_DRAFT=false to stop).
//   { action: "post" }      Publish the oldest queued post that is due. One per call, so the
//                           schedule in .github/workflows/social.yml sets the pace.
//   { action: "status" }    Counts, for the workflow log.
//
// Posts are built only from what the issue printed. Each one passes rejectPost() before it is
// queued. Without the four X keys set, "post" does nothing and says so.
//
// Secrets: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (an app with
// Read and Write permission, tokens generated for the newsletter's own account).
// Optional: X_DAILY_CAP (default 5), X_SIGNUP_POST ("false" to leave out the one post a day
// that carries the link; linked posts cost more on X's pay-per-use pricing).

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function keys(): XKeys | null {
  const k = { apiKey: Deno.env.get("X_API_KEY"), apiSecret: Deno.env.get("X_API_SECRET"), accessToken: Deno.env.get("X_ACCESS_TOKEN"), accessSecret: Deno.env.get("X_ACCESS_TOKEN_SECRET") };
  return k.apiKey && k.apiSecret && k.accessToken && k.accessSecret ? (k as XKeys) : null;
}

// Minutes after the first slot for each post: roughly 8am, 10:30am, 1pm and 3:30pm Eastern when
// generation runs on the 8am pass. The signup post goes last.
const SLOT_MINUTES = [0, 150, 300, 450, 540];

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);
  const body = await req.json().catch(() => ({}));
  const action: string = body?.action ?? "status";

  try {
    if (action === "generate") {
      if (!aiConfigured()) return json({ skipped: true, message: "no AI key configured" });
      const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
      const { data: issue } = await supabase.from("newsletters").select("id, issue_number, subject, slug, content, sent_at")
        .eq("status", "sent").gte("sent_at", since).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (!issue) return json({ skipped: true, message: "no issue sent in the last 20 hours" });
      const { count } = await supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("newsletter_id", issue.id);
      if ((count ?? 0) > 0) return json({ skipped: true, message: `posts already written for issue #${issue.issue_number}` });

      const c = normalizeContent(issue.content);
      const radar = (c.below_radar ?? []).filter((r) => r.found_via !== "SEC filing");
      const material = [
        `SUBJECT: ${issue.subject}`,
        c.editors_note ? `LEDE: ${c.editors_note.headline}\n${c.editors_note.paragraphs.join("\n")}` : "",
        c.by_the_numbers.length ? `NUMBERS:\n${c.by_the_numbers.map((s) => `- ${s.value}: ${s.label}. ${s.context ?? ""}`).join("\n")}` : "",
        radar.length ? `BELOW THE RADAR (ours alone):\n${radar.map((r) => `- ${r.confirmed ? "" : "(UNCONFIRMED signal) "}${r.headline}. ${r.body ?? ""}`).join("\n")}` : "",
        c.deal_tracker.length ? `ANNOUNCED DEALS:\n${c.deal_tracker.slice(0, 10).map((d) => `- ${d.sponsor} / ${d.target} (${d.deal_type}${d.sector ? `, ${d.sector}` : ""}). ${d.editor_take ?? d.summary ?? ""}`).join("\n")}` : "",
        c.fund_tracker.length ? `FUNDS:\n${c.fund_tracker.slice(0, 4).map((f) => `- ${f.firm}, ${f.fund_name} (${f.status}). ${f.summary ?? ""}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");

      const system = `${HOUSE_STYLE}

You write the X (Twitter) account of The GP Pulse, a weekday morning letter for lower-middle-market private equity investors ($2-25M EBITDA deals, sub-$1B funds). Followers are deal professionals. The account earns follows by posting facts they did not have: deals with no press release, counts from our own tracker, a sponsor on a run.

Write 4 posts from TODAY'S ISSUE below. JSON only:
{"posts":[{"kind":"lede|radar|number|pattern","text":"..."}],"linkedin":"..."}

RULES
- Each post stands alone and makes one point. 120 to 240 characters. Plain sentences. Numbers first where there is one.
- Use only facts in the issue. No figure, name or claim that is not printed there. Never estimate.
- An UNCONFIRMED item is worded as unconfirmed ("appears to have added", "not confirmed by either side"). Never say it closed. Never say how a deal was found.
- No links, no @mentions, no emoji, no threads, no "1/". At most one hashtag in the whole set, and only if it reads naturally; none is better.
- Do not mention lenders' filings, BDCs, stock indexes or rates. Do not give advice or predictions.
- No teasers ("you won't believe", "here's why"). No rhetorical questions. Do not mention the newsletter or ask for follows; another post handles that.
- Four different subjects. Lead with the most surprising fact.

ALSO write "linkedin": one LinkedIn post the editor will paste under his own name. 110 to 170 words, first person plural for the letter ("we found", "our tracker"). Open with the single most interesting fact from the issue in one plain sentence, no hook line. Then two or three short paragraphs: what happened, what our tracker shows around it, and one "Our read:" sentence. Same rules as above: only facts in the issue, no lenders' filings or BDCs, no emoji, no hashtags, no questions to the audience, no "thoughts?". Do not include a link or mention subscribing; that line is added for him.`;
      const text = await chat("", system, `TODAY'S ISSUE (#${issue.issue_number})\n\n${material}`, { temperature: 0.6, maxTokens: 1800, tier: "editorial" });
      const out = parseJSON<{ posts?: { kind?: string; text?: string }[]; linkedin?: string }>(text);
      const seen = new Set<string>();
      const rejected: string[] = [];
      const posts = (out?.posts ?? []).map((p) => ({ kind: ["lede", "radar", "number", "pattern"].includes(p.kind ?? "") ? p.kind! : "pattern", text: (p.text ?? "").replace(/\s+/g, " ").trim() }))
        .filter((p) => {
          const why = rejectPost(p.text) ?? (/https?:\/\//.test(p.text) ? "contains a link" : null) ?? (seen.has(p.text.toLowerCase()) ? "duplicate" : null);
          if (why) { rejected.push(`${why}: ${p.text.slice(0, 80)}`); return false; }
          seen.add(p.text.toLowerCase());
          return true;
        }).slice(0, 4);
      if (!posts.length) return json({ error: "no usable posts", rejected }, 502);

      if ((Deno.env.get("X_SIGNUP_POST") ?? "true").toLowerCase() !== "false") {
        const n = (c.below_radar ?? []).filter((r) => r.confirmed && r.found_via !== "SEC filing").length;
        const url = `${CONFIG.siteUrl}/?utm_source=x&utm_medium=social`;
        posts.push({ kind: "signup", text: n >= 2
          ? `Today's issue had ${n} deals you won't read anywhere else, plus the tracker and the people moves. Free, weekday mornings: ${url}`
          : `The lower middle market, every weekday morning: the deals nobody announced, the funds in market, who moved where. Free: ${url}` });
      }
      const start = Date.now();
      const rows = posts.map((p, i) => ({ newsletter_id: issue.id, kind: p.kind, body: p.text, scheduled_for: new Date(start + SLOT_MINUTES[Math.min(i, SLOT_MINUTES.length - 1)] * 60000).toISOString() }));
      const { error } = await supabase.from("social_posts").insert(rows);
      if (error) throw error;
      // LinkedIn is where this audience reads, and it does not allow automated posting. So the
      // editor gets one post a day by email, written from the issue, to paste himself.
      let linkedin: string | null = null;
      const draft = (out?.linkedin ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
      const words = draft.split(/\s+/).filter(Boolean).length;
      const draftOk = words >= 70 && words <= 230 && !/\b(BDC|business development compan)/i.test(draft) && !/\p{Extended_Pictographic}/u.test(draft) && !/#\w+/.test(draft) && !/https?:\/\//.test(draft);
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (draftOk && resendKey && (Deno.env.get("LINKEDIN_DRAFT") ?? "true").toLowerCase() !== "false") {
        const issueUrl = `${CONFIG.siteUrl}/archive/${issue.slug ?? issue.id}`;
        linkedin = `${draft}\n\nFrom today's issue of The GP Pulse, the lower middle market every weekday morning. Free: ${issueUrl}`;
        const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${resendKey.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: CONFIG.from, to: [CONFIG.replyTo], subject: `LinkedIn post for issue #${issue.issue_number}, ready to paste`,
            text: `${linkedin}\n\n---\nWritten from this morning's issue. Edit freely; nothing is posted for you.`,
            html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px;"><p style="font-size:12px;color:#6b7280;">Copy everything between the lines into LinkedIn. Written from this morning's issue; edit freely. Nothing is posted for you.</p><hr style="border:none;border-top:1px solid #e5e7eb;">${linkedin.split(/\n\n/).map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`).join("")}<hr style="border:none;border-top:1px solid #e5e7eb;"></div>`,
            tags: [{ name: "kind", value: "linkedin_draft" }],
          }),
        }).catch((e) => console.error("linkedin draft email failed", e));
      }

      return json({ message: `queued ${rows.length} posts for issue #${issue.issue_number}`, rejected, linkedin_draft_sent: Boolean(linkedin), posts: rows.map((r) => ({ kind: r.kind, at: r.scheduled_for, body: r.body })) });
    }

    if (action === "post") {
      const k = keys();
      const dry = Boolean(body?.dry);
      if (!k && !dry) return json({ skipped: true, message: "X keys are not set (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)" });
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const cap = Number(Deno.env.get("X_DAILY_CAP") ?? 5);
      const { count: postedToday } = await supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", dayAgo);
      if ((postedToday ?? 0) >= cap) return json({ skipped: true, message: `daily cap of ${cap} reached` });
      // A post more than 18 hours late is yesterday's news: retire it and move on.
      await supabase.from("social_posts").update({ status: "skipped", error: "expired before posting" }).eq("status", "queued").lt("scheduled_for", new Date(Date.now() - 18 * 3600 * 1000).toISOString());
      const { data: due } = await supabase.from("social_posts").select("id, body, attempts, kind").eq("status", "queued").lte("scheduled_for", new Date().toISOString()).order("scheduled_for", { ascending: true }).limit(1).maybeSingle();
      if (!due) return json({ skipped: true, message: "nothing due" });
      const why = rejectPost(due.body);
      if (why) { await supabase.from("social_posts").update({ status: "skipped", error: why }).eq("id", due.id); return json({ skipped: true, message: `post failed the rules: ${why}` }); }
      if (dry) return json({ dry: true, would_post: due.body });
      const res = await publishPost(due.body, k!);
      if (res.ok) {
        await supabase.from("social_posts").update({ status: "posted", external_id: res.id, posted_at: new Date().toISOString(), attempts: due.attempts + 1, error: null }).eq("id", due.id);
        return json({ message: "posted", id: res.id, kind: due.kind });
      }
      const attempts = due.attempts + 1;
      await supabase.from("social_posts").update({ status: res.retry && attempts < 3 ? "queued" : "failed", attempts, error: `HTTP ${res.status}: ${res.error}` }).eq("id", due.id);
      return json({ error: `X returned ${res.status}`, detail: res.error, will_retry: res.retry && attempts < 3 }, 502);
    }

    const { data: counts } = await supabase.from("social_posts").select("status").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
    const tally = ((counts ?? []) as { status: string }[]).reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {} as Record<string, number>);
    return json({ keys_set: Boolean(keys()), last_7_days: tally });
  } catch (e) {
    console.error("social-x", e);
    return json({ error: String(e) }, 500);
  }
});
