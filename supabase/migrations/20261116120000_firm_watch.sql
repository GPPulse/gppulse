-- Firm watch: anchor coverage to a watchlist of true middle-market sponsors
-- (860 active US firms with AUM of $2B or less). watch_tier is recency of last deal:
-- 1 = last 12 months, 2 = last 2 years, 3 = last 5 years, 4 = older.
-- The crawler (firm-watch/, GitHub Actions) reads these rows and files news into scraped_content.

ALTER TABLE public.pe_firm_sources
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS watchlist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watch_tier smallint,
  ADD COLUMN IF NOT EXISTS firm_type text,
  ADD COLUMN IF NOT EXISTS news_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS signup_page text,
  ADD COLUMN IF NOT EXISTS signup_provider text,
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz;

UPDATE public.pe_firm_sources
SET domain = regexp_replace(lower(website_url), '^https?://(www\.)?([^/]+).*$', '\2')
WHERE domain IS NULL;
CREATE INDEX IF NOT EXISTS idx_pe_firm_sources_domain ON public.pe_firm_sources (domain);
CREATE INDEX IF NOT EXISTS idx_pe_firm_sources_watchlist ON public.pe_firm_sources (watchlist) WHERE watchlist;

-- Nothing on the site reads this table; edge functions use the service role.
DROP POLICY IF EXISTS "Public can view active sources" ON public.pe_firm_sources;

-- Articles remember which watchlist firm they are about, so the draft can rank them first.
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS watchlist_firm text;

-- Mail received by the watch inbox (firm mailing lists). Announcements are also copied into
-- scraped_content; confirmation emails stay here with the link to click.
CREATE TABLE IF NOT EXISTS public.watch_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.pe_firm_sources(id) ON DELETE SET NULL,
  message_id text NOT NULL UNIQUE,
  from_address text,
  from_name text,
  subject text,
  kind text NOT NULL DEFAULT 'news' CHECK (kind IN ('news', 'confirm')),
  confirm_url text,
  confirmed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.watch_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage watch inbox" ON public.watch_inbox;
CREATE POLICY "Staff can manage watch inbox" ON public.watch_inbox FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Wire feeds by subject, using the codes GlobeNewswire lists today.
INSERT INTO public.rss_feeds (name, url, category_hint, fetch_article) VALUES
  ('GlobeNewswire — Mergers and Acquisitions (27)', 'https://www.globenewswire.com/RssFeed/subjectcode/27-Mergers%20And%20Acquisitions/feedTitle/GlobeNewswire%20-%20Mergers%20And%20Acquisitions', 'deal_flow', true),
  ('GlobeNewswire — Management Changes (86)',       'https://www.globenewswire.com/RssFeed/subjectcode/86-Management%20Changes/feedTitle/GlobeNewswire%20-%20Management%20Changes', 'people_moves', true),
  ('GlobeNewswire — Financing Agreements (17)',     'https://www.globenewswire.com/RssFeed/subjectcode/17-Financing%20Agreements/feedTitle/GlobeNewswire%20-%20Financing%20Agreements', NULL, true)
ON CONFLICT (url) DO NOTHING;

-- The watchlist rows themselves are loaded from firm-watch/data/firms.json by the firm-watch
-- workflow (action "seed"), which matches firms already tracked on domain and adds the rest.
