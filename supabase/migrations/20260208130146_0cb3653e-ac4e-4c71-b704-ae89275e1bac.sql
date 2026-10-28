
-- Create GP Pulse Index table for weekly proprietary data snapshots
CREATE TABLE public.gp_pulse_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  
  -- Deal volume metrics
  deal_count integer NOT NULL DEFAULT 0,
  total_deal_value_millions numeric,
  avg_deal_size_millions numeric,
  
  -- Multiples & valuation
  avg_ev_ebitda_multiple numeric,
  median_ev_ebitda_multiple numeric,
  
  -- Fund activity
  funds_in_market integer NOT NULL DEFAULT 0,
  total_fund_target_millions numeric,
  avg_fund_close_months numeric,
  
  -- Sector breakdown (stored as JSONB for flexibility)
  sector_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Deal type breakdown
  deal_type_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Week-over-week changes
  deal_count_wow_change numeric,
  deal_value_wow_change numeric,
  
  -- AI-generated narrative summary
  narrative_summary text,
  
  -- Trend signals
  trend_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Source article count used to generate this index
  source_article_count integer NOT NULL DEFAULT 0,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(week_start)
);

-- Enable RLS
ALTER TABLE public.gp_pulse_index ENABLE ROW LEVEL SECURITY;

-- Public can view the index (it's proprietary but public-facing for SEO/sharing)
CREATE POLICY "Public can view GP Pulse Index"
ON public.gp_pulse_index
FOR SELECT
USING (true);

-- Add index for fast lookups
CREATE INDEX idx_gp_pulse_index_week ON public.gp_pulse_index(week_start DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_gp_pulse_index_updated_at
BEFORE UPDATE ON public.gp_pulse_index
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
