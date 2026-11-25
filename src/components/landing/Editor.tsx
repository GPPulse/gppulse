import { SITE } from "@/lib/site";

import { FAQS as faqs } from "../../../api/_lib/copy.js";

export const Editor = () => {
  return (
    <section className="py-16 md:py-24 border-b-2 border-foreground">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">The editor</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight mb-5">{SITE.editor.name}</h2>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">{SITE.editor.title}</p>
            <p className="font-serif text-[17px] leading-relaxed text-foreground/85">{SITE.editor.bio}</p>
            <div className="mt-8 border-2 border-foreground p-5 bg-secondary">
              <p className="font-mono text-[11px] uppercase tracking-wider font-bold mb-2">How an issue gets made</p>
              <ol className="text-sm space-y-2 text-foreground/85">
                <li><span className="font-mono text-muted-foreground mr-2">17:00 CT</span>Software reads hundreds of PE firm newsrooms, the wires and the trades. Mega-caps and non-North American items are discarded.</li>
                <li><span className="font-mono text-muted-foreground mr-2">evening</span>A draft lands on the editor's desk: below-the-radar finds, announced deals with our file on each party, funds, moves. Figures only when disclosed.</li>
                <li><span className="font-mono text-muted-foreground mr-2">evening</span>The editor writes the Lede, cuts what doesn't belong, adds what readers sent in, and approves.</li>
                <li><span className="font-mono text-muted-foreground mr-2">06:00 ET</span>It sends. Reply goes to a person.</li>
              </ol>
            </div>
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Questions</p>
            <div className="divide-y-2 divide-foreground border-y-2 border-foreground">
              {faqs.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-4 font-bold text-[15px] leading-snug">
                    {f.q}
                    <span className="font-mono text-muted-foreground group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="text-sm text-foreground/80 leading-relaxed mt-3 pr-8">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
