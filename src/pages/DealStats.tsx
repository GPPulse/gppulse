import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GPPulseIndexCard } from "@/components/GPPulseIndex";
import { DealVolumeChart } from "@/components/charts/DealVolumeChart";
import { SectorTrendsChart } from "@/components/charts/SectorTrendsChart";
import { ValuationMultiplesChart } from "@/components/charts/ValuationMultiplesChart";
import { DealTypeBreakdownChart } from "@/components/charts/DealTypeBreakdownChart";
import { FundActivityChart } from "@/components/charts/FundActivityChart";
import { useGPIndexHistory } from "@/hooks/useGPIndex";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const DealStats = () => {
  const { data: history, isLoading } = useGPIndexHistory(12);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        {/* Hero */}
        <section className="py-16 md:py-24 border-b-2 border-foreground">
          <div className="container max-w-5xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <BarChart3 className="h-6 w-6" />
              <Badge className="text-sm">Proprietary Data</Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Weekly Deal Stats
            </h1>
            <p className="text-lg text-muted-foreground font-serif max-w-2xl mx-auto">
              Proprietary charts tracking LMM deal volume, sector trends, valuation
              multiples, and fund activity — sourced from 935+ PE firms weekly.
            </p>
          </div>
        </section>

        {/* Charts */}
        <section className="py-12 md:py-16">
          <div className="container max-w-5xl mx-auto px-4">
            {isLoading ? (
              <div className="space-y-6">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="border-2 border-foreground">
                    <CardContent className="pt-6">
                      <Skeleton className="h-[350px] w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-center py-16">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg text-muted-foreground font-serif">
                  No index data available yet. The GP Pulse Index is generated
                  weekly from our PE news pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Current Week Snapshot */}
                <GPPulseIndexCard data={history[0]} />

                {/* Deal Volume */}
                <DealVolumeChart data={history} />

                {/* Valuation Multiples */}
                <ValuationMultiplesChart data={history} />

                {/* Sector Trends */}
                <SectorTrendsChart data={history} />

                {/* Deal Type Mix */}
                <DealTypeBreakdownChart data={history} />

                {/* Fund Activity */}
                <FundActivityChart data={history} />

                {/* Attribution */}
                <p className="text-xs text-muted-foreground text-center font-mono">
                  GP Pulse Index™ · Data derived from {history.length} weeks of
                  proprietary analysis across 935+ PE firm sources
                </p>
              </div>
            )}
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
};

export default DealStats;
