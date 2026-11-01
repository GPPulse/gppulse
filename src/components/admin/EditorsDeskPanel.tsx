import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { IssueView } from "@/components/issue/IssueView";
import { NewsletterContentV2, normalizeContent } from "@/lib/newsletter-content";
import type { Json } from "@/integrations/supabase/types";
import { Check, Copy, Eye, Loader2, Mail, Plus, RefreshCw, Send, Share2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type IssueRow = { id: string; subject: string; preheader: string | null; issue_number: number; status: string; created_at: string; sent_at: string | null; content: Json; recipient_count: number | null; open_count: number | null; click_count: number | null; slug: string | null; edition: string };
type EditorItemRow = { id: string; kind: string; headline: string; body: string | null; url: string | null; attribution: string | null; status: string; created_at: string; submitted_by_email: string | null; submitted_by_role: string | null; attribution_ok: boolean };

const KINDS = [
  { value: "on_the_market", label: "On the market", hint: "A process launching, a teaser you saw, a banker shopping something." },
  { value: "overheard", label: "Overheard", hint: "A line from a lender, LP or banker. Attribute by role, not name." },
  { value: "reader_question", label: "Reader question", hint: "Something a subscriber asked that others will want answered." },
  { value: "job", label: "Job", hint: "An open seat at an LMM firm or portfolio company." },
  { value: "event", label: "Event", hint: "A conference or dinner worth the airfare." },
];

function Row({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0 text-sm">{children}</div>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Remove"><X className="h-4 w-4" /></button>
    </div>
  );
}

export function EditorsDeskPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; preheader: string; content: NewsletterContentV2 } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [postText, setPostText] = useState("");
  const [postCopied, setPostCopied] = useState(false);

  const issues = useQuery({
    queryKey: ["desk-issues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("newsletters").select("id, subject, preheader, issue_number, status, created_at, sent_at, content, recipient_count, open_count, click_count, slug, edition").order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      return data as IssueRow[];
    },
  });

  const queue = useQuery({
    queryKey: ["desk-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("editor_items").select("*").in("status", ["submitted", "queued"]).order("created_at", { ascending: true });
      if (error) throw error;
      return data as EditorItemRow[];
    },
  });

  const selected = useMemo(() => issues.data?.find((i) => i.id === selectedId) ?? null, [issues.data, selectedId]);

  useEffect(() => {
    if (!selectedId && issues.data?.length) {
      const first = issues.data.find((i) => i.status === "draft" || i.status === "approved") ?? issues.data[0];
      setSelectedId(first.id);
    }
  }, [issues.data, selectedId]);

  useEffect(() => {
    if (selected) {
      setDraft({ subject: selected.subject, preheader: selected.preheader ?? "", content: normalizeContent(selected.content) });
      setDirty(false);
    }
  }, [selected]);

  const patch = (fn: (c: NewsletterContentV2) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d.content);
      fn(next);
      return { ...d, content: next };
    });
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft || !selected) return;
      const { error } = await supabase.from("newsletters").update({ subject: draft.subject, preheader: draft.preheader || null, content: draft.content as unknown as Json }).eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ["desk-issues"] }); toast({ title: "Saved" }); },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const setStatus = async (status: "approved" | "draft" | "skipped") => {
    if (!selected) return;
    if (dirty) await save.mutateAsync();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("newsletters").update({ status, approved_at: status === "approved" ? new Date().toISOString() : null, approved_by: status === "approved" ? user?.id ?? null : null }).eq("id", selected.id);
    if (error) toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    else {
      qc.invalidateQueries({ queryKey: ["desk-issues"] });
      toast({ title: status === "approved" ? "Approved — it'll go out on the morning send" : `Marked ${status}` });
      if (status === "approved") await invoke("send-deal-alerts", { newsletter_id: selected.id }, "Deal alerts");
    }
  };

  const invoke = async (fn: string, body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: data?.message ?? "Done" });
      qc.invalidateQueries({ queryKey: ["desk-issues"] });
      qc.invalidateQueries({ queryKey: ["desk-queue"] });
      return data;
    } catch (e) {
      toast({ title: `${label} failed`, description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async () => {
    if (!selected) return;
    if (!confirm(`Send issue #${selected.issue_number} to every active subscriber now?`)) return;
    if (dirty) await save.mutateAsync();
    await invoke("send-newsletter", { newsletter_id: selected.id, force: true }, "Send");
  };

  // ---- "Post the Lede" — LinkedIn-ready text from the issue -----------------
  const buildPost = () => {
    if (!draft || !selected) return;
    const c = draft.content;
    const origin = window.location.origin;
    const url = `${origin}/archive/${selected.slug ?? selected.id}`;
    const stats = c.by_the_numbers.slice(0, 3).map((x) => `${x.value} — ${x.label}`).join("\n");
    const deals = c.deal_tracker.filter((d) => d.ev_ebitda_multiple).slice(0, 3)
      .map((d) => `• ${d.sponsor} → ${d.target}${d.sector ? ` (${d.sector})` : ""}: ${d.ev_ebitda_multiple?.toFixed(1)}x`).join("\n");
    const lede = c.editors_note;
    const lines = [
      lede?.headline ?? draft.subject,
      "",
      ...(lede?.paragraphs ?? []).slice(0, 2),
      stats ? `\nBy the numbers:\n${stats}` : "",
      deals ? `\nDisclosed multiples this ${c.edition === "weekly" ? "week" : "morning"}:\n${deals}` : "",
      "",
      `Full issue (free): ${url}`,
      "",
      "#privateequity #lowermiddlemarket #mergersandacquisitions",
    ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
    setPostText(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim());
    setPostCopied(false);
    setPostOpen(true);
  };
  const copyPost = async () => { await navigator.clipboard.writeText(postText); setPostCopied(true); setTimeout(() => setPostCopied(false), 1500); };

  // ---- editor queue ---------------------------------------------------------
  const [item, setItem] = useState({ kind: "on_the_market", headline: "", body: "", url: "", attribution: "" });
  const addItem = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("editor_items").insert({ kind: item.kind, headline: item.headline.trim(), body: item.body.trim() || null, url: item.url.trim() || null, attribution: item.attribution.trim() || null, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { setItem({ ...item, headline: "", body: "", url: "", attribution: "" }); qc.invalidateQueries({ queryKey: ["desk-queue"] }); toast({ title: "Queued for the next issue" }); },
    onError: (e) => toast({ title: "Couldn't add", description: String(e), variant: "destructive" }),
  });
  const removeItem = async (id: string) => {
    await supabase.from("editor_items").update({ status: "archived" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["desk-queue"] });
  };
  const promoteItem = async (q: EditorItemRow) => {
    // Strip identifying attribution unless the reader explicitly allowed it.
    const attribution = q.attribution_ok ? q.attribution : (q.submitted_by_role ? `Per a reader (${q.submitted_by_role.replace(/_/g, " ")})` : "Per a reader");
    await supabase.from("editor_items").update({ status: "queued", attribution }).eq("id", q.id);
    qc.invalidateQueries({ queryKey: ["desk-queue"] });
    toast({ title: "Queued for the next issue" });
  };

  const statusBadge = (s: string) => (
    <Badge variant={s === "sent" ? "default" : s === "approved" ? "secondary" : "outline"} className={cn("text-[10px] uppercase font-mono", s === "approved" && "border-accent-ink text-accent-ink")}>{s}</Badge>
  );

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      {/* Issue list */}
      <aside className="space-y-3">
        <Button className="w-full" variant="outline" disabled={!!busy} onClick={() => invoke("generate-newsletter", { force: true }, "Build")}>
          {busy === "Build" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}Build today's issue
        </Button>
        <div className="border-2 border-foreground divide-y divide-border/50">
          {issues.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {issues.data?.map((i) => (
            <button key={i.id} type="button" onClick={() => setSelectedId(i.id)} className={cn("w-full text-left p-3 hover:bg-secondary transition-colors", i.id === selectedId && "bg-secondary")}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-xs">#{i.issue_number}</span>
                {statusBadge(i.status)}
              </div>
              <p className="text-sm font-medium leading-snug line-clamp-2">{i.subject}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {new Date(i.sent_at ?? i.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {i.status === "sent" && i.recipient_count ? ` · ${i.recipient_count} sent · ${i.open_count ?? 0} opens` : ""}
              </p>
            </button>
          ))}
          {issues.data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">No issues yet. Build one.</p>}
        </div>
      </aside>

      {/* Editor */}
      <div className="space-y-6 min-w-0">
        {draft && selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">Issue #{selected.issue_number}</span>{statusBadge(selected.status)}
                {dirty && <span className="text-xs text-muted-foreground">unsaved</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreview(true)}><Eye className="h-4 w-4 mr-1" />Preview</Button>
                <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}><Mail className="h-4 w-4 mr-1" />Test email</Button>
                <Button size="sm" variant="outline" onClick={buildPost}><Share2 className="h-4 w-4 mr-1" />Post the Lede</Button>
                <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
                {selected.status === "draft" && <Button size="sm" onClick={() => setStatus("approved")}><Check className="h-4 w-4 mr-1" />Approve for 6am</Button>}
                {selected.status === "approved" && <Button size="sm" variant="outline" onClick={() => setStatus("draft")}>Un-approve</Button>}
                {selected.status !== "sent" && <Button size="sm" variant="destructive" onClick={sendNow} disabled={!!busy}><Send className="h-4 w-4 mr-1" />Send now</Button>}
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Subject & preheader</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input value={draft.subject} onChange={(e) => { setDraft({ ...draft, subject: e.target.value }); setDirty(true); }} className="font-medium" />
                <Input value={draft.preheader} placeholder="Preheader (shows after the subject in the inbox)" onChange={(e) => { setDraft({ ...draft, preheader: e.target.value }); setDirty(true); }} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">The Lede</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input value={draft.content.editors_note?.headline ?? ""} placeholder="Headline — a claim, not a topic" onChange={(e) => patch((c) => { c.editors_note = { ...(c.editors_note ?? { paragraphs: [] }), headline: e.target.value }; })} className="font-bold" />
                <Textarea rows={9} value={(draft.content.editors_note?.paragraphs ?? []).join("\n\n")} placeholder="Two or three paragraphs. Blank line between them." onChange={(e) => patch((c) => { c.editors_note = { ...(c.editors_note ?? { headline: "" }), paragraphs: e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) }; })} className="font-serif text-[15px] leading-relaxed" />
                <Input value={draft.content.closing_line ?? ""} placeholder="Closing line (sign-off)" onChange={(e) => patch((c) => { c.closing_line = e.target.value || null; })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">By the numbers</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => {
                  const s = draft.content.by_the_numbers[i] ?? { value: "", label: "", context: "" };
                  const set = (k: "value" | "label" | "context", v: string) => patch((c) => { while (c.by_the_numbers.length <= i) c.by_the_numbers.push({ value: "", label: "" }); c.by_the_numbers[i] = { ...c.by_the_numbers[i], [k]: v }; c.by_the_numbers = c.by_the_numbers.filter((x) => x.value || x.label); });
                  return (
                    <div key={i} className="space-y-1.5">
                      <Input value={s.value} placeholder="7.2x" onChange={(e) => set("value", e.target.value)} className="text-xl font-extrabold" />
                      <Input value={s.label} placeholder="Label" onChange={(e) => set("label", e.target.value)} />
                      <Input value={s.context ?? ""} placeholder="Context" onChange={(e) => set("context", e.target.value)} className="text-xs" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Headlines <span className="text-muted-foreground font-normal text-sm">({draft.content.top_headlines.length})</span></CardTitle></CardHeader>
                <CardContent>
                  {draft.content.top_headlines.map((a, i) => (
                    <Row key={a.id} onRemove={() => patch((c) => { c.top_headlines.splice(i, 1); })}>
                      <p className="font-medium leading-snug">{a.title}</p>
                      <Textarea rows={2} value={a.why_it_matters ?? ""} placeholder="Why it matters" onChange={(e) => patch((c) => { c.top_headlines[i].why_it_matters = e.target.value; })} className="mt-1 text-xs" />
                    </Row>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Deals <span className="text-muted-foreground font-normal text-sm">({draft.content.deal_tracker.length})</span></CardTitle></CardHeader>
                <CardContent>
                  {draft.content.deal_tracker.map((d, i) => (
                    <Row key={`${d.sponsor}-${d.target}`} onRemove={() => patch((c) => { c.deal_tracker.splice(i, 1); })}>
                      <div className="flex items-center gap-2">
                        <p className="font-medium leading-snug flex-1"><strong>{d.sponsor}</strong> → {d.target}</p>
                        <button type="button" className={cn("text-[10px] font-mono uppercase border px-1.5", d.featured ? "bg-foreground text-background" : "text-muted-foreground")} onClick={() => patch((c) => { c.deal_tracker.forEach((x, j) => { x.featured = j === i ? !x.featured : false; }); })}>Feature</button>
                      </div>
                      <Textarea rows={2} value={d.editor_take ?? ""} placeholder="Our read" onChange={(e) => patch((c) => { c.deal_tracker[i].editor_take = e.target.value; })} className="mt-1 text-xs" />
                    </Row>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Funds <span className="text-muted-foreground font-normal text-sm">({draft.content.fund_tracker.length})</span></CardTitle></CardHeader>
                <CardContent>
                  {draft.content.fund_tracker.map((f, i) => (
                    <Row key={`${f.firm}-${f.fund_name}`} onRemove={() => patch((c) => { c.fund_tracker.splice(i, 1); })}>
                      <p className="font-medium leading-snug">{f.firm} — {f.fund_name}</p>
                      <p className="text-xs text-muted-foreground">{f.status} · target {f.target_millions ?? "n/d"}M · raised {f.raised_millions ?? "n/d"}M</p>
                    </Row>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">People & macro</CardTitle></CardHeader>
                <CardContent>
                  {draft.content.people_moves.map((a, i) => (
                    <Row key={a.id} onRemove={() => patch((c) => { c.people_moves.splice(i, 1); })}><p className="leading-snug">{a.title} <span className="text-muted-foreground">{a.summary}</span></p></Row>
                  ))}
                  {draft.content.market_pulse.map((a, i) => (
                    <Row key={a.id} onRemove={() => patch((c) => { c.market_pulse.splice(i, 1); })}>
                      <p className="font-medium leading-snug">{a.title}</p>
                      <Textarea rows={2} value={a.why_it_matters ?? ""} placeholder="For the LMM" onChange={(e) => patch((c) => { c.market_pulse[i].why_it_matters = e.target.value; })} className="mt-1 text-xs" />
                    </Row>
                  ))}
                </CardContent>
              </Card>
            </div>

            {draft.content.the_read && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">The Read</CardTitle></CardHeader>
                <CardContent>
                  <Row onRemove={() => patch((c) => { c.the_read = null; })}>
                    <p className="font-medium">{draft.content.the_read.title}</p>
                    <Textarea rows={3} value={draft.content.the_read.take} onChange={(e) => patch((c) => { if (c.the_read) c.the_read.take = e.target.value; })} className="mt-1 text-xs" />
                  </Row>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Select an issue, or build today's.</p>
        )}

        {/* Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Editor queue <span className="text-muted-foreground font-normal text-sm">— queued items go into the next issue built; reader tips need a Queue click first</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-[180px_1fr] gap-3">
              <div>
                <Label className="font-mono text-[11px] uppercase tracking-wider">Section</Label>
                <Select value={item.kind} onValueChange={(v) => setItem({ ...item, kind: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{KINDS.find((k) => k.value === item.kind)?.hint}</p>
              </div>
              <div className="space-y-2">
                <Input value={item.headline} placeholder="Headline" onChange={(e) => setItem({ ...item, headline: e.target.value })} />
                <Textarea rows={2} value={item.body} placeholder="Detail (optional)" onChange={(e) => setItem({ ...item, body: e.target.value })} />
                <div className="grid sm:grid-cols-2 gap-2">
                  <Input value={item.url} placeholder="Link (optional)" onChange={(e) => setItem({ ...item, url: e.target.value })} />
                  <Input value={item.attribution} placeholder='Attribution, e.g. "a Midwest unitranche lender"' onChange={(e) => setItem({ ...item, attribution: e.target.value })} />
                </div>
                <Button size="sm" onClick={() => addItem.mutate()} disabled={!item.headline.trim() || addItem.isPending}><Plus className="h-4 w-4 mr-1" />Queue it</Button>
              </div>
            </div>
            {queue.data?.length ? (
              <div className="divide-y divide-border/50 border-t border-border/50">
                {queue.data.map((q) => (
                  <div key={q.id} className="flex items-start gap-3 py-2 text-sm">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase shrink-0">{KINDS.find((k) => k.value === q.kind)?.label ?? q.kind}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{q.headline}</p>
                      {q.body && <p className="text-muted-foreground text-xs">{q.body}</p>}
                      {q.status === "submitted" && (
                        <p className="text-[11px] text-accent-ink mt-1 font-mono">
                          READER TIP · {q.submitted_by_email}{q.submitted_by_role ? ` · ${q.submitted_by_role.replace(/_/g, " ")}` : ""}{q.attribution ? ` · wants credit as "${q.attribution}"${q.attribution_ok ? "" : " (not approved — will run anonymous)"}` : ""}
                        </p>
                      )}
                    </div>
                    {q.status === "submitted" && (
                      <Button size="sm" variant="outline" onClick={() => promoteItem(q)}><Check className="h-4 w-4 mr-1" />Queue</Button>
                    )}
                    <button type="button" onClick={() => removeItem(q.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">Nothing queued.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-2 sm:p-6">
          <DialogHeader><DialogTitle className="sr-only">Preview</DialogTitle></DialogHeader>
          {draft && selected && <IssueView content={draft.content} issueNumber={selected.issue_number} date={new Date(selected.sent_at ?? selected.created_at)} className="shadow-none" />}
        </DialogContent>
      </Dialog>

      {/* Post the Lede */}
      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Post the Lede</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">LinkedIn-ready. First line is the hook, link goes to the archive page. Edit, copy, paste. Post it the same morning the issue sends — the Lede is the free distribution channel.</p>
          <Textarea rows={16} value={postText} onChange={(e) => setPostText(e.target.value)} className="font-sans text-sm leading-relaxed" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">{postText.length} chars{postText.length > 3000 ? " — over LinkedIn's 3,000 limit" : ""}</span>
            <Button onClick={copyPost}>{postCopied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}{postCopied ? "Copied" : "Copy"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test email */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send a test</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Unsaved edits are saved first. The test renders exactly what subscribers get.</p>
          <Input type="email" value={testEmail} placeholder="you@firm.com" onChange={(e) => setTestEmail(e.target.value)} />
          <Button onClick={async () => { if (dirty) await save.mutateAsync(); await invoke("send-newsletter", { newsletter_id: selected?.id, test_email: testEmail }, "Test"); setTestOpen(false); }} disabled={!testEmail || !!busy}>
            {busy === "Test" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send test"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
