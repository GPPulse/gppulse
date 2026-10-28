import { Link } from "react-router-dom";
import { IssueView } from "@/components/issue/IssueView";
import { useLatestIssue } from "@/hooks/useNewsletters";
import { SAMPLE_ISSUE } from "@/lib/sample-issue";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const SampleNewsletter = () => {
  const { data: latest } = useLatestIssue();
  const isReal = Boolean(latest);
  const content = latest?.parsed ?? SAMPLE_ISSUE;
  const issueNumber = latest?.issue_number ?? 1;
  const date = latest ? new Date(latest.sent_at ?? latest.created_at) : new Date();

  return (
    <section className="py-16 md:py-24 border-b-2 border-foreground bg-secondary">
      <div className="container max-w-3xl mx-auto px-4">
        <div className="mb-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">
            {isReal ? "Latest issue" : "What an issue looks like"}
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
            {isReal ? latest!.subject : "Six minutes. Every section earns its place."}
          </h2>
          {!isReal && (
            <p className="font-serif text-muted-foreground mt-3 leading-relaxed">
              Firms, targets and figures below are illustrative. The format, the length and the voice are exactly what lands in your inbox.
            </p>
          )}
        </div>

        <IssueView content={content} issueNumber={issueNumber} date={date} />

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {isReal ? "Every issue is archived and shareable." : "First real issues land in the archive as they go out."}
          </p>
          <Link to="/archive">
            <Button variant="outline">Browse the archive<ArrowRight className="h-4 w-4 ml-2" /></Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
