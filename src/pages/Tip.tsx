import { useEffect, useState } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_OPTIONS, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

const KINDS = [
  { value: "on_the_market", label: "A process", hint: "Something launching, a teaser you've seen, a founder taking calls. Size, sector, geography, timing." },
  { value: "overheard", label: "Something you heard", hint: "A lender quote, a multiple that surprised you, what an LP said at the annual meeting." },
  { value: "reader_question", label: "A question", hint: "Something you'd want other readers' take on. We'll run it and print the best answers." },
  { value: "job", label: "An open seat", hint: "Hiring at an LMM firm or a portfolio company. Title, location, who to contact." },
  { value: "event", label: "An event", hint: "A conference or dinner worth the airfare." },
];

export default function Tip() {
  const [form, setForm] = useState({ kind: "on_the_market", headline: "", body: "", url: "", email: "", role: "", attribution: "", attribution_ok: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { document.title = `Send a tip | ${SITE.name}`; }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("manage-subscribers", { body: { action: "submit-tip", ...form } });
    setBusy(false);
    if (error || data?.error) setErr(data?.error ?? "Something went wrong. Reply to any issue instead.");
    else setDone(data.message);
  };

  const kind = KINDS.find((k) => k.value === form.kind)!;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-16 md:py-24">
          <div className="container max-w-2xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Send a tip</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">Seen a process? Heard a number? Tell the room.</h1>
            <p className="font-serif text-muted-foreground leading-relaxed mb-8">
              Everything here is off the record. We print it attributed by role only ("per a Southeast M&A banker") unless you tick the box asking for credit. An editor reads every submission before anything runs, and nothing identifying a live, confidential process gets published without the sender's say-so.
            </p>

            {done ? (
              <div className="border-2 border-foreground p-8 bg-secondary">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">{done}</p>
                    <p className="text-sm text-muted-foreground mt-1">If it runs, you'll see it in the next issue. Thanks for making it better for everyone.</p>
                  </div>
                </div>
                <Button variant="outline" className="mt-6" onClick={() => { setDone(null); setForm({ ...form, headline: "", body: "", url: "" }); }}>Send another</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="border-2 border-foreground p-6 md:p-8 space-y-6">
                <div>
                  <Label className="font-mono text-[11px] uppercase tracking-wider">What is it?</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {KINDS.map((k) => (
                      <button key={k.value} type="button" onClick={() => setForm({ ...form, kind: k.value })}
                        className={cn("text-xs px-3 py-1.5 border-2 border-foreground transition-colors", form.kind === k.value ? "bg-foreground text-background" : "hover:bg-secondary")}>
                        {k.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{kind.hint}</p>
                </div>

                <div>
                  <Label htmlFor="headline" className="font-mono text-[11px] uppercase tracking-wider">The one-liner</Label>
                  <Input id="headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder={form.kind === "on_the_market" ? "Specialty distributor, Southeast, ~$9M EBITDA, process launching next week" : "What's the line?"} className="mt-1 border-2 border-foreground" maxLength={160} required />
                </div>
                <div>
                  <Label htmlFor="body" className="font-mono text-[11px] uppercase tracking-wider">Detail <span className="normal-case text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea id="body" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Anything that helps a reader act on it. Leave out names you don't want printed." className="mt-1 border-2 border-foreground" maxLength={1200} />
                </div>
                <div>
                  <Label htmlFor="url" className="font-mono text-[11px] uppercase tracking-wider">Link <span className="normal-case text-muted-foreground font-normal">(optional)</span></Label>
                  <Input id="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" className="mt-1 border-2 border-foreground" />
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t-2 border-foreground">
                  <div className="pt-4">
                    <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-wider">Your email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@yourfirm.com" className="mt-1 border-2 border-foreground" required />
                    <p className="text-[11px] text-muted-foreground mt-1">Never printed. So we can follow up if something's unclear.</p>
                  </div>
                  <div className="pt-4">
                    <Label className="font-mono text-[11px] uppercase tracking-wider">Your seat</Label>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full h-10 border-2 border-foreground bg-background px-3 text-sm">
                      <option value="">Pick one</option>
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">This is how we attribute it: "per a lender."</p>
                  </div>
                </div>

                <div>
                  <label className="flex items-start gap-3 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.attribution_ok} onChange={(e) => setForm({ ...form, attribution_ok: e.target.checked })} className="mt-1 accent-black" />
                    <span>Credit me by name or firm. <span className="text-muted-foreground">Default is anonymous.</span></span>
                  </label>
                  {form.attribution_ok && (
                    <Input value={form.attribution} onChange={(e) => setForm({ ...form, attribution: e.target.value })} placeholder="How to credit you, e.g. Jane Doe, Harbor Point Capital" className="mt-2 border-2 border-foreground" />
                  )}
                </div>

                {err && <p className="text-sm text-destructive">{err}</p>}
                <Button type="submit" disabled={busy || form.headline.trim().length < 10 || !form.email}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send it"}</Button>
              </form>
            )}
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
