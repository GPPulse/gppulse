-- BDC schedules of investments, one row per BDC × filing × issuer (firm-watch/src/bdc.mjs).
-- is_new = absent from the BDC's previous 10-Q/10-K: a new financing, usually an unannounced
-- sponsor deal, add-on or recap. The newsletter reads new rows into Below the radar.
CREATE TABLE IF NOT EXISTS public.bdc_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bdc_ticker text NOT NULL,
  bdc_name text,
  period_end date,
  filed_on date,
  accession text NOT NULL,
  issuer text NOT NULL,
  issuer_key text NOT NULL,
  fair_value numeric,
  cost numeric,
  principal numeric,
  spread_pct numeric,
  rate_pct numeric,
  maturity date,
  first_lien boolean,
  instruments text[],
  is_new boolean NOT NULL DEFAULT false,
  venture boolean NOT NULL DEFAULT false,
  source_url text,
  used_in_newsletter_id uuid REFERENCES public.newsletters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bdc_ticker, accession, issuer_key)
);
CREATE INDEX IF NOT EXISTS bdc_holdings_new_idx ON public.bdc_holdings (filed_on DESC) WHERE is_new;
CREATE INDEX IF NOT EXISTS bdc_holdings_issuer_idx ON public.bdc_holdings (issuer_key);
ALTER TABLE public.bdc_holdings ENABLE ROW LEVEL SECURITY;
-- No public policies: read by edge functions with the service role only.
