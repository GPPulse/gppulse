import { useEffect, useState, useRef } from "react";
import { useSubscribers } from "@/hooks/useSubscribers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, UserPlus, Download, Upload, Search, UserMinus, RefreshCw, Trash2 } from "lucide-react";

export function SubscribersPanel() {
  const {
    subscribers, stats, total, loading,
    fetchSubscribers, addSubscriber, unsubscribe, reactivate, deleteSubscriber, importCsv, exportCsv,
  } = useSubscribers();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");

  useEffect(() => {
    fetchSubscribers(page, search, statusFilter);
  }, [page, statusFilter, fetchSubscribers]);

  const handleSearch = () => {
    setPage(1);
    fetchSubscribers(1, search, statusFilter);
  };

  const handleAdd = async () => {
    if (!newEmail) return;
    const ok = await addSubscriber(newEmail, newName, newCompany);
    if (ok) {
      setAddOpen(false);
      setNewEmail("");
      setNewName("");
      setNewCompany("");
      fetchSubscribers(page, search, statusFilter);
    }
  };

  const handleAction = async (action: "unsubscribe" | "reactivate" | "delete", id: string) => {
    let ok = false;
    if (action === "unsubscribe") ok = await unsubscribe(id);
    if (action === "reactivate") ok = await reactivate(id);
    if (action === "delete") ok = await deleteSubscriber(id);
    if (ok) fetchSubscribers(page, search, statusFilter);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <UserMinus className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.unsubscribed}</p>
                <p className="text-sm text-muted-foreground">Unsubscribed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-1 gap-2">
          <Input
            placeholder="Search by email, name, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" />Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Subscriber</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Email *</Label>
                  <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" />
                </div>
                <div>
                  <Label>First Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John" />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="PE Fund LLC" />
                </div>
                <Button onClick={handleAdd} className="w-full">Add Subscriber</Button>
              </div>
            </DialogContent>
          </Dialog>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const ok = await importCsv(file);
              if (ok) fetchSubscribers(page, search, statusFilter);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Import CSV
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>
      </div>

      {/* Subscribers Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : subscribers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No subscribers found
                  </TableCell>
                </TableRow>
              ) : (
                subscribers.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-mono text-sm">{sub.email}</TableCell>
                    <TableCell>{sub.first_name || "—"}</TableCell>
                    <TableCell>{sub.company || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(sub.subscribed_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {sub.status === "active" ? (
                          <Button variant="outline" size="sm" onClick={() => handleAction("unsubscribe", sub.id)}>
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => handleAction("reactivate", sub.id)}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleAction("delete", sub.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
