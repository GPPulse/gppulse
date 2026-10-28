import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";
import type { GPPulseIndexData } from "@/hooks/useGPIndex";

const chartConfig: ChartConfig = {
  avg: { label: "Avg EV/EBITDA", color: "hsl(var(--chart-1))" },
  median: { label: "Median EV/EBITDA", color: "hsl(var(--chart-3))" },
};

function formatWeekLabel(weekStart: string) {
  return new Date(weekStart + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ValuationMultiplesChart({ data }: { data: GPPulseIndexData[] }) {
  const chartData = [...data].reverse().map((d) => ({
    week: formatWeekLabel(d.week_start),
    avg: d.avg_ev_ebitda_multiple,
    median: d.median_ev_ebitda_multiple,
  }));

  // Calculate stats from latest data
  const latest = data[0];
  const previous = data[1];

  const avgChange =
    latest?.avg_ev_ebitda_multiple && previous?.avg_ev_ebitda_multiple
      ? (latest.avg_ev_ebitda_multiple - previous.avg_ev_ebitda_multiple).toFixed(1)
      : null;

  return (
    <Card className="border-2 border-foreground shadow-xs">
      <CardHeader className="border-b-2 border-foreground">
        <CardTitle className="text-base">Valuation Multiples</CardTitle>
        <CardDescription className="font-serif">
          Average and median EV/EBITDA multiples tracking LMM transaction pricing
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Current Avg</p>
            <p className="text-2xl font-bold font-mono">
              {latest?.avg_ev_ebitda_multiple != null
                ? `${latest.avg_ev_ebitda_multiple}x`
                : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Current Median</p>
            <p className="text-2xl font-bold font-mono">
              {latest?.median_ev_ebitda_multiple != null
                ? `${latest.median_ev_ebitda_multiple}x`
                : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">WoW Change</p>
            <p className="text-2xl font-bold font-mono">
              {avgChange != null ? (
                <span className={Number(avgChange) > 0 ? "" : "text-destructive"}>
                  {Number(avgChange) > 0 ? "+" : ""}
                  {avgChange}x
                </span>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Weeks Tracked</p>
            <p className="text-2xl font-bold font-mono">{data.length}</p>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              tickFormatter={(v) => `${v}x`}
              domain={["auto", "auto"]}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="avg"
              type="monotone"
              stroke="var(--color-avg)"
              fill="var(--color-avg)"
              fillOpacity={0.1}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Area
              dataKey="median"
              type="monotone"
              stroke="var(--color-median)"
              fill="var(--color-median)"
              fillOpacity={0.05}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
