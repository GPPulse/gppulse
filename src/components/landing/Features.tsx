import { SITE } from "@/lib/site";

const principles = [
  {
    n: "01",
    title: "Lower middle market only. By rule, not by vibe.",
    body: "Apollo, Blackstone, KKR and the rest of the mega-cap list are filtered out before a human ever sees the draft. If a fund is over $1B or a deal is a $4B take-private, it isn't in here. Your competitors are, and so are the firms you'll be bidding against next quarter.",
  },
  {
    n: "02",
    title: "If we print a multiple, someone disclosed it.",
    body: "No estimated EBITDA, no inferred EV, no \"sources say roughly 9x.\" The Deal tracker shows the figures that were actually released and says \"undisclosed\" when they weren't. You've seen enough made-up comps.",
  },
  {
    n: "03",
    title: "Written by someone who's sat on your side of the table.",
    body: `${SITE.editor.name} is a partner at a lower middle market firm. The Lede is a point of view, tagged with how much conviction is behind it. When the material is thin, it says so instead of manufacturing significance.`,
  },
  {
    n: "04",
    title: "Reply, and a person reads it.",
    body: "Processes you're seeing, a lender quote worth repeating, a hire we missed. The best replies become the \"On the market\" and \"Overheard\" sections, attributed by role, never by name.",
  },
];

export const Features = () => {
  return (
    <section className="py-16 md:py-24 border-b-2 border-foreground">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-[280px_1fr] gap-10 lg:gap-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Why this one</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
              There's plenty of PE news. Very little of it is about your market.
            </h2>
            <p className="font-serif text-muted-foreground mt-4 leading-relaxed">
              Trade press skews to the funds with the biggest PR budgets. This doesn't.
            </p>
          </div>
          <div className="divide-y-2 divide-foreground border-y-2 border-foreground">
            {principles.map((p) => (
              <div key={p.n} className="grid sm:grid-cols-[56px_1fr] gap-3 py-6">
                <span className="font-mono text-sm text-muted-foreground pt-1">{p.n}</span>
                <div>
                  <h3 className="text-lg md:text-xl font-bold leading-snug mb-2">{p.title}</h3>
                  <p className="text-[15px] text-foreground/80 leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
