# The GP Pulse

The lower middle market, every weekday morning. A Vite + React front end (Vercel/Netlify) on Supabase with edge functions that gather overnight, extract deals and funds with disclosed figures only, draft the issue in a single editorial voice, and send at 6am ET after an editor approves.

## How an issue gets made

| When (CT) | Step | Function |
|---|---|---|
| 5:00pm | Scrape firm newsrooms, wires, trades; AI-classify; drop mega-caps and non-NA items | `scrape-*`, `process-content` |
| 5:05pm | Extract structured deals/funds (disclosed figures only), write the Lede, subject, "why it matters", deal takes, By the numbers, The Read | `generate-newsletter` |
| evening | Editor opens `/admin` → **Desk**, edits the Lede, cuts what doesn't belong, adds *On the market* / *Overheard* items, clicks **Approve for 6am** | — |
| 5:00am (6 ET) | Send the approved issue; log a `sent` event per recipient | `daily-newsletter-pipeline` mode=`send` → `send-newsletter` |
| all day | Opens, clicks, bounces, complaints arrive from Resend | `resend-webhook` |

If nothing is approved, the morning send **skips** (logged in `pipeline_runs`). Set `AUTO_SEND=true` to send the draft unattended.

## Content schema (v2)

`newsletters.content` is a `NewsletterContentV2` (see `supabase/functions/_shared/content.ts`, mirrored at `src/lib/newsletter-content.ts`):

`editors_note` · `market_data` · `by_the_numbers` · `top_headlines` · `deal_tracker` · `on_the_market` · `fund_tracker` · `people_moves` · `market_pulse` · `overheard` · `the_read` · `jobs` · `closing_line`

Old v1 issues still render — `normalizeContent()` upgrades them on read.

Structured rows are also persisted to `deals` and `funds` (public read) and power `/deals`.

## One-time setup

See `deploy/README.md` for the full walkthrough (GitHub → Vercel → Supabase → Resend). Short version:

### 1. Run the migration
`supabase/migrations/20261027160000_editorial_v2.sql`. It locks down the subscriber table (the old policies exposed every email publicly), adds roles, deals, funds, editor items, email events, and the approval workflow.

### 2. Make yourself an editor
Create a user in Supabase Auth (email + password), then:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@firm.com';
```
Sign in at `/admin`.

### 3. Edge function secrets
| Secret | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | yes | |
| `NEWSLETTER_FROM` | yes | `The GP Pulse <pulse@mail.yourdomain.com>` — verify the domain in Resend first. Sending from `resend.dev` goes to spam. |
| `NEWSLETTER_REPLY_TO` | yes | A real inbox. "Reply, a person reads it" is a product promise. |
| `NEWSLETTER_POSTAL_ADDRESS` | yes | CAN-SPAM requires a physical address in the footer. |
| `NEWSLETTER_EDITOR_NAME` / `NEWSLETTER_EDITOR_TITLE` | yes | Also set in `src/lib/site.ts` for the website. |
| `SITE_URL` | yes | `https://thegppulse.com` — used for unsubscribe, preferences, referral and "read online" links. |
| `RESEND_WEBHOOK_SECRET` | yes | From Resend → Webhooks (`whsec_…`). Endpoint: `/functions/v1/resend-webhook`. Enable delivered, opened, clicked, bounced, complained. |
| `ANTHROPIC_API_KEY` | yes | Writes the issue (Sonnet for the editorial pass, Haiku for extraction). `OPENAI_API_KEY` works as a fallback. |
| `FIRECRAWL_API_KEY` | yes | Scraping. |
| `FRED_API_KEY` | optional | Free at fred.stlouisfed.org. Adds the HY spread to the ticker. |
| `PIPELINE_SECRET` | optional | Lets an external scheduler call the pipeline with an `x-pipeline-secret` header. The pg_cron jobs below use the service key instead. |
| `AUTO_SEND` | optional | `true` to send unapproved drafts at 6am. Default off. |

### 4. Schedule it
In the SQL editor (pg_cron + pg_net are enabled by an earlier migration):
```sql
select cron.schedule('gp-pulse-build', '0 22 * * 0-4', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-newsletter-pipeline',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{"mode":"full"}'::jsonb) $$);

select cron.schedule('gp-pulse-send', '0 11 * * 1-5', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-newsletter-pipeline',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{"mode":"send"}'::jsonb) $$);
```
Times are UTC: `22:00 UTC` = 5pm CDT build, `11:00 UTC` = 6am EDT send. Shift both by an hour when clocks change, or run them an hour early year-round.

### 5. Deliverability checklist
- SPF, DKIM and DMARC on the sending domain (Resend walks you through it).
- Send from a subdomain (`mail.`) so the root domain's reputation is insulated.
- Warm up: the first week, send to a few dozen known-good addresses before importing a list.
- `List-Unsubscribe` + one-click headers are already set on every send.

## Admin (`/admin`)
- **Desk** — the editorial workflow: edit subject/preheader, the Lede, By the numbers, takes; remove items; feature a deal; queue *On the market* / *Overheard* / *Jobs*; preview; test send; approve; send now.
- **Analytics**, **Issues**, **Subscribers** (role, firm vs. personal email, opens/clicks), **People**, **Pipeline**.

## Public pages
`/` landing · `/deals` deal tracker · `/deal-stats` weekly index · `/people-moves` · `/archive` and `/archive/:slug` · `/about` · `/referrals` · `/preferences?token=` · `/unsubscribe?token=`

## Voice
`HOUSE_STYLE` in `supabase/functions/_shared/ai.ts` is the single source of truth for how the model writes: direct, numbers first, conviction-tagged, banned-word list, no invented figures. Edit it there and every section follows.

## Local dev
```sh
npm i
npm run dev
```
Backend deploys from GitHub Actions on push to `main` (`.github/workflows/deploy-backend.yml`); the schedule runs in `pipeline.yml`. `supabase/functions/_shared/` holds code shared across functions. `npm run check:functions` typechecks them with Deno.
