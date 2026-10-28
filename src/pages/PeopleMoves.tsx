import { useState, useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SubscribeForm } from "@/components/landing/SubscribeForm";
import { usePeopleMoves } from "@/hooks/usePeopleMoves";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowUpRight, UserCheck, ArrowRightLeft, Star, LogOut } from "lucide-react";

const moveTypeIcon = (summary: string) => {
  const lower = summary.toLowerCase();
  if (lower.includes("promotion")) return <Star className="h-4 w-4 text-chart-4" />;
  if (lower.includes("hire")) return <UserCheck className="h-4 w-4 text-chart-2" />;
  if (lower.includes("departure")) return <LogOut className="h-4 w-4 text-destructive" />;
  if (lower.includes("appointment")) return <ArrowRightLeft className="h-4 w-4 text-chart-1" />;
  return <UserCheck className="h-4 w-4 text-muted-foreground" />;
};

const moveTypeBadge = (summary: string) => {
  const lower = summary.toLowerCase();
  if (lower.includes("promotion")) return <Badge variant="default">Promotion</Badge>;
  if (lower.includes("hire")) return <Badge variant="secondary">New Hire</Badge>;
  if (lower.includes("departure")) return <Badge variant="destructive">Departure</Badge>;
  if (lower.includes("appointment")) return <Badge variant="outline">Appointment</Badge>;
  return <Badge variant="outline">Move</Badge>;
};

const PeopleMoves = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: moves, isLoading } = usePeopleMoves(debouncedSearch);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    document.title = "People Moves | The GP Pulse";
    return () => { document.title = "The GP Pulse"; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-12 md:py-16">
          <div className="container max-w-4xl mx-auto px-4">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                People Moves
              </h1>
              <p className="text-muted-foreground font-serif text-lg">
                Track executive movements, promotions, and appointments across lower middle market private equity.
              </p>
            </div>

            {/* Search */}
            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, firm, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Results */}
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full border-2 border-foreground" />
                ))}
              </div>
            ) : !moves || moves.length === 0 ? (
              <div className="text-center py-16 border-2 border-foreground bg-muted/20">
                <p className="text-lg font-bold mb-1">No People Moves Found</p>
                <p className="text-muted-foreground text-sm">
                  {search ? "Try a different search term." : "Run the pipeline to scrape the latest moves."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground font-mono mb-4">
                  {moves.length} move{moves.length !== 1 ? "s" : ""} found
                </p>
                {moves.map((move) => (
                  <Card key={move.id} className="border-2 border-foreground hover:bg-muted/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">
                          {moveTypeIcon(move.summary || "")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-bold">{move.title}</p>
                            {moveTypeBadge(move.summary || "")}
                          </div>
                          {move.summary && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {move.summary}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-mono">
                            <span>{move.source}</span>
                            <span>•</span>
                            <span>{new Date(move.scraped_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {move.source_url && (
                          <a
                            href={move.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 mt-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Subscribe CTA */}
            <div className="mt-16 text-center border-2 border-foreground p-8 bg-secondary">
              <h2 className="text-2xl font-bold mb-2">Never Miss a Move</h2>
              <p className="text-muted-foreground font-serif mb-6">
                Get people moves delivered daily with The GP Pulse newsletter.
              </p>
              <div className="max-w-md mx-auto">
                <SubscribeForm />
              </div>
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
};

export default PeopleMoves;
