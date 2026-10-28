import {
  useAnalyticsNewsletters,
  useAnalyticsSubscribers,
  useTopArticles,
} from "@/hooks/useAnalytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Eye, MousePointerClick, TrendingUp, Users, Newspaper } from "lucide-react";

const engagementChartConfig: ChartConfig = {
  opens: { label: "Opens", color: "hsl(var(--chart-1))" },
  clicks: { label: "Clicks", color: "hsl(var(--chart-2))" },
};

const growthChartConfig: ChartConfig = {
  total: { label: "Total Subscribers", color: "hsl(var(--chart-3))" },
};

const dailySignupsChartConfig: ChartConfig = {
  newSignups: { label: "New Signups", color: "hsl(var(--chart-4))" },
};

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {detail && (
              <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function categoryLabel(cat: string) {
  const labels: Record<string, string> = {
    headline: "Headline",
    fund_tracker: "Fund Tracker",
    people_moves: "People Moves",
    deal_flow: "Deal Flow",
    market_insight: "Market Insight",
  };
  return labels[cat] || cat;
}

export function AnalyticsPanel() {
  const { data: newsletters, isLoading: nlLoading } = useAnalyticsNewsletters();
  const { data: subData, isLoading: subLoading } = useAnalyticsSubscribers();
  const { data: topArticles, isLoading: artLoading } = useTopArticles();

  if (nlLoading || subLoading) return <LoadingSkeleton />;

  const sentNewsletters = newsletters || [];
  const totalOpens = sentNewsletters.reduce((sum, n) => sum + n.open_count, 0);
  const totalClicks = sentNewsletters.reduce((sum, n) => sum + n.click_count, 0);
  const avgOpenRate =
    sentNewsletters.length > 0 && subData && subData.activeCount > 0
      ? ((totalOpens / (sentNewsletters.length * subData.activeCount)) * 100).toFixed(1)
      : "—";
  const avgClickRate =
    totalOpens > 0 ? ((totalClicks / totalOpens) * 100).toFixed(1) : "—";

  // Chart data: per-issue engagement
  const engagementData = sentNewsletters.map((n) => ({
    issue: `#${n.issue_number}`,
    opens: n.open_count,
    clicks: n.click_count,
  }));

  // Category breakdown across all sent newsletters
  const categoryCounts: Record<string, number> = {};
  for (const nl of sentNewsletters) {
    const sections = [
      ...(nl.content.top_headlines || []),
      ...(nl.content.fund_tracker || []),
      ...(nl.content.people_moves || []),
      ...(nl.content.market_pulse || []),
    ];
    for (const a of sections) {
      const cat = a.category || "uncategorized";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Newspaper}
          label="Issues Sent"
          value={sentNewsletters.length}
        />
        <StatCard
          icon={Eye}
          label="Avg Open Rate"
          value={avgOpenRate === "—" ? "—" : `${avgOpenRate}%`}
          detail={`${totalOpens} total opens`}
        />
        <StatCard
          icon={MousePointerClick}
          label="Avg Click Rate"
          value={avgClickRate === "—" ? "—" : `${avgClickRate}%`}
          detail={`${totalClicks} total clicks`}
        />
        <StatCard
          icon={Users}
          label="Active Subscribers"
          value={subData?.activeCount ?? 0}
          detail={`${subData?.unsubscribedCount ?? 0} unsubscribed`}
        />
      </div>

      {/* Engagement Chart */}
      {engagementData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement per Issue</CardTitle>
            <CardDescription>Opens and clicks for each sent newsletter</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={engagementChartConfig} className="h-[280px] w-full">
              <BarChart data={engagementData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="issue" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="opens" fill="var(--color-opens)" radius={0} />
                <Bar dataKey="clicks" fill="var(--color-clicks)" radius={0} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Subscriber Growth Charts */}
      {subData && subData.growth.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Cumulative Growth
              </CardTitle>
              <CardDescription>Total subscriber count over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={growthChartConfig} className="h-[250px] w-full">
                <LineChart data={subData.growth} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="total"
                    type="monotone"
                    stroke="var(--color-total)"
                    strokeWidth={2}
                    dot={true}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Daily Signups
              </CardTitle>
              <CardDescription>New subscribers per day</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={dailySignupsChartConfig} className="h-[250px] w-full">
                <BarChart data={subData.growth} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="newSignups" fill="var(--color-newSignups)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content Category Breakdown */}
      {Object.keys(categoryCounts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Breakdown</CardTitle>
            <CardDescription>Articles by category across all sent issues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(categoryCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => (
                  <div
                    key={cat}
                    className="flex items-center gap-2 border border-border px-3 py-2"
                  >
                    <span className="font-medium text-sm">{categoryLabel(cat)}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Articles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Performing Articles</CardTitle>
          <CardDescription>Most featured articles across newsletter issues</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {artLoading ? (
            <div className="p-6">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !topArticles || topArticles.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              No article data available yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Featured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topArticles.map((article, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm max-w-[300px] truncate">
                      {article.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {categoryLabel(article.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {article.source}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {article.appearances}×
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
