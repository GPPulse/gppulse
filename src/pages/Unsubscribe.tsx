import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type State = { kind: "loading" } | { kind: "done"; email: string } | { kind: "error"; message: string } | { kind: "resubscribed" };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) { setState({ kind: "error", message: "This link is missing its token. Use the unsubscribe link at the bottom of any issue." }); return; }
    supabase.functions.invoke("manage-subscribers", { body: { action: "unsubscribe-token", token } }).then(({ data, error }) => {
      if (error || data?.error) setState({ kind: "error", message: data?.error ?? "We couldn't find that subscription." });
      else setState({ kind: "done", email: data.email });
    });
  }, [token]);

  const resubscribe = async () => {
    if (!token) return;
    const { data } = await supabase.functions.invoke("manage-subscribers", { body: { action: "update-preferences", token, status: "active" } });
    if (data?.subscriber) setState({ kind: "resubscribed" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-24">
          <div className="container max-w-xl mx-auto px-4 text-center">
            {state.kind === "loading" && <Loader2 className="h-6 w-6 animate-spin mx-auto" />}
            {state.kind === "done" && (
              <>
                <h1 className="text-3xl font-bold mb-3">You're unsubscribed.</h1>
                <p className="font-serif text-muted-foreground mb-2">{state.email} won't get The GP Pulse anymore. No hard feelings.</p>
                <p className="text-sm text-muted-foreground mb-8">If this was a mistake, or you'd rather get it less often, we can fix that.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button onClick={resubscribe}>Resubscribe</Button>
                  <Link to={`/preferences?token=${token}`}><Button variant="outline">Adjust preferences instead</Button></Link>
                </div>
              </>
            )}
            {state.kind === "resubscribed" && (
              <>
                <h1 className="text-3xl font-bold mb-3">Welcome back.</h1>
                <p className="font-serif text-muted-foreground mb-8">Next issue lands at 6am ET.</p>
                <Link to="/archive"><Button variant="outline">Read the archive</Button></Link>
              </>
            )}
            {state.kind === "error" && (
              <>
                <h1 className="text-3xl font-bold mb-3">Hmm.</h1>
                <p className="font-serif text-muted-foreground mb-8">{state.message}</p>
                <Link to="/"><Button variant="outline">Back home</Button></Link>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
