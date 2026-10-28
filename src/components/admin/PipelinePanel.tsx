import { usePipeline } from "@/hooks/usePipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Send, Zap, Loader2, CheckCircle2, XCircle, Clock, BarChart3 } from "lucide-react";

export function PipelinePanel() {
  const { running, lastResult, runPipeline, generateGPIndex } = usePipeline();

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
      scrape: "Scrape PE Sources",
      "people-moves": "People Moves Search",
      process: "AI Content Processing",
      generate: "Generate Newsletter",
      "gp-index": "Generate GP Pulse Index",
      send: "Send Newsletter",
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
                <p className="font-medium">Content Pipeline</p>
                <p className="text-sm text-muted-foreground">Scrape, process, generate newsletter draft</p>
              </div>
              <Badge variant="outline">5:00 PM CT</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="font-medium">Admin Review Window</p>
                <p className="text-sm text-muted-foreground">Review and edit the generated draft</p>
              </div>
              <Badge variant="outline">5:00 – 6:30 PM CT</Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Newsletter Send</p>
                <p className="text-sm text-muted-foreground">Send to all active subscribers</p>
              </div>
              <Badge variant="outline">7:00 PM CT</Badge>
            </div>
          </div>
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
