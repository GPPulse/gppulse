import { useState } from "react";
import { usePeopleMoves, useAddPeopleMove } from "@/hooks/usePeopleMoves";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, UserPlus } from "lucide-react";

export function PeopleMovesPanel() {
  const { data: moves, isLoading } = usePeopleMoves();
  const addMove = useAddPeopleMove();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [firm, setFirm] = useState("");
  const [previousFirm, setPreviousFirm] = useState("");
  const [moveType, setMoveType] = useState("hire");
  const [summary, setSummary] = useState("");

  const resetForm = () => {
    setName("");
    setTitle("");
    setFirm("");
    setPreviousFirm("");
    setMoveType("hire");
    setSummary("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim() || !firm.trim()) {
      toast({ title: "Missing Fields", description: "Name, title, and firm are required.", variant: "destructive" });
      return;
    }

    try {
      await addMove.mutateAsync({
        name: name.trim(),
        title: title.trim(),
        firm: firm.trim(),
        previousFirm: previousFirm.trim() || undefined,
        moveType,
        summary: summary.trim() || undefined,
      });
      toast({ title: "People Move Added", description: `${name} added successfully.` });
      resetForm();
      setFormOpen(false);
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{moves?.length || 0}</p>
            <p className="text-sm text-muted-foreground">Total Tracked Moves</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">
              {moves?.filter(m => {
                const d = new Date(m.scraped_at);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return d >= weekAgo;
              }).length || 0}
            </p>
            <p className="text-sm text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">
              {moves?.filter(m => m.source === "Manual Entry").length || 0}
            </p>
            <p className="text-sm text-muted-foreground">Manual Entries</p>
          </CardContent>
        </Card>
      </div>

      {/* Add New Move */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Add People Move</CardTitle>
            <Button
              variant={formOpen ? "secondary" : "default"}
              size="sm"
              onClick={() => setFormOpen(!formOpen)}
            >
              {formOpen ? "Cancel" : <><Plus className="h-4 w-4 mr-1" /> Add Move</>}
            </Button>
          </div>
        </CardHeader>
        {formOpen && (
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pm-name">Full Name *</Label>
                  <Input id="pm-name" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-title">New Title / Role *</Label>
                  <Input id="pm-title" placeholder="Managing Director" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-firm">Firm *</Label>
                  <Input id="pm-firm" placeholder="Acme Capital Partners" value={firm} onChange={(e) => setFirm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-prev">Previous Firm</Label>
                  <Input id="pm-prev" placeholder="Previous employer (optional)" value={previousFirm} onChange={(e) => setPreviousFirm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Move Type</Label>
                  <Select value={moveType} onValueChange={setMoveType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hire">New Hire</SelectItem>
                      <SelectItem value="promotion">Promotion</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="departure">Departure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pm-summary">Additional Notes</Label>
                <Textarea id="pm-summary" placeholder="Brief context about the move..." value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
              </div>
              <Button type="submit" disabled={addMove.isPending}>
                {addMove.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Save Move
              </Button>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Recent Moves Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent People Moves</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !moves || moves.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people moves tracked yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moves.slice(0, 25).map((move) => (
                  <TableRow key={move.id}>
                    <TableCell className="font-medium">{move.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {move.summary}
                    </TableCell>
                    <TableCell>
                      <Badge variant={move.source === "Manual Entry" ? "secondary" : "outline"} className="text-xs">
                        {move.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(move.scraped_at).toLocaleDateString()}
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
