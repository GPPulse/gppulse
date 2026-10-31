# The GP Pulse — deploy (own stack, no Lovable)

**Stack:** GitHub (source of truth) → Vercel or Netlify (front end) · Supabase (database, auth, edge functions) · Resend (email) · Anthropic (writing) · Firecrawl (scraping). GitHub Actions deploy the backend and run the schedule.

## What you set up once (~25 min)

### 1. Accounts and connectors
- **GitHub**: create an empty repo `gppulse`. In claude.ai → Settings → Connectors, connect GitHub. Then I push.
- **Supabase**: create a project (free tier). Save the **database password** you set. Either connect the Supabase connector in claude.ai, or create a personal access token (Account → Access Tokens) and give it to me — with either I run migrations, deploy functions and set secrets from here.
- **Vercel** (or Netlify): sign up with GitHub, *Import* the `gppulse` repo. It builds on every push. Add the three `VITE_*` env vars from `.env.example` (values from Supabase → Project Settings → API).
- **Anthropic**: console.anthropic.com → API key. ~$0.20–0.50 per issue at Sonnet/Haiku pricing.
- **Firecrawl**: firecrawl.dev → API key (free tier is enough for one scrape a day).
- **Resend**: API key, verified sending domain (see 4), webhook (see 5).

### 2. GitHub repository secrets
Settings → Secrets and variables → Actions. These drive `deploy-backend.yml` and `pipeline.yml`:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | personal access token |
| `SUPABASE_PROJECT_REF` | from the project URL |
| `SUPABASE_DB_PASSWORD` | the one you set at creation |
| `SUPABASE_ANON_KEY` | Project Settings → API |
| `PIPELINE_SECRET` | any long random string — `openssl rand -hex 24` |
| `ANTHROPIC_API_KEY` | primary writer. Sonnet for the Lede, Haiku for extraction |
| `OPENAI_API_KEY` | **fallback** — used automatically if Anthropic errors, rate-limits or times out. Any OpenAI-compatible host works: set `OPENAI_BASE_URL` for OpenRouter/Groq/Together |
| `AI_PROVIDER` | optional, `anthropic` (default) or `openai` to flip which is primary |
| `FIRECRAWL_API_KEY`, `RESEND_API_KEY` | from each service |
| `SITE_URL` | `https://thegppulse.com` (or the Vercel URL for now), no trailing slash |
| `NEWSLETTER_FROM` | `The GP Pulse <pulse@mail.thegppulse.com>` |
| `NEWSLETTER_REPLY_TO` | `cschlotman@littlejohncapital.com` or a dedicated inbox |
| `NEWSLETTER_POSTAL_ADDRESS` | a real mailing address (CAN-SPAM) |
| `NEWSLETTER_EDITOR_NAME` / `NEWSLETTER_EDITOR_TITLE` | `Carl Schlotman` / `Partner, Eaglehead Capital Management` |
| `RESEND_WEBHOOK_SECRET` | from step 5 |
| `FRED_API_KEY` | optional; HY spread in the ticker |
| `AUTO_SEND` | `false` |

Push to `main` → the **Deploy backend** action applies migrations, deploys all edge functions and pushes every secret above into Supabase. Re-runs are safe.

### 3. You as editor + subscriber
Supabase → Authentication → Users → Add user (`cschlotman@littlejohncapital.com`, auto-confirm). Then SQL editor → paste `step3_admin_and_subscribe.sql`.

### 4. Sending domain (Resend)
Add `mail.thegppulse.com` in Resend → Domains. Enter the three DNS records it shows (MX + SPF TXT + DKIM TXT) at your registrar, plus `_dmarc.mail.thegppulse.com` TXT `v=DMARC1; p=none;`. Verify. Until this is done Resend only delivers to your own address.

### 5. Resend webhook
Resend → Webhooks → Add: `https://<project-ref>.supabase.co/functions/v1/resend-webhook`, events delivered/opened/clicked/bounced/complained. Copy the `whsec_…` into the `RESEND_WEBHOOK_SECRET` repo secret and re-run Deploy backend.

## How it runs after that
- **4:50pm CT Sun–Thu**: `pipeline.yml` calls the pipeline in `full` mode → draft on your Desk.
- **Evening**: you edit the Lede, approve. Sector alerts go out on approve.
- **5:50am ET Mon–Fri**: `pipeline.yml` calls `send` → the approved issue goes.
- Manual run any time: Actions → Newsletter pipeline → Run workflow.

`step2_cron.sql` is an optional pg_cron equivalent if you'd rather schedule inside the database; you don't need both.

## Files here
- `step1_schema.sql` — only needed if you apply migrations by hand; the action does this for you.
- `step2_cron.sql` — optional in-database schedule.
- `step3_admin_and_subscribe.sql` — run once, after creating your Auth user.
- `step4_smoke_test.sql` — fire the pipeline by hand and inspect the run.
