import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Share2, Trophy, Target, Users, Gift, ArrowRight, CheckCircle } from "lucide-react";

interface Milestone {
  threshold: number;
  label: string;
  reward: string;
}

interface ReferralDashboardData {
  referral_code: string;
  masked_email: string;
  first_name: string | null;
  referral_count: number;
  recent_referrals: { date: string }[];
  earned_milestones: Milestone[];
  next_milestone: Milestone | null;
  milestones: Milestone[];
}

export default function Referrals() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [data, setData] = useState<ReferralDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const fetchDashboard = async (referralCode: string) => {
    if (!referralCode.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-subscribers?action=referral-dashboard&code=${encodeURIComponent(referralCode.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          setError("Referral code not found. Please check your code and try again.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        setData(null);
        return;
      }

      const result = await response.json();
      setData(result);
    } catch {
      setError("Failed to load referral data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialCode = searchParams.get("code");
    if (initialCode) {
      setCode(initialCode);
      fetchDashboard(initialCode);
    }
  }, [searchParams]);

  const referralLink = data ? `${window.location.origin}/?ref=${data.referral_code}` : null;

  const handleCopy = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!", description: "Share it with your PE network." });
    }
  };

  const milestoneIcons = [Gift, Target, Trophy, Users];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-12 md:py-20">
          <div className="container max-w-2xl mx-auto px-4">
            <div className="text-center mb-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-3">Referral Program</h1>
              <p className="text-muted-foreground font-serif text-lg">
                Share The GP Pulse with your network and unlock exclusive PE intelligence.
              </p>
            </div>

            {/* Code Lookup */}
            {!data && (
              <Card className="border-2 border-foreground shadow-sm mb-8">
                <CardHeader>
                  <CardTitle className="text-lg">Enter Your Referral Code</CardTitle>
                  <CardDescription>
                    Find your code in any GP Pulse email or after subscribing.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      fetchDashboard(code);
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g. a1b2c3d4"
                      className="font-mono border-2 border-foreground"
                    />
                    <Button type="submit" disabled={loading || !code.trim()}>
                      {loading ? "Loading..." : "Look Up"}
                    </Button>
                  </form>
                  {error && (
                    <p className="text-destructive text-sm mt-3">{error}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {loading && !data && (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            )}

            {data && (
              <div className="space-y-6">
                {/* Stats Overview */}
                <Card className="border-2 border-foreground shadow-sm">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {data.first_name ? `Hi, ${data.first_name}` : data.masked_email}
                        </p>
                        <p className="text-4xl font-bold">{data.referral_count}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.referral_count === 1 ? "referral" : "referrals"} so far
                        </p>
                      </div>
                      <div className="text-right">
                        {data.earned_milestones.length > 0 && (
                          <Badge className="text-xs">
                            {data.earned_milestones[data.earned_milestones.length - 1].label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Progress to next milestone */}
                    {data.next_milestone && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{data.referral_count} referrals</span>
                          <span>{data.next_milestone.threshold} needed</span>
                        </div>
                        <div className="w-full h-3 border-2 border-foreground bg-secondary">
                          <div
                            className="h-full bg-foreground transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (data.referral_count / data.next_milestone.threshold) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {data.next_milestone.threshold - data.referral_count} more to unlock: <strong>{data.next_milestone.reward}</strong>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Share Link */}
                <Card className="border-2 border-foreground shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Share2 className="h-4 w-4" />
                      Your Referral Link
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-3">
                      <Input
                        value={referralLink || ""}
                        readOnly
                        className="text-xs font-mono border-2 border-foreground"
                      />
                      <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                        {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I read The GP Pulse daily for lower middle market PE intelligence. Join me: ${referralLink}`)}`, "_blank")}
                      >
                        Share on X
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink || "")}`, "_blank")}
                      >
                        Share on LinkedIn
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`mailto:?subject=${encodeURIComponent("Check out The GP Pulse")}&body=${encodeURIComponent(`I've been reading The GP Pulse for daily PE intelligence. Worth checking out: ${referralLink}`)}`, "_blank")}
                      >
                        Email a friend
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Milestone Rewards */}
                <Card className="border-2 border-foreground shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Milestone Rewards
                    </CardTitle>
                    <CardDescription>
                      Unlock exclusive PE content as you refer more professionals.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {data.milestones.map((milestone, i) => {
                        const earned = data.referral_count >= milestone.threshold;
                        const Icon = milestoneIcons[i] || Gift;
                        return (
                          <div
                            key={milestone.threshold}
                            className={`flex items-center gap-3 p-3 border-2 ${
                              earned ? "border-foreground bg-secondary" : "border-border"
                            }`}
                          >
                            <Icon className={`h-5 w-5 shrink-0 ${earned ? "text-foreground" : "text-muted-foreground"}`} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className={`font-bold text-sm ${earned ? "" : "text-muted-foreground"}`}>
                                  {milestone.label}
                                </p>
                                <Badge variant={earned ? "default" : "outline"} className="text-xs">
                                  {milestone.threshold} referrals
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{milestone.reward}</p>
                            </div>
                            {earned && <CheckCircle className="h-4 w-4 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Referrals */}
                {data.recent_referrals.length > 0 && (
                  <Card className="border-2 border-foreground shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Recent Referrals</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {data.recent_referrals.map((ref, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              New subscriber joined{" "}
                              {new Date(ref.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="text-center">
                  <Button variant="outline" onClick={() => { setData(null); setCode(""); }}>
                    Look up a different code
                  </Button>
                </div>
              </div>
            )}

            {/* How it works (always visible) */}
            {!data && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-center">How It Works</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { step: "1", title: "Subscribe", desc: "Sign up for The GP Pulse and get your unique referral link." },
                    { step: "2", title: "Share", desc: "Send your link to PE professionals in your network." },
                    { step: "3", title: "Earn", desc: "Unlock exclusive content as your referrals hit milestones." },
                  ].map((item) => (
                    <Card key={item.step} className="border-2 border-foreground text-center">
                      <CardContent className="pt-6">
                        <div className="w-10 h-10 border-2 border-foreground flex items-center justify-center mx-auto mb-3 font-bold">
                          {item.step}
                        </div>
                        <p className="font-bold mb-1">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="text-center">
                  <Link to="/">
                    <Button size="lg">
                      Subscribe Now
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
