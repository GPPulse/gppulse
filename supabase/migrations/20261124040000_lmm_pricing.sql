-- LMM loan pricing: aggregates over lender schedules of investments (bdc_holdings) for the
-- public /pricing page. Returns counts and quantiles only; no borrower or lender names leave
-- the table, which stays readable by the service role alone.
--
-- Scope: first-lien loans, venture lenders excluded, spreads between 2% and 12% (values outside
-- that band are parsing noise or non-cash-pay paper). "New" = absent from the same lender's
-- previous filing, i.e. a loan made in the quarter.
CREATE OR REPLACE FUNCTION public.lmm_pricing_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH loans AS (
    SELECT (date_trunc('quarter', period_end) + interval '3 months - 1 day')::date AS quarter_end,
           bdc_ticker, spread_pct, is_new, maturity, period_end, filed_on
    FROM public.bdc_holdings
    WHERE first_lien AND NOT venture AND period_end IS NOT NULL
      AND spread_pct IS NOT NULL AND spread_pct BETWEEN 2 AND 12
  ),
  q AS (
    SELECT quarter_end,
           count(*) FILTER (WHERE is_new) AS new_n,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY spread_pct) FILTER (WHERE is_new) AS new_p25,
           percentile_cont(0.5)  WITHIN GROUP (ORDER BY spread_pct) FILTER (WHERE is_new) AS new_median,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY spread_pct) FILTER (WHERE is_new) AS new_p75,
           count(*) AS book_n,
           percentile_cont(0.5)  WITHIN GROUP (ORDER BY spread_pct) AS book_median,
           count(DISTINCT bdc_ticker) AS lenders,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY (maturity - period_end) / 365.25)
             FILTER (WHERE is_new AND maturity > period_end) AS new_median_tenor_years,
           max(filed_on) AS last_filed
    FROM loans GROUP BY quarter_end
  ),
  latest AS (SELECT max(quarter_end) AS quarter_end FROM q WHERE new_n > 0),
  b AS (
    SELECT bucket, count(*) AS n
    FROM (
      SELECT CASE WHEN spread_pct < 4.5 THEN 1 WHEN spread_pct < 5 THEN 2 WHEN spread_pct < 5.5 THEN 3
                  WHEN spread_pct < 6 THEN 4 WHEN spread_pct < 6.5 THEN 5 WHEN spread_pct < 7 THEN 6 ELSE 7 END AS bucket
      FROM loans, latest WHERE loans.quarter_end = latest.quarter_end AND is_new
    ) x GROUP BY bucket
  )
  SELECT jsonb_build_object(
    'quarters', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'quarter_end', quarter_end, 'new_n', new_n,
        'new_p25', round(new_p25::numeric, 2), 'new_median', round(new_median::numeric, 2), 'new_p75', round(new_p75::numeric, 2),
        'book_n', book_n, 'book_median', round(book_median::numeric, 2), 'lenders', lenders,
        'new_median_tenor_years', round(new_median_tenor_years::numeric, 1), 'last_filed', last_filed
      ) ORDER BY quarter_end DESC) FROM q), '[]'::jsonb),
    'latest_quarter_end', (SELECT quarter_end FROM latest),
    'buckets', coalesce((SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'n', n) ORDER BY bucket) FROM b), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.lmm_pricing_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lmm_pricing_summary() TO anon, authenticated, service_role;
