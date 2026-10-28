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
