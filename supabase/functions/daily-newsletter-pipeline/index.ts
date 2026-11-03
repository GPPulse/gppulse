import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

// Pipeline entry point. Two ways to drive it:
//
//   { mode: "step", step: "<name>", run_id: "<uuid>" }
//     Runs ONE step and appends its result to pipeline_runs[run_id]. This is what the
//     GitHub Action uses: each step is a short invocation, so no single call runs long
//     enough to hit the edge-function resource limit. process-content returns
//     `remaining` so the caller loops until the queue is empty.
//
//   { mode: "full" | "send" | "full-send" | "scrape" }
//     Legacy single-call orchestration for the admin "Run pipeline" button. Fine for
//     small queues; for a full nightly build prefer the step mode.
//
// Steps: discover-sources · scrape-rss · scrape-form-d · scrape-pe-sources · scrape-industry-news · scrape-people-moves ·
//        process-content · generate-newsletter · generate-gp-index · send-newsletter · send-deal-alerts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Step { name: string; status: "running" | "success" | "error" | "skipped"; message?: string; startedAt?: string; completedAt?: string }
type CallResult = { ok: boolean; data: unknown; error?: string };

async function call(supabaseUrl: string, serviceKey: string, fn: string, body: Record<string, unknown> = {}): Promise<CallResult> {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, data, error: (data as { error?: string })?.error ?? `HTTP ${r.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, data: null, error: String(e) };
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

  const body = await req.json().catch(() => ({}));
  const mode: string = body?.mode ?? "full";
  const autoSend = (Deno.env.get("AUTO_SEND") ?? "false").toLowerCase() === "true";

  /** Find the issue the morning send should go out with. */
  const findSendable = async () => {
    const statuses = autoSend ? ["approved", "scheduled", "draft"] : ["approved", "scheduled"];
    const { data } = await supabase.from("newsletters").select("id, subject, issue_number, status").in("status", statuses).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  };

  /** Execute one named step. Returns the Step record plus any extra data for the caller. */
  const runStep = async (name: string): Promise<{ step: Step; extra?: Record<string, unknown> }> => {
    const step: Step = { name, status: "running", startedAt: new Date().toISOString() };
    const finish = (res: CallResult, extra?: Record<string, unknown>) => {
      step.status = res.ok ? "success" : "error";
      step.message = res.ok ? JSON.stringify(res.data).slice(0, 600) : res.error;
      step.completedAt = new Date().toISOString();
      console.log(`[pipeline] ${name}: ${step.status} ${step.message ?? ""}`);
      return { step, extra };
    };
    switch (name) {
      case "discover-sources": return finish(await call(supabaseUrl, serviceKey, "discover-sources", { limit: Number(body.limit ?? 25) }));
      case "scrape-rss": return finish(await call(supabaseUrl, serviceKey, "scrape-rss"));
      case "scrape-form-d": return finish(await call(supabaseUrl, serviceKey, "scrape-form-d"));
      case "reprocess-form-d": return finish(await call(supabaseUrl, serviceKey, "scrape-form-d", { reprocess: true }));
      case "scrape-pe-sources": return finish(await call(supabaseUrl, serviceKey, "scrape-pe-sources", { limit: 15 }));
      case "scrape-industry-news": return finish(await call(supabaseUrl, serviceKey, "scrape-industry-news"));
      case "scrape-people-moves": return finish(await call(supabaseUrl, serviceKey, "scrape-people-moves"));
      case "process-content": {
        // One batch per invocation; report how many are left so the caller can loop.
        const res = await call(supabaseUrl, serviceKey, "process-content", { limit: Number(body.limit ?? 8) });
        const { count } = await supabase.from("scraped_content").select("id", { count: "exact", head: true }).eq("processed", false);
        const d = (res.data ?? {}) as { processed?: number; articles_created?: number };
        return finish(res, { remaining: count ?? 0, processed: d.processed ?? 0, created: d.articles_created ?? 0 });
      }
      case "generate-newsletter": return finish(await call(supabaseUrl, serviceKey, "generate-newsletter", { force: Boolean(body.force) }));
      case "generate-gp-index": {
        const dow = new Date().getDay();
        if (dow !== 4 && dow !== 5 && !body.force) { step.status = "skipped"; step.message = "weekly — runs Thu/Fri"; step.completedAt = new Date().toISOString(); return { step }; }
        return finish(await call(supabaseUrl, serviceKey, "generate-gp-index"));
      }
      case "send-test": {
        // Latest draft/approved issue → one address (body.test_email). Used for the editor's own preview.
        const to = String(body.test_email ?? Deno.env.get("NEWSLETTER_REPLY_TO") ?? "").trim();
        if (!to) { step.status = "error"; step.message = "test_email required"; step.completedAt = new Date().toISOString(); return { step }; }
        const { data: issue } = await supabase.from("newsletters").select("id, subject").in("status", ["draft", "approved", "scheduled", "sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!issue) { step.status = "skipped"; step.message = "no issue to send"; step.completedAt = new Date().toISOString(); return { step }; }
        return finish(await call(supabaseUrl, serviceKey, "send-newsletter", { newsletter_id: issue.id, test_email: to }), { newsletter_id: issue.id, to });
      }
      case "send-newsletter": {
        const issue = await findSendable();
        if (!issue) { step.status = "skipped"; step.message = autoSend ? "nothing to send" : "no approved issue — approve today's draft in the Editor's Desk, or set AUTO_SEND=true"; step.completedAt = new Date().toISOString(); return { step }; }
        return finish(await call(supabaseUrl, serviceKey, "send-newsletter", { newsletter_id: issue.id }), { newsletter_id: issue.id });
      }
      case "send-deal-alerts": {
        const { data: issue } = await supabase.from("newsletters").select("id").in("status", ["approved", "scheduled", "sending", "sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!issue) { step.status = "skipped"; step.message = "no issue"; step.completedAt = new Date().toISOString(); return { step }; }
        return finish(await call(supabaseUrl, serviceKey, "send-deal-alerts", { newsletter_id: issue.id }));
      }
      default:
        step.status = "error"; step.message = `unknown step ${name}`; step.completedAt = new Date().toISOString();
        return { step };
    }
  };

  // ---- step mode (GitHub Action) -----------------------------------------------------------
  if (mode === "step") {
    const name = String(body.step ?? "");
    const runId: string | undefined = body.run_id;
    const { step, extra } = await runStep(name);
    if (runId) {
      // Merge into the run's step log; repeated process-content steps collapse into one entry.
      const { data: run } = await supabase.from("pipeline_runs").select("id, steps, success").eq("id", runId).maybeSingle();
      const steps: Step[] = Array.isArray(run?.steps) ? (run!.steps as Step[]) : [];
      const idx = name === "process-content" ? steps.findIndex((s) => s.name === name) : -1;
      if (idx >= 0) {
        const prev = steps[idx];
        const m = prev.message?.match(/processed (\d+), created (\d+)/);
        const p = (m ? Number(m[1]) : 0) + Number(extra?.processed ?? 0), c = (m ? Number(m[2]) : 0) + Number(extra?.created ?? 0);
        steps[idx] = { ...prev, status: step.status === "error" ? "error" : prev.status, message: `processed ${p}, created ${c}, ${extra?.remaining ?? 0} remaining`, completedAt: step.completedAt };
      } else {
        steps.push(name === "process-content" ? { ...step, message: `processed ${extra?.processed ?? 0}, created ${extra?.created ?? 0}, ${extra?.remaining ?? 0} remaining` } : step);
      }
      const success = !steps.some((s) => s.status === "error");
      if (run) await supabase.from("pipeline_runs").update({ steps, success, completed_at: new Date().toISOString() }).eq("id", runId);
      else await supabase.from("pipeline_runs").insert({ id: runId, mode: String(body.run_mode ?? "step"), steps, success, started_at: step.startedAt, completed_at: new Date().toISOString() });
    }
    return json({ step, ...(extra ?? {}), ok: step.status !== "error" });
  }

  // ---- legacy single-call orchestration ----------------------------------------------------
  const startedAt = new Date().toISOString();
  const steps: Step[] = [];
  try {
    const seq: string[] = [];
    if (["full", "scrape", "full-send"].includes(mode)) seq.push("scrape-rss", "scrape-form-d", "scrape-pe-sources", "scrape-industry-news", "scrape-people-moves", "process-content");
    if (["full", "full-send"].includes(mode)) seq.push("generate-newsletter", "generate-gp-index");
    if (["send", "full-send"].includes(mode)) seq.push("send-newsletter", "send-deal-alerts");
    for (const name of seq) {
      if (name === "process-content") {
        // Bounded loop: a few batches, then hand off to the next scheduled run if more remain.
        let total = 0, created = 0, remaining = 0;
        for (let i = 0; i < 4; i++) {
          const { step, extra } = await runStep("process-content");
          total += Number(extra?.processed ?? 0); created += Number(extra?.created ?? 0); remaining = Number(extra?.remaining ?? 0);
          if (step.status === "error" || !extra?.processed) break;
        }
        steps.push({ name, status: "success", message: `processed ${total}, created ${created}, ${remaining} remaining`, completedAt: new Date().toISOString() });
      } else {
        steps.push((await runStep(name)).step);
      }
    }
    const success = !steps.some((s) => s.status === "error");
    await supabase.from("pipeline_runs").insert({ mode, success, steps, started_at: startedAt, completed_at: new Date().toISOString() });
    return json({ message: `Pipeline finished (${mode})`, success, steps, completed_at: new Date().toISOString() });
  } catch (error) {
    console.error("pipeline", error);
    await supabase.from("pipeline_runs").insert({ mode, success: false, steps: [...steps, { name: "fatal", status: "error", message: String(error) }], started_at: startedAt, completed_at: new Date().toISOString() });
    return json({ error: String(error), steps }, 500);
  }
});
