-- Tracker integrity. Three things were making the tracker say things that were not true:
--
--  1. Dates. Every deal was dated the day we built the issue. A sponsor's undated news archive,
--     read for the first time, became "four Seaport deals this week" (two were from 2023).
--     deals.date_known says whether we have a real announcement date; pace counts use only those.
--  2. Duplicates. "StationServ" on Monday and "StationServ Holdings" the Wednesday before were
--     two rows, so the file read "2nd Rosewood deal since Nov 18". A second sighting of a deal
--     is now stored hidden with duplicate_of set, and never counts.
--  3. The scoreboard counted every post on a bank's site as a closing, including hires.
--
-- All of it lives in the database so it holds whichever version of the generator is deployed.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS date_known boolean NOT NULL DEFAULT true;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.deals(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS first_seen_on date;

-- "StationServ Holdings, LLC" → "stationserv". Legal suffixes and punctuation carry no identity.
CREATE OR REPLACE FUNCTION public.co_key(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(t, '')), '&amp;', '&', 'g'),
    '\m(the|inc|incorporated|llc|l\.l\.c|lp|l\.p|ltd|plc|corp|corporation|co|company|holdings|holding|group)\M\.?', ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- "Falfurrias Capital Partners" and "Falfurrias Management Partners" → "falfurrias".
