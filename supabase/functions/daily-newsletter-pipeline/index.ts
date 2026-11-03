import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

// Orchestrates the nightly build and the morning send.
//   mode=full      scrape → process → draft issue → refresh index   (evening, before review)
//   mode=send      send the approved issue (or the draft if AUTO_SEND=true)   (morning)
//   mode=full-send both, back to back (manual use)
//   mode=scrape    just refill the article pool

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};

interface Step { name: string; status: "running" | "success" | "error" | "skipped"; message?: string; startedAt?: string; completedAt?: string }

async function call(supabaseUrl: string, serviceKey: string, fn: string, body: Record<string, unknown> = {}) {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, data, error: data?.error ?? `HTTP ${r.status}` };
    return { ok: true, data, error: undefined };
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
  const startedAt = new Date().toISOString();
  const steps: Step[] = [];
  const run = async (name: string, fn: () => Promise<{ ok: boolean; data: unknown; error?: string }>) => {
    const step: Step = { name, status: "running", startedAt: new Date().toISOString() };
    steps.push(step);
    const res = await fn();
    step.status = res.ok ? "success" : "error";
    step.message = res.ok ? JSON.stringify(res.data).slice(0, 600) : res.error;
    step.completedAt = new Date().toISOString();
    console.log(`[pipeline] ${name}: ${step.status} ${step.message ?? ""}`);
    return res;
  };

  try {
    if (["full", "scrape", "full-send"].includes(mode)) {
      await run("scrape-rss", () => call(supabaseUrl, serviceKey, "scrape-rss"));
      await run("scrape-pe-sources", () => call(supabaseUrl, serviceKey, "scrape-pe-sources", { limit: 15 }));
      await run("scrape-industry-news", () => call(supabaseUrl, serviceKey, "scrape-industry-news"));
      await run("scrape-people-moves", () => call(supabaseUrl, serviceKey, "scrape-people-moves"));

      let processed = 0, created = 0;
      for (let i = 0; i < 12; i++) {
        const r = await call(supabaseUrl, serviceKey, "process-content", { limit: 10 });
        if (!r.ok) break;
        const d = r.data as { processed?: number; articles_created?: number };
        processed += d.processed ?? 0; created += d.articles_created ?? 0;
        if (!d.processed) break;
        await new Promise((res) => setTimeout(res, 800));
      }
      steps.push({ name: "process-content", status: "success", message: `processed ${processed}, created ${created}`, completedAt: new Date().toISOString() });
    }

    if (["full", "full-send"].includes(mode)) {
      await run("generate-newsletter", () => call(supabaseUrl, serviceKey, "generate-newsletter"));
      if (new Date().getDay() === 4 || new Date().getDay() === 5) {
        await run("generate-gp-index", () => call(supabaseUrl, serviceKey, "generate-gp-index"));
      } else {
        steps.push({ name: "generate-gp-index", status: "skipped", message: "weekly — runs Thu/Fri" });
      }
    }

    if (["send", "full-send"].includes(mode)) {
      const autoSend = (Deno.env.get("AUTO_SEND") ?? "false").toLowerCase() === "true";
      const statuses = autoSend ? ["approved", "scheduled", "draft"] : ["approved", "scheduled"];
      const { data: issue } = await supabase.from("newsletters").select("id, subject, issue_number, status")
        .in("status", statuses).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!issue) {
        steps.push({ name: "send-newsletter", status: "skipped", message: autoSend ? "nothing to send" : "no approved issue — approve today's draft in the Editor's Desk, or set AUTO_SEND=true", completedAt: new Date().toISOString() });
      } else {
        await run("send-newsletter", () => call(supabaseUrl, serviceKey, "send-newsletter", { newsletter_id: issue.id }));
        await run("send-deal-alerts", () => call(supabaseUrl, serviceKey, "send-deal-alerts", { newsletter_id: issue.id }));
      }
    }

    const success = !steps.some((s) => s.status === "error");
    await supabase.from("pipeline_runs").insert({ mode, success, steps, started_at: startedAt, completed_at: new Date().toISOString() });

    return new Response(JSON.stringify({ message: `Pipeline finished (${mode})`, success, steps, completed_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("pipeline", error);
    await supabase.from("pipeline_runs").insert({ mode, success: false, steps: [...steps, { name: "fatal", status: "error", message: String(error) }], started_at: startedAt, completed_at: new Date().toISOString() });
    return new Response(JSON.stringify({ error: String(error), steps }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
