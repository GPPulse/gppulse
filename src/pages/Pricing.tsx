import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Copy, Check } from "lucide-react";

type Quarter = {
  quarter_end: string;
  new_n: number;
  new_p25: number | null;
  new_median: number | null;
  new_p75: number | null;
  book_n: number;
  book_median: number | null;
  lenders: number;
  new_median_tenor_years: number | null;
  last_filed: string | null;
};
type Summary = { quarters: Quarter[]; latest_quarter_end: string | null; buckets: { bucket: number; n: number }[] };

const BUCKET_LABELS = ["Under 4.50%", "4.50–4.99%", "5.00–5.49%", "5.50–5.99%", "6.00–6.49%", "6.50–6.99%", "7.00% and over"];
const THIN = 20;

const pct = (v: number | null) => (v === null || v === undefined ? "n/a" : `${Number(v).toFixed(2)}%`);
const bps = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}bp`;
// Dates arrive as YYYY-MM-DD; parse the parts so the quarter doesn't shift with the reader's time zone.
const parts = (iso: string) => iso.split("-").map(Number);
const quarterLabel = (iso: string) => { const [y, m] = parts(iso); return `Q${Math.ceil(m / 3)} ${y}`; };
const dayLabel = (iso: string) => { const [y, m, d] = parts(iso); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

export default function Pricing() {
  const [copied, setCopied] = useState(false);
  useEffect(() => { document.title = `LMM loan pricing | ${SITE.name}`; }, []);

  const q = useQuery({
    queryKey: ["lmm-pricing"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("lmm_pricing_summary");
      if (error) throw error;
      return data as Summary;
    },
  });

  const quarters = q.data?.quarters ?? [];
  const latest = quarters.find((x) => x.quarter_end === q.data?.latest_quarter_end) ?? null;
  const prior = latest ? quarters.find((x) => x.quarter_end < latest.quarter_end && x.new_n > 0) ?? null : null;
  const buckets = q.data?.buckets ?? [];
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));
  const vsBook = latest && latest.new_median !== null && latest.book_median !== null ? latest.new_median - latest.book_median : null;
  const vsPrior = latest && prior && latest.new_median !== null && prior.new_median !== null ? latest.new_median - prior.new_median : null;
  const priorThin = !!prior && prior.new_n < THIN;

  const summary = latest
    ? `New first-lien loans, ${quarterLabel(latest.quarter_end)}: median spread ${pct(latest.new_median)} over SOFR, IQR ${pct(latest.new_p25)}–${pct(latest.new_p75)}, n=${latest.new_n} loans across ${latest.lenders} lenders' filings. Source: The GP Pulse, thegppulse.com/pricing.`
    : "";
  const copy = async () => { await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-14 md:py-20 border-b-2 border-foreground">
          <div className="container max-w-5xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Loan pricing</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">What new first-lien loans actually priced at.</h1>
            <p className="font-serif text-muted-foreground max-w-2xl leading-relaxed">Spreads over SOFR on loans that appeared for the first time in a lender's quarterly schedule of investments. Taken from the filings, loan by loan. No surveys, no "market talk." Small samples are flagged.</p>
          </div>
        </section>

        <section className="py-10">
          <div className="container max-w-5xl mx-auto px-4">
            {q.isLoading ? (
              <Skeleton className="h-64 w-full border-2 border-foreground" />
            ) : q.isError ? (
              <div className="border-2 border-foreground p-10 text-center">
                <p className="text-2xl font-extrabold tracking-tight mb-2">Couldn't load the numbers</p>
                <p className="font-serif text-muted-foreground max-w-md mx-auto">Try again in a minute.</p>
              </div>
            ) : !latest ? (
              <div className="border-2 border-foreground p-10 text-center">
                <p className="text-2xl font-extrabold tracking-tight mb-2">n = 0</p>
                <p className="font-serif text-muted-foreground max-w-md mx-auto">No new loans with a disclosed spread on file yet. This page fills in as lenders file each quarter.</p>
              </div>
            ) : (
              <>
                <div className="border-2 border-foreground shadow-md">
                  <div className="grid sm:grid-cols-4 divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-foreground">
                    <div className="p-5 bg-foreground text-background">
                      <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">Median spread · {quarterLabel(latest.quarter_end)}</p>
                      <p className="text-5xl font-extrabold tracking-tight leading-none mt-2">{pct(latest.new_median)}</p>
                      <p className="font-mono text-[11px] opacity-70 mt-2">n = {latest.new_n} new loans{latest.new_n < THIN ? " · small sample" : ""}</p>
                    </div>
                    <div className="p-5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Middle half</p>
                      <p className="text-3xl font-extrabold tracking-tight leading-none mt-2">{pct(latest.new_p25)}–{pct(latest.new_p75)}</p>
                      <p className="font-mono text-[11px] text-muted-foreground mt-2">25th to 75th percentile</p>
                    </div>
                    <div className="p-5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">New vs. existing book</p>
                      <p className="text-3xl font-extrabold tracking-tight leading-none mt-2">{vsBook === null ? "n/a" : bps(vsBook)}</p>
                      <p className="font-mono text-[11px] text-muted-foreground mt-2">Book median {pct(latest.book_median)} · {latest.book_n} loans</p>
                    </div>
                    <div className="p-5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Median tenor</p>
                      <p className="text-3xl font-extrabold tracking-tight leading-none mt-2">{latest.new_median_tenor_years === null ? "n/a" : `${Number(latest.new_median_tenor_years).toFixed(1)} yrs`}</p>
                      <p className="font-mono text-[11px] text-muted-foreground mt-2">Quarter end to maturity</p>
                    </div>
                  </div>
                  <div className="border-t-2 border-foreground p-4 bg-secondary flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <p className="text-sm font-serif leading-snug">{summary}</p>
                    <Button variant="outline" size="sm" onClick={copy} className="shrink-0">{copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}Copy for IC memo</Button>
                  </div>
                </div>
                {vsPrior !== null && prior && (
                  <p className="text-xs mt-3 font-mono text-muted-foreground">
                    {bps(vsPrior)} against {quarterLabel(prior.quarter_end)} ({pct(prior.new_median)}, n = {prior.new_n}).
                    {priorThin ? ` The earlier quarter rests on ${prior.new_n} loans from ${prior.lenders} lender${prior.lenders === 1 ? "" : "s"}, so read the change as direction, not size.` : ""}
                  </p>
                )}

                <h2 className="text-xl font-bold mt-10 mb-3">Where the {latest.new_n} loans landed</h2>
                <div className="border-2 border-foreground p-5">
                  <div className="space-y-2">
                    {BUCKET_LABELS.map((label, i) => {
                      const n = buckets.find((b) => b.bucket === i + 1)?.n ?? 0;
                      return (
                        <div key={label} className="grid grid-cols-[120px_1fr_36px] items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground">{label}</span>
                          <div className="h-5 bg-secondary"><div className="h-5 bg-foreground" style={{ width: `${(n / maxBucket) * 100}%` }} /></div>
                          <span className="font-mono text-xs font-bold text-right">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 font-mono">Spread over SOFR, new first-lien loans, {quarterLabel(latest.quarter_end)}.</p>
                </div>

                <h2 className="text-xl font-bold mt-10 mb-3">By quarter</h2>
                <div className="border-2 border-foreground overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b-2 border-foreground bg-secondary font-mono text-[10px] uppercase tracking-wider text-left">
                      <th className="p-3">Quarter</th><th className="p-3 text-right">New loans</th><th className="p-3 text-right">25th</th><th className="p-3 text-right">Median</th><th className="p-3 text-right">75th</th><th className="p-3 text-right">Book median</th><th className="p-3 text-right">Lenders</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border/40">
                      {quarters.map((x) => (
                        <tr key={x.quarter_end}>
                          <td className="p-3 font-bold whitespace-nowrap">{quarterLabel(x.quarter_end)}{x.new_n > 0 && x.new_n < THIN ? <span className="font-mono text-[10px] font-normal text-destructive ml-2">small sample</span> : null}</td>
                          <td className="p-3 text-right font-mono text-xs">{x.new_n}</td>
                          <td className="p-3 text-right font-mono text-xs">{pct(x.new_p25)}</td>
                          <td className="p-3 text-right font-mono text-xs font-bold">{pct(x.new_median)}</td>
                          <td className="p-3 text-right font-mono text-xs">{pct(x.new_p75)}</td>
                          <td className="p-3 text-right font-mono text-xs">{pct(x.book_median)}</td>
                          <td className="p-3 text-right font-mono text-xs">{x.lenders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-8 font-serif text-sm text-muted-foreground max-w-3xl space-y-2 leading-relaxed">
              <p><strong className="text-foreground">How to read it.</strong> A loan counts as new when it shows up in a lender's schedule of investments and wasn't in that lender's previous filing. That catches loans made in the quarter. It also catches the occasional loan bought from another holder, so treat the count as an upper bound on originations.</p>
              <p>First-lien only. Venture lenders are left out. Spreads below 2% or above 12% are dropped as filing noise or non-cash-pay paper. A loan held by two lenders counts twice. These are loans to sponsor-backed and other private companies of every size the lenders serve, so the median leans toward the upper end of the lower middle market. Floors, OID and fees aren't in the schedules and aren't in these numbers.</p>
              {latest?.last_filed && <p className="font-mono text-xs">Latest filing read: {dayLabel(latest.last_filed)}. Updated as each quarter's filings arrive.</p>}
            </div>

            <div className="mt-12 border-2 border-foreground p-8 bg-secondary grid lg:grid-cols-[1fr_380px] gap-6 items-center">
              <div>
                <h2 className="text-2xl font-bold">The credit numbers that change your leverage math.</h2>
                <p className="font-serif text-muted-foreground mt-1">In the issue every weekday, with the deals behind them.</p>
              </div>
              <SubscribeForm source="pricing-page" />
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
