CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
-- Trade publications and the Google News LMM sweep become a fourth kind of source.
ALTER TABLE public.pe_firm_sources DROP CONSTRAINT IF EXISTS pe_firm_sources_source_kind_check;
ALTER TABLE public.pe_firm_sources ADD CONSTRAINT pe_firm_sources_source_kind_check CHECK (source_kind IN ('sponsor', 'advisor', 'lender', 'trade'));

-- Deal records now carry what the extraction can see: the platform an add-on joins, who sold,
-- where the company is, and how we found it (press release vs. banker tombstone vs. trade press).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS seller_type text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS hq_state text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS found_via text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS below_radar boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS deals_sponsor_lower_idx ON public.deals (lower(sponsor));
CREATE INDEX IF NOT EXISTS deals_platform_lower_idx ON public.deals (lower(platform));
CREATE INDEX IF NOT EXISTS scraped_content_title_trgm_idx ON public.scraped_content USING gin (lower(title) extensions.gin_trgm_ops);

-- What we already know about the parties to a deal, from our own archive. This is the
-- context line under each deal ("Kinderhook's 4th deal since Nov 3; on 11 banker tombstones").
CREATE OR REPLACE FUNCTION public.deal_context(p_sponsor text, p_stem text, p_target text, p_platform text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT lower(trim(p_sponsor)) AS sp, lower(trim(coalesce(p_stem, p_sponsor))) AS stem,
           lower(trim(p_target)) AS tg, lower(trim(coalesce(p_platform, ''))) AS pf
  ),
  tracker AS (
    SELECT d.target, d.announced_on, d.deal_type FROM deals d, s
    WHERE (lower(d.sponsor) = s.sp OR (length(s.stem) >= 6 AND lower(d.sponsor) LIKE s.stem || '%'))
      AND lower(d.target) <> s.tg AND NOT d.hidden
    ORDER BY d.announced_on DESC LIMIT 8
  ),
  platform_adds AS (
    SELECT d.target, d.announced_on FROM deals d, s
    WHERE s.pf <> '' AND (lower(d.platform) = s.pf OR lower(d.target) = s.pf) AND lower(d.target) <> s.tg AND NOT d.hidden
  ),
  tomb AS (
    SELECT sc.source_name, count(*) AS n FROM scraped_content sc JOIN pe_firm_sources p ON p.id = sc.source_id, s
    WHERE p.source_kind IN ('advisor', 'lender') AND length(s.stem) >= 6 AND lower(sc.title) LIKE '%' || s.stem || '%'
    GROUP BY 1 ORDER BY 2 DESC
  ),
  fund AS (
    SELECT f.fund_name, f.raised_millions, f.target_millions, f.status, f.announced_on FROM funds f, s
    WHERE NOT f.hidden AND (lower(f.firm) = s.sp OR (length(s.stem) >= 6 AND lower(f.firm) LIKE s.stem || '%'))
    ORDER BY f.announced_on DESC LIMIT 1
  ),
  press AS (
    SELECT count(*) AS n FROM scraped_content sc LEFT JOIN pe_firm_sources p ON p.id = sc.source_id, s
    WHERE length(s.tg) >= 5 AND lower(sc.title) LIKE '%' || s.tg || '%'
      AND coalesce(p.source_kind, 'feed') NOT IN ('advisor', 'lender', 'trade')
      AND sc.scraped_at > now() - interval '45 days'
  )
  SELECT jsonb_build_object(
    'tracker', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM tracker t), '[]'::jsonb),
    'platform_addons', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM platform_adds a), '[]'::jsonb),
    'tombstone_banks', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM tomb LIMIT 4) t), '[]'::jsonb),
    'tombstone_total', (SELECT coalesce(sum(n), 0) FROM tomb),
    'fund', (SELECT to_jsonb(f) FROM fund f),
    'press_mentions', (SELECT n FROM press)
  );
$$;

-- Who is busy: banks and lenders posting new closings, platforms stacking add-ons, sectors
-- running hot against their own trailing pace. Feeds the Scoreboard section.
CREATE OR REPLACE FUNCTION public.market_intel(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH banks AS (
    SELECT p.name, p.source_kind, count(*) AS n, (array_agg(sc.title ORDER BY sc.scraped_at DESC))[1] AS latest
    FROM scraped_content sc JOIN pe_firm_sources p ON p.id = sc.source_id
    WHERE p.source_kind IN ('advisor', 'lender') AND sc.article_id IS NOT NULL AND sc.scraped_at > now() - make_interval(days => p_days)
    GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 8
  ),
  plats AS (
    SELECT coalesce(d.platform, '') AS platform, (array_agg(d.sponsor ORDER BY d.announced_on DESC))[1] AS sponsor, count(*) AS n,
           (array_agg(d.target ORDER BY d.announced_on DESC))[1:3] AS latest
    FROM deals d WHERE NOT d.hidden AND d.deal_type = 'add-on' AND d.platform IS NOT NULL AND d.platform <> ''
    GROUP BY 1 HAVING count(*) >= 2 ORDER BY 3 DESC LIMIT 8
  ),
  sponsors AS (
    SELECT d.sponsor, count(*) AS n FROM deals d
    WHERE NOT d.hidden AND d.announced_on > current_date - p_days AND d.deal_type IN ('platform', 'add-on', 'recap', 'growth', 'carve-out')
    GROUP BY 1 HAVING count(*) >= 2 ORDER BY 2 DESC LIMIT 8
  ),
  sectors AS (
    SELECT coalesce(sector, 'Other') AS sector,
           count(*) FILTER (WHERE announced_on > current_date - 7) AS this_week,
           round(count(*) FILTER (WHERE announced_on <= current_date - 7 AND announced_on > current_date - 35) / 4.0, 1) AS weekly_avg
    FROM deals WHERE NOT hidden AND announced_on > current_date - 35 GROUP BY 1 ORDER BY 2 DESC
  ),
  sellers AS (
    SELECT coalesce(seller_type, 'unknown') AS seller_type, count(*) AS n FROM deals
    WHERE NOT hidden AND announced_on > current_date - p_days AND deal_type IN ('platform', 'add-on', 'recap') GROUP BY 1
  ),
  radar AS (
    SELECT count(*) FILTER (WHERE below_radar) AS below, count(*) AS total FROM deals WHERE NOT hidden AND announced_on > current_date - p_days
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
