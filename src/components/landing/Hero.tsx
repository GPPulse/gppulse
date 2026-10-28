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
              The lower middle market, before the market opens.
            </h1>
            <p className="text-lg md:text-xl text-foreground/80 font-serif leading-relaxed max-w-xl">
              A briefing for the people who buy, lend to and sell {SITE.focus.ebitdaRange} companies. The deals that
              printed and what they cleared at. Which sub-$1B funds are in market. Who moved. The credit moves that
              change your leverage math. Written by a GP, read in six minutes.
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
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Lower middle market, every weekday</p>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground text-right">6:00am ET</p>
            </div>
            <ul className="divide-y divide-border/40 text-sm">
              {[
                ["The Lede", "The one thing that matters today, and the mechanism behind it."],
                ["Deal tracker", "Sponsor, target, type, sector. EV and multiple only if disclosed."],
                ["On the market", "Processes launching, teasers circulating. Off the record."],
                ["Fund tracker", "Sub-$1B closes and launches, with the actual numbers."],
                ["Macro & credit", "SOFR, spreads, the 10-year, translated into your leverage math."],
                ["People moves", "Who left, who landed, who got the title."],
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
