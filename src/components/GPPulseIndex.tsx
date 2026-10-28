import { useLatestGPIndex, type GPPulseIndexData } from "@/hooks/useGPIndex";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, BarChart3, DollarSign, Building, Timer } from "lucide-react";

function TrendArrow({ value }: { value: number | null }) {
  if (value == null) return null;
  if (value > 0) return <span className="text-sm font-mono">▲ {value}%</span>;
  if (value < 0) return <span className="text-sm font-mono text-destructive">▼ {Math.abs(value)}%</span>;
  return <span className="text-sm font-mono text-muted-foreground">— 0%</span>;
}

function formatValue(val: number | null, suffix = ""): string {
  if (val == null) return "—";
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}B${suffix}`;
  return `$${val.toFixed(0)}M${suffix}`;
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "up") return <TrendingUp className="h-3 w-3 shrink-0" />;
  if (direction === "down") return <TrendingDown className="h-3 w-3 shrink-0" />;
  return <Minus className="h-3 w-3 shrink-0" />;
}

export function GPPulseIndexCard({ data: propData }: { data?: GPPulseIndexData | null }) {
  const { data: fetchedData, isLoading } = useLatestGPIndex();
  const data = propData !== undefined ? propData : fetchedData;

  if (isLoading && propData === undefined) {
    return (
      <Card className="border-2 border-foreground shadow-sm">
        <CardContent className="pt-6">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const weekLabel = `${new Date(data.week_start + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} — ${new Date(data.week_end + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <Card className="border-2 border-foreground shadow-sm">
      <CardHeader className="border-b-2 border-foreground pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <CardTitle className="text-lg">GP Pulse Index™</CardTitle>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {weekLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              Deal Volume
            </div>
            <p className="text-2xl font-bold">{data.deal_count}</p>
            <TrendArrow value={data.deal_count_wow_change} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Total Value
            </div>
            <p className="text-2xl font-bold">
              {formatValue(data.total_deal_value_millions)}
            </p>
            <TrendArrow value={data.deal_value_wow_change} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building className="h-3 w-3" />
              Avg EV/EBITDA
            </div>
            <p className="text-2xl font-bold">
              {data.avg_ev_ebitda_multiple != null ? `${data.avg_ev_ebitda_multiple}x` : "—"}
            </p>
            {data.median_ev_ebitda_multiple != null && (
              <p className="text-xs text-muted-foreground">
                Median: {data.median_ev_ebitda_multiple}x
              </p>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="h-3 w-3" />
              Funds in Market
            </div>
            <p className="text-2xl font-bold">{data.funds_in_market}</p>
            {data.total_fund_target_millions != null && (
              <p className="text-xs text-muted-foreground">
                {formatValue(data.total_fund_target_millions)} target
              </p>
            )}
          </div>
        </div>

        {/* Sector Breakdown */}
        {data.sector_breakdown.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Sector Activity
            </p>
            <div className="flex flex-wrap gap-2">
              {data.sector_breakdown.map((s) => (
                <div
                  key={s.sector}
                  className="flex items-center gap-1.5 border border-border px-2 py-1"
                >
                  <span className="text-xs font-medium">{s.sector}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {s.count} ({s.percentage}%)
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deal Type Breakdown */}
        {data.deal_type_breakdown.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Deal Types
            </p>
            <div className="w-full h-4 border-2 border-foreground flex overflow-hidden">
              {data.deal_type_breakdown.map((dt, i) => {
                const colors = [
                  "bg-foreground",
                  "bg-muted-foreground",
                  "bg-foreground/60",
                  "bg-foreground/40",
                  "bg-foreground/20",
                ];
                return (
                  <div
                    key={dt.type}
                    className={`${colors[i % colors.length]} h-full`}
                    style={{ width: `${dt.percentage}%` }}
                    title={`${dt.type}: ${dt.count} (${dt.percentage}%)`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5">
              {data.deal_type_breakdown.map((dt, i) => {
                const labels: Record<string, string> = {
                  buyout: "Buyout",
                  "add-on": "Add-on",
                  growth_equity: "Growth",
                  exit: "Exit",
                  recapitalization: "Recap",
                  "carve-out": "Carve-out",
                };
                return (
                  <span key={dt.type} className="text-xs text-muted-foreground">
                    {labels[dt.type] || dt.type}: {dt.percentage}%
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Trend Signals */}
        {data.trend_signals.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Trend Signals
            </p>
            <div className="space-y-2">
              {data.trend_signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <TrendIcon direction={signal.direction} />
                  <div>
                    <span className="font-medium">{signal.metric}:</span>{" "}
                    <span className="text-muted-foreground">{signal.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Narrative Summary */}
        {data.narrative_summary && (
          <div className="border-t-2 border-foreground pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Weekly Analysis
            </p>
            <p className="text-sm font-serif leading-relaxed">{data.narrative_summary}</p>
          </div>
        )}

        {/* Source Attribution */}
        <p className="text-xs text-muted-foreground text-right font-mono">
          Based on {data.source_article_count} sources · GP Pulse Index™
        </p>
      </CardContent>
    </Card>
  );
}
