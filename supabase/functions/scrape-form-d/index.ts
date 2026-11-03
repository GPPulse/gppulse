import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStaff, isInternalCall, unauthorized } from "../_shared/auth.ts";

// SEC Form D → fund tracker. Every private fund raising capital under Reg D files a Form D
// (and D/A amendments as it closes). We read EDGAR's "current filings" feed, pull each
// filing's structured XML, keep Private Equity funds under $1B, and upsert into `funds`
// plus an article so the issue can mention it. This surfaces LMM fund launches and closes
// weeks before a press release, and catches the ones that never issue one.
//
// EDGAR asks for a descriptive User-Agent with contact info and ≤10 req/s.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};
const CONTACT = Deno.env.get("NEWSLETTER_REPLY_TO") ?? "editor@thegppulse.com";
const UA = `TheGPPulse/1.0 (newsletter; ${CONTACT})`;
const MAX_FILINGS = Number(Deno.env.get("FORM_D_MAX_FILINGS") ?? 160);
const FUND_CAP_MILLIONS = 1000;

const pick = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
};
const num = (s: string | null): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function edgar(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml, text/xml, application/atom+xml, text/html" } });
    if (!r.ok) { console.warn(`[form-d] ${r.status} ${url}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[form-d] fetch failed ${url}: ${String(e).slice(0, 80)}`);
    return null;
  }
}

