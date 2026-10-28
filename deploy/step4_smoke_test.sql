-- STEP 4 (optional) — Fire the pipeline by hand instead of waiting for 5pm, then check what happened.
-- Replace <SERVICE_ROLE_KEY>. Takes 2–4 minutes; re-run the second query until a row appears.
select net.http_post(
  url := 'https://kqiazvoxspmwpzzfopzy.supabase.co/functions/v1/daily-newsletter-pipeline',
  headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
  body := '{"mode":"full"}'::jsonb);

select mode, success, started_at, jsonb_pretty(steps) from public.pipeline_runs order by started_at desc limit 1;
select issue_number, subject, status, created_at from public.newsletters order by created_at desc limit 3;
