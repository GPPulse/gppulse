import { SITE } from "@/lib/site";

const faqs = [
  {
    q: "Is it free?",
    a: "Yes. The daily issue is free and will stay free. If we ever add a paid product it'll be something separate, like the deal database or the quarterly multiples report, and current subscribers will hear first.",
  },
  {
    q: "How is this different from PE Hub, Axios Pro Rata or PitchBook?",
    a: "Those are good at the whole market. This is only the lower middle market. Mega-cap firms are filtered out by rule, fund coverage stops at $1B, and every deal figure is disclosed or marked undisclosed. The Lede is an opinion from a working GP, not a wire summary.",
  },
  {
    q: "Who writes it?",
    a: `${SITE.editor.name}, ${SITE.editor.title.toLowerCase()}. Software does the gathering overnight. A person writes the Lede, picks what makes the cut, and signs it.`,
  },
  {
    q: "Can I send you a deal, a process, or a tip?",
    a: "Please. Reply to any issue or use the tip form at /tip. Everything is off the record and attributed by role only unless you say otherwise. If you're a banker with a process launching, \"On the market\" is read by exactly the buyers you want.",
  },
  {
    q: "What's the conflict-of-interest policy?",
    a: "The editor is a partner at an active PE firm. The newsletter doesn't cover deals or processes that firm is party to while they're live, and it doesn't take payment for placement. Nothing here is investment advice.",
  },
];

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
                <li><span className="font-mono text-muted-foreground mr-2">evening</span>A draft lands on the editor's desk: deals extracted with disclosed figures only, funds, moves, macro.</li>
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
