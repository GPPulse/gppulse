import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeContent } from "@/lib/newsletter-content";

export type { Article as NewsletterArticle, MarketQuote, NewsletterContentV2 as NewsletterContent } from "@/lib/newsletter-content";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useNewsletterArchive() {
  return useQuery({
    queryKey: ["newsletter-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletters")
        .select("id, subject, preheader, issue_number, status, sent_at, created_at, slug, edition")
        .eq("status", "sent")
        .order("issue_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Accepts either the issue UUID or its slug (YYYY-MM-DD-N). */
export function useNewsletterIssue(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ["newsletter-issue", idOrSlug],
    queryFn: async () => {
      if (!idOrSlug) throw new Error("No issue id");
      let q = supabase.from("newsletters").select("*").eq("status", "sent");
      q = UUID.test(idOrSlug) ? q.eq("id", idOrSlug) : q.eq("slug", idOrSlug);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Newsletter not found");
      return { ...data, parsed: normalizeContent(data.content) };
    },
    enabled: !!idOrSlug,
  });
}

export function useLatestIssue() {
  return useQuery({
    queryKey: ["newsletter-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletters")
        .select("*")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, parsed: normalizeContent(data.content) } : null;
    },
  });
}
