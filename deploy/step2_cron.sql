-- STEP 2 of 3 — Schedule. Replace <SERVICE_ROLE_KEY> (Supabase → Project Settings → API → service_role) then run.
-- Times are UTC. 22:00 UTC = 5pm CDT build (Sun–Thu, for Mon–Fri issues). 11:00 UTC = 6am EDT send (Mon–Fri).
-- After the November clock change use 23:00 and 12:00, or leave as-is and accept an hour earlier.

select cron.unschedule(jobname) from cron.job where jobname in ('gp-pulse-build','gp-pulse-send');

select cron.schedule('gp-pulse-build', '0 22 * * 0-4', $$
  select net.http_post(
    url := 'https://kqiazvoxspmwpzzfopzy.supabase.co/functions/v1/daily-newsletter-pipeline',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{"mode":"full"}'::jsonb) $$);

select cron.schedule('gp-pulse-send', '0 11 * * 1-5', $$
  select net.http_post(
    url := 'https://kqiazvoxspmwpzzfopzy.supabase.co/functions/v1/daily-newsletter-pipeline',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{"mode":"send"}'::jsonb) $$);

-- Verify:
select jobname, schedule, active from cron.job where jobname like 'gp-pulse%';
