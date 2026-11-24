-- One question a week (Tuesday's issue), answered with one click from the email. Results run
-- the following Tuesday once enough readers have answered. Questions come from a standing bank
-- in `polls`, taken in `sort` order; add rows to extend it. Applied 2026-11-23 with 16 questions
-- (see the seed in the project's migration history).
CREATE TABLE IF NOT EXISTS public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort smallint NOT NULL DEFAULT 100,
  question text NOT NULL UNIQUE,
  options text[] NOT NULL CHECK (array_length(options, 1) BETWEEN 2 AND 5),
  active_from date,
  newsletter_id uuid REFERENCES public.newsletters(id) ON DELETE SET NULL,
  result_newsletter_id uuid REFERENCES public.newsletters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, subscriber_id)
);
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Staff can read polls" ON public.polls FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
  CREATE POLICY "Staff can write polls" ON public.polls FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
  CREATE POLICY "Staff can read poll votes" ON public.poll_votes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
