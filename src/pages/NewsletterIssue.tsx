import { useParams, Link } from "react-router-dom";
import { useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { IssueView } from "@/components/issue/IssueView";
import { useNewsletterIssue } from "@/hooks/useNewsletters";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NewsletterIssue = () => {
  const { id } = useParams<{ id: string }>();
  const { data: issue, isLoading, error } = useNewsletterIssue(id);
  const { toast } = useToast();

  useEffect(() => {
    if (!issue) return;
    document.title = `${issue.subject} | The GP Pulse`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", issue.preheader ?? `Issue #${issue.issue_number} of The GP Pulse — the lower middle market, every weekday morning.`);
    return () => { document.title = "The GP Pulse"; };
  }, [issue]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: issue?.subject, url }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-8 md:py-12">
          <div className="container max-w-3xl mx-auto px-4">
            <div className="flex items-center justify-between mb-6">
              <Link to="/archive">
                <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />All issues</Button>
              </Link>
              {issue && (
                <Button variant="outline" size="sm" onClick={share}><Share2 className="h-4 w-4 mr-1" />Share</Button>
              )}
            </div>

            {isLoading ? (
              <Skeleton className="h-[700px] w-full border-2 border-foreground" />
            ) : error || !issue ? (
              <div className="text-center py-16">
                <h2 className="text-2xl font-bold mb-2">Issue not found</h2>
                <p className="text-muted-foreground font-serif mb-6">This issue doesn't exist or hasn't gone out yet.</p>
                <Link to="/archive"><Button variant="outline">Browse the archive</Button></Link>
              </div>
            ) : (
              <>
                <h1 className="sr-only">{issue.subject}</h1>
                <IssueView content={issue.parsed} issueNumber={issue.issue_number} date={new Date(issue.sent_at ?? issue.created_at)} />

                <div className="mt-12 border-2 border-foreground p-8 bg-secondary">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold mb-2">Get the next one</p>
                  <h2 className="text-2xl font-bold mb-2">This lands in your inbox at 6am ET, every weekday.</h2>
                  <p className="text-muted-foreground font-serif mb-6">Deals with the terms that were actually disclosed. Sub-$1B funds. No mega-cap noise. Free.</p>
                  <div className="max-w-md"><SubscribeForm source="issue-page" /></div>
                </div>
              </>
            )}
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
};

export default NewsletterIssue;
