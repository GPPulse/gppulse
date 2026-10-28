export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          category: string | null
          created_at: string
          fund_size_relevant: boolean | null
          id: string
          original_content: string | null
          published_at: string | null
          relevance_score: number | null
          scraped_at: string
          source: string
          source_url: string | null
          summary: string | null
          title: string
          used_in_newsletter_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          fund_size_relevant?: boolean | null
          id?: string
          original_content?: string | null
          published_at?: string | null
          relevance_score?: number | null
          scraped_at?: string
          source: string
          source_url?: string | null
          summary?: string | null
          title: string
          used_in_newsletter_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          fund_size_relevant?: boolean | null
          id?: string
          original_content?: string | null
          published_at?: string | null
          relevance_score?: number | null
          scraped_at?: string
          source?: string
          source_url?: string | null
          summary?: string | null
          title?: string
          used_in_newsletter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_used_in_newsletter_id_fkey"
            columns: ["used_in_newsletter_id"]
            isOneToOne: false
            referencedRelation: "newsletters"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          alerted_at: string | null
          alert_recipients: number | null
          id: string
          article_id: string | null
          announced_on: string | null
          sponsor: string
          target: string
          deal_type: string
          sector: string | null
          sub_sector: string | null
          geography: string | null
          enterprise_value_millions: number | null
          revenue_millions: number | null
          ebitda_millions: number | null
          ev_ebitda_multiple: number | null
          figures_disclosed: boolean
          seller: string | null
          advisors: string | null
          lender: string | null
          summary: string | null
          source: string | null
          source_url: string | null
          featured: boolean
          editor_take: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          alerted_at?: string | null
          alert_recipients?: number | null
          id?: string
          article_id?: string | null
          announced_on?: string | null
          sponsor: string
          target: string
          deal_type: string
          sector?: string | null
          sub_sector?: string | null
          geography?: string | null
          enterprise_value_millions?: number | null
          revenue_millions?: number | null
          ebitda_millions?: number | null
          ev_ebitda_multiple?: number | null
          figures_disclosed?: boolean
          seller?: string | null
          advisors?: string | null
          lender?: string | null
          summary?: string | null
          source?: string | null
          source_url?: string | null
          featured?: boolean
          editor_take?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          alerted_at?: string | null
          alert_recipients?: number | null
          id?: string
          article_id?: string | null
          announced_on?: string | null
          sponsor?: string
          target?: string
          deal_type?: string
          sector?: string | null
          sub_sector?: string | null
          geography?: string | null
          enterprise_value_millions?: number | null
          revenue_millions?: number | null
          ebitda_millions?: number | null
          ev_ebitda_multiple?: number | null
          figures_disclosed?: boolean
          seller?: string | null
          advisors?: string | null
          lender?: string | null
          summary?: string | null
          source?: string | null
          source_url?: string | null
          featured?: boolean
          editor_take?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      editor_items: {
        Row: {
          submitted_by_email: string | null
          submitted_by_role: string | null
          attribution_ok: boolean
          id: string
          kind: string
          headline: string
          body: string | null
          url: string | null
          attribution: string | null
          status: string
          newsletter_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          submitted_by_email?: string | null
          submitted_by_role?: string | null
          attribution_ok?: boolean
          id?: string
          kind: string
          headline: string
          body?: string | null
          url?: string | null
          attribution?: string | null
          status?: string
          newsletter_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          submitted_by_email?: string | null
          submitted_by_role?: string | null
          attribution_ok?: boolean
          id?: string
          kind?: string
          headline?: string
          body?: string | null
          url?: string | null
          attribution?: string | null
          status?: string
          newsletter_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          id: string
          resend_email_id: string | null
          event_type: string
          email: string | null
          newsletter_id: string | null
          subscriber_id: string | null
          link_url: string | null
          payload: Json | null
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          resend_email_id?: string | null
          event_type: string
          email?: string | null
          newsletter_id?: string | null
          subscriber_id?: string | null
          link_url?: string | null
          payload?: Json | null
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          resend_email_id?: string | null
          event_type?: string
          email?: string | null
          newsletter_id?: string | null
          subscriber_id?: string | null
          link_url?: string | null
          payload?: Json | null
          occurred_at?: string
          created_at?: string
        }
        Relationships: []
      }
      funds: {
        Row: {
          id: string
          article_id: string | null
          announced_on: string | null
          firm: string
          fund_name: string
          strategy: string | null
          status: string
          target_millions: number | null
          raised_millions: number | null
          hard_cap_millions: number | null
          prior_fund_millions: number | null
          fund_number: number | null
          placement_agent: string | null
          notable_lps: string | null
          headquarters: string | null
          summary: string | null
          source: string | null
          source_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          article_id?: string | null
          announced_on?: string | null
          firm: string
          fund_name: string
          strategy?: string | null
          status: string
          target_millions?: number | null
          raised_millions?: number | null
          hard_cap_millions?: number | null
          prior_fund_millions?: number | null
          fund_number?: number | null
          placement_agent?: string | null
          notable_lps?: string | null
          headquarters?: string | null
          summary?: string | null
          source?: string | null
          source_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          article_id?: string | null
          announced_on?: string | null
          firm?: string
          fund_name?: string
          strategy?: string | null
          status?: string
          target_millions?: number | null
          raised_millions?: number | null
          hard_cap_millions?: number | null
          prior_fund_millions?: number | null
          fund_number?: number | null
          placement_agent?: string | null
          notable_lps?: string | null
          headquarters?: string | null
          summary?: string | null
          source?: string | null
          source_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      gp_pulse_index: {
        Row: {
          avg_deal_size_millions: number | null
          avg_ev_ebitda_multiple: number | null
          avg_fund_close_months: number | null
          created_at: string
          deal_count: number
          deal_count_wow_change: number | null
          deal_type_breakdown: Json
          deal_value_wow_change: number | null
          funds_in_market: number
          id: string
          median_ev_ebitda_multiple: number | null
          narrative_summary: string | null
          sector_breakdown: Json
          source_article_count: number
          total_deal_value_millions: number | null
          total_fund_target_millions: number | null
          trend_signals: Json
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          avg_deal_size_millions?: number | null
          avg_ev_ebitda_multiple?: number | null
          avg_fund_close_months?: number | null
          created_at?: string
          deal_count?: number
          deal_count_wow_change?: number | null
          deal_type_breakdown?: Json
          deal_value_wow_change?: number | null
          funds_in_market?: number
          id?: string
          median_ev_ebitda_multiple?: number | null
          narrative_summary?: string | null
          sector_breakdown?: Json
          source_article_count?: number
          total_deal_value_millions?: number | null
          total_fund_target_millions?: number | null
          trend_signals?: Json
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          avg_deal_size_millions?: number | null
          avg_ev_ebitda_multiple?: number | null
          avg_fund_close_months?: number | null
          created_at?: string
          deal_count?: number
          deal_count_wow_change?: number | null
          deal_type_breakdown?: Json
          deal_value_wow_change?: number | null
          funds_in_market?: number
          id?: string
          median_ev_ebitda_multiple?: number | null
          narrative_summary?: string | null
          sector_breakdown?: Json
          source_article_count?: number
          total_deal_value_millions?: number | null
          total_fund_target_millions?: number | null
          trend_signals?: Json
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      newsletters: {
        Row: {
          preheader: string | null
          slug: string | null
          edition: string
          recipient_count: number | null
          approved_at: string | null
          approved_by: string | null
          send_log: Json | null
          click_count: number | null
          content: Json
          created_at: string
          html_content: string | null
          id: string
          issue_number: number
          open_count: number | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          preheader?: string | null
          slug?: string | null
          edition?: string
          recipient_count?: number | null
          approved_at?: string | null
          approved_by?: string | null
          send_log?: Json | null
          click_count?: number | null
          content?: Json
          created_at?: string
          html_content?: string | null
          id?: string
          issue_number?: number
          open_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          preheader?: string | null
          slug?: string | null
          edition?: string
          recipient_count?: number | null
          approved_at?: string | null
          approved_by?: string | null
          send_log?: Json | null
          click_count?: number | null
          content?: Json
          created_at?: string
          html_content?: string | null
          id?: string
          issue_number?: number
          open_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_runs: {
        Row: {
          id: string
          mode: string
          success: boolean
          steps: Json
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          mode: string
          success?: boolean
          steps?: Json
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          mode?: string
          success?: boolean
          steps?: Json
          started_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      pe_firm_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_scraped_at: string | null
          name: string
          news_path: string | null
          press_release_path: string | null
          scrape_frequency_hours: number | null
          updated_at: string
          website_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_scraped_at?: string | null
          name: string
          news_path?: string | null
          press_release_path?: string | null
          scrape_frequency_hours?: number | null
          updated_at?: string
          website_url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_scraped_at?: string | null
          name?: string
          news_path?: string | null
          press_release_path?: string | null
          scrape_frequency_hours?: number | null
          updated_at?: string
          website_url?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_content: {
        Row: {
          article_id: string | null
          created_at: string
          id: string
          processed: boolean
          processed_at: string | null
          raw_content: string | null
          scraped_at: string
          source_id: string | null
          title: string | null
          url: string
        }
        Insert: {
          article_id?: string | null
          created_at?: string
          id?: string
          processed?: boolean
          processed_at?: string | null
          raw_content?: string | null
          scraped_at?: string
          source_id?: string | null
          title?: string | null
          url: string
        }
        Update: {
          article_id?: string | null
          created_at?: string
          id?: string
          processed?: boolean
          processed_at?: string | null
          raw_content?: string | null
          scraped_at?: string
          source_id?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraped_content_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraped_content_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "pe_firm_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          sectors: string[]
          alert_count: number
          role: string | null
          firm_type: string | null
          unsubscribe_token: string | null
          source: string | null
          welcome_sent_at: string | null
          last_opened_at: string | null
          last_clicked_at: string | null
          open_count: number
          click_count: number
          company: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          referral_code: string | null
          status: string
          subscribed_at: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          sectors?: string[]
          alert_count?: number
          role?: string | null
          firm_type?: string | null
          unsubscribe_token?: string | null
          source?: string | null
          welcome_sent_at?: string | null
          last_opened_at?: string | null
          last_clicked_at?: string | null
          open_count?: number
          click_count?: number
          company?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          referral_code?: string | null
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          sectors?: string[]
          alert_count?: number
          role?: string | null
          firm_type?: string | null
          unsubscribe_token?: string | null
          source?: string | null
          welcome_sent_at?: string | null
          last_opened_at?: string | null
          last_clicked_at?: string | null
          open_count?: number
          click_count?: number
          company?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          referral_code?: string | null
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_staff: {
        Args: { _user_id: string }
        Returns: boolean
      }
      increment_counter: {
        Args: { table_name: string; row_id: string; column_name: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "editor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor"],
    },
  },
} as const
