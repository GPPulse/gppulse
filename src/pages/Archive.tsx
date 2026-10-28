import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { useNewsletterArchive } from "@/hooks/useNewsletters";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ArrowRight } from "lucide-react";

const Archive = () => {
  const { data: newsletters, isLoading } = useNewsletterArchive();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        {/* Hero */}
        <section className="py-16 md:py-24 border-b-2 border-foreground">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <Badge className="mb-4">Newsletter Archive</Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Every issue, archived.
            </h1>
            <p className="text-lg text-muted-foreground font-serif max-w-2xl mx-auto">
              Searchable by your browser, shareable by link. The Lede, the deals, the funds and the moves, exactly as they went out.
            </p>
          </div>
        </section>

        {/* Newsletter List */}
        <section className="py-12 md:py-16">
          <div className="container max-w-4xl mx-auto px-4">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full border-2 border-foreground" />
                ))}
              </div>
            ) : !newsletters || newsletters.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-lg text-muted-foreground font-serif">
                  No issues published yet. Subscribe to be the first to receive The GP Pulse!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {newsletters.map((newsletter) => (
                  <Link
                    key={newsletter.id}
                    to={`/archive/${newsletter.slug ?? newsletter.id}`}
                  >
                    <Card className="border-2 border-foreground shadow-xs hover:shadow-sm transition-shadow bg-background group">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <Badge variant="outline" className="font-mono text-xs shrink-0">
                                #{newsletter.issue_number}
                              </Badge>
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5" />
                                <span className="font-mono">
                                  {newsletter.sent_at
                                    ? formatDate(newsletter.sent_at)
                                    : formatDate(newsletter.created_at)}
                                </span>
                              </div>
                            </div>
                            <h2 className="text-lg font-bold truncate group-hover:text-muted-foreground transition-colors">
                              {newsletter.subject}
                            </h2>
                            {newsletter.preheader && (
                              <p className="text-sm text-muted-foreground truncate font-serif">{newsletter.preheader}</p>
                            )}
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
};

export default Archive;
