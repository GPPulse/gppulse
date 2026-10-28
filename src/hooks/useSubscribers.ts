import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Subscriber {
  id: string;
  email: string;
  first_name: string | null;
  company: string | null;
  status: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

interface SubscriberStats {
  total: number;
  active: number;
  unsubscribed: number;
}

interface SubscribersResponse {
  subscribers: Subscriber[];
  total: number;
  page: number;
  per_page: number;
  stats: SubscriberStats;
}

export function useSubscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<SubscriberStats>({ total: 0, active: 0, unsubscribed: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSubscribers = useCallback(async (page = 1, search = "", status = "all") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "list", page, search, status, per_page: 20 },
      });
      if (error) throw error;
      const res = data as SubscribersResponse;
      setSubscribers(res.subscribers || []);
      setTotal(res.total || 0);
      setStats(res.stats || { total: 0, active: 0, unsubscribed: 0 });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const addSubscriber = useCallback(async (email: string, firstName?: string, company?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "add", email, first_name: firstName, company },
      });
      if (error) throw error;
      toast({ title: "Success", description: data.message });
      return true;
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  const unsubscribe = useCallback(async (subscriberId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "unsubscribe", subscriber_id: subscriberId },
      });
      if (error) throw error;
      toast({ title: "Success", description: data.message });
      return true;
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  const reactivate = useCallback(async (subscriberId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "reactivate", subscriber_id: subscriberId },
      });
      if (error) throw error;
      toast({ title: "Success", description: data.message });
      return true;
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  const deleteSubscriber = useCallback(async (subscriberId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "delete", subscriber_id: subscriberId },
      });
      if (error) throw error;
      toast({ title: "Success", description: data.message });
      return true;
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  const importCsv = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
      const emailIdx = headers.indexOf("email");
      if (emailIdx === -1) throw new Error("CSV must have an 'email' column");
      const nameIdx = headers.indexOf("first_name");
      const companyIdx = headers.indexOf("company");

      const subs = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^",]+|(?<=,)(?=,))/g)?.map(c => c.replace(/^"|"$/g, "").trim()) || [];
        return {
          email: cols[emailIdx] || "",
          first_name: nameIdx >= 0 ? cols[nameIdx] : undefined,
          company: companyIdx >= 0 ? cols[companyIdx] : undefined,
        };
      }).filter(s => s.email && s.email.includes("@"));

      if (subs.length === 0) throw new Error("No valid email addresses found in CSV");

      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "bulk-import", subscribers: subs },
      });
      if (error) throw error;
      toast({ title: "Success", description: data.message || `Imported ${subs.length} subscribers` });
      return true;
    } catch (e) {
      toast({ title: "Import Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  const exportCsv = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscribers", {
        body: { action: "export" },
      });
      if (error) throw error;
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscribers-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Success", description: "CSV exported" });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  }, [toast]);

  return { subscribers, stats, total, loading, fetchSubscribers, addSubscriber, unsubscribe, reactivate, deleteSubscriber, importCsv, exportCsv };
}
