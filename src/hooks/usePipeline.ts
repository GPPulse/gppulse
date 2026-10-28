import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PipelineStep {
  name: string;
  status: "pending" | "running" | "success" | "error";
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

interface PipelineResult {
  message: string;
  success: boolean;
  steps: PipelineStep[];
  completed_at: string;
}

export function usePipeline() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<PipelineResult | null>(null);
  const { toast } = useToast();

  const runPipeline = useCallback(async (mode: "full" | "send" | "full-send" = "full") => {
    setRunning(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("daily-newsletter-pipeline", {
        body: { mode },
      });
      if (error) throw error;
      const result = data as PipelineResult;
      setLastResult(result);
      toast({
        title: result.success ? "Pipeline Complete" : "Pipeline Finished with Errors",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      return result;
    } catch (e) {
      toast({ title: "Pipeline Error", description: String(e), variant: "destructive" });
      return null;
    } finally {
      setRunning(false);
    }
  }, [toast]);

  const generateGPIndex = useCallback(async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-gp-index");
      if (error) throw error;
      toast({
        title: "GP Pulse Index Generated",
        description: data.message,
      });
      return data;
    } catch (e) {
      toast({ title: "Index Error", description: String(e), variant: "destructive" });
      return null;
    } finally {
      setRunning(false);
    }
  }, [toast]);

  const sendTestEmail = useCallback(async (newsletterId: string, email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-newsletter", {
        body: { newsletter_id: newsletterId, test_email: email },
      });
      if (error) throw error;
      toast({ title: "Test Email Sent", description: data.message });
      return true;
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  const sendNewsletter = useCallback(async (newsletterId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-newsletter", {
        body: { newsletter_id: newsletterId },
      });
      if (error) throw error;
      toast({ title: "Newsletter Sent", description: data.message });
      return true;
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      return false;
    }
  }, [toast]);

  return { running, lastResult, runPipeline, sendTestEmail, sendNewsletter, generateGPIndex };
}
