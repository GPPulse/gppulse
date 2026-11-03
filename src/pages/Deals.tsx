import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DEAL_TYPE_LABEL, DealRow, fmtMillions, fmtMultiple } from "@/lib/newsletter-content";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

type Row = DealRow & { id: string; announced_on: string | null };

const SECTORS = ["All", "Industrials", "Business Services", "Healthcare", "Technology", "Consumer", "Financial Services", "Energy", "Aerospace & Defense", "Infrastructure", "Other"];

export default function Deals() {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [disclosedOnly, setDisclosedOnly] = useState(false);

  useEffect(() => { document.title = `Deal tracker | ${SITE.name}`; }, []);

  const deals = useQuery({
    queryKey: ["public-deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*").eq("hidden", false).order("announced_on", { ascending: false }).limit(300);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return (deals.data ?? []).filter((d) =>
      (sector === "All" || d.sector === sector) &&
      (!disclosedOnly || d.figures_disclosed) &&
      (!needle || `${d.sponsor} ${d.target} ${d.summary ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [deals.data, q, sector, disclosedOnly]);

  const disclosed = rows.filter((d) => d.ev_ebitda_multiple);
  const median = disclosed.length
    ? [...disclosed].sort((a, b) => (a.ev_ebitda_multiple ?? 0) - (b.ev_ebitda_multiple ?? 0))[Math.floor(disclosed.length / 2)].ev_ebitda_multiple
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-14 md:py-20 border-b-2 border-foreground">
          <div className="container max-w-5xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Deal tracker</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">Every LMM deal we've covered, with the terms that were actually disclosed.</h1>
            <p className="font-serif text-muted-foreground max-w-2xl leading-relaxed">Sponsor, target, type and sector for all of them. EV, EBITDA and multiple only where a party released them. Updated with each issue.</p>
          </div>
        </section>

        <section className="py-10">
          <div className="container max-w-5xl mx-auto px-4">
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {[
                [String(rows.length), "deals tracked", "in current filter"],
                [String(disclosed.length), "with disclosed multiples", `${rows.length ? Math.round((100 * disclosed.length) / rows.length) : 0}% of the sample`],
                [median ? fmtMultiple(median) : "n/d", "median disclosed EV/EBITDA", disclosed.length < 5 ? "small sample — treat with care" : "disclosed deals only"],
              ].map(([v, l, c]) => (
                <div key={l} className="border-2 border-foreground p-4">
                  <p className="text-3xl font-extrabold tracking-tight">{v}</p>
                  <p className="font-bold text-sm mt-1">{l}</p>
                  <p className="text-xs text-muted-foreground">{c}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sponsor or target" className="border-2 border-foreground md:max-w-xs" />
              <div className="flex flex-wrap gap-1.5">
                {SECTORS.map((s) => (
                  <button key={s} type="button" onClick={() => setSector(s)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground transition-colors", sector === s ? "bg-foreground text-background" : "hover:bg-secondary")}>{s}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs md:ml-auto cursor-pointer">
                <input type="checkbox" checked={disclosedOnly} onChange={(e) => setDisclosedOnly(e.target.checked)} className="accent-black" />
                Disclosed terms only
              </label>
            </div>

            {deals.isLoading ? (
              <Skeleton className="h-96 w-full border-2 border-foreground" />
            ) : rows.length === 0 ? (
              <div className="border-2 border-foreground p-10 text-center">
                <p className="font-serif text-muted-foreground">{deals.data?.length ? "Nothing matches that filter." : "The tracker fills in as issues go out. Subscribe and you'll see the first ones land."}</p>
              </div>
            ) : (
              <div className="border-2 border-foreground overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-foreground bg-secondary font-mono text-[10px] uppercase tracking-wider text-left">
                      <th className="p-3">Date</th><th className="p-3">Sponsor</th><th className="p-3">Target</th><th className="p-3">Type</th><th className="p-3">Sector</th>
                      <th className="p-3 text-right">EV</th><th className="p-3 text-right">EBITDA</th><th className="p-3 text-right">Multiple</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {rows.map((d) => (
                      <tr key={d.id} className="hover:bg-secondary/60">
                        <td className="p-3 font-mono text-xs whitespace-nowrap text-muted-foreground">{d.announced_on ? new Date(d.announced_on).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</td>
                        <td className="p-3 font-bold">{d.sponsor}</td>
                        <td className="p-3">{d.source_url ? <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="border-b border-foreground">{d.target}</a> : d.target}</td>
                        <td className="p-3 font-mono text-xs">{DEAL_TYPE_LABEL[d.deal_type] ?? d.deal_type}</td>
                        <td className="p-3 text-xs">{d.sector ?? "—"}</td>
                        <td className={cn("p-3 text-right font-mono text-xs", !d.enterprise_value_millions && "text-muted-foreground")}>{fmtMillions(d.enterprise_value_millions)}</td>
                        <td className={cn("p-3 text-right font-mono text-xs", !d.ebitda_millions && "text-muted-foreground")}>{fmtMillions(d.ebitda_millions)}</td>
                        <td className={cn("p-3 text-right font-mono text-xs font-bold", !d.ev_ebitda_multiple && "text-muted-foreground font-normal")}>{fmtMultiple(d.ev_ebitda_multiple)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 font-mono">n/d = not disclosed. We don't estimate. Want medians by sector and size? <a href="/comps" className="underline">Comps</a>.</p>

            <div className="mt-12 border-2 border-foreground p-8 bg-secondary grid lg:grid-cols-[1fr_380px] gap-6 items-center">
              <div>
                <h2 className="text-2xl font-bold">Get the deals as they print.</h2>
                <p className="font-serif text-muted-foreground mt-1">Each one lands in the morning issue with a read on what it means.</p>
              </div>
              <SubscribeForm source="deals-page" />
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
