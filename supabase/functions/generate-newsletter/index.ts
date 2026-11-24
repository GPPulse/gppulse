import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiConfigured, chat, HOUSE_STYLE, parseJSON } from "../_shared/ai.ts";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";
import { CONFIG } from "../_shared/config.ts";
import { lintIssue } from "../_shared/lint.ts";
import { isFridayIssue, issueDateLabel, issueDay } from "../_shared/issue-day.ts";
import { dealContext, DealContext, fileLines, FOUND_VIA_LABEL, FoundVia, intelText, isBelowRadar, marketIntel } from "../_shared/intel.ts";
import {
  Article,
  DealRow,
  EditorItem,
  emptyContent,
  fmtMillions,
  FundRow,
  MarketQuote,
  NewsletterContentV2,
  RadarItem,
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
  watchlist_firm?: string | null;
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
  platform?: string | null; seller_type?: string | null; hq_state?: string | null;
  advisors?: string | null; lender?: string | null;
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
- Only sponsor-involved transactions: a PE/growth/independent-sponsor buyer, or a sponsor seller (exit). Skip strategic-to-strategic deals where no sponsor is on either side.
- If several items describe the same transaction, return it ONCE (use the most complete item's index).
- Figures: ONLY what the text states. If EV, EBITDA or multiple is not explicitly stated, use null and figures_disclosed=false. Never infer or estimate. "Undisclosed" means null.
- Convert stated figures to millions USD (e.g. "$1.2 billion" → 1200).
- sector: one of Industrials, Business Services, Healthcare, Technology, Consumer, Financial Services, Energy, Aerospace & Defense, Infrastructure, Other.
- Some items come from an M&A advisor's or lender's list of closed deals, or from trade/local press. The advisor, lender or publication is NOT the buyer. On add-ons, the sponsor is the PE firm that owns the acquiring company ("Ecowaste Solutions, a portfolio company of Kinderhook" → sponsor Kinderhook Industries, platform Ecowaste Solutions). If no sponsor can be identified from the text, skip the item.
- platform: on add-ons, the acquiring portfolio company. Otherwise null.
- seller_type: founder (founder/family/owner-operated), sponsor (another PE firm sold), corporate (carve-out from a company), management, or null if not stated.
- hq_state: two-letter US state of the target if stated, else null.
- advisors: named M&A advisors with their side, e.g. "MelCap Partners (sell-side)". Null if none named.
- lender: named debt providers, e.g. "o15 Capital (unitranche)". Null if none named.
- one_line: 1 sentence, max 28 words, factual, no adjectives. What was bought, by whom, from whom if stated, and what the company does. Include the city/state if stated.

Return ONLY a JSON array: [{"index":1,"sponsor":"","target":"","platform":null,"deal_type":"platform|add-on|exit|recap|growth|carve-out|secondary|other","sector":"","enterprise_value_millions":null,"ebitda_millions":null,"ev_ebitda_multiple":null,"figures_disclosed":false,"seller_type":null,"hq_state":null,"advisors":null,"lender":null,"one_line":""}]`;
  try {
    const text = await chat(apiKey, system, ctx, { temperature: 0.1, maxTokens: 4000 });
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

For each item about a fund launch, first close, final close or oversubscribed close by a firm whose vehicle is under $1B, return one record. Skip anything over $1B, non-North American, or not about a fund. Equity funds only (buyout, growth, independent-sponsor, SBIC equity): skip CLOs, credit/lending funds, real estate, infrastructure and venture.

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
  radar_takes: { index: number; take: string }[];
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
    radar: RadarItem[];
    funds: FundRow[];
    people: DbArticle[];
    pulse: DbArticle[];
    readCandidates: DbArticle[];
    editorItems: EditorItem[];
    intel: string;
    weekNarrative: string | null;
    weekStats: string | null;
    /** Set on the second attempt: what the first draft got wrong. */
    feedback?: string[];
  },
  apiKey: string,
): Promise<EditorialOutput | null> {
  const fmtArt = (list: DbArticle[]) => list.map((a, i) => `[${i + 1}] ${a.title}\n    ${a.summary ?? ""}\n    (${a.source})`).join("\n");
  const fmtFile = (f?: string[]) => (f?.length ? `\n    THE FILE: ${f.join(" | ")}` : "");
  const fmtDeals = input.deals
    .map((d, i) => `[${i + 1}] ${d.sponsor} → ${d.target}${d.platform ? ` (add-on to ${d.platform})` : ""} | ${d.deal_type} | ${d.sector ?? "sector n/d"}${d.hq_state ? ` | ${d.hq_state}` : ""}${d.seller_type ? ` | seller: ${d.seller_type}` : ""} | EV ${d.enterprise_value_millions ?? "n/d"}M | EBITDA ${d.ebitda_millions ?? "n/d"}M | ${d.ev_ebitda_multiple ?? "n/d"}x${d.advisors ? ` | advisors: ${d.advisors}` : ""}${d.lender ? ` | lender: ${d.lender}` : ""} | found via: ${d.found_via ?? "n/d"}\n    ${d.summary ?? ""}${fmtFile(d.file)}`)
    .join("\n");
  const fmtRadar = input.radar
    .map((r, i) => `[${i + 1}] (${r.found_via}${r.confirmed ? "" : ", UNCONFIRMED signal"}) ${r.headline}\n    ${r.body ?? ""}${fmtFile(r.file)}`)
    .join("\n");
  const fmtFunds = input.funds
    .map((f, i) => `[${i + 1}] ${f.firm} — ${f.fund_name} | ${f.status} | target ${f.target_millions ?? "n/d"}M | raised ${f.raised_millions ?? "n/d"}M | ${f.strategy ?? ""} | source: ${f.source}`)
    .join("\n");
  const fmtQuotes = input.quotes.map((q) => `${q.name}: ${q.price} (${q.change >= 0 ? "+" : ""}${q.unit === "percent" ? `${Math.round(q.change * 100)}bp` : `${q.changePercent.toFixed(2)}%`})`).join(", ");
  const fmtItems = input.editorItems.map((e) => `- (${e.kind}) ${e.headline}${e.body ? ` — ${e.body}` : ""}`).join("\n");

  const system = `${HOUSE_STYLE}

You are writing today's issue of The GP Pulse (${input.edition === "weekly" ? "Friday week-in-review edition" : "daily edition"}) for ${input.dateLabel}.

WHAT THIS NEWSLETTER IS. The one place a lower-middle-market GP ($2–25M EBITDA deals, sub-$1B funds) sees the deals nobody announced and the context nobody else has. PE Hub, PitchBook News, Axios Pro and Mergers & Acquisitions already reprint press releases and markets. We do not compete on that. Our edge, in order:
  1. BELOW THE RADAR: deals and signals we found with no press release (banker tombstones, trade and local press, portfolio pages, SEC filings).
  2. THE FILE: what our archive says about each party — the sponsor's pace, the platform's add-on count, which banks keep closing with them, which fund they're investing from.
  3. PATTERNS across our own tracker: sponsors on a run, platforms stacking add-ons, sectors running hot vs. their own pace, banks with a busy month, founder vs. sponsor sellers.

HARD RULES
- The Lede is built on 1, 2 or 3 above. Never open on the stock market, rates or the ticker. Macro may appear in at most one sentence, and only if you tie it to a specific deal or lender in today's material. If public markets are the only thing you can say, you have the wrong story.
- The subject line names a company, a sponsor, a platform or a count from our data. Never an index level, a yield, or "markets". Prefer a below-the-radar deal or a pattern. Bad: "Russell down 4.2%, 10Y at 5.1%, and deals still printed". Good: "Kinderhook's waste roll-up quietly added two more", "Three Midwest towing deals, none announced", "The banks that closed 9 LMM deals this week".
- Never write filler about missing numbers ("terms undisclosed", "we can't tell what anyone paid", "pricing undisclosed so the arbitrage is unverifiable"). The reader knows LMM deals rarely disclose. Say something only when there is something to say.
- Deal takes and radar takes must use a fact from THE FILE, the advisor/lender, the seller type, the geography, or the platform history. A take that would fit any deal ("deploying on pace", "classic add-on", "route density") is banned. If you have nothing specific, skip the deal — fewer takes is better.
- UNCONFIRMED signals (new names on a portfolio page) are described as exactly that: "now listed on X's portfolio page; we found no announcement". Never state a deal closed on the strength of a signal.
- Use only figures that appear in the material. Never estimate.
- LENDER FILINGS. Items found via \"SEC filing\" are loans listed in a lender's quarterly schedule. Our readers are sponsors; they do not follow BDCs. Never build the subject, the Lede, a by_the_numbers entry or the closing line on a lender, a BDC or a list of its borrowers, and never name a BDC or lender in the subject. A filing item may get one radar take about the borrower and its pricing. If filings are the only below-the-radar material, lead with a pattern from the Scoreboard or the most instructive announced deal instead.
- SIZE. This is a lower-middle-market letter. Do not lead with, feature, or build a number on a deal above $1B in enterprise value or one where the only sponsor is a large-cap firm.
${input.edition === "weekly" ? `
FRIDAY RULES. The keeper issue. The Lede is 3–4 paragraphs on the PATTERN across the week from OUR DATA (the Scoreboard numbers below): who was busiest, which platforms stacked add-ons, which banks closed the most, which sectors ran above their own pace, how many deals were below the radar. Open with the single number that best summarizes the week. Subject reads as a weekly verdict built on our data.` : ""}

OUTPUT (JSON only, no prose outside it):
{
  "subject": "6–10 words, lowercase except proper nouns, per the rules above.",
  "preheader": "One sentence, max 90 chars, extending the subject without repeating it.",
  "editors_note": {
    "headline": "5–9 words. A claim, not a topic.",
    "paragraphs": ["2–3 paragraphs, 50–90 words each. One story, explained by mechanism: what it says about sourcing, add-on strategy, seller behavior, lender appetite, or exits in the LMM. Use THE FILE facts and the scoreboard counts. End with a conviction-tagged call ('Our read: …' / 'High conviction: …' / 'Watch: …')."]
  },
  "by_the_numbers": [ {"value":"7","label":"short label","context":"8–12 words"} ],  // exactly 3, from OUR data (scoreboard, tracker counts, disclosed figures) — not the ticker.
  "headline_takes": [ {"index":1,"why_it_matters":"1–2 sentences for a $2–25M EBITDA investor."} ],
  "radar_takes": [ {"index":1,"take":"1–2 sentences: why this deal or signal matters, using THE FILE."} ],
  "deal_takes": [ {"index":1,"take":"1–2 sentences, specific, per the rules."} ],
  "featured_deal_index": 1,  // most instructive deal in DEALS, or null
  "market_pulse_takes": [ {"index":1,"why_it_matters":"1 sentence in LMM terms."} ],
  "the_read": {"index": 1, "take": "2–3 sentences on why READ CANDIDATE [index] is worth 15 minutes. Describe THAT item, not another."} or null,
  "closing_line": "One dry, specific sign-off sentence. No platitudes, no markets jokes."
}`;

  const user = `BELOW THE RADAR (no press release found):
${fmtRadar || "(none today)"}

DEALS (announced):
${fmtDeals || "(none)"}

SCOREBOARD (our tracker, last 30 days):
${input.intel || "(not available)"}

NON-DEAL HEADLINES:
${fmtArt(input.headlines) || "(none)"}

FUNDS:
${fmtFunds || "(none)"}

PEOPLE MOVES:
${fmtArt(input.people) || "(none)"}

MACRO / CREDIT (context only):
${fmtArt(input.pulse) || "(none)"}

READ CANDIDATES (for the_read; index into THIS list):
${fmtArt(input.readCandidates) || "(none)"}

TICKER (printed at the top of the issue; context only — do not lead the Lede or subject with it): ${fmtQuotes || "n/a"}

EDITOR-SUBMITTED ITEMS (already written; context only):
${fmtItems || "(none)"}
${input.weekStats ? `\nTHIS WEEK (computed from the tracker):\n${input.weekStats}` : ""}${input.weekNarrative ? `\nWEEKLY INDEX NARRATIVE:\n${input.weekNarrative}` : ""}${input.feedback?.length ? `\n\nYOUR FIRST DRAFT WAS REJECTED. Write it again and fix every one of these:\n${input.feedback.map((f) => `- ${f}`).join("\n")}` : ""}`;

  try {
    const text = await chat(apiKey, system, user, { temperature: 0.5, maxTokens: 4500, tier: "editorial" });
    const out = parseJSON<EditorialOutput>(text);
    if (!out?.editors_note?.paragraphs?.length) return null;
    return out;
  } catch (e) {
    console.error("editorial pass failed", e);
    return null;
  }
}

// Sponsors whose flagship funds are well above our readers' range. A deal stays if any named
// sponsor is not on this list (a smaller co-investor or seller makes it relevant).
const LARGE_SPONSOR = /^(the )?(blackstone|kkr|kohlberg kravis roberts|carlyle|apollo|tpg|bain capital|advent international|warburg pincus|cvc|eqt|thoma bravo|vista equity|silver lake|hellman & friedman|hellman and friedman|clayton,? dubilier & rice|cd&r|platinum equity|clearlake|new mountain|american securities|madison dearborn|mdp|gtcr|veritas capital|genstar|audax|h\.?i\.?g\.?|leonard green|providence equity|permira|cinven|apax|brookfield|ares|stone point|onex|berkshire partners|ta associates|general atlantic|insight partners|francisco partners|golden gate capital|oak hill|kelso|welsh,? carson|wcas|roark|l catterton|partners group|mubadala|temasek|gic|adia|cppib|omers|ontario teachers)\b/i;

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
    // Within a day, watchlist firms (true middle market) outrank everything else.
    const onList = (a: DbArticle) => Number(Boolean(a.watchlist_firm));
    articles.sort((a, b) => tier(b) - tier(a) || onList(b) - onList(a) || (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

    const seen = new Set<string>();
    // Dedupe on title (and person for moves). Source is a feed name now, not a firm, so it's not a key.
    const keysOf = (a: DbArticle) => {
      const k = [`title:${a.title.toLowerCase().trim()}`];
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

    // Deals first and generously: coverage of the deals is the product. Headlines are what's left
    // that is not a deal (a deal headline would just repeat the tracker).
    const dealArticles = take(articles.filter((a) => {
      if (a.category !== "deal_flow" && a.category !== "headline") return false;
      const t = text(a); return !isMegaFirm(t) && !hasNonPEPattern(t) && !isPartnershipNotDeal(t);
    }), 16);
    const headlines = take(articles.filter((a) => {
      if (a.category !== "headline") return false;
      const t = text(a); return !isMegaFirm(t) && !hasNonPEPattern(t);
    }), 4);
    const fundArticles = take(articles.filter((a) => a.category === "fund_tracker" && a.fund_size_relevant !== false && !isMegaFirm(text(a))), 6);
    // Promotions cluster (most firms announce in December and January), so a busy day can bring
    // dozens. Six run in full, more on Friday; the rest are named in one roundup line instead of
    // being left to resurface over the following days.
    const PEOPLE_FULL = isFridayIssue() ? 12 : 6;
    const peopleAll = take(articles.filter((a) => { if (a.category !== "people_moves") return false; const t = text(a); return !hasNonPEOrg(t) && !isMegaFirm(t) && !hasNonPEPattern(t); }), PEOPLE_FULL + 40);
    const people = peopleAll.slice(0, PEOPLE_FULL);
    const peopleMore = peopleAll.slice(PEOPLE_FULL);
    // Macro & credit only when it carries data. Sell-side guides, vendor op-eds and webinars are not news.
    const FLUFF = /\b(guide|how to|step[- ]by[- ]step|what is|tips|checklist|webinar|podcast|e-?book|white ?paper|playbook|101|explained|lessons|sell your)\b/i;
    const pulse = take(articles.filter((a) => a.category === "market_insight" && !FLUFF.test(a.title) && /\d/.test(a.summary ?? "") && !/vendor-authored|promotes its own|educational guide/i.test(a.summary ?? "")), 2);

    // Headlines also count as deals for extraction (they're the big ones); dedupe by id
    const dealSource = [...dealArticles, ...headlines].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);

    // Where each item came from: the sponsor's own release, a wire, a banker's tombstone,
    // trade or local press, or a filing. This is what decides "below the radar".
    const viaById = new Map<string, FoundVia>();
    {
      const ids = dealSource.map((a) => a.id);
      const { data: origin } = ids.length
        ? await supabase.from("scraped_content").select("article_id, source_name, pe_firm_sources(source_kind)").in("article_id", ids)
        : { data: [] };
      type Origin = { article_id: string; source_name: string | null; pe_firm_sources: { source_kind: string } | { source_kind: string }[] | null };
      for (const row of (origin ?? []) as unknown as Origin[]) {
        const src = row.pe_firm_sources;
        const k = Array.isArray(src) ? src[0]?.source_kind : src?.source_kind;
        const via: FoundVia = k === "sponsor" ? "press_release" : k === "advisor" || k === "lender" ? "tombstone"
          : k === "trade" ? ((row.source_name ?? "").startsWith("Google News") ? "local_press" : "trade_press") : "news";
        const prev = viaById.get(row.article_id);
        // A sponsor release beats anything else for the same article.
        if (!prev || via === "press_release") viaById.set(row.article_id, via);
      }
      for (const a of dealSource) {
        if (viaById.has(a.id)) continue;
        viaById.set(a.id, /sec form d/i.test(a.source) ? "sec_filing" : /newswire|business wire|globenewswire|accesswire|pr newswire/i.test(a.source) ? "wire" : "news");
      }
    }

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
          platform: d.platform ?? null, seller_type: d.seller_type ?? null, hq_state: d.hq_state ?? null,
          advisors: d.advisors ?? null, lender: d.lender ?? null, found_via: viaById.get(src.id) ?? "news",
          article_id: src.id,
        } as DealRow & { article_id: string };
      });

    // Same deal from several wires: collapse on sponsor + overlapping target words.
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "inc", "llc", "corp", "holdings", "group", "company", "portfolio", "fleet", "business"].includes(w));
    for (let i = deals.length - 1; i > 0; i--) {
      const a = deals[i];
      for (let j = 0; j < i; j++) {
        const b = deals[j];
        if (a.sponsor.toLowerCase().split(/[;,(]/)[0].trim() !== b.sponsor.toLowerCase().split(/[;,(]/)[0].trim()) continue;
        const wa = new Set(norm(a.target)), wb = norm(b.target);
        const overlap = wb.filter((w) => wa.has(w)).length / Math.max(1, Math.min(wa.size, wb.length));
        if (overlap >= 0.5) {
          // keep the one with more disclosed figures / longer summary
          const score = (d: DealRow) => Number(Boolean(d.ev_ebitda_multiple)) * 3 + Number(Boolean(d.enterprise_value_millions)) * 2 + (d.summary?.length ?? 0) / 1000;
          if (score(a) > score(b)) deals[j] = a;
          deals.splice(i, 1);
          break;
        }
      }
    }

    // Lower middle market only: drop billion-dollar deals and deals whose only sponsor is a large-cap firm.
    const tooBig = (d: DealRow) => (d.enterprise_value_millions ?? 0) >= 1000 || (d.sponsor.split(/[;,/&]| and /i).map((x) => x.trim()).filter(Boolean).every((x) => LARGE_SPONSOR.test(x)));
    for (let i = deals.length - 1; i >= 0; i--) if (tooBig(deals[i])) deals.splice(i, 1);

    // The draft is built the evening before it goes out, so "is this the Friday issue" is asked of the send day.
    const edition0 = (): "daily" | "weekly" => isFridayIssue() ? "weekly" : "daily";
    // The file on every deal, and whether anyone else reported it.
    const contexts = await Promise.all(deals.map((d) => dealContext(supabase, d)));
    deals.forEach((d, i) => {
      const ctx: DealContext | null = contexts[i];
      d.file = fileLines(d, ctx);
      d.below_radar = isBelowRadar((d.found_via ?? "news") as FoundVia, ctx);
    });
    const verbOf = (d: DealRow) => d.deal_type === "exit" ? "sold" : d.deal_type === "add-on" ? `added ${d.target} to ${d.platform ?? "a platform"}` : d.deal_type === "recap" ? "recapitalized" : d.deal_type === "growth" ? "invested in" : "acquired";
    const radar: RadarItem[] = deals.filter((d) => d.below_radar).map((d) => ({
      headline: d.deal_type === "add-on" ? `${d.sponsor} ${verbOf(d)}` : `${d.sponsor} ${verbOf(d)} ${d.target}`,
      body: d.summary, found_via: FOUND_VIA_LABEL[(d.found_via ?? "news") as FoundVia] ?? "Found", source: d.source, source_url: d.source_url,
      confirmed: true, file: d.file,
    }));

    // Unconfirmed signals: names that appeared on a sponsor's portfolio page with no announcement.
    const fourDaysAgo = new Date(); fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    const { data: spotted } = await supabase.from("editor_items").select("id, headline, body, url")
      .eq("kind", "overheard").eq("status", "submitted").like("headline", "First spotted:%").gte("created_at", fourDaysAgo.toISOString()).limit(20);
    const signalIds: string[] = [];
    for (const it of (spotted ?? []) as { id: string; headline: string; body: string | null; url: string | null }[]) {
      const m = it.headline.match(/^First spotted: (.+) now on (.+?)'s? portfolio page$/);
      if (!m) continue;
      const [, company, sponsor] = m;
      if (/^[0-9a-f]{12,}$/i.test(company.replace(/[\s_-]/g, "")) || company.length < 3) continue;
      // A news headline scraped off the page is not a company name.
      if (company.split(/\s+/).length > 6 || /\b(leads?|acquires?|announces?|completes?|invests?|recapitali[sz]ation|acquisition|partners with)\b/i.test(company)) continue;
      signalIds.push(it.id);
      radar.push({
        headline: `${company} is now on ${sponsor}'s portfolio page`,
        body: `${sponsor} added ${company} to the portfolio list on its website. We found no press release, wire story or banker tombstone for it. Treat it as a signal until the firm confirms.`,
        found_via: FOUND_VIA_LABEL.portfolio_page, source: sponsor, source_url: it.url, confirmed: false,
      });
    }
    // New borrowers in BDC filings: financings that were never announced, with the lender and the price.
    const tenDaysAgo = new Date(); tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const { data: bdcNew, error: bdcErr } = await supabase.from("bdc_holdings")
      .select("id, bdc_ticker, bdc_name, period_end, filed_on, issuer, issuer_key, fair_value, spread_pct, maturity, first_lien, source_url")
      .eq("is_new", true).eq("venture", false).gte("filed_on", tenDaysAgo.toISOString().slice(0, 10)).order("fair_value", { ascending: false }).limit(300);
    if (bdcErr) console.warn("bdc_holdings unavailable:", bdcErr.message);
    type BdcRow = { id: string; bdc_ticker: string; bdc_name: string | null; period_end: string | null; filed_on: string; issuer: string; issuer_key: string; fair_value: number | null; spread_pct: number | null; maturity: string | null; first_lien: boolean | null; source_url: string | null; used?: boolean };
    const bdcRows = (bdcNew ?? []) as BdcRow[];
    const bdcSpreads = bdcRows.filter((r) => r.first_lien && r.spread_pct).map((r) => Number(r.spread_pct)).sort((x, y) => x - y);
    const bdcStat = bdcRows.length
      ? `Lender filings, last 10 days (context only; see the LENDER FILINGS rule): ${bdcSpreads.length ? `median spread on ${bdcSpreads.length} new first-lien loans ${bdcSpreads[Math.floor(bdcSpreads.length / 2)].toFixed(2)}% over the base rate` : `${new Set(bdcRows.map((r) => r.issuer_key)).size} new borrowers, no spreads stated`}.`
      : "";
    const { data: usedBdc } = bdcRows.length
      ? await supabase.from("bdc_holdings").select("issuer_key").not("used_in_newsletter_id", "is", null).in("issuer_key", bdcRows.map((r) => r.issuer_key))
      : { data: [] };
    const bdcDone = new Set(((usedBdc ?? []) as { issuer_key: string }[]).map((r) => r.issuer_key));
    const byBorrower = new Map<string, BdcRow[]>();
    for (const r of bdcRows) if (!bdcDone.has(r.issuer_key)) byBorrower.set(r.issuer_key, [...(byBorrower.get(r.issuer_key) ?? []), r]);
    const bdcIds: string[] = [];
    // Lender filings are supporting material, never the story (the readers are sponsors, not
    // credit investors). At most two a day, borrower first, and only loans with a stated spread.
    const usd = (n: number | null) => (n && n >= 1e6 ? fmtMillions(n / 1e6) : null);
    const filingRadar: RadarItem[] = [];
    const priced = [...byBorrower.values()].filter((rows) => rows[0].first_lien && rows[0].spread_pct);
    for (const rows of priced.slice(0, edition0() === "weekly" ? 4 : 2)) {
      const top = rows[0];
      rows.forEach((r) => bdcIds.push(r.id));
      const lenders = [...new Set(rows.map((r) => (r.bdc_name ?? r.bdc_ticker).replace(/,? (Inc|Corp|Corporation|LLC)\.?$/i, "").replace(/\b([A-Z])([A-Z]{3,})\b/g, (_m, h: string, t: string) => h + t.toLowerCase())))];
      const terms = [usd(top.fair_value) ? `${usd(top.fair_value)} at fair value` : null, `${Number(top.spread_pct).toFixed(2)}% over the base rate`, top.maturity ? `due ${top.maturity.slice(0, 4)}` : null].filter(Boolean).join(", ");
      filingRadar.push({
        headline: `${top.issuer} took a new first-lien loan`,
        body: `${top.issuer} appears for the first time in a lender's quarterly schedule of investments (${lenders.join(", ")}, period ending ${top.period_end ?? "latest quarter"}): ${terms}. It was not in the prior quarter's filing, and the filing does not name a sponsor.`,
        found_via: FOUND_VIA_LABEL.sec_filing, source: `${lenders.join(", ")} 10-Q`, source_url: top.source_url, confirmed: true,
      });
    }

    radar.sort((x, y) => Number(y.confirmed) - Number(x.confirmed)); // confirmed finds before signals
    radar.push(...filingRadar); // filings last: deals and signals lead the section
    // Below-the-radar deals lead the issue in their own section; the tracker keeps the announced ones.
    let announced = deals.filter((d) => !d.below_radar);

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
    const edition: "daily" | "weekly" = isFridayIssue(now) ? "weekly" : "daily";
    let weekNarrative: string | null = null;
    let weekStats: string | null = null;
    if (edition === "weekly") {
      const { data: idx } = await supabase.from("gp_pulse_index").select("narrative_summary").order("week_start", { ascending: false }).limit(1).maybeSingle();
      weekNarrative = idx?.narrative_summary ?? null;

      // The Friday issue carries the whole week: everything in the tracker since Monday, not just today's pool.
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      const [{ data: weekDeals }, { data: weekFunds }] = await Promise.all([
        supabase.from("deals").select("*").eq("hidden", false).gte("announced_on", weekAgo.toISOString().slice(0, 10)).order("announced_on", { ascending: false }),
        supabase.from("funds").select("*").eq("hidden", false).gte("announced_on", weekAgo.toISOString().slice(0, 10)).order("announced_on", { ascending: false }),
      ]);
      const seenDeal = new Set(deals.map((d) => `${d.sponsor}|${d.target}`.toLowerCase()));
      for (const d of (weekDeals ?? []) as (DealRow & { id: string })[]) {
        const k = `${d.sponsor}|${d.target}`.toLowerCase();
        if (!seenDeal.has(k)) { seenDeal.add(k); deals.push({ ...d, featured: false }); }
      }
      const seenFund = new Set(funds.map((f) => `${f.firm}|${f.fund_name}`.toLowerCase()));
      for (const f of (weekFunds ?? []) as (FundRow & { id: string })[]) {
        const k = `${f.firm}|${f.fund_name}`.toLowerCase();
        if (!seenFund.has(k)) { seenFund.add(k); funds.push(f); }
      }
      // Disclosed multiples first, then everything else.
      deals.sort((a, b) => Number(Boolean(b.ev_ebitda_multiple)) - Number(Boolean(a.ev_ebitda_multiple)));
      // The week's below-the-radar finds join today's; the tracker carries the rest.
      const inRadar = new Set(radar.map((r) => r.headline.toLowerCase()));
      for (const d of deals) {
        if (!d.below_radar || d.file) continue; // today's are already in
        const h = d.deal_type === "add-on" ? `${d.sponsor} ${verbOf(d)}` : `${d.sponsor} ${verbOf(d)} ${d.target}`;
        if (inRadar.has(h.toLowerCase())) continue;
        radar.push({ headline: h, body: d.summary, found_via: FOUND_VIA_LABEL[(d.found_via ?? "news") as FoundVia] ?? "Found", source: d.source, source_url: d.source_url, confirmed: true });
      }
      announced = deals.filter((d) => !d.below_radar);

      const mults = deals.map((d) => d.ev_ebitda_multiple).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
      const median = mults.length ? mults[Math.floor(mults.length / 2)] : null;
      const closes = funds.filter((f) => f.status === "final_close" || f.status === "oversubscribed");
      const raised = closes.reduce((a, f) => a + (f.raised_millions ?? 0), 0);
      const bySector = deals.reduce((m, d) => { const k = d.sector ?? "Other"; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>);
      weekStats = [
        `Deals tracked this week: ${deals.length}, ${deals.filter((d) => d.below_radar).length} with no press release (${mults.length} with disclosed multiples${median ? `, median ${median.toFixed(1)}x` : ""})`,
        `By sector: ${Object.entries(bySector).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "n/a"}`,
        `Fund closes: ${closes.length}${raised ? ` totaling $${Math.round(raised)}M` : ""}; funds newly in market: ${funds.filter((f) => f.status === "launched").length}`,
      ].join("\n");
    }

    // Headlines that became tracker rows would print twice.
    const dealArticleIds = new Set(deals.map((d) => (d as DealRow & { article_id?: string }).article_id));
    const headlinesOnly = headlines.filter((a) => !dealArticleIds.has(a.id));
    const readCandidates = [...headlinesOnly, ...pulse];

    const intel = await marketIntel(supabase, 30);
    const dateLabel = issueDateLabel(now);
    const editorialInput = { dateLabel, edition, quotes, headlines: headlinesOnly, deals: announced, radar, funds, people, pulse, readCandidates, editorItems, intel: [intelText(intel), bdcStat].filter(Boolean).join("\n"), weekNarrative, weekStats };
    let editorial = aiKey ? await editorialPass(editorialInput, aiKey) : null;

    // The issue checks its own front page. One rewrite; if it still fails, it is held for the editor.
    const lenderNames = [...new Set(bdcRows.map((r) => r.bdc_name ?? r.bdc_ticker))];
    const check = (e: EditorialOutput | null): string[] => e
      ? lintIssue({ subject: e.subject, preheader: e.preheader, headline: e.editors_note?.headline, paragraphs: e.editors_note?.paragraphs, numbers: e.by_the_numbers, closing: e.closing_line, lenders: lenderNames })
      : ["The writing pass did not run, so the issue has no Lede or subject line of its own."];
    let qualityFlags = check(editorial);
    if (editorial && qualityFlags.length && aiKey) {
      console.warn("issue failed its own check, rewriting once:", qualityFlags);
      const second = await editorialPass({ ...editorialInput, feedback: qualityFlags }, aiKey);
      if (second) { const again = check(second); if (again.length < qualityFlags.length) { editorial = second; qualityFlags = again; } }
    }

    // Apply editorial layer
    const toArticle = (a: DbArticle): Article => ({ id: a.id, title: a.title, summary: a.summary, category: a.category, source: a.source, source_url: a.source_url, fund_size_relevant: a.fund_size_relevant });
    const headlineArticles = headlinesOnly.map(toArticle);
    const pulseArticles = pulse.map(toArticle);
    if (editorial) {
      for (const t of editorial.headline_takes ?? []) if (headlineArticles[t.index - 1]) headlineArticles[t.index - 1].why_it_matters = t.why_it_matters;
      for (const t of editorial.market_pulse_takes ?? []) if (pulseArticles[t.index - 1]) pulseArticles[t.index - 1].why_it_matters = t.why_it_matters;
      for (const t of editorial.deal_takes ?? []) if (announced[t.index - 1]) announced[t.index - 1].editor_take = t.take;
      for (const t of editorial.radar_takes ?? []) if (radar[t.index - 1]) (radar[t.index - 1] as RadarItem & { take?: string }).take = t.take;
      if (editorial.featured_deal_index && announced[editorial.featured_deal_index - 1]) announced[editorial.featured_deal_index - 1].featured = true;
    }
    // Tracker order: featured, then platforms, add-ons, recaps/growth, exits.
    const typeRank: Record<string, number> = { platform: 0, "carve-out": 1, "add-on": 2, recap: 3, growth: 3, secondary: 4, exit: 5, other: 6 };
    announced.sort((a, b) => Number(b.featured) - Number(a.featured) || (typeRank[a.deal_type] ?? 6) - (typeRank[b.deal_type] ?? 6));
    if (editorial) {
    }

    const readItem = editorial?.the_read ? readCandidates[editorial.the_read.index - 1] : undefined;
    const theRead = editorial?.the_read && readItem
      ? { title: readItem.title, source: readItem.source, url: readItem.source_url, take: editorial.the_read.take }
      : null;

    const editorName = CONFIG.editorName;

    const content: NewsletterContentV2 = {
      ...emptyContent(edition),
      editors_note: editorial ? { headline: editorial.editors_note.headline, paragraphs: editorial.editors_note.paragraphs, byline: editorName } : null,
      market_data: quotes,
      by_the_numbers: (editorial?.by_the_numbers ?? []).slice(0, 3),
      below_radar: radar,
      scoreboard: intel ? {
        window_days: 30,
        banks: (intel.banks ?? []).slice(0, edition === "weekly" ? 8 : 5),
        platforms: (intel.platforms ?? []).slice(0, edition === "weekly" ? 8 : 4),
        sponsors: (intel.sponsors ?? []).slice(0, edition === "weekly" ? 8 : 5),
        sectors: edition === "weekly" ? intel.sectors ?? [] : [],
        radar: intel.radar ?? null,
      } : null,
      top_headlines: headlineArticles,
      deal_tracker: announced,
      fund_tracker: funds,
      people_moves: [
        ...people.map(toArticle),
        ...(peopleMore.length ? [{
          id: `more-${peopleMore[0].id}`,
          title: `${peopleMore.length} more move${peopleMore.length === 1 ? "" : "s"} today`,
          summary: peopleMore.map((a) => (a.title.toLowerCase().includes(a.source.toLowerCase()) ? a.title : `${a.title} (${a.source})`)).join("; ").slice(0, 1400),
          category: "people_moves", source: "The GP Pulse tracker", source_url: `${CONFIG.siteUrl}/people-moves`,
        } as Article] : []),
      ],
      on_the_market: editorItems.filter((e) => e.kind === "on_the_market"),
      overheard: editorItems.filter((e) => e.kind === "overheard" || e.kind === "reader_question"),
      market_pulse: pulseArticles,
      the_read: theRead,
      jobs: editorItems.filter((e) => e.kind === "job"),
      closing_line: editorial?.closing_line ?? null,
      quality_flags: qualityFlags,
    };

    // Reader question: Tuesday's issue asks one from the bank and reports last week's answers
    // once at least POLL_MIN readers have voted. Best effort; the issue never waits on it.
    let pollToMark: string | null = null, resultToMark: string | null = null;
    try {
      const day = issueDay(now);
      if (day.getUTCDay() === 2) {
        const POLL_MIN = Number(Deno.env.get("POLL_MIN_VOTES") ?? 10);
        const { data: last } = await supabase.from("polls").select("id, question, options").not("active_from", "is", null).is("result_newsletter_id", null).order("active_from", { ascending: false }).limit(1).maybeSingle();
        if (last) {
          const { data: votes } = await supabase.from("poll_votes").select("option_index").eq("poll_id", last.id).limit(20000);
          const counts = (last.options as string[]).map((_o, i) => ((votes ?? []) as { option_index: number }[]).filter((v) => v.option_index === i).length);
          const total = counts.reduce((x, y) => x + y, 0);
          if (total >= POLL_MIN) { content.poll_result = { question: last.question, options: last.options, counts, total }; resultToMark = last.id; }
        }
        const { data: next } = await supabase.from("polls").select("id, question, options").is("active_from", null).order("sort", { ascending: true }).limit(1).maybeSingle();
        if (next) { content.poll = { id: next.id, question: next.question, options: next.options }; pollToMark = next.id; }
      }
    } catch (e) { console.warn("poll step skipped:", e); }

    // Issue number + record
    const { data: last } = await supabase.from("newsletters").select("issue_number").order("issue_number", { ascending: false }).limit(1).maybeSingle();
    const issueNumber = (last?.issue_number ?? 0) + 1;
    const fallbackSubject = (radar[0]?.headline ?? (announced[0] ? `${announced[0].sponsor} → ${announced[0].target}` : headlines[0]?.title ?? "Today in the lower middle market")).slice(0, 80);
    const subject = editorial?.subject?.trim() || fallbackSubject;
    const slug = `${now.toISOString().slice(0, 10)}-${issueNumber}`;

    const { data: newsletter, error: nlErr } = await supabase.from("newsletters").insert({
      subject, preheader: editorial?.preheader ?? null, issue_number: issueNumber, content, status: "draft", edition, slug,
    }).select().single();
    if (nlErr) throw new Error(nlErr.message);

    if (pollToMark) await supabase.from("polls").update({ active_from: issueDay(now).toISOString().slice(0, 10), newsletter_id: newsletter.id }).eq("id", pollToMark);
    if (resultToMark) await supabase.from("polls").update({ result_newsletter_id: newsletter.id }).eq("id", resultToMark);

    // Persist structured rows, link editor items, mark articles used
    const usedIds = [...headlines, ...dealSource, ...fundArticles, ...people, ...peopleMore, ...pulse].map((a) => a.id);
    // `file` is computed per issue, not stored. If the v2.1 columns aren't there yet, store the v2 row.
    const dealRows = deals.map(({ file: _file, ...d }) => ({ ...d, announced_on: now.toISOString().slice(0, 10) }));
    const saveDeals = async () => {
      if (!dealRows.length) return;
      const { error } = await supabase.from("deals").upsert(dealRows, { onConflict: "sponsor,target", ignoreDuplicates: true });
      if (error) {
        console.warn("deals upsert (v2.1) failed, retrying with v2 columns:", error.message);
        const v2 = dealRows.map(({ platform: _p, seller_type: _s, hq_state: _h, found_via: _f, below_radar: _b, ...r }) => r);
        await supabase.from("deals").upsert(v2, { onConflict: "sponsor,target", ignoreDuplicates: true });
      }
    };
    await Promise.all([
      saveDeals(),
      bdcIds.length ? supabase.from("bdc_holdings").update({ used_in_newsletter_id: newsletter.id }).in("id", bdcIds) : Promise.resolve(),
      signalIds.length ? supabase.from("editor_items").update({ status: "published", newsletter_id: newsletter.id }).in("id", signalIds) : Promise.resolve(),
      funds.length
        ? supabase.from("funds").upsert(funds.map((f) => ({ ...f, announced_on: now.toISOString().slice(0, 10) })), { onConflict: "firm,fund_name", ignoreDuplicates: true })
        : Promise.resolve(),
      editorItems.length
        ? supabase.from("editor_items").update({ status: "published", newsletter_id: newsletter.id }).in("id", editorItems.map((e) => e.id))
        : Promise.resolve(),
      usedIds.length ? supabase.from("articles").update({ used_in_newsletter_id: newsletter.id }).in("id", usedIds) : Promise.resolve(),
    ]);

    // A held issue will not go out on its own. Tell the editor now, while there is an evening to fix it.
    if (qualityFlags.length) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${resendKey.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: CONFIG.from, to: [CONFIG.replyTo], subject: `[HELD] Issue #${issueNumber} needs you before it sends`,
            html: `<p>Issue #${issueNumber} ("${esc(subject)}") failed its own check and will not send automatically.</p><ul>${qualityFlags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul><p>Fix it and approve it on the <a href="${CONFIG.siteUrl}/admin">Editor's Desk</a>. Approving sends it at the usual time.</p>`,
            tags: [{ name: "kind", value: "held" }],
          }),
        }).catch((e) => console.error("held-issue alert failed", e));
      }
    }

    return new Response(JSON.stringify({
      message: `Issue #${issueNumber} drafted: ${radar.length} below the radar, ${headlinesOnly.length} headlines, ${announced.length} announced deals, ${funds.length} funds, ${people.length} moves, ${editorItems.length} editor items${editorial ? "" : " (editorial pass unavailable)"}${qualityFlags.length ? `. HELD for the editor: ${qualityFlags.join(" ")}` : ""}`,
      newsletter_id: newsletter.id, issue_number: issueNumber, subject,
      sections: { headlines: headlines.length, deals: deals.length, funds: funds.length, people: people.length, pulse: pulse.length, editor_items: editorItems.length },
      editorial: Boolean(editorial), held: qualityFlags.length > 0, quality_flags: qualityFlags,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-newsletter", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
