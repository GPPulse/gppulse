import { SubscribeForm } from "./SubscribeForm";

export const ClosingCta = () => (
  <section className="bg-foreground text-background border-b-2 border-foreground">
    <div className="container max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">Start tomorrow morning.</h2>
      <p className="text-background/75 mt-4 max-w-xl mx-auto">
        Join the GPs, independent sponsors, lenders and bankers who read The GP Pulse before the market opens.
      </p>
      <div className="mt-8 max-w-lg mx-auto bg-background text-foreground p-5 md:p-6 text-left">
        <SubscribeForm source="closing" />
      </div>
    </div>
  </section>
);
