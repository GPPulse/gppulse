import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DEAL_TYPE_LABEL } from "@/lib/newsletter-content";
import { LeagueDeal, rankSponsors } from "@/lib/league";
import { SECTOR_OPTIONS, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
  { label: "All", days: Infinity },
];
const day = (iso: string | null) => {
  if (!iso) return "n/a";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function Sponsors() {
  const [win, setWin] = useState(1);
  const [sector, setSector] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { document.title = `Most active sponsors | ${SITE.name}`; }, []);

  const deals = useQuery({
    queryKey: ["league-deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*").eq("hidden", false).order("announced_on", { ascending: false }).limit(2000);
      if (error) throw error;
      return data as unknown as LeagueDeal[];
    },
  });

  const { lines, total } = useMemo(() => {
    const w = WINDOWS[win];
    const cutoff = Number.isFinite(w.days) ? new Date(Date.now() - w.days * 86400000).toISOString().slice(0, 10) : "";
    const inScope = (deals.data ?? []).filter((d) => (!cutoff || (d.announced_on ?? "") >= cutoff) && (sector === "All" || d.sector === sector));
    const needle = q.toLowerCase().trim();
    return { lines: rankSponsors(inScope).filter((l) => !needle || l.sponsor.toLowerCase().includes(needle)), total: inScope.length };
  }, [deals.data, win, sector, q]);

  const repeat = lines.filter((l) => l.deals.length >= 2).length;
  const shown = q ? lines : lines.slice(0, 100);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-14 md:py-20 border-b-2 border-foreground">
          <div className="container max-w-5xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Sponsors</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">Who is actually doing deals in the lower middle market.</h1>
            <p className="font-serif text-muted-foreground max-w-2xl leading-relaxed">Sponsors ranked by the deals in our tracker: platforms, add-ons and exits, including the ones that never got a press release. Counts are deals we found, not deals done; a quiet firm may simply announce less.</p>
          </div>
        </section>

        <section className="py-10">
          <div className="container max-w-5xl mx-auto px-4">
            <div className="flex flex-wrap gap-6 mb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Window</p>
                <div className="flex flex-wrap gap-1.5">{WINDOWS.map((w, i) => <button key={w.label} type="button" onClick={() => setWin(i)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground", win === i ? "bg-foreground text-background" : "hover:bg-secondary")}>{w.label}</button>)}</div>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Sector</p>
                <div className="flex flex-wrap gap-1.5">{["All", ...SECTOR_OPTIONS].map((s) => <button key={s} type="button" onClick={() => setSector(s)} className={cn("text-xs px-2.5 py-1.5 border-2 border-foreground", sector === s ? "bg-foreground text-background" : "hover:bg-secondary")}>{s}</button>)}</div>
              </div>
            </div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a sponsor" className="max-w-sm mb-6 border-2 border-foreground rounded-none" />

            {deals.isLoading ? (
              <Skeleton className="h-64 w-full border-2 border-foreground" />
            ) : !lines.length ? (
              <div className="border-2 border-foreground p-10 text-center">
                <p className="text-2xl font-extrabold tracking-tight mb-2">n = 0</p>
                <p className="font-serif text-muted-foreground max-w-md mx-auto">No tracked deals match. Widen the window or clear the sector.</p>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-3 border-2 border-foreground divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-foreground mb-6">
                  {[["Deals tracked", total], ["Sponsors", lines.length], ["With two or more", repeat]].map(([l, v]) => (
                    <div key={l as string} className="p-5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
                      <p className="text-3xl font-extrabold tracking-tight leading-none mt-2">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="border-2 border-foreground overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b-2 border-foreground bg-secondary font-mono text-[10px] uppercase tracking-wider text-left">
                      <th className="p-3 w-10">#</th><th className="p-3">Sponsor</th><th className="p-3 text-right">Deals</th><th className="p-3 text-right">Platforms</th><th className="p-3 text-right">Add-ons</th><th className="p-3 text-right">Exits</th><th className="p-3 text-right">No release</th><th className="p-3">Most in</th><th className="p-3 text-right">Latest</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border/40">
                      {shown.map((l, i) => (
                        <Fragment key={l.sponsor}>
                          <tr className="cursor-pointer hover:bg-secondary/60" onClick={() => setOpen(open === l.sponsor ? null : l.sponsor)} aria-expanded={open === l.sponsor}>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-bold">{l.sponsor}</td>
                            <td className="p-3 text-right font-mono text-xs font-bold">{l.deals.length}</td>
                            <td className="p-3 text-right font-mono text-xs">{l.platforms || ""}</td>
                            <td className="p-3 text-right font-mono text-xs">{l.addOns || ""}</td>
                            <td className="p-3 text-right font-mono text-xs">{l.exits || ""}</td>
                            <td className="p-3 text-right font-mono text-xs">{l.quiet || ""}</td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{l.topSector ?? ""}</td>
                            <td className="p-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">{day(l.latest)}</td>
                          </tr>
                          {open === l.sponsor && (
                            <tr className="bg-secondary/40">
                              <td />
                              <td colSpan={8} className="p-3">
                                <ul className="space-y-1.5">
                                  {l.deals.map((d) => (
                                    <li key={d.id} className="text-sm">
                                      <span className="font-mono text-[11px] text-muted-foreground mr-2">{day(d.announced_on)} · {DEAL_TYPE_LABEL[d.deal_type] ?? "Deal"}</span>
                                      {d.source_url ? <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="border-b border-foreground font-bold">{d.target}</a> : <span className="font-bold">{d.target}</span>}
                                      {d.platform ? <span className="text-muted-foreground"> · add-on to {d.platform}</span> : null}
                                      {d.below_radar ? <span className="font-mono text-[10px] uppercase tracking-wider ml-2 border border-foreground px-1">no release</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!q && lines.length > shown.length && <p className="text-xs text-muted-foreground mt-3 font-mono">Showing the top {shown.length} of {lines.length}. Search to find the rest.</p>}
              </>
            )}
            <p className="text-xs text-muted-foreground mt-3 font-mono">Co-sponsors each get credit for a shared deal. Click a row for the deals behind it. Full list in the <a href="/deals" className="underline">deal tracker</a>.</p>

            <div className="mt-12 border-2 border-foreground p-8 bg-secondary grid lg:grid-cols-[1fr_380px] gap-6 items-center">
              <div>
                <h2 className="text-2xl font-bold">The deals behind these counts, the morning we find them.</h2>
                <p className="font-serif text-muted-foreground mt-1">Including the ones nobody announced.</p>
              </div>
              <SubscribeForm source="sponsors-page" />
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
