import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart } from "recharts";
import type { GPPulseIndexData } from "@/hooks/useGPIndex";

const chartConfig: ChartConfig = {
  deals: { label: "Deals", color: "hsl(var(--chart-1))" },
  value: { label: "Total Value ($M)", color: "hsl(var(--chart-2))" },
};

function formatWeekLabel(weekStart: string) {
  return new Date(weekStart + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function DealVolumeChart({ data }: { data: GPPulseIndexData[] }) {
  const chartData = [...data].reverse().map((d) => ({
    week: formatWeekLabel(d.week_start),
    deals: d.deal_count,
    value: d.total_deal_value_millions ?? 0,
  }));

  return (
    <Card className="border-2 border-foreground shadow-xs">
      <CardHeader className="border-b-2 border-foreground">
        <CardTitle className="text-base">LMM Deal Volume</CardTitle>
        <CardDescription className="font-serif">
          Weekly deal count and aggregate transaction value across the lower middle market
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
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
            <Bar yAxisId="left" dataKey="deals" fill="var(--color-deals)" radius={0} />
            <Line
              yAxisId="right"
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