-- Only the first named sponsor counts; a stem that would be empty falls back to the full key.
CREATE OR REPLACE FUNCTION public.sponsor_key(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH k AS (SELECT public.co_key(split_part(split_part(split_part(coalesce(t, ''), ';', 1), '(', 1), ' and ', 1)) AS full_key),
  s AS (SELECT full_key, trim(regexp_replace(full_key,
    '(\s+(capital|partners|partner|equity|industries|management|investments|investment|investors|advisors|private|growth|fund|ventures|associates|i|ii|iii|iv|v|vi|vii))+$', '', 'g')) AS stem FROM k)
  SELECT CASE WHEN length(stem) >= 4 THEN stem ELSE full_key END FROM s;
$$;

-- Two names for one company: equal keys, or one name sitting whole inside the other
-- ("sun tech" in "sunrise technologies sun tech").
CREATE OR REPLACE FUNCTION public.same_company(a text, b text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  WITH k AS (SELECT public.co_key(a) AS ka, public.co_key(b) AS kb)
  SELECT CASE
    WHEN ka = '' OR kb = '' THEN false
    WHEN ka = kb THEN true
    WHEN length(ka) < 5 OR length(kb) < 5 THEN false
    ELSE (' ' || ka || ' ') LIKE ('% ' || kb || ' %') OR (' ' || kb || ' ') LIKE ('% ' || ka || ' %')
         OR extensions.similarity(ka, kb) >= 0.75
  END FROM k;
$$;

-- On the way in: take the real date from the article when there is one, and fold a repeat
-- sighting into the row we already have.
CREATE OR REPLACE FUNCTION public.deals_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  pub timestamptz;
  url_year int;
  prior uuid;
BEGIN
  NEW.first_seen_on := coalesce(NEW.first_seen_on, current_date);
  SELECT a.published_at INTO pub FROM articles a
   WHERE (NEW.article_id IS NOT NULL AND a.id = NEW.article_id) OR (NEW.source_url IS NOT NULL AND a.source_url = NEW.source_url)
   ORDER BY a.published_at NULLS LAST LIMIT 1;
  IF pub IS NOT NULL THEN
    NEW.date_known := true;
    NEW.announced_on := least(coalesce(NEW.announced_on, current_date), (pub AT TIME ZONE 'America/New_York')::date);
  ELSE
    NEW.date_known := false;
    -- /news/2023/... in the address is as good as a dateline.
    url_year := (substring(coalesce(NEW.source_url, '') from '/(20[0-9]{2})(?:/|-)'))::int;
    IF url_year IS NOT NULL AND url_year < extract(year from current_date)::int THEN
      NEW.announced_on := make_date(url_year, 12, 31);
      NEW.hidden := true;
    END IF;
  END IF;

  SELECT d.id INTO prior FROM deals d
   WHERE d.duplicate_of IS NULL AND d.announced_on > current_date - 90
     AND public.sponsor_key(d.sponsor) = public.sponsor_key(NEW.sponsor)
     AND public.same_company(d.target, NEW.target)
   ORDER BY d.created_at LIMIT 1;
  IF prior IS NOT NULL THEN
    NEW.duplicate_of := prior;
    NEW.hidden := true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS deals_before_insert ON public.deals;
CREATE TRIGGER deals_before_insert BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.deals_before_insert();

-- The file on a deal. Changes: the tracker lists only dated deals, one row per company, never
-- the deal itself under another spelling; a firm's own site is not a tombstone naming it;
-- prior_report says when we first carried this same deal.
CREATE OR REPLACE FUNCTION public.deal_context(p_sponsor text, p_stem text, p_target text, p_platform text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH s AS (
    SELECT lower(trim(p_sponsor)) AS sp, lower(trim(coalesce(p_stem, p_sponsor))) AS stem,
           lower(trim(p_target)) AS tg, lower(trim(coalesce(p_platform, ''))) AS pf, public.sponsor_key(p_sponsor) AS sk
  ),
  mine AS (
    SELECT d.* FROM deals d, s
    WHERE (lower(d.sponsor) = s.sp OR public.sponsor_key(d.sponsor) = s.sk OR (length(s.stem) >= 6 AND lower(d.sponsor) LIKE s.stem || '%'))
  ),
  prior AS (
    SELECT m.announced_on, m.first_seen_on, m.found_via, m.source FROM mine m
    WHERE m.duplicate_of IS NULL AND public.same_company(m.target, p_target) AND m.created_at < now() - interval '20 hours'
    ORDER BY m.created_at LIMIT 1
  ),
  tracker AS (
    SELECT DISTINCT ON (public.co_key(m.target)) m.target, m.announced_on, m.deal_type FROM mine m, s
    WHERE NOT m.hidden AND m.duplicate_of IS NULL AND m.date_known AND m.announced_on > current_date - 120
      AND NOT public.same_company(m.target, p_target)
    ORDER BY public.co_key(m.target), m.announced_on DESC
  ),
  platform_adds AS (
    SELECT DISTINCT ON (public.co_key(d.target)) d.target, d.announced_on FROM deals d, s
    WHERE s.pf <> '' AND public.same_company(d.platform, p_platform) AND d.deal_type = 'add-on'
      AND NOT public.same_company(d.target, p_target) AND NOT d.hidden AND d.duplicate_of IS NULL
    ORDER BY public.co_key(d.target), d.announced_on DESC
  ),
  tomb AS (
    SELECT sc.source_name, count(*) AS n FROM scraped_content sc JOIN pe_firm_sources p ON p.id = sc.source_id, s
    WHERE p.source_kind IN ('advisor', 'lender') AND length(s.stem) >= 6 AND lower(sc.title) LIKE '%' || s.stem || '%'
      AND public.sponsor_key(p.name) <> s.sk AND lower(p.name) NOT LIKE s.stem || '%'
      AND sc.title !~* '\m(names|named|joins|joined|promot|hires|hired|appoint|welcomes|ranked|award|conference|webinar|podcast)'
    GROUP BY 1 ORDER BY 2 DESC
  ),
  fund AS (
    SELECT f.fund_name, f.raised_millions, f.target_millions, f.status, f.announced_on FROM funds f, s
    WHERE NOT f.hidden AND (lower(f.firm) = s.sp OR public.sponsor_key(f.firm) = s.sk OR (length(s.stem) >= 6 AND lower(f.firm) LIKE s.stem || '%'))
    ORDER BY f.announced_on DESC LIMIT 1
  ),
  press AS (
    SELECT count(*) AS n FROM scraped_content sc LEFT JOIN pe_firm_sources p ON p.id = sc.source_id, s
    WHERE length(public.co_key(p_target)) >= 5 AND public.co_key(sc.title) LIKE '%' || public.co_key(p_target) || '%'
      AND lower(sc.title) LIKE '%' || split_part(public.co_key(p_target), ' ', 1) || '%'
      AND coalesce(p.source_kind, 'feed') NOT IN ('advisor', 'lender', 'trade')
      AND sc.scraped_at > now() - interval '45 days'
  )
  SELECT jsonb_build_object(
    'tracker', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.announced_on DESC) FROM (SELECT * FROM tracker ORDER BY announced_on DESC LIMIT 8) t), '[]'::jsonb),
    'platform_addons', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM platform_adds a), '[]'::jsonb),
    'tombstone_banks', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM tomb LIMIT 4) t), '[]'::jsonb),
    'tombstone_total', (SELECT coalesce(sum(n), 0) FROM tomb),
    'fund', (SELECT to_jsonb(f) FROM fund f),
    'press_mentions', (SELECT n FROM press),
    'prior_report', (SELECT to_jsonb(p) FROM prior p)
  );
$$;

