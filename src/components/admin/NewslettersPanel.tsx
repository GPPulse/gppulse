import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePipeline } from "@/hooks/usePipeline";
import { Mail, Eye, Send, ExternalLink } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface Article {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  source_url: string;
  fund_size_relevant: boolean;
  why_it_matters?: string;
}

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface NewsletterContent {
  market_data?: MarketQuote[];
  top_headlines?: Article[];
  fund_tracker?: Article[];
  people_moves?: Article[];
  market_pulse?: Article[];
}

interface Newsletter {
  id: string;
  subject: string;
  issue_number: number;
  status: string;
  content: NewsletterContent;
  created_at: string;
  sent_at: string | null;
  open_count: number | null;
  click_count: number | null;
}

function parseContent(raw: Json): NewsletterContent {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as unknown as NewsletterContent;
  }
  return {};
}

export function NewslettersPanel() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewNl, setPreviewNl] = useState<Newsletter | null>(null);
  const [testEmailOpen, setTestEmailOpen] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const { sendTestEmail, sendNewsletter } = usePipeline();

  const fetchNewsletters = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("newsletters")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setNewsletters(
        data.map((n) => ({
          ...n,
          content: parseContent(n.content),
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNewsletters();
  }, []);

  const handleSendTest = async () => {
    if (!testEmailOpen || !testEmail) return;
    const ok = await sendTestEmail(testEmailOpen, testEmail);
    if (ok) {
      setTestEmailOpen(null);
      setTestEmail("");
    }
  };

  const handleSendAll = async (id: string) => {
    const ok = await sendNewsletter(id);
    if (ok) fetchNewsletters();
  };

  const sectionLabel = (key: string) => {
    const labels: Record<string, string> = {
      top_headlines: "📰 Top Headlines",
      fund_tracker: "💰 Fund Tracker",
      people_moves: "👥 People Moves & Deals",
      market_pulse: "📊 Macro & Market Pulse",
    };
    return labels[key] || key;
  };

  const totalArticles = (content: NewsletterContent) =>
    (content.top_headlines?.length || 0) +
    (content.fund_tracker?.length || 0) +
    (content.people_moves?.length || 0) +
    (content.market_pulse?.length || 0);

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-muted-foreground text-center py-8">Loading newsletters...</p>
      ) : newsletters.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No newsletters yet. Run the pipeline to generate one.</p>
      ) : (
        newsletters.map((nl) => (
          <Card key={nl.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{nl.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Created {new Date(nl.created_at).toLocaleString()} · {totalArticles(nl.content)} articles
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={nl.status === "sent" ? "default" : "secondary"}>
                    {nl.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Market data indicator */}
              {nl.content.market_data && nl.content.market_data.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-3 p-3 bg-secondary/50 border border-border">
                  {nl.content.market_data.map((q) => (
                    <div key={q.symbol} className="text-center">
                      <p className="text-xs text-muted-foreground font-medium">{q.name}</p>
                      <p className="text-sm font-bold">
                        {q.symbol === "^TNX" || q.symbol === "SOFR" ? `${q.price.toFixed(2)}%` : q.price.toLocaleString()}
                      </p>
                      <p className={`text-xs font-medium ${q.change >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                        {q.change >= 0 ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Section summary */}
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(nl.content)
                  .filter(([key]) => key !== 'market_data')
                  .map(([key, articles]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {sectionLabel(key)}: {(articles as Article[])?.length || 0}
                  </Badge>
                ))}
              </div>

              {/* Stats for sent newsletters */}
              {nl.status === "sent" && (
                <div className="flex gap-4 mb-4 text-sm text-muted-foreground">
                  <span>Sent: {nl.sent_at ? new Date(nl.sent_at).toLocaleString() : "—"}</span>
                  <span>Opens: {nl.open_count ?? 0}</span>
                  <span>Clicks: {nl.click_count ?? 0}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewNl(nl)}>
                  <Eye className="h-4 w-4 mr-1" />Preview
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTestEmailOpen(nl.id)}>
                  <Mail className="h-4 w-4 mr-1" />Test Email
                </Button>
                {nl.status === "draft" && (
                  <Button size="sm" onClick={() => handleSendAll(nl.id)}>
                    <Send className="h-4 w-4 mr-1" />Send to All
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewNl} onOpenChange={() => setPreviewNl(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewNl?.subject}</DialogTitle>
          </DialogHeader>
           {previewNl && (
            <div className="space-y-6">
              {/* Market Data Ticker */}
              {previewNl.content.market_data && previewNl.content.market_data.length > 0 && (
                <div className="bg-primary text-primary-foreground p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-center mb-3 opacity-75">📈 Market Snapshot</p>
                  <div className="grid grid-cols-5 gap-2">
                    {previewNl.content.market_data.map((q) => (
                      <div key={q.symbol} className="text-center">
                        <p className="text-xs opacity-75 font-medium">{q.name}</p>
                        <p className="text-sm font-bold">
                          {q.symbol === "^TNX" || q.symbol === "SOFR" ? `${q.price.toFixed(2)}%` : q.price.toLocaleString()}
                        </p>
                        <p className={`text-xs font-medium ${q.change >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                          {q.change >= 0 ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.entries(previewNl.content)
                .filter(([key]) => key !== 'market_data')
                .map(([key, articles]) => {
                  const list = articles as Article[] | undefined;
                  if (!list || list.length === 0) return null;
                  return (
                    <div key={key}>
                      <h3 className="font-bold text-sm uppercase tracking-wide mb-3 text-muted-foreground">
                        {sectionLabel(key)}
                      </h3>
                      <div className="space-y-3">
                        {list.map((article) => (
                          <Card key={article.id}>
                            <CardContent className="py-3 px-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">{article.title}</p>
                                  <p className="text-sm text-muted-foreground mt-1">{article.summary}</p>
                                  {article.why_it_matters && (
                                    <div className="mt-2 pl-3 border-l-2 border-foreground/30">
                                      <p className="text-sm italic">
                                        <span className="not-italic font-bold text-xs uppercase tracking-wide text-muted-foreground mr-1">Why it matters:</span>
                                        {article.why_it_matters}
                                      </p>
                                    </div>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2">Source: {article.source}</p>
                                </div>
                                {article.source_url && (
                                  <a href={article.source_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                  </a>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={!!testEmailOpen} onOpenChange={() => setTestEmailOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                type="email"
              />
            </div>
            <Button onClick={handleSendTest} className="w-full">
              <Send className="h-4 w-4 mr-2" />Send Test
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
