-- RSS feeds as the primary, credit-free content source.
-- Edit rows here (or in the admin) to add/remove feeds without a redeploy.

CREATE TABLE IF NOT EXISTS public.rss_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL UNIQUE,
  category_hint text,                    -- optional nudge for the classifier: headline | fund_tracker | people_moves | deal_flow | market_insight
  is_active boolean NOT NULL DEFAULT true,
  fetch_article boolean NOT NULL DEFAULT true,   -- also fetch the linked page for fuller text
  last_fetched_at timestamptz,
  last_status text,                      -- 'ok' | 'http 404' | 'parse error' | ...
  last_item_count integer,
  last_new_count integer,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rss_feeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage rss feeds" ON public.rss_feeds;
CREATE POLICY "Staff can manage rss feeds" ON public.rss_feeds FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP TRIGGER IF EXISTS update_rss_feeds_updated_at ON public.rss_feeds;
CREATE TRIGGER update_rss_feeds_updated_at BEFORE UPDATE ON public.rss_feeds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Scraped items can now come from a feed rather than a firm newsroom.
ALTER TABLE public.scraped_content
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS feed_id uuid REFERENCES public.rss_feeds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS category_hint text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraped_content_url ON public.scraped_content (url);
CREATE INDEX IF NOT EXISTS idx_scraped_content_unprocessed ON public.scraped_content (processed, scraped_at);

-- Starter feeds. URLs that 404 get flagged in last_status after the first run; fix or deactivate there.
INSERT INTO public.rss_feeds (name, url, category_hint, fetch_article) VALUES
  ('PR Newswire — Private Equity',          'https://www.prnewswire.com/rss/financial-services-latest-news/private-equity-list.rss', NULL, true),
  ('PR Newswire — M&A',                     'https://www.prnewswire.com/rss/financial-services-latest-news/acquisitions-mergers-and-takeovers-list.rss', 'deal_flow', true),
  ('GlobeNewswire — M&A',                   'https://www.globenewswire.com/RssFeed/subjectcode/22-Mergers%20and%20Acquisitions/feedTitle/GlobeNewswire%20-%20Mergers%20and%20Acquisitions', 'deal_flow', true),
  ('GlobeNewswire — Private Equity',        'https://www.globenewswire.com/RssFeed/subjectcode/68-Private%20Equity/feedTitle/GlobeNewswire%20-%20Private%20Equity', NULL, true),
  ('Business Wire — M&A',                   'https://www.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpRVQ==', 'deal_flow', true),
  ('PE Hub',                                'https://www.pehub.com/feed/', NULL, true),
  ('Buyouts',                               'https://www.buyoutsinsider.com/feed/', NULL, true),
  ('Middle Market Growth (ACG)',            'https://middlemarketgrowth.org/feed/', 'market_insight', true),
  ('Mergers & Acquisitions',                'https://www.themiddlemarket.com/feed', NULL, true),
  ('citybiz',                               'https://www.citybiz.co/feed/', 'deal_flow', true),
  ('Private Equity Wire',                   'https://www.privateequitywire.co.uk/feed/', NULL, false),
  ('Axios Pro Rata',                        'https://api.axios.com/feed/pro-rata', 'market_insight', false),
  ('Institutional Investor — Alternatives', 'https://www.institutionalinvestor.com/rss/alternatives', 'market_insight', false),
  ('PitchBook News',                        'https://pitchbook.com/news/rss', 'market_insight', false),
  ('Crain''s Chicago — Deals',              'https://www.chicagobusiness.com/section/private-equity/rss.xml', 'deal_flow', false),
  ('Dallas Business Journal — Deals',       'https://www.bizjournals.com/dallas/news/mergers-and-acquisitions/feed', 'deal_flow', false)
ON CONFLICT (url) DO NOTHING;