-- The scoreboard. Changes: a bank's count is its deal posts, not its hires; sponsors are
-- counted under one name, on dated deals only, one row per company.
CREATE OR REPLACE FUNCTION public.market_intel(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH live AS (
    SELECT * FROM deals WHERE NOT hidden AND duplicate_of IS NULL
  ),
  banks AS (
    SELECT p.name, p.source_kind, count(*) AS n,
           (array_agg(CASE WHEN length(sc.title) > 110 THEN left(sc.title, 107) || '…' ELSE sc.title END ORDER BY sc.scraped_at DESC))[1] AS latest
    FROM scraped_content sc JOIN pe_firm_sources p ON p.id = sc.source_id JOIN articles a ON a.id = sc.article_id
    WHERE p.source_kind IN ('advisor', 'lender') AND a.category = 'deal_flow' AND sc.scraped_at > now() - make_interval(days => p_days)
      AND sc.title !~* '\m(names|named|joins|joined|promot|hires|hired|appoint|welcomes)'
    GROUP BY 1, 2 HAVING count(*) >= 2 ORDER BY 3 DESC, 1 LIMIT 8
  ),
  plats AS (
    SELECT (array_agg(d.platform ORDER BY d.announced_on DESC))[1] AS platform, (array_agg(d.sponsor ORDER BY d.announced_on DESC))[1] AS sponsor,
           count(DISTINCT public.co_key(d.target)) AS n, (array_agg(d.target ORDER BY d.announced_on DESC))[1:3] AS latest
    FROM live d WHERE d.deal_type = 'add-on' AND d.platform IS NOT NULL AND d.platform <> '' AND d.announced_on > current_date - 120
    GROUP BY public.co_key(d.platform) HAVING count(DISTINCT public.co_key(d.target)) >= 2 ORDER BY 3 DESC LIMIT 8
  ),
  sponsors AS (
    SELECT (array_agg(d.sponsor ORDER BY length(d.sponsor)))[1] AS sponsor, count(DISTINCT public.co_key(d.target)) AS n FROM live d
    WHERE d.date_known AND d.announced_on > current_date - p_days AND d.deal_type IN ('platform', 'add-on', 'recap', 'growth', 'carve-out')
    GROUP BY public.sponsor_key(d.sponsor) HAVING count(DISTINCT public.co_key(d.target)) >= 2 ORDER BY 2 DESC, 1 LIMIT 8
  ),
  sectors AS (
    SELECT coalesce(sector, 'Other') AS sector,
           count(*) FILTER (WHERE announced_on > current_date - 7) AS this_week,
           round(count(*) FILTER (WHERE announced_on <= current_date - 7 AND announced_on > current_date - 35) / 4.0, 1) AS weekly_avg
    FROM live WHERE date_known AND announced_on > current_date - 35 GROUP BY 1 ORDER BY 2 DESC
  ),
  sellers AS (
    SELECT coalesce(seller_type, 'unknown') AS seller_type, count(*) AS n FROM live
    WHERE announced_on > current_date - p_days AND deal_type IN ('platform', 'add-on', 'recap') GROUP BY 1
  ),
  radar AS (
    SELECT count(*) FILTER (WHERE below_radar) AS below, count(*) AS total FROM live WHERE date_known AND announced_on > current_date - p_days
  )
  SELECT jsonb_build_object(
    'banks', coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM banks b), '[]'::jsonb),
    'platforms', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM plats x), '[]'::jsonb),
    'sponsors', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sponsors x), '[]'::jsonb),
    'sectors', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sectors x), '[]'::jsonb),
    'sellers', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sellers x), '[]'::jsonb),
    'radar', (SELECT to_jsonb(r) FROM radar r)
  );
$$;
REVOKE ALL ON FUNCTION public.deal_context(text, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_intel(int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.deals_before_insert() FROM public, anon, authenticated;

-- Backfill: which existing rows have a real date, and which are second sightings.
UPDATE public.deals d SET first_seen_on = coalesce(d.first_seen_on, d.created_at::date);
UPDATE public.deals d SET date_known = EXISTS (
  SELECT 1 FROM public.articles a
  WHERE ((d.article_id IS NOT NULL AND a.id = d.article_id) OR (d.source_url IS NOT NULL AND a.source_url = d.source_url)) AND a.published_at IS NOT NULL);
UPDATE public.deals d SET hidden = true
 WHERE NOT d.date_known AND (substring(coalesce(d.source_url, '') from '/(20[0-9]{2})(?:/|-)'))::int < extract(year from d.created_at)::int;
UPDATE public.deals d SET duplicate_of = o.id, hidden = true
  FROM public.deals o
 WHERE o.id <> d.id AND o.created_at < d.created_at AND o.duplicate_of IS NULL
   AND public.sponsor_key(o.sponsor) = public.sponsor_key(d.sponsor) AND public.same_company(o.target, d.target)
   AND NOT EXISTS (SELECT 1 FROM public.deals e WHERE e.id <> d.id AND e.created_at < o.created_at
                   AND public.sponsor_key(e.sponsor) = public.sponsor_key(d.sponsor) AND public.same_company(e.target, d.target));
