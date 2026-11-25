-- Follow a sponsor: subscribers list firms in preferences and get a short note the evening one
-- of them shows up in the tracker (send-deal-alerts). deals.firm_alerted_at marks a deal as
-- already considered, so nobody hears about the same deal twice.
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS followed_firms text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_subscribers_followed_firms ON public.subscribers USING gin (followed_firms);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS firm_alerted_at timestamptz;
-- Deals already in the tracker predate the feature; do not alert on them.
UPDATE public.deals SET firm_alerted_at = now() WHERE firm_alerted_at IS NULL;
