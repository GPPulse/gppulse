-- Weekend Reading: links worth a long read, collected through the week and published in the
-- Saturday edition. Rows arrive from mail sent to the reading address (inbound-email) and from
-- the editor. Only the link, its title and its publisher are kept; the text of the email a link
-- arrived in is not stored.
create table if not exists public.reading_queue (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  publisher text,
  -- Which digest or sender the link arrived in. Internal; never printed.
  via text,
  received_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'published', 'skipped')),
  newsletter_id uuid references public.newsletters(id) on delete set null
);
create index if not exists reading_queue_status_idx on public.reading_queue (status, received_at desc);
alter table public.reading_queue enable row level security;
-- No policies: only the service role (edge functions) reads or writes the queue.
