import { usePipeline } from "@/hooks/usePipeline";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Send, Zap, Loader2, CheckCircle2, XCircle, Clock, BarChart3 } from "lucide-react";

export function PipelinePanel() {
  const { running, lastResult, runPipeline, generateGPIndex } = usePipeline();

  type Run = { id: string; mode: string; success: boolean; steps: Json; started_at: string; completed_at: string | null };
  const runs = useQuery({
    queryKey: ["pipeline-runs", lastResult?.completed_at],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data as Run[];
    },
    refetchInterval: 60_000,
  });
  const stepsOf = (j: Json) => (Array.isArray(j) ? (j as unknown as { name: string; status: string; message?: string }[]) : []);

  const stepIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
      case "error": return <XCircle className="h-4 w-4 text-destructive" />;
      case "running": return <Loader2 className="h-4 w-4 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const stepLabel = (name: string) => {
    const labels: Record<string, string> = {
      "scrape-rss": "RSS feeds",
      "scrape-pe-sources": "Scrape firm newsrooms",
      "scrape-industry-news": "Scrape trades & wires",
      "scrape-people-moves": "People moves search",
      "process-content": "Classify & summarize",
      "generate-newsletter": "Draft the issue",
      "generate-gp-index": "GP Pulse Index",
      "send-newsletter": "Send",
      "send-deal-alerts": "Sector deal alerts",
    };
    return labels[name] || name;
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-bold">Full Pipeline</h3>
                <p className="text-sm text-muted-foreground">Scrape → Process → Generate</p>
              </div>
              <Button onClick={() => runPipeline("full")} disabled={running} className="w-full">
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Run Pipeline
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-bold">GP Pulse Index</h3>
                <p className="text-sm text-muted-foreground">Generate weekly deal stats</p>
              </div>
              <Button onClick={generateGPIndex} disabled={running} variant="outline" className="w-full">
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                Generate Index
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <Send className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-bold">Send Latest Draft</h3>
                <p className="text-sm text-muted-foreground">Send to all subscribers</p>
              </div>
              <Button onClick={() => runPipeline("send")} disabled={running} variant="outline" className="w-full">
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send Now
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <Play className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-bold">Pipeline + Send</h3>
                <p className="text-sm text-muted-foreground">Generate and immediately send</p>
              </div>
              <Button onClick={() => runPipeline("full-send")} disabled={running} variant="outline" className="w-full">
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Run & Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="font-medium">Build</p>
                <p className="text-sm text-muted-foreground">Scrape, classify, extract, draft. Sun–Thu. Runs from GitHub Actions.</p>
              </div>
              <Badge variant="outline">4:50 PM CT</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="font-medium">Editor review</p>
                <p className="text-sm text-muted-foreground">Rewrite the Lede, cut, feature, approve. Alerts fire on approve.</p>
              </div>
              <Badge variant="outline">evening</Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Send</p>
                <p className="text-sm text-muted-foreground">Approved issue only (unless AUTO_SEND). Mon–Fri.</p>
              </div>
              <Badge variant="outline">5:50 AM ET</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent runs (from pipeline_runs) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent>
          {runs.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : !runs.data?.length ? <p className="text-sm text-muted-foreground">No runs logged yet. The first scheduled build will appear here.</p>
          : (
            <div className="divide-y divide-border">
              {runs.data.map((r) => (
                <details key={r.id} className="py-2 group">
                  <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.success ? <CheckCircle2 className="h-4 w-4 text-chart-2 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                      <span className="font-mono text-xs">{new Date(r.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">{r.mode}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{stepsOf(r.steps).filter((x) => x.status === "error").length ? `${stepsOf(r.steps).filter((x) => x.status === "error").length} error(s)` : `${stepsOf(r.steps).length} steps`}</span>
                  </summary>
                  <div className="mt-2 pl-6 space-y-1.5">
                    {stepsOf(r.steps).map((st, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {stepIcon(st.status)}
                        <span className="font-medium shrink-0">{stepLabel(st.name)}</span>
                        <span className="text-muted-foreground truncate">{st.message}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Run Results */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Last Run Results
              <Badge variant={lastResult.success ? "default" : "destructive"}>
                {lastResult.success ? "Success" : "Errors"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lastResult.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  {stepIcon(step.status)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{stepLabel(step.name)}</p>
                    {step.message && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{step.message}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {step.status}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Completed: {new Date(lastResult.completed_at).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
