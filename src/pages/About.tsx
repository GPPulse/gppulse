import { useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Editor } from "@/components/landing/Editor";
import { SITE } from "@/lib/site";

export default function About() {
  useEffect(() => { document.title = `About | ${SITE.name}`; }, []);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-16 md:py-24 border-b-2 border-foreground">
          <div className="container max-w-3xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">About</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-6">A briefing for the part of private equity that does most of the deals and gets the least coverage.</h1>
            <div className="font-serif text-[17px] leading-relaxed space-y-4 text-foreground/85">
              <p>Most of private equity by deal count happens below $100M of enterprise value. Most of the coverage doesn't. The trades follow the funds with PR teams; the wires print whatever lands on them. If you run a {SITE.focus.fundCap.replace("funds ", "")} fund and buy {SITE.focus.ebitdaRange} companies, the news about your market is scattered across nine hundred firm newsrooms and a dozen regional bankers' inboxes.</p>
              <p>The GP Pulse gathers it every night, throws out everything that isn't lower middle market, extracts the deals and funds into a table with only the figures that were disclosed, and puts it in front of an editor who has done this for a living. He writes a short opinion on the one thing that matters, cuts what doesn't belong, and it sends at six.</p>
              <p>It is free, it is weekdays only, and it does not take money for placement.</p>
            </div>

            <div className="mt-12 grid sm:grid-cols-3 gap-4">
              {[
                ["Coverage", `${SITE.focus.geography}. ${SITE.focus.ebitdaRange} targets. ${SITE.focus.fundCap}.`],
                ["Figures", "Disclosed only. Undisclosed is marked undisclosed. No estimates, no \"sources say.\""],
                ["Conflicts", "The editor's firm and its live processes are excluded from coverage. Nothing here is investment advice."],
              ].map(([k, v]) => (
                <div key={k} className="border-2 border-foreground p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider font-bold mb-1.5">{k}</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <Editor />
        <Footer />
      </main>
    </div>
  );
}
