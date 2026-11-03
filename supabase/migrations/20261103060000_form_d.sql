-- SEC Form D tracking: every filing we inspect, so we never re-fetch, plus unique article URLs.
CREATE TABLE IF NOT EXISTS public.sec_form_d (
  accession text PRIMARY KEY,
  cik text,
  issuer text,
  fund_type text,
  industry_group text,
  is_amendment boolean,
  total_offering numeric,
  amount_sold numeric,
  state text,
  filed_at timestamptz,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sec_form_d ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view form d" ON public.sec_form_d;
CREATE POLICY "Staff can view form d" ON public.sec_form_d FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_sec_form_d_filed ON public.sec_form_d (filed_at DESC);

-- Articles are upserted by URL from structured sources
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_source_url ON public.articles (source_url) WHERE source_url IS NOT NULL;
