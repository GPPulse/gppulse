import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface Article {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
}

interface NewsletterContent {
  top_headlines?: Article[];
  fund_tracker?: Article[];
  people_moves?: Article[];
  market_pulse?: Article[];
}

function parseContent(raw: Json): NewsletterContent {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as unknown as NewsletterContent;
  }
  return {};
}

export interface NewsletterStats {
  id: string;
  subject: string;
  issue_number: number;
  status: string;
  open_count: number;
  click_count: number;
  sent_at: string | null;
  created_at: string;
  content: NewsletterContent;
}

export interface SubscriberGrowthPoint {
  date: string;
  total: number;
  newSignups: number;
  label: string;
}

export interface TopArticle {
  title: string;
  category: string;
  source: string;
  appearances: number;
}

export function useAnalyticsNewsletters() {
  return useQuery({
    queryKey: ["analytics-newsletters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletters")
        .select("id, subject, issue_number, status, open_count, click_count, sent_at, created_at, content")
        .eq("status", "sent")
        .order("issue_number", { ascending: true });

      if (error) throw error;

      return (data || []).map((n) => ({
        ...n,
        open_count: n.open_count ?? 0,
        click_count: n.click_count ?? 0,
        content: parseContent(n.content),
      })) as NewsletterStats[];
    },
  });
}

export function useAnalyticsSubscribers() {
  return useQuery({
    queryKey: ["analytics-subscribers-growth"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscribers")
        .select("subscribed_at, status")
        .order("subscribed_at", { ascending: true });

      if (error) throw error;

      const active = (data || []).filter((s) => s.status === "active");
      const total = (data || []).length;
      const activeCount = active.length;
      const unsubscribedCount = total - activeCount;

      // Build cumulative growth and daily signups by day
      const dailyMap = new Map<string, number>();
      const cumulativeMap = new Map<string, number>();
      let cumulative = 0;
      for (const sub of data || []) {
        const day = sub.subscribed_at.substring(0, 10);
        cumulative++;
        dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
        cumulativeMap.set(day, cumulative);
      }

      const growth: SubscriberGrowthPoint[] = Array.from(cumulativeMap.entries()).map(
        ([date, total]) => ({
          date,
          total,
          newSignups: dailyMap.get(date) || 0,
          label: new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        })
      );

      return { total, activeCount, unsubscribedCount, growth };
    },
  });
}

export function useTopArticles() {
  return useQuery({
    queryKey: ["analytics-top-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("title, category, source, used_in_newsletter_id")
        .not("used_in_newsletter_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Count appearances per article title
      const countMap = new Map<string, { title: string; category: string; source: string; count: number }>();
      for (const a of data || []) {
        const key = a.title;
        const existing = countMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(key, {
            title: a.title,
            category: a.category || "uncategorized",
            source: a.source,
            count: 1,
          });
        }
      }

      const top: TopArticle[] = Array.from(countMap.values())
        .map((v) => ({
          title: v.title,
          category: v.category,
          source: v.source,
          appearances: v.count,
        }))
        .sort((a, b) => b.appearances - a.appearances)
        .slice(0, 10);

      return top;
    },
  });
}
