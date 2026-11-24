-- Mailing-list sign-ups (firm-watch/src/subscribe.mjs): what happened the one time we tried.
-- signup_status: subscribed | failed | captcha | needs_browser | skipped
ALTER TABLE public.pe_firm_sources
  ADD COLUMN IF NOT EXISTS signup_status text,
  ADD COLUMN IF NOT EXISTS signup_note text,
  ADD COLUMN IF NOT EXISTS signup_attempted_at timestamptz;
