import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { GPPulseIndexData } from "@/hooks/useGPIndex";

const DEAL_TYPE_LABELS: Record<string, string> = {
  buyout: "Buyout",
  "add-on": "Add-on",
  growth_equity: "Growth",
  exit: "Exit",
  recapitalization: "Recap",
  "carve-out": "Carve-out",
};

const chartConfig: ChartConfig = {
  buyout: { label: "Buyout", color: "hsl(var(--chart-1))" },
  "add-on": { label: "Add-on", color: "hsl(var(--chart-2))" },
  growth_equity: { label: "Growth", color: "hsl(var(--chart-3))" },
  exit: { label: "Exit", color: "hsl(var(--chart-4))" },
  recapitalization: { label: "Recap", color: "hsl(var(--chart-5))" },
  "carve-out": { label: "Carve-out", color: "hsl(var(--chart-1))" },
};

function formatWeekLabel(weekStart: string) {
  return new Date(weekStart + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function DealTypeBreakdownChart({ data }: { data: GPPulseIndexData[] }) {
  // Find all deal types across history
  const allTypes = new Set<string>();
  for (const week of data) {
    for (const dt of week.deal_type_breakdown) {
      allTypes.add(dt.type);
    }
  }
  const dealTypes = Array.from(allTypes);

  const reversed = [...data].reverse();
  const chartData = reversed.map((d) => {
    const row: Record<string, string | number> = { week: formatWeekLabel(d.week_start) };
    for (const type of dealTypes) {
      const found = d.deal_type_breakdown.find((dt) => dt.type === type);
      row[type] = found ? found.count : 0;
    }
    return row;
  });

  const CHART_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  return (
    <Card className="border-2 border-foreground shadow-xs">
      <CardHeader className="border-b-2 border-foreground">
        <CardTitle className="text-base">Deal Type Mix</CardTitle>
        <CardDescription className="font-serif">
          Platform buyouts vs. add-ons, growth equity, and exits over time
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {dealTypes.map((type, i) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="types"
                name={DEAL_TYPE_LABELS[type] || type}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={0}
              />
            ))}
          </BarChart>
        </ChartContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {dealTypes.map((type, i) => (
            <div key={type} className="flex items-center gap-1.5 text-xs">
              <div
                className="h-3 w-3 border border-border"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{DEAL_TYPE_LABELS[type] || type}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
