import { SubscribeForm } from "./SubscribeForm";
import { SITE } from "@/lib/site";

export const Hero = () => {
  return (
    <section id="subscribe" className="py-20 md:py-28 border-b-2 border-foreground">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
          <div className="space-y-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold">
              Weekday mornings · 6:00am ET · Free
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-[58px] font-extrabold tracking-tight leading-[1.02]">
              The lower-middle-market deals nobody announced.
            </h1>
            <p className="text-lg md:text-xl text-foreground/80 font-serif leading-relaxed max-w-xl">
              Most {SITE.focus.ebitdaRange} deals never get a press release. We find them anyway: on 680 bankers'
              closing lists, in 50 trade journals and local papers, on 860 sponsors' portfolio pages, in SEC filings.
              Then we tell you what our archive knows about every party. Written by a GP, read in six minutes.
            </p>
            <div className="max-w-md">
              <SubscribeForm source="hero" />
            </div>
            <p className="text-sm text-muted-foreground">
              Built for deal teams, independent sponsors, lenders and bankers. No mega-cap noise, by rule.
            </p>
          </div>

          {/* Masthead card */}
          <div className="border-2 border-foreground shadow-md bg-background">
            <div className="px-5 py-4 border-b-2 border-foreground flex items-end justify-between">
              <div>
                <p className="font-extrabold tracking-tight">THE GP PULSE</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">The LMM deals nobody announced</p>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground text-right">6:00am ET</p>
            </div>
            <ul className="divide-y divide-border/40 text-sm">
              {[
                ["Below the radar", "Deals with no press release, found on banker tombstones, trade press, portfolio pages and filings."],
                ["The file", "Under every deal: the sponsor's pace, the platform's add-on count, the banks they close with, the fund they're investing from."],
                ["The Lede", "One pattern from our own tracker, and the mechanism behind it."],
                ["The scoreboard", "Busiest sponsors, banks posting closings, platforms stacking add-ons."],
                ["Fund tracker", "Sub-$1B closes and launches, including the ones only the SEC knows about."],
                ["On the market", "Processes launching, teasers circulating. Off the record."],
              ].map(([k, v]) => (
                <li key={k} className="px-5 py-3 grid grid-cols-[120px_1fr] gap-3">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider pt-0.5">{k}</span>
                  <span className="text-foreground/80 leading-snug">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};
