-- Posts written from each issue for the newsletter's X account (supabase/functions/social-x).
-- One row per post. Nothing here is public; the Editor reads it through the staff policy.
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'x' CHECK (platform IN ('x')),
  newsletter_id uuid REFERENCES public.newsletters(id) ON DELETE SET NULL,
  kind text NOT NULL,                       -- lede | radar | number | pattern | signup
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'posted', 'failed', 'skipped')),
  external_id text,
  attempts smallint NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz
);
CREATE INDEX IF NOT EXISTS social_posts_due_idx ON public.social_posts (scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS social_posts_issue_idx ON public.social_posts (newsletter_id);
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read social posts" ON public.social_posts;
CREATE POLICY "Staff can read social posts" ON public.social_posts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update social posts" ON public.social_posts;
CREATE POLICY "Staff can update social posts" ON public.social_posts FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
