import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PeopleMove {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  source_url: string | null;
  scraped_at: string;
  category: string | null;
}

export function usePeopleMoves(search?: string) {
  return useQuery({
    queryKey: ["people-moves", search],
    queryFn: async () => {
      let query = supabase
        .from("articles")
        .select("id, title, summary, source, source_url, scraped_at, category")
        .eq("category", "people_moves")
        .order("scraped_at", { ascending: false })
        .limit(100);

      if (search && search.trim()) {
        query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PeopleMove[];
    },
  });
}

export function useAddPeopleMove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (move: {
      name: string;
      title: string;
      firm: string;
      previousFirm?: string;
      moveType: string;
      summary?: string;
    }) => {
      const articleTitle = move.name;
      const articleSummary = move.previousFirm
        ? `${move.moveType} — ${move.title} at ${move.firm}, previously at ${move.previousFirm}. ${move.summary || ""}`
        : `${move.moveType} — ${move.title} at ${move.firm}. ${move.summary || ""}`;

      const { data, error } = await supabase.from("articles").insert({
        title: articleTitle,
        summary: articleSummary.trim(),
        category: "people_moves",
        source: "Manual Entry",
        fund_size_relevant: true,
        relevance_score: 60,
        scraped_at: new Date().toISOString(),
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people-moves"] });
    },
  });
}
