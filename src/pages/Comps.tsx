import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DEAL_TYPE_LABEL, DealRow, fmtMillions, fmtMultiple } from "@/lib/newsletter-content";
import { SECTOR_OPTIONS, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

type Row = DealRow & { id: string; announced_on: string | null };

const BANDS = [
  { label: "Any size", min: 0, max: Infinity },
  { label: "$2–5M", min: 2, max: 5 },
  { label: "$5–10M", min: 5, max: 10 },
  { label: "$10–25M", min: 10, max: 25 },
  { label: "$25M+", min: 25, max: Infinity },
];
const WINDOWS = [
  { label: "90 days", days: 90 },
  { label: "6 months", days: 182 },
  { label: "12 months", days: 365 },
  { label: "All", days: Infinity },
];
const TYPES: (DealRow["deal_type"] | "all")[] = ["all", "platform", "add-on", "recap", "exit", "growth", "carve-out"];

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export default function Comps() {
  const [sector, setSector] = useState<string>("Industrials");
  const [band, setBand] = useState(0);
  const [win, setWin] = useState(2);
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [copied, setCopied] = useState(false);

  useEffect(() => { document.title = `LMM comps | ${SITE.name}`; }, []);

  const deals = useQuery({
    queryKey: ["comps-deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*").not("ev_ebitda_multiple", "is", null).order("announced_on", { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const b = BANDS[band], w = WINDOWS[win];
    const cutoff = Number.isFinite(w.days) ? Date.now() - w.days * 86400000 : -Infinity;
    return (deals.data ?? []).filter((d) =>
      d.sector === sector &&
      (type === "all" || d.deal_type === type) &&
      (band === 0 || (d.ebitda_millions !== null && d.ebitda_millions >= b.min && d.ebitda_millions < b.max)) &&
      (!Number.isFinite(cutoff) || (d.announced_on ? new Date(d.announced_on).getTime() >= cutoff : false)),
    );
  }, [deals.data, sector, band, win, type]);

  const mults = useMemo(() => rows.map((d) => d.ev_ebitda_multiple as number).sort((a, b) => a - b), [rows]);
  const n = mults.length;
  const stats = n ? { median: quantile(mults, 0.5), p25: quantile(mults, 0.25), p75: quantile(mults, 0.75), lo: mults[0], hi: mults[n - 1] } : null;
  const thin = n > 0 && n < 5;

  const summary = stats
    ? `${sector}${type !== "all" ? ` ${DEAL_TYPE_LABEL[type as DealRow["deal_type"]].toLowerCase()}s` : ""}, ${BANDS[band].label === "Any size" ? "all sizes" : `${BANDS[band].label} EBITDA`}, last ${WINDOWS[win].label.toLowerCase()}: median ${fmtMultiple(stats.median)} EV/EBITDA, IQR ${fmtMultiple(stats.p25)}–${fmtMultiple(stats.p75)}, n=${n} disclosed. Source: The GP Pulse deal tracker, ${SITE.name === "The GP Pulse" ? "thegppulse.com/comps" : "/comps"}.`
    : "";

  const copy = async () => { await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-14 md:py-20 border-b-2 border-foreground">
          <div className="container max-w-5xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Comps</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">What lower middle market deals actually cleared at.</h1>
            <p className="font-serif text-muted-foreground max-w-2xl leading-relaxed">Pick a sector, an EBITDA band and a window. You get the median and interquartile range of <em>disclosed</em> EV/EBITDA multiples and the deals behind them. No estimates, no "sources say." Small samples are flagged.</p>
          </div>
        </section>

        <section className="py-10">
          <div className="container max-w-5xl mx-auto px-4">
            {/* Controls */}
            <div className="grid md:grid-cols-[1fr_auto] gap-6 mb-8">
              <div className="space-y-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Sector</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTOR_OPTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => setSector(s)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground transition-colors", sector === s ? "bg-foreground text-background" : "hover:bg-secondary")}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">EBITDA</p>
                    <div className="flex flex-wrap gap-1.5">{BANDS.map((b, i) => <button key={b.label} type="button" onClick={() => setBand(i)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground", band === i ? "bg-foreground text-background" : "hover:bg-secondary")}>{b.label}</button>)}</div>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Window</p>
                    <div className="flex flex-wrap gap-1.5">{WINDOWS.map((w, i) => <button key={w.label} type="button" onClick={() => setWin(i)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground", win === i ? "bg-foreground text-background" : "hover:bg-secondary")}>{w.label}</button>)}</div>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Type</p>
                    <div className="flex flex-wrap gap-1.5">{TYPES.map((t) => <button key={t} type="button" onClick={() => setType(t)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground", type === t ? "bg-foreground text-background" : "hover:bg-secondary")}>{t === "all" ? "All" : DEAL_TYPE_LABEL[t]}</button>)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Result */}
            {deals.isLoading ? (
              <Skeleton className="h-64 w-full border-2 border-foreground" />
            ) : !stats ? (
              <div className="border-2 border-foreground p-10 text-center">
                <p className="text-2xl font-extrabold tracking-tight mb-2">n = 0</p>
                <p className="font-serif text-muted-foreground max-w-md mx-auto">{deals.data?.length ? "No disclosed multiples match that filter. Widen the window or the band." : "The tracker fills in as issues go out. Disclosed multiples are rare in the LMM — expect a handful a week, not dozens."}</p>
              </div>
            ) : (
              <>
                <div className="border-2 border-foreground shadow-md">
                  <div className="grid sm:grid-cols-4 divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-foreground">
                    <div className="p-5 sm:col-span-1 bg-foreground text-background">
                      <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">Median EV/EBITDA</p>
                      <p className="text-5xl font-extrabold tracking-tight leading-none mt-2">{fmtMultiple(stats.median)}</p>
                      <p className="font-mono text-[11px] opacity-70 mt-2">n = {n} disclosed{thin ? " · small sample" : ""}</p>
                    </div>
                    {[["25th pct", stats.p25], ["75th pct", stats.p75], ["Range", null]].map(([l, v]) => (
                      <div key={l as string} className="p-5">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
                        <p className="text-3xl font-extrabold tracking-tight leading-none mt-2">{v === null ? `${fmtMultiple(stats.lo)}–${fmtMultiple(stats.hi)}` : fmtMultiple(v as number)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t-2 border-foreground p-4 bg-secondary flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <p className="text-sm font-serif leading-snug">{summary}</p>
                    <Button variant="outline" size="sm" onClick={copy} className="shrink-0">{copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}Copy for IC memo</Button>
                  </div>
                </div>
                {thin && <p className="text-xs text-destructive mt-3 font-mono">Fewer than five deals. Treat the median as anecdote, not benchmark.</p>}

                <div className="mt-8 border-2 border-foreground overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b-2 border-foreground bg-secondary font-mono text-[10px] uppercase tracking-wider text-left">
                      <th className="p-3">Date</th><th className="p-3">Sponsor</th><th className="p-3">Target</th><th className="p-3">Type</th><th className="p-3 text-right">EV</th><th className="p-3 text-right">EBITDA</th><th className="p-3 text-right">Multiple</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border/40">
                      {rows.map((d) => (
                        <tr key={d.id}>
                          <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{d.announced_on ? new Date(d.announced_on).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</td>
                          <td className="p-3 font-bold">{d.sponsor}</td>
                          <td className="p-3">{d.source_url ? <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="border-b border-foreground">{d.target}</a> : d.target}</td>
                          <td className="p-3 font-mono text-xs">{DEAL_TYPE_LABEL[d.deal_type]}</td>
                          <td className="p-3 text-right font-mono text-xs">{fmtMillions(d.enterprise_value_millions)}</td>
                          <td className="p-3 text-right font-mono text-xs">{fmtMillions(d.ebitda_millions)}</td>
                          <td className="p-3 text-right font-mono text-xs font-bold">{fmtMultiple(d.ev_ebitda_multiple)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground mt-3 font-mono">Only deals where a party disclosed EV and EBITDA (or the multiple itself). Everything else is in the <a href="/deals" className="underline">deal tracker</a> marked n/d.</p>

            <div className="mt-12 border-2 border-foreground p-8 bg-secondary grid lg:grid-cols-[1fr_380px] gap-6 items-center">
              <div>
                <h2 className="text-2xl font-bold">Every disclosed multiple, the morning it prints.</h2>
                <p className="font-serif text-muted-foreground mt-1">Plus a read on whether it's a comp or an outlier.</p>
              </div>
              <SubscribeForm source="comps-page" />
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
