import { SubscribeForm } from "./SubscribeForm";
import { SITE } from "@/lib/site";

// Real deals from the Nov 19, 2026 draft. Swap these when a sharper set comes through.
const RADAR = [
  { type: "Add-on", text: <><strong>Linx Partners</strong> adds Palmetto State Transportation</>, meta: "Found on a banker tombstone · no press release" },
  { type: "Recap", text: <><strong>Ridgemont Equity Partners</strong> recaps SRM</>, meta: "Found in local press" },
];
const TRACKER = [
  { type: "Platform", text: <><strong>Tonka Bay Equity Partners</strong> acquires AFI Industries</>, meta: "Industrials · IL" },
  { type: "Add-on", text: <><strong>Compass Group Equity Partners</strong> adds Cahaba</>, meta: "Healthcare · AL" },
];

const DealLine = ({ d }: { d: (typeof RADAR)[number] }) => (
  <div className="mt-3 leading-snug">
    <span className="inline-block text-[11px] font-semibold border border-foreground rounded px-1.5 mr-2">{d.type}</span>
    <span className="text-sm">{d.text}</span>
    <span className="block font-mono text-[11px] text-muted-foreground mt-0.5">{d.meta}</span>
  </div>
);

export const Hero = () => {
  return (
    <section id="subscribe" className="bg-foreground text-background border-b-2 border-foreground scroll-mt-16">
      <div className="container max-w-6xl mx-auto px-4 py-14 md:py-24">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-[56px] font-extrabold tracking-tight leading-[1.04] text-balance">
              {SITE.tagline}
            </h1>
            <p className="text-lg md:text-xl text-background/75 leading-relaxed max-w-xl mt-5">
              The {SITE.focus.ebitdaRange} deals that never get a press release, the sub-$1B funds in market, who moved
              where, and the credit numbers that change your leverage math. Ten minutes, before the open.
            </p>

            <div className="mt-8 max-w-lg bg-background text-foreground p-5 md:p-6 border-2 border-background shadow-[10px_10px_0_0_rgba(255,255,255,0.18)]">
              <p className="font-bold text-lg mb-3">Get tomorrow's issue</p>
              <SubscribeForm source="hero" />
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-background/70">
              <li>1,500+ sponsors watched daily</li>
              <li>Weekdays at 6am ET</li>
              <li>Written by a GP</li>
              <li>Free</li>
            </ul>
          </div>

          {/* What lands in the inbox */}
          <div>
            <article className="bg-background text-foreground border-2 border-background lg:rotate-[0.6deg]" aria-label="Sample of an issue">
              <div className="px-5 py-4 border-b-2 border-foreground flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Issue #14</p>
                  <p className="font-extrabold text-xl tracking-tight">The GP Pulse</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">Nov 19, 2026</p>
              </div>
              <div className="px-5 py-4 border-b-2 border-foreground">
                <span className="inline-block text-xs font-semibold px-3 py-1 rounded-md bg-foreground text-background">Below the Radar</span>
                {RADAR.map((d, i) => <DealLine key={i} d={d} />)}
              </div>
              <div className="px-5 py-4">
                <span className="inline-block text-xs font-semibold px-3 py-1 rounded-md bg-secondary">Deal Tracker</span>
                {TRACKER.map((d, i) => <DealLine key={i} d={d} />)}
              </div>
            </article>
            <p className="text-xs text-background/50 mt-3 text-right">Deals from the Nov 19 draft.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
