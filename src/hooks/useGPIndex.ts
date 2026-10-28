import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SectorEntry {
  sector: string;
  count: number;
  percentage: number;
}

interface DealTypeEntry {
  type: string;
  count: number;
  percentage: number;
}

interface TrendSignal {
  direction: "up" | "down" | "neutral";
  metric: string;
  description: string;
}

export interface GPPulseIndexData {
  id: string;
  week_start: string;
  week_end: string;
  deal_count: number;
  total_deal_value_millions: number | null;
  avg_deal_size_millions: number | null;
  avg_ev_ebitda_multiple: number | null;
  median_ev_ebitda_multiple: number | null;
  funds_in_market: number;
  total_fund_target_millions: number | null;
  avg_fund_close_months: number | null;
  sector_breakdown: SectorEntry[];
  deal_type_breakdown: DealTypeEntry[];
  deal_count_wow_change: number | null;
  deal_value_wow_change: number | null;
  narrative_summary: string | null;
  trend_signals: TrendSignal[];
  source_article_count: number;
  created_at: string;
}

export function useLatestGPIndex() {
  return useQuery({
    queryKey: ["gp-pulse-index-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gp_pulse_index")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        sector_breakdown: (data.sector_breakdown || []) as unknown as SectorEntry[],
        deal_type_breakdown: (data.deal_type_breakdown || []) as unknown as DealTypeEntry[],
        trend_signals: (data.trend_signals || []) as unknown as TrendSignal[],
      } as GPPulseIndexData;
    },
  });
}

export function useGPIndexHistory(limit = 12) {
  return useQuery({
    queryKey: ["gp-pulse-index-history", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gp_pulse_index")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((d) => ({
        ...d,
        sector_breakdown: (d.sector_breakdown || []) as unknown as SectorEntry[],
        deal_type_breakdown: (d.deal_type_breakdown || []) as unknown as DealTypeEntry[],
        trend_signals: (d.trend_signals || []) as unknown as TrendSignal[],
      })) as GPPulseIndexData[];
    },
  });
}
