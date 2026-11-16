-- Firm watch, second pass: sources beyond sponsor news pages.
-- source_kind separates sponsors (the watchlist) from the advisors and lenders whose
-- closed-transaction pages are read for deals sponsors never announce.
-- portfolio_* holds each sponsor's portfolio page and the company names last seen on it,
-- so a new name can be flagged to the editor as an unannounced deal signal.

ALTER TABLE public.pe_firm_sources
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'sponsor',
  ADD COLUMN IF NOT EXISTS deals_url text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS portfolio_names jsonb,
  ADD COLUMN IF NOT EXISTS portfolio_checked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pe_firm_sources_source_kind_check') THEN
    ALTER TABLE public.pe_firm_sources ADD CONSTRAINT pe_firm_sources_source_kind_check CHECK (source_kind IN ('sponsor', 'advisor', 'lender'));
  END IF;
END $$;
