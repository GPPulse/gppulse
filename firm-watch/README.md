# Firm watch

Keeps the newsletter anchored to true middle-market sponsors. The watchlist is 860 active
US firms with AUM of $2B or less (`pe_firm_sources.watchlist = true`), tiered by how
recently they did a deal (`watch_tier` 1 = last 12 months … 4 = none in 5 years).

## How it fits the pipeline

    firm sites ─┐
    Google News ┼─ firm-watch crawl (GitHub Actions, 20:17 UTC) ─┐
    firm emails ── inbound-email (edge function) ────────────────┼─ scraped_content
    wires, feeds ─ scrape-rss (existing) ────────────────────────┘        │
                                             process-content (flags watchlist firms)
                                                                          │
                                             generate-newsletter (watchlist ranked first)

| Piece | Where | What it does |
|---|---|---|
| Discovery | `src/discover.mjs` | Visits each firm's site once. Saves its news page, RSS feed, LinkedIn page and mailing-list form to `pe_firm_sources`. |
| Crawl | `src/crawl.mjs` | Daily. Reads each news page or feed, keeps links the database has not seen, pulls the article text, queues deals, exits, fund closes and promotions for the classifier. Searches Google News for tier 1–2 firms. |
| Database access | `supabase/functions/firm-watch` | The only way the crawler touches the database. Authenticated with `PIPELINE_SECRET`, like the pipeline. |
| Email intake | `supabase/functions/inbound-email` | Resend calls it for mail sent to `watch@in.thegppulse.com`. Logs to `watch_inbox`; firm announcements also go to the classifier. |
| Schedule | `.github/workflows/firm-watch.yml` | Daily crawl, Sunday retry of firms with no source, manual runs. |

## Deals nobody announces

Two more sources feed the same queue:

- **Advisor and lender tombstones.** `data/advisors.json` lists M&A advisors and lenders
  (`source_kind` advisor / lender). Discovery finds each one's closed-transactions page; the
  crawl reads it with `extractTombstones` and queues new blocks. The classifier is told the
  source is the advisor or lender on the deal, not the buyer.
- **Portfolio watch** (`src/portfolio.mjs`). Finds each sponsor's portfolio page, stores the
  company names on it, and on later runs sends new names to the Editor's Desk as `overheard`
  items with status `submitted`. These are inferences. They are never published automatically.
  A swing of more than three additions is treated as a redesign and only re-baselined.

The first time a firm is crawled its archive is recorded as already seen and only items
from the last 10 days are queued. The crawler identifies itself as `GPPulseBot`, obeys
robots.txt and makes two or three requests per firm per day.

Each run uploads three lists as the `firm-watch-lists` artifact: `linkedin-pages.csv`,
`signup-forms.csv` and `needs-review.csv` (firms whose site could not be read).

## Email intake setup

1. Resend → Domains → add `in.thegppulse.com` with receiving on; add the MX record it shows at the DNS host.
2. Resend → Webhooks → add `https://<project-ref>.supabase.co/functions/v1/inbound-email` for the `email.received` event.
3. Save that webhook's signing secret as the repo secret `RESEND_INBOUND_WEBHOOK_SECRET` and re-run **Deploy backend**.
4. Subscribe `watch@in.thegppulse.com` to the firms in `signup-forms.csv`. Confirmation links appear in `watch_inbox.confirm_url`.

## LinkedIn

Not automated. LinkedIn's terms prohibit automated following and scraping, and bulk scripted
follows put the account at risk. `linkedin-pages.csv` lists each firm's company page, most
active firms first, for following by hand.

## Local

    cd firm-watch && npm ci && npm test
    SUPABASE_PROJECT_REF=… SUPABASE_ANON_KEY=… PIPELINE_SECRET=… node src/discover.mjs --tier 1 --limit 20
    SUPABASE_PROJECT_REF=… SUPABASE_ANON_KEY=… PIPELINE_SECRET=… node src/crawl.mjs --dry --no-gnews
