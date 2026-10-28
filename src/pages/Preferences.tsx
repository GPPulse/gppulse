import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ROLE_OPTIONS, SECTOR_OPTIONS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface Prefs { email: string; first_name: string | null; company: string | null; role: string | null; status: string; referral_code: string | null; sectors: string[] }

export default function Preferences() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) { setError("This link is missing its token. Use the preferences link at the bottom of any issue."); return; }
    supabase.functions.invoke("manage-subscribers", { body: { action: "get-preferences", token } }).then(({ data, error }) => {
      if (error || data?.error) setError(data?.error ?? "We couldn't find that subscription.");
      else setPrefs({ ...data.subscriber, sectors: data.subscriber.sectors ?? [] });
    });
  }, [token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs || !token) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-subscribers", {
      body: { action: "update-preferences", token, first_name: prefs.first_name ?? "", company: prefs.company ?? "", role: prefs.role, sectors: prefs.sectors ?? [], status: prefs.status === "active" ? "active" : undefined },
    });
    setSaving(false);
    if (error || data?.error) toast({ title: "Couldn't save", variant: "destructive" });
    else toast({ title: "Saved" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-16 md:py-24">
          <div className="container max-w-xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold mb-2">Preferences</p>
            <h1 className="text-3xl font-bold mb-2">Make it fit your seat.</h1>
            <p className="font-serif text-muted-foreground mb-8">Your first name goes on the morning greeting. Your role shapes what we lead with. Sectors turn on deal alerts.</p>

            {error && (
              <div className="border-2 border-foreground p-6">
                <p className="font-serif mb-4">{error}</p>
                <Link to="/"><Button variant="outline">Back home</Button></Link>
              </div>
            )}
            {!error && !prefs && <Loader2 className="h-6 w-6 animate-spin" />}
            {prefs && (
              <form onSubmit={save} className="space-y-6 border-2 border-foreground p-6">
                <div>
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Email</Label>
                  <p className="mt-1 text-sm">{prefs.email}</p>
                  {prefs.status !== "active" && (
                    <p className="text-xs text-destructive mt-1">
                      Currently {prefs.status}. <button type="button" className="underline" onClick={() => setPrefs({ ...prefs, status: "active" })}>Resubscribe</button> and save.
                    </p>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fn" className="font-mono text-[11px] uppercase tracking-wider">First name</Label>
                    <Input id="fn" value={prefs.first_name ?? ""} onChange={(e) => setPrefs({ ...prefs, first_name: e.target.value })} className="mt-1 border-2 border-foreground" />
                  </div>
                  <div>
                    <Label htmlFor="co" className="font-mono text-[11px] uppercase tracking-wider">Firm</Label>
                    <Input id="co" value={prefs.company ?? ""} onChange={(e) => setPrefs({ ...prefs, company: e.target.value })} className="mt-1 border-2 border-foreground" />
                  </div>
                </div>
                <div>
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Your seat</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ROLE_OPTIONS.map((o) => (
                      <button key={o.value} type="button" onClick={() => setPrefs({ ...prefs, role: o.value })}
                        className={cn("text-xs px-3 py-1.5 border-2 border-foreground transition-colors", prefs.role === o.value ? "bg-foreground text-background" : "hover:bg-secondary")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Deal alerts</Label>
                  <p className="text-xs text-muted-foreground mt-1">Pick sectors and you'll get a one-paragraph note the evening a deal in that sector prints with a disclosed multiple. Separate from the daily. Leave empty for none.</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SECTOR_OPTIONS.map((sct) => {
                      const on = prefs.sectors.includes(sct);
                      return (
                        <button key={sct} type="button" onClick={() => setPrefs({ ...prefs, sectors: on ? prefs.sectors.filter((x) => x !== sct) : [...prefs.sectors, sct] })}
                          className={cn("text-xs px-3 py-1.5 border-2 border-foreground transition-colors", on ? "bg-foreground text-background" : "hover:bg-secondary")}>
                          {sct}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-2">
                  <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
                  <div className="text-xs text-muted-foreground space-x-3">
                    {prefs.referral_code && <Link to={`/referrals?code=${prefs.referral_code}`} className="underline">Referrals</Link>}
                    <Link to={`/unsubscribe?token=${token}`} className="underline">Unsubscribe</Link>
                  </div>
                </div>
              </form>
            )}
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
