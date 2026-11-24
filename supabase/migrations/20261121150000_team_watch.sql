-- Team watch: each sponsor's team page is stored as a list of { name, title } and compared on
-- later runs (firm-watch/src/team.mjs). A title that moves up is a promotion nobody announced.
ALTER TABLE public.pe_firm_sources
  ADD COLUMN IF NOT EXISTS team_url text,
  ADD COLUMN IF NOT EXISTS team_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_members jsonb;

-- One row per person per move, from either route:
--   team_page     seen as a change on the firm's own team page
--   announcement  read out of a press release or news item by the classifier
-- status: 'published' went to the People section, 'review' is waiting on the Editor's Desk,
-- 'logged' is kept for the record only (junior moves, sideways title changes).
CREATE TABLE IF NOT EXISTS public.people_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.pe_firm_sources(id) ON DELETE SET NULL,
  firm_name text NOT NULL,
  person_name text NOT NULL,
  person_key text NOT NULL,
  move_type text NOT NULL CHECK (move_type IN ('promotion', 'hire', 'departure', 'title_change')),
  old_title text,
  new_title text,
  old_rank smallint,
  new_rank smallint,
  source text NOT NULL CHECK (source IN ('team_page', 'announcement')),
  source_url text,
  status text NOT NULL DEFAULT 'logged' CHECK (status IN ('published', 'review', 'logged')),
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  move_key text NOT NULL UNIQUE,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_moves_detected_idx ON public.people_moves (detected_at DESC);
CREATE INDEX IF NOT EXISTS people_moves_person_idx ON public.people_moves (person_key);
CREATE INDEX IF NOT EXISTS people_moves_firm_idx ON public.people_moves (firm_id);
ALTER TABLE public.people_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read people moves" ON public.people_moves;
CREATE POLICY "Staff can read people moves" ON public.people_moves FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
