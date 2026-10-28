import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import type { GPPulseIndexData } from "@/hooks/useGPIndex";

const chartConfig: ChartConfig = {
  funds: { label: "Funds in Market", color: "hsl(var(--chart-4))" },
  target: { label: "Aggregate Target ($M)", color: "hsl(var(--chart-2))" },
};

function formatWeekLabel(weekStart: string) {
  return new Date(weekStart + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function FundActivityChart({ data }: { data: GPPulseIndexData[] }) {
  const chartData = [...data].reverse().map((d) => ({
    week: formatWeekLabel(d.week_start),
    funds: d.funds_in_market,
    target: d.total_fund_target_millions ?? 0,
  }));

  const latest = data[0];

  return (
    <Card className="border-2 border-foreground shadow-xs">
      <CardHeader className="border-b-2 border-foreground">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Fund Raise Activity</CardTitle>
            <CardDescription className="font-serif">
              Active fundraising and aggregate capital targets in the LMM
            </CardDescription>
          </div>
          {latest && (
            <div className="text-right">
              <p className="text-2xl font-bold font-mono">{latest.funds_in_market}</p>
              <p className="text-xs text-muted-foreground">Funds in market</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <ComposedChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}B` : `$${v}M`)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar yAxisId="left" dataKey="funds" fill="var(--color-funds)" radius={0} />
            <Line
              yAxisId="right"
              dataKey="target"
              type="monotone"
              stroke="var(--color-target)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
