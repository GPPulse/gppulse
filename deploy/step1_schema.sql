-- STEP 1 of 3 — Schema. Paste into Supabase SQL editor (or Lovable Cloud → Database → SQL) and run once.
-- Safe to re-run: every statement is IF NOT EXISTS / DROP IF EXISTS.
BEGIN;
-- ============================================================================
-- The GP Pulse — Editorial v2
--
-- 1. Lock down subscriber data (the old policies exposed every email publicly)
-- 2. Admin roles for the /admin dashboard
-- 3. Structured deal + fund tables (disclosed figures only, no AI estimates)
-- 4. Editor-curated items (On the Market, Overheard, Reader Q, Jobs)
-- 5. Email events from the Resend webhook (opens, clicks, bounces, complaints)
-- 6. Subscriber lifecycle columns (role, firm, unsubscribe token, source)
-- 7. Newsletter workflow (approved status, preheader, slug) + scheduling
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS lockdown
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can check if email exists" ON public.subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.subscribers;
DROP POLICY IF EXISTS "Public can view referrals by referrer" ON public.referrals;

-- All subscriber reads/writes go through edge functions (service role).
-- Nothing is readable with the publishable key.

-- ---------------------------------------------------------------------------
-- 2. Admin roles
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'editor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'editor')
  )
$$;

DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Staff can read every newsletter (drafts included) and edit them from the dashboard.
DROP POLICY IF EXISTS "Staff can view all newsletters" ON public.newsletters;
CREATE POLICY "Staff can view all newsletters"
ON public.newsletters FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update newsletters" ON public.newsletters;
CREATE POLICY "Staff can update newsletters"
ON public.newsletters FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view all articles" ON public.articles;
CREATE POLICY "Staff can view all articles"
ON public.articles FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage articles" ON public.articles;
CREATE POLICY "Staff can manage articles"
ON public.articles FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Staff may read the subscriber list from the dashboard (analytics charts).
-- Writes still go through the manage-subscribers function.
DROP POLICY IF EXISTS "Staff can view subscribers" ON public.subscribers;
CREATE POLICY "Staff can view subscribers"
ON public.subscribers FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view referrals" ON public.referrals;
CREATE POLICY "Staff can view referrals"
ON public.referrals FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Structured deals + funds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  announced_on date,
  sponsor text NOT NULL,
  target text NOT NULL,
  deal_type text NOT NULL CHECK (deal_type IN ('platform', 'add-on', 'exit', 'recap', 'growth', 'carve-out', 'secondary', 'other')),
  sector text,
  sub_sector text,
  geography text,
  enterprise_value_millions numeric,
  revenue_millions numeric,
  ebitda_millions numeric,
  ev_ebitda_multiple numeric,
  figures_disclosed boolean NOT NULL DEFAULT false,
  seller text,
  advisors text,
  lender text,
  summary text,
  source text,
  source_url text,
  featured boolean NOT NULL DEFAULT false,
  editor_take text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor, target)
);
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view deals" ON public.deals;
CREATE POLICY "Public can view deals" ON public.deals FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can manage deals" ON public.deals;
CREATE POLICY "Staff can manage deals" ON public.deals FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_deals_announced ON public.deals (announced_on DESC);
CREATE INDEX IF NOT EXISTS idx_deals_sector ON public.deals (sector);
DROP TRIGGER IF EXISTS update_deals_updated_at ON public.deals;
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  announced_on date,
  firm text NOT NULL,
  fund_name text NOT NULL,
  strategy text,
  status text NOT NULL CHECK (status IN ('launched', 'first_close', 'final_close', 'oversubscribed', 'other')),
  target_millions numeric,
  raised_millions numeric,
  hard_cap_millions numeric,
  prior_fund_millions numeric,
  fund_number integer,
  placement_agent text,
  notable_lps text,
  headquarters text,
  summary text,
  source text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm, fund_name)
);
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view funds" ON public.funds;
CREATE POLICY "Public can view funds" ON public.funds FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can manage funds" ON public.funds;
CREATE POLICY "Staff can manage funds" ON public.funds FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_funds_announced ON public.funds (announced_on DESC);
DROP TRIGGER IF EXISTS update_funds_updated_at ON public.funds;
CREATE TRIGGER update_funds_updated_at BEFORE UPDATE ON public.funds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Editor-curated items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.editor_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('on_the_market', 'overheard', 'reader_question', 'job', 'the_read', 'event')),
  headline text NOT NULL,
  body text,
  url text,
  attribution text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'published', 'archived')),
  newsletter_id uuid REFERENCES public.newsletters(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.editor_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view published editor items" ON public.editor_items;
CREATE POLICY "Public can view published editor items" ON public.editor_items FOR SELECT
USING (status = 'published');
DROP POLICY IF EXISTS "Staff can manage editor items" ON public.editor_items;
CREATE POLICY "Staff can manage editor items" ON public.editor_items FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_editor_items_status ON public.editor_items (status, kind);
DROP TRIGGER IF EXISTS update_editor_items_updated_at ON public.editor_items;
CREATE TRIGGER update_editor_items_updated_at BEFORE UPDATE ON public.editor_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Email events (Resend webhook)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id text,
  event_type text NOT NULL,
  email text,
  newsletter_id uuid REFERENCES public.newsletters(id) ON DELETE SET NULL,
  subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  link_url text,
  payload jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view email events" ON public.email_events;
CREATE POLICY "Staff can view email events" ON public.email_events FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_email_events_newsletter ON public.email_events (newsletter_id, event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_subscriber ON public.email_events (subscriber_id);

-- ---------------------------------------------------------------------------
-- 6. Subscriber lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS firm_type text,
  ADD COLUMN IF NOT EXISTS unsubscribe_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

UPDATE public.subscribers
SET unsubscribe_token = encode(gen_random_bytes(16), 'hex')
WHERE unsubscribe_token IS NULL;

ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_status_check;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_status_check
  CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained'));

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON public.subscribers (status);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON public.subscribers (unsubscribe_token);

-- ---------------------------------------------------------------------------
-- 7. Newsletter workflow
-- ---------------------------------------------------------------------------
ALTER TABLE public.newsletters DROP CONSTRAINT IF EXISTS newsletters_status_check;
ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_status_check
  CHECK (status IN ('draft', 'approved', 'scheduled', 'sending', 'sent', 'skipped'));

ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS preheader text,
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS edition text NOT NULL DEFAULT 'daily' CHECK (edition IN ('daily', 'weekly', 'special')),
  ADD COLUMN IF NOT EXISTS recipient_count integer,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_log jsonb;

CREATE INDEX IF NOT EXISTS idx_newsletters_status ON public.newsletters (status, created_at DESC);

-- Pipeline run log so the admin can see what the cron did overnight
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view pipeline runs" ON public.pipeline_runs;
CREATE POLICY "Staff can view pipeline runs" ON public.pipeline_runs FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. Scheduling (pg_cron + pg_net)
--
-- Replace <PROJECT_REF> and <ANON_KEY> before running, or run the two
-- cron.schedule calls from the SQL editor after deploying functions.
-- Times are UTC. During CDT (UTC-5): 22:00 UTC = 5pm CT build; 11:00 UTC = 6am ET send.
-- During CST (UTC-6) shift each by an hour or use the DST-aware wrapper below.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 9. Atomic counter helper used by the Resend webhook
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_counter(table_name text, row_id uuid, column_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF table_name NOT IN ('newsletters', 'subscribers') OR column_name NOT IN ('open_count', 'click_count') THEN
    RAISE EXCEPTION 'increment_counter: not allowed';
  END IF;
  EXECUTE format('UPDATE public.%I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1', table_name, column_name, column_name) USING row_id;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_counter(text, uuid, text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Public read of the archive by slug (issue pages) — already covered by
--     "Public can view sent newsletters"; nothing to add.
-- ---------------------------------------------------------------------------

-- The GP Pulse — sector deal alerts, reader tips, who's raising
-- Run after 20261027160000_editorial_v2.sql

-- Subscriber sector preferences drive deal alerts
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS sectors text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alert_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_subscribers_sectors ON public.subscribers USING gin (sectors);

-- Track which deals have already gone out as alerts
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_recipients integer;

-- Reader-submitted tips land as 'submitted' and need an editor to promote them to 'queued'
ALTER TABLE public.editor_items DROP CONSTRAINT IF EXISTS editor_items_status_check;
ALTER TABLE public.editor_items ADD CONSTRAINT editor_items_status_check
  CHECK (status IN ('submitted', 'queued', 'published', 'archived'));
ALTER TABLE public.editor_items
  ADD COLUMN IF NOT EXISTS submitted_by_email text,
  ADD COLUMN IF NOT EXISTS submitted_by_role text,
  ADD COLUMN IF NOT EXISTS attribution_ok boolean NOT NULL DEFAULT false;

-- Tip volume log (lightweight abuse control: the function refuses >5 per email per day)
CREATE INDEX IF NOT EXISTS idx_editor_items_submitted ON public.editor_items (submitted_by_email, created_at);
COMMIT;
