import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminGate } from "@/components/admin/AdminGate";
import { EditorsDeskPanel } from "@/components/admin/EditorsDeskPanel";
import { NewslettersPanel } from "@/components/admin/NewslettersPanel";
import { SubscribersPanel } from "@/components/admin/SubscribersPanel";
import { PipelinePanel } from "@/components/admin/PipelinePanel";
import { AnalyticsPanel } from "@/components/admin/AnalyticsPanel";
import { PeopleMovesPanel } from "@/components/admin/PeopleMovesPanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Newspaper, Users, Zap, BarChart3, UserCheck, PenLine, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Admin() {
  const navigate = useNavigate();

  return (
    <AdminGate>
      {({ email, signOut }) => (
        <div className="min-h-screen bg-background">
          <header className="border-b-2 border-foreground">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate("/")} aria-label="Back to site"><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight">THE GP PULSE</h1>
                  <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Editor's desk</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
                <Button variant="outline" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
              </div>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-4 py-6">
            <Tabs defaultValue="desk" className="space-y-6">
              <TabsList className="grid w-full grid-cols-6 max-w-3xl">
                <TabsTrigger value="desk" className="flex items-center gap-2"><PenLine className="h-4 w-4" /><span className="hidden sm:inline">Desk</span></TabsTrigger>
                <TabsTrigger value="analytics" className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /><span className="hidden sm:inline">Analytics</span></TabsTrigger>
                <TabsTrigger value="newsletters" className="flex items-center gap-2"><Newspaper className="h-4 w-4" /><span className="hidden sm:inline">Issues</span></TabsTrigger>
                <TabsTrigger value="subscribers" className="flex items-center gap-2"><Users className="h-4 w-4" /><span className="hidden sm:inline">Subscribers</span></TabsTrigger>
                <TabsTrigger value="people-moves" className="flex items-center gap-2"><UserCheck className="h-4 w-4" /><span className="hidden sm:inline">People</span></TabsTrigger>
                <TabsTrigger value="pipeline" className="flex items-center gap-2"><Zap className="h-4 w-4" /><span className="hidden sm:inline">Pipeline</span></TabsTrigger>
              </TabsList>

              <TabsContent value="desk"><EditorsDeskPanel /></TabsContent>
              <TabsContent value="analytics"><AnalyticsPanel /></TabsContent>
              <TabsContent value="newsletters"><NewslettersPanel /></TabsContent>
              <TabsContent value="subscribers"><SubscribersPanel /></TabsContent>
              <TabsContent value="people-moves"><PeopleMovesPanel /></TabsContent>
              <TabsContent value="pipeline"><PipelinePanel /></TabsContent>
            </Tabs>
          </main>
        </div>
      )}
    </AdminGate>
  );
}
