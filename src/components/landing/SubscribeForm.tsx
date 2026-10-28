import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, Check, Copy } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ROLE_OPTIONS, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

interface Props {
  source?: string;
  compact?: boolean;
}

export const SubscribeForm = ({ source = "web", compact }: Props) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState<null | { referral_code: string; prefs_token?: string; existing: boolean }>(null);
  const [role, setRole] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      toast({ title: "That email doesn't look right", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "add", email: clean, referral_code: refCode || undefined, source },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDone({
        referral_code: data?.subscriber?.referral_code ?? "",
        prefs_token: data?.subscriber?.prefs_token,
        existing: data?.message === "Subscriber already exists",
      });
    } catch (err) {
      console.error(err);
      toast({ title: "Something went wrong", description: "Try again in a minute.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const pickRole = async (value: string) => {
    setRole(value);
    if (!done?.prefs_token) return;
    await supabase.functions.invoke("manage-subscribers", { body: { action: "update-preferences", token: done.prefs_token, role: value } });
  };

  const referralLink = done?.referral_code ? `${window.location.origin}/?ref=${done.referral_code}` : null;
  const copy = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (done) {
    return (
      <div className="space-y-4 text-left">
        <div className="flex items-start gap-3 p-4 border-2 border-foreground bg-secondary">
          <Check className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">{done.existing ? "You're already on the list." : "You're in. First issue hits at 6am ET."}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {done.existing ? "Check your inbox tomorrow morning." : "A short welcome note is on its way. Drag it to Primary so we don't land in Promotions."}
            </p>
          </div>
        </div>

        {!done.existing && done.prefs_token && (
          <div className="border-2 border-foreground p-4">
            <p className="font-bold text-sm mb-1">One question so the issue fits you</p>
            <p className="text-xs text-muted-foreground mb-3">What's your seat?</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pickRole(o.value)}
                  className={cn(
                    "text-xs px-3 py-1.5 border-2 border-foreground transition-colors",
                    role === o.value ? "bg-foreground text-background" : "hover:bg-secondary",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {referralLink && (
          <div className="border-2 border-foreground p-4 space-y-2">
            <p className="font-bold text-sm">Know a GP who'd read this?</p>
            <p className="text-xs text-muted-foreground">
              {SITE.referralMilestones[0].threshold} referrals unlocks the {SITE.referralMilestones[0].reward.toLowerCase()}. Your link:
            </p>
            <div className="flex gap-2">
              <Input value={referralLink} readOnly className="text-xs font-mono border-2 border-foreground" />
              <Button variant="outline" size="icon" onClick={copy} className="shrink-0" aria-label="Copy referral link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <a href={`/referrals?code=${done.referral_code}`} className="text-xs font-medium underline hover:text-muted-foreground">Track your referrals →</a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {refCode && <p className="text-xs text-muted-foreground text-center">A subscriber sent you. Good company.</p>}
      <form onSubmit={handleSubmit} className={cn("flex gap-2", compact ? "flex-row" : "flex-col sm:flex-row")}>
        <Input
          type="email"
          placeholder="you@yourfirm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-base border-2 border-foreground px-4 flex-1"
          disabled={isLoading}
          autoComplete="email"
          required
        />
        <Button type="submit" size="lg" className="h-12 px-6 font-medium shadow-sm hover:shadow-md transition-shadow" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Subscribe<ArrowRight className="h-4 w-4 ml-2" /></>}
        </Button>
      </form>
      {!compact && <p className="text-xs text-muted-foreground text-center">Free. Weekday mornings. One click to leave.</p>}
    </div>
  );
};