/** "Blue Point Capital Partners IV, L.P." → firm "Blue Point Capital Partners", fund "Fund IV", number 4 */
function splitIssuer(name: string): { firm: string; fund: string; number: number | null } {
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15 };
  let clean = name.replace(/,?\s*(L\.?P\.?|LLC|L\.L\.C\.|Ltd\.?|Limited|Inc\.?|SCSp|S\.C\.A\.)\s*$/i, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
  // trailing numeral, optionally with a parallel-vehicle suffix: "IV", "IV-A", "2", "III (Parallel)"
  const m = clean.match(/\b(X{0,2}(?:IX|IV|V?I{1,3}|V|X)|\d{1,2})(?:\s*-\s*[A-Z]|\s*[A-Z])?\s*$/);
  let number: number | null = null;
  let stem = clean;
  if (m) {
    number = roman[m[1]] ?? (Number(m[1]) || null);
    stem = clean.slice(0, m.index).trim().replace(/[,\-]+$/, "").trim();
  }
  // Drop generic trailing fund words from the firm name
  const firm = stem.replace(/\s+(?:(?:Growth|Investment|Opportunit(?:y|ies)|Buyout|Private Equity|Equity|Co-?Invest(?:ment)?|Parallel|Feeder|Master)\s+)*(?:Fund|Investors|Partners Fund|Vehicle)\s*$/i, "").trim() || stem || clean;
  const fund = number ? `Fund ${m![1]}${(m![0].match(/-?\s*([A-Z])\s*$/)?.[1] && !roman[m![1].slice(-1)] ? "" : "")}` : clean;
  return { firm, fund, number };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!isInternalCall(req) && !(await getStaff(req, supabase))) return unauthorized(corsHeaders);

  try {
    // Current Form D filings (includes D/A amendments). Two pages = up to 200 filings.
    const entries: { title: string; link: string; updated: string }[] = [];
    for (const start of [0, 100]) {
      const atom = await edgar(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D&count=100&start=${start}&output=atom`);
      if (!atom) break;
      for (const b of atom.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []) {
        const title = pick(b, "title") ?? "";
        const link = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? "";
        const updated = pick(b, "updated") ?? "";
        if (/^D(\/A)?\s+-/i.test(title) && link) entries.push({ title, link, updated });
      }
      await sleep(150);
      if (entries.length >= MAX_FILINGS) break;
    }

    // Skip accessions we've already seen
    const accessionOf = (link: string) => link.match(/(\d{10}-\d{2}-\d{6})/)?.[1] ?? null;
    const accs = entries.map((e) => accessionOf(e.link)).filter(Boolean) as string[];
    const { data: seen } = await supabase.from("sec_form_d").select("accession").in("accession", accs);
    const seenSet = new Set((seen ?? []).map((s: { accession: string }) => s.accession));

    let checked = 0, peFunds = 0, inserted = 0, updated = 0;
    const found: string[] = [];

    for (const e of entries.slice(0, MAX_FILINGS)) {
      const acc = accessionOf(e.link);
      if (!acc || seenSet.has(acc)) continue;
      const cik = e.link.match(/\/data\/(\d+)\//)?.[1];
      if (!cik) continue;
      const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}`;
      const xml = await edgar(`${folder}/primary_doc.xml`);
      await sleep(120);
      checked++;
      if (!xml) continue;

      const fundType = pick(xml, "investmentFundType");
      const industry = pick(xml, "industryGroupType");
      const issuer = pick(xml, "entityName") ?? e.title.replace(/^D(\/A)?\s+-\s+/i, "").replace(/\s*\(\d+\).*$/, "");
      const isAmendment = /<isAmendment>\s*true/i.test(xml);
      const total = num(pick(xml, "totalOfferingAmount"));
      const sold = num(pick(xml, "totalAmountSold"));
      const indefinite = /<totalOfferingAmount>[^<]*<\/totalOfferingAmount>/i.test(xml) ? false : /Indefinite/i.test(xml);
      const firstSale = pick(xml, "dateOfFirstSale");
      const state = (xml.match(/<issuerAddress>[\s\S]*?<stateOrCountry>([^<]+)</i)?.[1] ?? "").trim();
      const country = (xml.match(/<issuerAddress>[\s\S]*?<stateOrCountryDescription>([^<]+)</i)?.[1] ?? "").trim();
      const related = [...xml.matchAll(/<relatedPersonInfo>[\s\S]*?<firstName>([^<]*)<\/firstName>[\s\S]*?<lastName>([^<]*)<\/lastName>[\s\S]*?<\/relatedPersonInfo>/gi)].slice(0, 4).map((m) => `${m[1].trim()} ${m[2].trim()}`);

      // Record every filing we inspected so we never re-fetch it
      await supabase.from("sec_form_d").insert({ accession: acc, cik, issuer, fund_type: fundType, industry_group: industry, is_amendment: isAmendment, total_offering: total, amount_sold: sold, state, filed_at: e.updated || new Date().toISOString(), url: `${folder}/primary_doc.xml` });

      const isPE = (fundType ?? "").toLowerCase().includes("private equity");
      const isUS = !country || /united states/i.test(country) || /^[A-Z]{2}$/.test(state);
      const underCap = indefinite || total === null || total / 1e6 <= FUND_CAP_MILLIONS;
      // "Private Equity Fund" is self-reported on Form D: SPVs, co-invest vehicles, feeders, real estate and
      // retail-platform series all tick it. Keep committed-capital buyout/growth vehicles only.
      const NOISE = /\b(SPV|Series of|a series|Note Issuer|Realty|Real Estate|REIT|Co-?Invest(?:ment|ors)?|Feeder|Master|Access|Equitybee|AngelList|Forge|Secondary|Credit|Lending|Debt|Infrastructure|Royalt|Blocker|Aggregator|Employee|GP|General Partner|Carry|Management|Advisors)\b/i;
      const totalMillions = total ? total / 1e6 : null;
      const bigEnough = indefinite || (totalMillions !== null && totalMillions >= 25);
      if (!isPE || !isUS || !underCap || NOISE.test(issuer) || !bigEnough) continue;
      peFunds++;

      const { firm, fund, number } = splitIssuer(issuer);
      const totalM = total ? Math.round(total / 1e6) : null;
      const soldM = sold ? Math.round(sold / 1e6) : null;
      const status: "launched" | "first_close" | "final_close" = soldM && totalM && soldM >= totalM ? "final_close" : soldM ? "first_close" : "launched";
      const summary = `Form D${isAmendment ? " amendment" : ""}: ${soldM !== null ? `$${soldM}M sold` : "no sales yet"}${totalM ? ` of $${totalM}M offering` : indefinite ? " (indefinite offering)" : ""}${firstSale ? `, first sale ${firstSale}` : ""}${related.length ? `. Related persons: ${related.join(", ")}` : ""}.`;
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}-index.htm`;

      // Upsert the fund row (firm + fund_name unique). Amendments update amounts and status.
      const { data: existing } = await supabase.from("funds").select("id, raised_millions, status").eq("firm", firm).eq("fund_name", fund).maybeSingle();
      if (existing) {
        await supabase.from("funds").update({ raised_millions: soldM ?? existing.raised_millions, target_millions: totalM, status, summary, source: "SEC Form D", source_url: filingUrl, headquarters: state || null }).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("funds").insert({ firm, fund_name: fund, fund_number: number, status, strategy: "Private equity (per Form D)", target_millions: totalM, raised_millions: soldM, headquarters: state || null, summary, source: "SEC Form D", source_url: filingUrl, announced_on: (e.updated || new Date().toISOString()).slice(0, 10) });
        inserted++;
      }
      // An article so the issue's fund tracker and the Lede can see it (only when there's real money moving)
      if (soldM && soldM >= 10) {
        const title = `${firm} ${isAmendment ? "reports" : "files"} ${fund}: $${soldM}M${totalM ? ` of $${totalM}M` : ""} raised (Form D)`;
        await supabase.from("articles").upsert({ title, summary, category: "fund_tracker", source: "SEC Form D", source_url: filingUrl, fund_size_relevant: true, relevance_score: 70, published_at: e.updated || null, scraped_at: new Date().toISOString() }, { onConflict: "source_url", ignoreDuplicates: true });
      }
      found.push(`${firm} — ${fund}: ${soldM ?? 0}/${totalM ?? "?"}M`);
    }

    return new Response(JSON.stringify({ message: `Form D: ${checked} filings checked, ${peFunds} PE funds under $1B, ${inserted} new, ${updated} updated`, checked, pe_funds: peFunds, inserted, updated, sample: found.slice(0, 15) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scrape-form-d", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
