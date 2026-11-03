-- Non-destructive moderation: rows we decide not to show stay in the table but are hidden.
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_funds_visible ON public.funds (announced_on DESC) WHERE hidden = false;
CREATE INDEX IF NOT EXISTS idx_deals_visible ON public.deals (announced_on DESC) WHERE hidden = false;
-- First Form D pass used a loose filter; hide those rows pending re-evaluation (scrape-form-d {reprocess:true}).
UPDATE public.funds SET hidden = true WHERE source = 'SEC Form D';
