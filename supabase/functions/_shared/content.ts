// Shared content types for The GP Pulse newsletter (schema v2).
// Keep this file in sync with src/lib/newsletter-content.ts on the front end.

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit?: "index" | "percent" | "bps" | "usd";
}

export interface Article {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  source: string;
  source_url: string | null;
  fund_size_relevant?: boolean | null;
  why_it_matters?: string;
}

export interface DealRow {
  id?: string;
  sponsor: string;
  target: string;
  deal_type: "platform" | "add-on" | "exit" | "recap" | "growth" | "carve-out" | "secondary" | "other";
  sector: string | null;
  enterprise_value_millions: number | null;
  ebitda_millions: number | null;
  ev_ebitda_multiple: number | null;
  figures_disclosed: boolean;
  summary: string | null;
  source: string;
  source_url: string | null;
  editor_take?: string | null;
  featured?: boolean;
}

export interface FundRow {
  id?: string;
  firm: string;
  fund_name: string;
  status: "launched" | "first_close" | "final_close" | "oversubscribed" | "other";
  strategy: string | null;
  target_millions: number | null;
  raised_millions: number | null;
  fund_number: number | null;
  headquarters: string | null;
  summary: string | null;
  source: string;
  source_url: string | null;
}

export interface EditorItem {
  id: string;
  kind: "on_the_market" | "overheard" | "reader_question" | "job" | "the_read" | "event";
  headline: string;
  body: string | null;
  url: string | null;
  attribution: string | null;
}

export interface Stat {
  value: string;
  label: string;
  context?: string;
}

export interface EditorsNote {
  headline: string;
  paragraphs: string[];
  byline?: string;
}

export interface TheRead {
  title: string;
  source: string;
  url: string | null;
  take: string;
}

export interface NewsletterContentV2 {
  version: 2;
  edition: "daily" | "weekly" | "special";
  editors_note: EditorsNote | null;
  market_data: MarketQuote[];
  by_the_numbers: Stat[];
  top_headlines: Article[];
  deal_tracker: DealRow[];
  fund_tracker: FundRow[];
  people_moves: Article[];
  on_the_market: EditorItem[];
  overheard: EditorItem[];
  market_pulse: Article[];
  the_read: TheRead | null;
  jobs: EditorItem[];
  closing_line: string | null;
}

export function emptyContent(edition: NewsletterContentV2["edition"] = "daily"): NewsletterContentV2 {
  return {
    version: 2,
    edition,
    editors_note: null,
    market_data: [],
    by_the_numbers: [],
    top_headlines: [],
    deal_tracker: [],
    fund_tracker: [],
    people_moves: [],
    on_the_market: [],
    overheard: [],
    market_pulse: [],
    the_read: null,
    jobs: [],
    closing_line: null,
  };
}

/** Upgrade a v1 content blob (sections only) into the v2 shape so old issues still render. */
export function normalizeContent(raw: unknown): NewsletterContentV2 {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<NewsletterContentV2> & Record<string, unknown>;
  if (c.version === 2) {
    return { ...emptyContent(c.edition ?? "daily"), ...c } as NewsletterContentV2;
  }
  return {
    ...emptyContent("daily"),
    market_data: (c.market_data as MarketQuote[]) ?? [],
    top_headlines: (c.top_headlines as Article[]) ?? [],
    fund_tracker: [],
    people_moves: (c.people_moves as Article[]) ?? [],
    market_pulse: (c.market_pulse as Article[]) ?? [],
    // v1 fund_tracker was a list of articles — map them into FundRows with unknown figures
    ...(Array.isArray(c.fund_tracker)
      ? {
          fund_tracker: (c.fund_tracker as unknown as Article[]).map((a) => ({
            firm: a.source,
            fund_name: a.title,
            status: "other" as const,
            strategy: null,
            target_millions: null,
            raised_millions: null,
            fund_number: null,
            headquarters: null,
            summary: a.summary,
            source: a.source,
            source_url: a.source_url,
          })),
        }
      : {}),
  };
}

export const fmtMillions = (m: number | null | undefined): string => {
  if (m === null || m === undefined || Number.isNaN(m)) return "n/d";
  if (m >= 1000) return `$${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}B`;
  return `$${Math.round(m)}M`;
};

export const fmtMultiple = (x: number | null | undefined): string =>
  x === null || x === undefined || Number.isNaN(x) ? "n/d" : `${x.toFixed(1)}x`;

export const DEAL_TYPE_LABEL: Record<DealRow["deal_type"], string> = {
  platform: "Platform",
  "add-on": "Add-on",
  exit: "Exit",
  recap: "Recap",
  growth: "Growth",
  "carve-out": "Carve-out",
  secondary: "Secondary",
  other: "Deal",
};

export const FUND_STATUS_LABEL: Record<FundRow["status"], string> = {
  launched: "In market",
  first_close: "First close",
  final_close: "Final close",
  oversubscribed: "Oversubscribed",
  other: "Update",
};
