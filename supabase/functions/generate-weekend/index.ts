// Weekend Reading: the Saturday edition. Six to eight long reads from the week, each with a
// short note written here and a link to the original. Picks come from the reading queue (links
// that arrived at the reading address) mixed with the week's best pieces from our own sources,
// so the edition is never a copy of one letter's list. Nothing is quoted from the pieces.
//
// Skips quietly when fewer than MIN_READS pieces qualify: no weekend issue is better than a thin one.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiConfigured, chat, HOUSE_STYLE, parseJSON } from "../_shared/ai.ts";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { CONFIG } from "../_shared/config.ts";
import { emptyContent, NewsletterContentV2, WeekendRead } from "../_shared/content.ts";
import { lintStyle, tidy } from "../_shared/lint.ts";
import { pageFacts, publisherFromHost, resolve } from "../_shared/reading.ts";
import { capPerPublisher, weekendLabel } from "./pick.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MIN_READS = 4, MAX_READS = 8;

interface Candidate { key: string; url: string; title: string; publisher: string; description: string | null; opening: string; words: number; queueId?: string; articleId?: string }

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);
    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);
    if (!aiConfigured()) return json({ message: "No AI provider configured; the weekend edition needs the writing pass.", skipped: true });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 8 * 86400_000).toISOString();
    const { data: recent } = await supabase.from("newsletters").select("id, issue_number, content").gte("created_at", new Date(now.getTime() - 5 * 86400_000).toISOString());
    const already = (recent ?? []).find((n) => ((n.content as { weekend_reads?: unknown[] } | null)?.weekend_reads ?? []).length > 0);
    if (already && !force) return json({ message: `Weekend issue #${already.issue_number} already exists`, newsletter_id: already.id, skipped: true });

    // Candidates: the reading queue first, then the week's long reads from our own sources.
    const [{ data: queued, error: qErr }, { data: own }] = await Promise.all([
      supabase.from("reading_queue").select("id, url, title, publisher").eq("status", "queued").gte("received_at", weekAgo).order("received_at", { ascending: false }).limit(40),
      supabase.from("articles").select("id, title, source, source_url, relevance_score").eq("category", "market_insight").gte("scraped_at", weekAgo).not("source_url", "is", null).order("relevance_score", { ascending: false }).limit(12),
    ]);
    if (qErr) console.warn("reading_queue unavailable:", qErr.message);
    const raw = [
      ...((queued ?? []) as { id: string; url: string; title: string | null; publisher: string | null }[]).map((q) => ({ queueId: q.id, url: q.url, title: q.title, publisher: q.publisher })),
      ...((own ?? []) as { id: string; title: string; source: string; source_url: string }[]).map((a) => ({ articleId: a.id, url: a.source_url, title: a.title, publisher: a.source })),
    ].filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i).slice(0, 30);

    // Read each piece. One we cannot open, or that is too short to be a long read, is dropped.
    const pages = await Promise.all(raw.map((c) => resolve(c.url, 10_000)));
    const candidates: Candidate[] = [];
    raw.forEach((c, i) => {
      const page = pages[i];
      if (!page) return;
      const f = pageFacts(page.html);
      const words = page.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).length;
      if (words < 700) return;
      candidates.push({ key: String(candidates.length + 1), url: c.url, title: (f.title ?? c.title ?? "").trim(), publisher: (c.publisher || f.site || publisherFromHost(c.url)).trim(), description: f.description, opening: f.opening, words, queueId: (c as { queueId?: string }).queueId, articleId: (c as { articleId?: string }).articleId });
    });
    if (candidates.length < MIN_READS) return json({ message: `Only ${candidates.length} readable long reads this week (need ${MIN_READS}); no weekend issue.`, skipped: true, queued: (queued ?? []).length });

    const system = `${HOUSE_STYLE}

You are editing Weekend Reading, the Saturday edition of The GP Pulse: the week's best long reads for a lower-middle-market private equity investor. The reader has an hour on Saturday morning and wants pieces that make them better at buying, financing, running or selling a company.

PICK ${MIN_READS + 2} to ${MAX_READS} of the candidates below. Prefer: investor letters and memos, original reporting, data-heavy research, operating and capital-allocation essays, business history. Reject: press releases, product marketing, news briefs, anything paywalled to a stub, anything you cannot describe from the material given, and anything about day trading or crypto price moves. No more than two picks from one publisher. Order them best first.

FOR EACH PICK write a note of two or three sentences, in our own words:
- What the piece argues or shows, concretely. Then why a private equity investor should spend the time.
- Do not quote the piece. Do not copy its phrasing. Do not say where we came across it.
- Vary the notes: different openings, different lengths.

ALSO WRITE
- subject: 6–10 words, lowercase except proper nouns, built on the best pick's idea. Not "weekend reading".
- preheader: one sentence, max 90 characters.
- intro: two or three sentences that set up the weekend's theme if there is one; plain if there is not.
- closing_line: one dry sentence.

OUTPUT (JSON only):
{"subject":"","preheader":"","intro_headline":"5–9 words","intro":"","picks":[{"key":"3","note":""}],"closing_line":""}`;
    const user = candidates.map((c) => `[${c.key}] ${c.title}\n    Publisher: ${c.publisher} | about ${Math.round(c.words / 230)} min\n    ${c.description ?? ""}\n    Opening: ${c.opening.slice(0, 900)}`).join("\n\n");

    type Out = { subject: string; preheader: string; intro_headline: string; intro: string; picks: { key: string; note: string }[]; closing_line: string };
    const write = async (feedback?: string[]) => parseJSON<Out>(await chat("configured", system, feedback?.length ? `${user}\n\nYOUR FIRST DRAFT WAS REJECTED. Fix every one of these:\n${feedback.map((f) => `- ${f}`).join("\n")}` : user, { temperature: 0.5, maxTokens: 3000, tier: "editorial" }));
    const style = (o: Out | null) => (o ? lintStyle({ subject: o.subject, headline: o.intro_headline, paragraphs: [o.intro], closing: o.closing_line, takes: o.picks.map((p) => p.note) }) : []);
    let out = await write();
    const notes = style(out);
    if (out && notes.length) { const second = await write(notes); if (second && style(second).length < notes.length) out = second; }
    if (!out?.picks?.length) return json({ message: "The writing pass returned nothing usable; no weekend issue.", skipped: true }, 200);

    const byKey = new Map(candidates.map((c) => [c.key, c]));
    const chosen = capPerPublisher(out.picks.map((p) => ({ c: byKey.get(String(p.key)), note: tidy(p.note ?? "") })).filter((p): p is { c: Candidate; note: string } => Boolean(p.c && p.note)).map((p) => ({ ...p, publisher: p.c.publisher })), 2).slice(0, MAX_READS);
    if (chosen.length < MIN_READS) return json({ message: `Only ${chosen.length} picks survived; no weekend issue.`, skipped: true });
    const reads: WeekendRead[] = chosen.map(({ c, note }) => ({ title: c.title, publisher: c.publisher, url: c.url, note, minutes: Math.max(3, Math.round(c.words / 230 / 5) * 5 || 5) }));

    const content: NewsletterContentV2 = {
      ...emptyContent("special"),
      editors_note: { headline: tidy(out.intro_headline || "Weekend Reading"), paragraphs: [tidy(out.intro)].filter(Boolean), byline: CONFIG.editorName },
      weekend_reads: reads,
      closing_line: tidy(out.closing_line) || null,
      quality_flags: [],
    };
    const { data: last } = await supabase.from("newsletters").select("issue_number").order("issue_number", { ascending: false }).limit(1).maybeSingle();
    const issueNumber = (last?.issue_number ?? 0) + 1;
    const subject = tidy(out.subject || "") || `Weekend Reading: ${reads[0].title}`.slice(0, 80);
    const { data: nl, error } = await supabase.from("newsletters").insert({
      subject, preheader: tidy(out.preheader || "") || `${reads.length} long reads for ${weekendLabel(now)}.`, issue_number: issueNumber, content, status: "draft", edition: "special", slug: `${now.toISOString().slice(0, 10)}-weekend-${issueNumber}`,
    }).select().single();
    if (error) throw new Error(error.message);

    const usedQueue = chosen.map((p) => p.c.queueId).filter(Boolean) as string[];
    const usedArticles = chosen.map((p) => p.c.articleId).filter(Boolean) as string[];
    await Promise.all([
      usedQueue.length ? supabase.from("reading_queue").update({ status: "published", newsletter_id: nl.id }).in("id", usedQueue) : Promise.resolve(),
      usedArticles.length ? supabase.from("articles").update({ used_in_newsletter_id: nl.id }).in("id", usedArticles) : Promise.resolve(),
    ]);
    return json({ message: `Weekend issue #${issueNumber} drafted with ${reads.length} reads (${usedQueue.length} from the reading queue, ${usedArticles.length} from our own sources).`, newsletter_id: nl.id, issue_number: issueNumber, subject });
  } catch (e) {
    console.error("generate-weekend", e);
    return json({ error: String(e) }, 500);
  }
});
