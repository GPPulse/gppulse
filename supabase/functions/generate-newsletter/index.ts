import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiConfigured, chat, HOUSE_STYLE, parseJSON } from "../_shared/ai.ts";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import {
  Article,
  DealRow,
  EditorItem,
  emptyContent,
  FundRow,
  MarketQuote,
  NewsletterContentV2,
  Stat,
} from "../_shared/content.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};

type DbArticle = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  source: string;
  source_url: string | null;
  fund_size_relevant: boolean | null;
  relevance_score: number | null;
  published_at: string | null;
  scraped_at: string;
};

// ---------------------------------------------------------------------------
// Filters (carried over from v1 — these are doing real work)
// ---------------------------------------------------------------------------
const MEGA_FIRMS = [
  "apollo", "blackstone", "kkr", "carlyle", "tpg", "ares management", "ares capital",
  "bain capital", "warburg pincus", "advent international", "thoma bravo", "vista equity",
  "silver lake", "hellman & friedman", "leonard green", "general atlantic", "cvc capital",
  "eqt", "permira", "cinven", "apax", "brookfield", "blue owl", "goldman sachs",
  "morgan stanley", "jp morgan",
];
const NON_PE_PATTERNS = [
  "cybersecurity", "cyber security", "marketing partnership", "technology partner",
  "software partnership", "vendor partnership", "channel partner", "strategic alliance",
  "latin america", "latam", "europe", "asia", "africa", "middle east",
];
const NON_PE_ORG_PATTERNS = [
  "law firm", "llp", "legal", "attorney", "counsel", "lawyer", "accounting", "audit",
  "deloitte", "kpmg", "pwc", "ernst & young", "ey ", "consulting", "mckinsey",
  "bain & company", "bcg", "recruiter", "recruiting", "staffing",
];
const isMegaFirm = (t: string) => MEGA_FIRMS.some((f) => t.includes(f));
const hasNonPEPattern = (t: string) => NON_PE_PATTERNS.some((p) => t.includes(p));
const hasNonPEOrg = (t: string) => NON_PE_ORG_PATTERNS.some((p) => t.includes(p));
const isPartnershipNotDeal = (t: string) => {
  if (t.includes("partnership") || t.includes("partners with")) {
    return !["acqui", "invest", "buyout", "exit", "recapitali", "add-on", "platform"].some((d) => t.includes(d));
  }
  return false;
};

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------
async function fetchMarketData(supabaseUrl: string, serviceKey: string): Promise<MarketQuote[]> {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/fetch-market-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return d.quotes ?? [];
  } catch (e) {
    console.error("market data failed", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Structured extraction — disclosed figures only
// ---------------------------------------------------------------------------
interface ExtractedDeal {
  index: number; sponsor: string; target: string;
  deal_type: DealRow["deal_type"]; sector: string | null;
  enterprise_value_millions: number | null; ebitda_millions: number | null; ev_ebitda_multiple: number | null;
  figures_disclosed: boolean; one_line: string;
}
interface ExtractedFund {
  index: number; firm: string; fund_name: string; status: FundRow["status"]; strategy: string | null;
  target_millions: number | null; raised_millions: number | null; fund_number: number | null; headquarters: string | null;
  one_line: string;
}

async function extractDeals(articles: DbArticle[], apiKey: string): Promise<ExtractedDeal[]> {
  if (!articles.length) return [];
  const ctx = articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.summary ?? ""}\nSource: ${a.source}`).join("\n\n");
  const system = `You extract structured deal records from private equity news for a data table. Precision matters more than coverage.

For each item that describes a completed or signed equity transaction (platform acquisition, add-on, exit/sale, recapitalization, growth investment, carve-out, secondary), return one record. Skip items that are not transactions (partnerships, hires, fund closes, commentary).

RULES
- sponsor = the PE firm (buyer on acquisitions, seller on exits). target = the company changing hands.
- Figures: ONLY what the text states. If EV, EBITDA or multiple is not explicitly stated, use null and figures_disclosed=false. Never infer or estimate. "Undisclosed" means null.
- Convert stated figures to millions USD (e.g. "$1.2 billion" → 1200).
- sector: one of Industrials, Business Services, Healthcare, Technology, Consumer, Financial Services, Energy, Aerospace & Defense, Infrastructure, Other.
- one_line: 1 sentence, max 28 words, factual, no adjectives. What was bought, by whom, from whom if stated, and what the company does.

Return ONLY a JSON array: [{"index":1,"sponsor":"","target":"","deal_type":"platform|add-on|exit|recap|growth|carve-out|secondary|other","sector":"","enterprise_value_millions":null,"ebitda_millions":null,"ev_ebitda_multiple":null,"figures_disclosed":false,"one_line":""}]`;
  try {
    const text = await chat(apiKey, system, ctx, { temperature: 0.1, maxTokens: 2500 });
    return parseJSON<ExtractedDeal[]>(text) ?? [];
  } catch (e) {
    console.error("deal extraction failed", e);
    return [];
  }
}

async function extractFunds(articles: DbArticle[], apiKey: string): Promise<ExtractedFund[]> {
  if (!articles.length) return [];
  const ctx = articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.summary ?? ""}\nSource: ${a.source}`).join("\n\n");
  const system = `You extract structured fundraising records from private equity news.

For each item about a fund launch, first close, final close or oversubscribed close by a firm whose vehicle is under $1B, return one record. Skip anything over $1B, non-North American, or not about a fund.

RULES
- Figures ONLY as stated, in millions USD. Unknown → null. Never estimate.
- status: launched (in market / targeting), first_close, final_close, oversubscribed (final close above target), other.
- strategy: short phrase, e.g. "LMM buyout, industrials & services", "Growth equity, healthcare", "Independent sponsor".
- fund_number: the roman/arabic numeral in the fund name if present (Fund III → 3).
- one_line: 1 factual sentence, max 25 words.

Return ONLY a JSON array: [{"index":1,"firm":"","fund_name":"","status":"final_close","strategy":"","target_millions":null,"raised_millions":null,"fund_number":null,"headquarters":null,"one_line":""}]`;
  try {
    const text = await chat(apiKey, system, ctx, { temperature: 0.1, maxTokens: 2000 });
    return parseJSON<ExtractedFund[]>(text) ?? [];
  } catch (e) {
    console.error("fund extraction failed", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Editorial pass — the whole issue in one voice
// ---------------------------------------------------------------------------
interface EditorialOutput {
  subject: string;
  preheader: string;
  editors_note: { headline: string; paragraphs: string[] };
  by_the_numbers: Stat[];
  headline_takes: { index: number; why_it_matters: string }[];
  deal_takes: { index: number; take: string }[];
  featured_deal_index: number | null;
  market_pulse_takes: { index: number; why_it_matters: string }[];
  the_read: { index: number; take: string } | null;
  closing_line: string;
}

async function editorialPass(
  input: {
    dateLabel: string;
    edition: "daily" | "weekly";
    quotes: MarketQuote[];
    headlines: DbArticle[];
    deals: DealRow[];
    funds: FundRow[];
    people: DbArticle[];
    pulse: DbArticle[];
    editorItems: EditorItem[];
    weekNarrative: string | null;
  },
  apiKey: string,
): Promise<EditorialOutput | null> {
  const fmtArt = (list: DbArticle[]) => list.map((a, i) => `[${i + 1}] ${a.title}\n    ${a.summary ?? ""}\n    (${a.source})`).join("\n");
  const fmtDeals = input.deals
    .map((d, i) => `[${i + 1}] ${d.sponsor} → ${d.target} | ${d.deal_type} | ${d.sector ?? "sector n/d"} | EV ${d.enterprise_value_millions ?? "n/d"}M | EBITDA ${d.ebitda_millions ?? "n/d"}M | ${d.ev_ebitda_multiple ?? "n/d"}x\n    ${d.summary ?? ""}`)
    .join("\n");
  const fmtFunds = input.funds
    .map((f, i) => `[${i + 1}] ${f.firm} — ${f.fund_name} | ${f.status} | target ${f.target_millions ?? "n/d"}M | raised ${f.raised_millions ?? "n/d"}M | ${f.strategy ?? ""}`)
    .join("\n");
  const fmtQuotes = input.quotes.map((q) => `${q.name}: ${q.price} (${q.change >= 0 ? "+" : ""}${q.unit === "percent" ? `${Math.round(q.change * 100)}bp` : `${q.changePercent.toFixed(2)}%`})`).join(", ");
  const fmtItems = input.editorItems.map((e) => `- (${e.kind}) ${e.headline}${e.body ? ` — ${e.body}` : ""}`).join("\n");

  const system = `${HOUSE_STYLE}

You are writing today's issue of The GP Pulse (${input.edition === "weekly" ? "Friday week-in-review edition" : "daily edition"}) for ${input.dateLabel}. You have the day's raw material below. Produce the editorial layer.

OUTPUT (JSON only, no prose outside it):
{
  "subject": "Email subject. 6–10 words. Specific, concrete, lowercase except proper nouns. The single most interesting fact or tension of the day. No 'GP Pulse', no date, no colon-cliché. Examples of the register: 'Two industrial recaps at 7x, and a lender blinked', 'Sub-$500M funds are closing faster than Q1'.",
  "preheader": "One sentence, max 90 chars, that extends the subject without repeating it.",
  "editors_note": {
    "headline": "The Lede headline. 5–9 words. A claim, not a topic.",
    "paragraphs": ["2–3 paragraphs, 50–90 words each. Pick the ONE thing that matters most today for a lower middle market GP and explain the mechanism: what it does to multiples, leverage, exit timing, LP appetite, or sourcing. Cite specific numbers from the material. End with a conviction-tagged call ('Our read: …' / 'High conviction: …' / 'Watch: …'). If the material is thin, say so plainly and write about the pattern across the last few days instead of forcing significance."]
  },
  "by_the_numbers": [ {"value":"7.2x","label":"short label","context":"optional 8–12 words"} ],  // exactly 3 stats pulled from today's material or the ticker. Real figures only; if fewer than 3 real figures exist, return fewer.
  "headline_takes": [ {"index":1,"why_it_matters":"1–2 sentences. The implication for a $2–25M EBITDA investor, not a restatement."} ],  // one per headline
  "deal_takes": [ {"index":1,"take":"1–2 sentences. What the deal says about the buyer's thesis, the price if disclosed, or the sector. Skip deals with nothing to say — fewer takes is fine."} ],
  "featured_deal_index": 1,  // the most instructive deal for the reader, or null
  "market_pulse_takes": [ {"index":1,"why_it_matters":"1 sentence translating the macro item into LMM terms: leverage cost, lender appetite, exit windows."} ],
  "the_read": {"index": 1, "take": "2–3 sentences on why this one piece (from headlines or macro) is worth 15 minutes, and what to take from it."} or null,
  "closing_line": "One sentence sign-off. Dry, human, specific to today. No platitudes."
}`;

  const user = `TICKER: ${fmtQuotes || "n/a"}

HEADLINES:
${fmtArt(input.headlines) || "(none)"}

DEALS:
${fmtDeals || "(none)"}

FUNDS:
${fmtFunds || "(none)"}

PEOPLE MOVES:
${fmtArt(input.people) || "(none)"}

MACRO / CREDIT:
${fmtArt(input.pulse) || "(none)"}

EDITOR-SUBMITTED ITEMS (processes, overheard, jobs — already written, do not rewrite; use for context only):
${fmtItems || "(none)"}
${input.weekNarrative ? `\nWEEKLY INDEX NARRATIVE (for Friday context):\n${input.weekNarrative}` : ""}`;

  try {
    const text = await chat(apiKey, system, user, { temperature: 0.55, maxTokens: 3500, tier: "editorial" });
    const out = parseJSON<EditorialOutput>(text);
    if (!out?.editors_note?.paragraphs?.length) return null;
    return out;
  } catch (e) {
    console.error("editorial pass failed", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiKey = aiConfigured() ? "configured" : "";
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

    let force = false;
    try {
      const b = await req.json();
      force = Boolean(b?.force);
    } catch { /* no body */ }

    // Don't stack drafts: if an unsent draft from today exists, bail unless forced.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: existingDraft } = await supabase
      .from("newsletters").select("id, issue_number")
      .in("status", ["draft", "approved"]).gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingDraft && !force) {
      return new Response(JSON.stringify({ message: `Draft #${existingDraft.issue_number} already exists for today`, newsletter_id: existingDraft.id, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Candidate articles
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 4);
    const [articlesResult, quotes] = await Promise.all([
      supabase.from("articles").select("*").gte("scraped_at", cutoff.toISOString()).is("used_in_newsletter_id", null).order("relevance_score", { ascending: false }),
      fetchMarketData(supabaseUrl, serviceKey),
    ]);
    if (articlesResult.error) throw new Error(articlesResult.error.message);

    let articles = (articlesResult.data ?? []) as DbArticle[];
    const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    articles = articles.filter((a) => !a.published_at || new Date(a.published_at) >= threeDaysAgo);

    const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1);
    const tier = (a: DbArticle) => { const d = new Date(a.published_at ?? a.scraped_at); return d >= todayStart ? 2 : d >= yStart ? 1 : 0; };
    articles.sort((a, b) => tier(b) - tier(a) || (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

    const seen = new Set<string>();
    const keysOf = (a: DbArticle) => {
      const k = [`source:${a.source.toLowerCase().trim()}`, `title:${a.title.toLowerCase().trim()}`];
      if (a.category === "people_moves") k.push(`person:${a.title.toLowerCase().trim()}`);
      return k;
    };
    const take = (list: DbArticle[], limit: number) => {
      const out: DbArticle[] = [];
      for (const a of list) {
        const ks = keysOf(a);
        if (ks.some((k) => seen.has(k))) continue;
        ks.forEach((k) => seen.add(k));
        out.push(a);
        if (out.length >= limit) break;
      }
      return out;
    };
    const text = (a: DbArticle) => `${a.title} ${a.summary ?? ""}`.toLowerCase();

    const headlines = take(articles.filter((a) => {
      if (a.category !== "headline" && !(a.category === "deal_flow" && (a.relevance_score ?? 0) >= 70)) return false;
      const t = text(a); return !isMegaFirm(t) && !hasNonPEPattern(t) && !isPartnershipNotDeal(t);
    }), 5);
    const dealArticles = take(articles.filter((a) => {
      if (a.category !== "deal_flow" && a.category !== "headline") return false;
      const t = text(a); return !isMegaFirm(t) && !hasNonPEPattern(t) && !isPartnershipNotDeal(t);
    }), 8);
    const fundArticles = take(articles.filter((a) => a.category === "fund_tracker" && a.fund_size_relevant !== false && !isMegaFirm(text(a))), 6);
    const people = take(articles.filter((a) => { if (a.category !== "people_moves") return false; const t = text(a); return !hasNonPEOrg(t) && !isMegaFirm(t) && !hasNonPEPattern(t); }), 6);
    const pulse = take(articles.filter((a) => a.category === "market_insight"), 3);

    // Headlines also count as deals for extraction (they're the big ones); dedupe by id
    const dealSource = [...headlines, ...dealArticles].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);

    if (!headlines.length && !dealSource.length && !fundArticles.length && !people.length && !pulse.length) {
      return new Response(JSON.stringify({ message: "No new articles to include", skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Structured extraction (parallel)
    const [rawDeals, rawFunds] = await Promise.all([
      aiKey ? extractDeals(dealSource, aiKey) : Promise.resolve([]),
      aiKey ? extractFunds(fundArticles, aiKey) : Promise.resolve([]),
    ]);

    const deals: DealRow[] = rawDeals
      .filter((d) => d.sponsor && d.target && dealSource[d.index - 1])
      .map((d) => {
        const src = dealSource[d.index - 1];
        return {
          sponsor: d.sponsor, target: d.target, deal_type: d.deal_type ?? "other", sector: d.sector ?? null,
          enterprise_value_millions: d.enterprise_value_millions ?? null, ebitda_millions: d.ebitda_millions ?? null,
          ev_ebitda_multiple: d.ev_ebitda_multiple ?? null, figures_disclosed: Boolean(d.figures_disclosed),
          summary: d.one_line, source: src.source, source_url: src.source_url, editor_take: null, featured: false,
        };
      });

    const funds: FundRow[] = rawFunds
      .filter((f) => f.firm && f.fund_name && fundArticles[f.index - 1])
      .filter((f) => !f.target_millions || f.target_millions < 1000)
      .map((f) => {
        const src = fundArticles[f.index - 1];
        return {
          firm: f.firm, fund_name: f.fund_name, status: f.status ?? "other", strategy: f.strategy ?? null,
          target_millions: f.target_millions ?? null, raised_millions: f.raised_millions ?? null, fund_number: f.fund_number ?? null,
          headquarters: f.headquarters ?? null, summary: f.one_line, source: src.source, source_url: src.source_url,
        };
      });

    // Editor-curated queue
    const { data: queued } = await supabase.from("editor_items").select("id, kind, headline, body, url, attribution").eq("status", "queued").order("created_at", { ascending: true });
    const editorItems = (queued ?? []) as EditorItem[];

    // Friday = week in review; pull the latest index narrative for context
    const now = new Date();
    const edition: "daily" | "weekly" = now.getDay() === 5 ? "weekly" : "daily";
    let weekNarrative: string | null = null;
    if (edition === "weekly") {
      const { data: idx } = await supabase.from("gp_pulse_index").select("narrative_summary").order("week_start", { ascending: false }).limit(1).maybeSingle();
      weekNarrative = idx?.narrative_summary ?? null;
    }

    const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const editorial = aiKey
      ? await editorialPass({ dateLabel, edition, quotes, headlines, deals, funds, people, pulse, editorItems, weekNarrative }, aiKey)
      : null;

    // Apply editorial layer
    const toArticle = (a: DbArticle): Article => ({ id: a.id, title: a.title, summary: a.summary, category: a.category, source: a.source, source_url: a.source_url, fund_size_relevant: a.fund_size_relevant });
    const headlineArticles = headlines.map(toArticle);
    const pulseArticles = pulse.map(toArticle);
    if (editorial) {
      for (const t of editorial.headline_takes ?? []) if (headlineArticles[t.index - 1]) headlineArticles[t.index - 1].why_it_matters = t.why_it_matters;
      for (const t of editorial.market_pulse_takes ?? []) if (pulseArticles[t.index - 1]) pulseArticles[t.index - 1].why_it_matters = t.why_it_matters;
      for (const t of editorial.deal_takes ?? []) if (deals[t.index - 1]) deals[t.index - 1].editor_take = t.take;
      if (editorial.featured_deal_index && deals[editorial.featured_deal_index - 1]) {
        deals[editorial.featured_deal_index - 1].featured = true;
        deals.sort((a, b) => Number(b.featured) - Number(a.featured));
      }
    }

    const readSource = [...headlines, ...pulse];
    const theRead = editorial?.the_read && readSource[editorial.the_read.index - 1]
      ? { title: readSource[editorial.the_read.index - 1].title, source: readSource[editorial.the_read.index - 1].source, url: readSource[editorial.the_read.index - 1].source_url, take: editorial.the_read.take }
      : null;

    const editorName = Deno.env.get("NEWSLETTER_EDITOR_NAME") ?? "The GP Pulse";

    const content: NewsletterContentV2 = {
      ...emptyContent(edition),
      editors_note: editorial ? { headline: editorial.editors_note.headline, paragraphs: editorial.editors_note.paragraphs, byline: editorName } : null,
      market_data: quotes,
      by_the_numbers: (editorial?.by_the_numbers ?? []).slice(0, 3),
      top_headlines: headlineArticles,
      deal_tracker: deals,
      fund_tracker: funds,
      people_moves: people.map(toArticle),
      on_the_market: editorItems.filter((e) => e.kind === "on_the_market"),
      overheard: editorItems.filter((e) => e.kind === "overheard" || e.kind === "reader_question"),
      market_pulse: pulseArticles,
      the_read: theRead,
      jobs: editorItems.filter((e) => e.kind === "job"),
      closing_line: editorial?.closing_line ?? null,
    };

    // Issue number + record
    const { data: last } = await supabase.from("newsletters").select("issue_number").order("issue_number", { ascending: false }).limit(1).maybeSingle();
    const issueNumber = (last?.issue_number ?? 0) + 1;
    const fallbackSubject = `${headlines[0]?.title ?? "Today in the lower middle market"}`.slice(0, 80);
    const subject = editorial?.subject?.trim() || fallbackSubject;
    const slug = `${now.toISOString().slice(0, 10)}-${issueNumber}`;

    const { data: newsletter, error: nlErr } = await supabase.from("newsletters").insert({
      subject, preheader: editorial?.preheader ?? null, issue_number: issueNumber, content, status: "draft", edition, slug,
    }).select().single();
    if (nlErr) throw new Error(nlErr.message);

    // Persist structured rows, link editor items, mark articles used
    const usedIds = [...headlines, ...dealSource, ...fundArticles, ...people, ...pulse].map((a) => a.id);
    await Promise.all([
      deals.length
        ? supabase.from("deals").upsert(deals.map((d) => ({ ...d, announced_on: now.toISOString().slice(0, 10) })), { onConflict: "sponsor,target", ignoreDuplicates: true })
        : Promise.resolve(),
      funds.length
        ? supabase.from("funds").upsert(funds.map((f) => ({ ...f, announced_on: now.toISOString().slice(0, 10) })), { onConflict: "firm,fund_name", ignoreDuplicates: true })
        : Promise.resolve(),
      editorItems.length
        ? supabase.from("editor_items").update({ status: "published", newsletter_id: newsletter.id }).in("id", editorItems.map((e) => e.id))
        : Promise.resolve(),
      usedIds.length ? supabase.from("articles").update({ used_in_newsletter_id: newsletter.id }).in("id", usedIds) : Promise.resolve(),
    ]);

    return new Response(JSON.stringify({
      message: `Issue #${issueNumber} drafted: ${headlines.length} headlines, ${deals.length} deals, ${funds.length} funds, ${people.length} moves, ${editorItems.length} editor items${editorial ? "" : " (editorial pass unavailable)"}`,
      newsletter_id: newsletter.id, issue_number: issueNumber, subject,
      sections: { headlines: headlines.length, deals: deals.length, funds: funds.length, people: people.length, pulse: pulse.length, editor_items: editorItems.length },
      editorial: Boolean(editorial),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-newsletter", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
