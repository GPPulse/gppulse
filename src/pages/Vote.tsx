import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";
import { Loader2 } from "lucide-react";

interface Result { question: string; options: string[]; voted: number | null; closed: boolean; total: number; counts: number[] | null }

export default function Vote() {
  const [params] = useSearchParams();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Your answer | ${SITE.name}`;
    const poll_id = params.get("p"), option = Number(params.get("o")), token = params.get("t");
    if (!poll_id || !token || Number.isNaN(option)) { setError("This link is incomplete. Use one of the answer links in the issue."); return; }
    supabase.functions.invoke("manage-subscribers", { body: { action: "vote", poll_id, option, token } }).then(({ data, error }) => {
      if (error || data?.error) setError(data?.error ?? "We couldn't record that. Try the link again.");
      else setResult(data as Result);
    });
  }, [params]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-16 md:py-24">
          <div className="container max-w-xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold mb-2">One question</p>
            {error && <div className="border-2 border-foreground p-6"><p className="font-serif mb-4">{error}</p><Link to="/"><Button variant="outline">Back home</Button></Link></div>}
            {!error && !result && <Loader2 className="h-6 w-6 animate-spin" />}
            {result && (
              <>
                <h1 className="text-3xl font-bold mb-2">{result.question}</h1>
                <p className="font-serif text-muted-foreground mb-6">
                  {result.closed ? "This one has closed, so your click wasn't counted." : <>Counted: <strong className="text-foreground">{result.options[result.voted ?? 0]}</strong>. Click a different answer in the email to change it.</>}
                </p>
                <div className="border-2 border-foreground p-6">
                  {result.counts ? (
                    <div className="space-y-3">
                      {result.options.map((o, i) => {
                        const pct = Math.round(((result.counts as number[])[i] / Math.max(result.total, 1)) * 100);
                        return (
                          <div key={o}>
                            <div className="flex justify-between text-sm"><span className={i === result.voted ? "font-bold" : ""}>{o}</span><span className="font-mono text-xs font-bold">{pct}%</span></div>
                            <div className="h-2 bg-secondary mt-1"><div className="h-2 bg-foreground" style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })}
                      <p className="font-mono text-xs text-muted-foreground pt-2">{result.total} answers so far. Final numbers in next Tuesday's issue.</p>
                    </div>
                  ) : (
                    <p className="font-serif text-muted-foreground">Results show once ten readers have answered, and run in next Tuesday's issue. Answers are counted, never attributed.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
