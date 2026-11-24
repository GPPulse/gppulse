import { SITE } from "@/lib/site";

import { PRINCIPLES as principles } from "../../../api/_lib/copy.js";

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
