import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";
import type { GPPulseIndexData } from "@/hooks/useGPIndex";

const SECTOR_COLORS: Record<string, string> = {
  Technology: "hsl(var(--chart-1))",
  Healthcare: "hsl(var(--chart-2))",
  Industrials: "hsl(var(--chart-3))",
  "Business Services": "hsl(var(--chart-4))",
  Consumer: "hsl(var(--chart-5))",
  "Financial Services": "hsl(var(--chart-1))",
  Energy: "hsl(var(--chart-2))",
};

function formatWeekLabel(weekStart: string) {
  return new Date(weekStart + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function SectorTrendsChart({ data }: { data: GPPulseIndexData[] }) {
  // Aggregate sector counts across all weeks
  const sectorTotals: Record<string, number> = {};
  for (const week of data) {
    for (const s of week.sector_breakdown) {
      sectorTotals[s.sector] = (sectorTotals[s.sector] || 0) + s.count;
    }
  }

  const topSectors = Object.entries(sectorTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([s]) => s);

  // Build stacked data per week
  const reversed = [...data].reverse();
  const chartData = reversed.map((d) => {
    const row: Record<string, string | number> = { week: formatWeekLabel(d.week_start) };
    for (const sector of topSectors) {
      const found = d.sector_breakdown.find((s) => s.sector === sector);
      row[sector] = found ? found.count : 0;
    }
    return row;
  });

  const chartConfig: ChartConfig = Object.fromEntries(
    topSectors.map((sector, i) => [
      sector,
      {
        label: sector,
        color: SECTOR_COLORS[sector] || `hsl(var(--chart-${(i % 5) + 1}))`,
      },
    ])
  );

  // Current week breakdown for the summary badges
  const latestWeek = data[0];
  const latestSectors = latestWeek?.sector_breakdown || [];

  return (
    <Card className="border-2 border-foreground shadow-xs">
      <CardHeader className="border-b-2 border-foreground">
        <CardTitle className="text-base">Sector Activity Trends</CardTitle>
        <CardDescription className="font-serif">
          Deal distribution by sector over time — identifying where capital is flowing
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {topSectors.map((sector, i) => (
              <Bar
                key={sector}
                dataKey={sector}
                stackId="sectors"
                fill={`var(--color-${sector.replace(/\s+/g, "-")})`}
                // fallback fill using chart colors
                style={{
                  fill: SECTOR_COLORS[sector] || `hsl(var(--chart-${(i % 5) + 1}))`,
                }}
                radius={0}
              />
            ))}
          </BarChart>
        </ChartContainer>

        {/* Current Week Summary */}
        {latestSectors.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              This Week's Breakdown
            </p>
            <div className="flex flex-wrap gap-2">
              {latestSectors.map((s) => (
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
      </CardContent>
    </Card>
  );
}
