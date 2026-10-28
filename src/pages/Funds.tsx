import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMillions, FUND_STATUS_LABEL, FundRow } from "@/lib/newsletter-content";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

type Row = FundRow & { id: string; announced_on: string | null; created_at: string };
const STATUSES: { value: FundRow["status"] | "all"; label: string }[] = [
  { value: "all", label: "All" }, { value: "launched", label: "In market" }, { value: "first_close", label: "First close" }, { value: "final_close", label: "Final close" }, { value: "oversubscribed", label: "Oversubscribed" },
];

export default function Funds() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  useEffect(() => { document.title = `Who's raising | ${SITE.name}`; }, []);

  const funds = useQuery({
    queryKey: ["public-funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funds").select("*").order("announced_on", { ascending: false }).limit(300);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const n = q.toLowerCase().trim();
    return (funds.data ?? []).filter((f) => (status === "all" || f.status === status) && (!n || `${f.firm} ${f.fund_name} ${f.strategy ?? ""} ${f.headquarters ?? ""}`.toLowerCase().includes(n)));
  }, [funds.data, q, status]);

  const inMarket = rows.filter((f) => f.status === "launched" || f.status === "first_close");
  const targetSum = inMarket.reduce((a, f) => a + (f.target_millions ?? 0), 0);
  const closed = rows.filter((f) => f.status === "final_close" || f.status === "oversubscribed");
  const raisedSum = closed.reduce((a, f) => a + (f.raised_millions ?? 0), 0);
  const monthsAgo = (d: string | null) => d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / (30 * 86400000))) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-14 md:py-20 border-b-2 border-foreground">
          <div className="container max-w-5xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Who's raising</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">Every sub-$1B fund we've tracked: in market, first close, final close.</h1>
            <p className="font-serif text-muted-foreground max-w-2xl leading-relaxed">Targets and amounts raised as disclosed by the firm or its placement agent. If you're an LP, this is the pipeline. If you're a GP, these are the vehicles you'll be bidding against in 18 months.</p>
          </div>
        </section>

        <section className="py-10">
          <div className="container max-w-5xl mx-auto px-4">
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {[
                [String(inMarket.length), "funds in market", targetSum ? `${fmtMillions(targetSum)} of disclosed targets` : "targets undisclosed"],
                [String(closed.length), "final closes tracked", raisedSum ? `${fmtMillions(raisedSum)} raised` : "amounts undisclosed"],
                [String(rows.filter((f) => f.status === "oversubscribed").length), "closed above target", "oversubscribed"],
              ].map(([v, l, c]) => (
                <div key={l} className="border-2 border-foreground p-4">
                  <p className="text-3xl font-extrabold tracking-tight">{v}</p>
                  <p className="font-bold text-sm mt-1">{l}</p>
                  <p className="text-xs text-muted-foreground">{c}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search firm, fund, strategy, city" className="border-2 border-foreground md:max-w-xs" />
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button key={s.value} type="button" onClick={() => setStatus(s.value)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground transition-colors", status === s.value ? "bg-foreground text-background" : "hover:bg-secondary")}>{s.label}</button>
                ))}
              </div>
            </div>

            {funds.isLoading ? (
              <Skeleton className="h-96 w-full border-2 border-foreground" />
            ) : rows.length === 0 ? (
              <div className="border-2 border-foreground p-10 text-center">
                <p className="font-serif text-muted-foreground">{funds.data?.length ? "Nothing matches that filter." : "Fills in as issues go out."}</p>
              </div>
            ) : (
              <div className="border-2 border-foreground overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-foreground bg-secondary font-mono text-[10px] uppercase tracking-wider text-left">
                      <th className="p-3">Firm / fund</th><th className="p-3">Strategy</th><th className="p-3">HQ</th><th className="p-3">Status</th>
                      <th className="p-3 text-right">Target</th><th className="p-3 text-right">Raised</th><th className="p-3 text-right">Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {rows.map((f) => {
                      const m = monthsAgo(f.announced_on ?? f.created_at);
                      return (
                        <tr key={f.id} className="hover:bg-secondary/60">
                          <td className="p-3"><span className="font-bold">{f.firm}</span><br /><span className="text-xs">{f.source_url ? <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="border-b border-foreground">{f.fund_name}</a> : f.fund_name}</span></td>
                          <td className="p-3 text-xs">{f.strategy ?? "—"}</td>
                          <td className="p-3 text-xs">{f.headquarters ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{FUND_STATUS_LABEL[f.status] ?? f.status}</td>
                          <td className={cn("p-3 text-right font-mono text-xs", !f.target_millions && "text-muted-foreground")}>{fmtMillions(f.target_millions)}</td>
                          <td className={cn("p-3 text-right font-mono text-xs font-bold", !f.raised_millions && "text-muted-foreground font-normal")}>{fmtMillions(f.raised_millions)}</td>
                          <td className="p-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">{m === null ? "—" : m === 0 ? "this month" : `${m} mo ago`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 font-mono">n/d = not disclosed. Status reflects the last announcement we saw, not a live check with the firm.</p>

            <div className="mt-12 border-2 border-foreground p-8 bg-secondary grid lg:grid-cols-[1fr_380px] gap-6 items-center">
              <div>
                <h2 className="text-2xl font-bold">Fund closes land in the morning issue first.</h2>
                <p className="font-serif text-muted-foreground mt-1">With a read on what the LP appetite says about your own raise.</p>
              </div>
              <SubscribeForm source="funds-page" />
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
