import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// Ticker for the masthead. Chosen for what moves an LMM investor's math, not for
// what's on CNBC: small-cap equities, the 10-year, SOFR (unitranche base rate),
// and high-yield spreads (the cleanest public proxy for private credit appetite).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: "index" | "percent" | "bps";
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function yahoo(symbol: string, name: string, unit: MarketQuote["unit"] = "index"): Promise<MarketQuote | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const d = await r.json();
    const meta = d.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prev = meta?.chartPreviousClose ?? meta?.previousClose;
    if (!price || !prev) return null;
    const change = price - prev;
    return {
      symbol, name, unit,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 1000) / 1000,
      changePercent: Math.round((change / prev) * 10000) / 100,
    };
  } catch (e) {
    console.error(`yahoo ${symbol}`, e);
    return null;
  }
}

async function sofr(): Promise<MarketQuote | null> {
  try {
    const r = await fetch("https://markets.newyorkfed.org/api/rates/secured/sofr/last/2.json", { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const d = await r.json();
    const rates = d?.refRates ?? [];
    if (!rates[0]) return null;
    const cur = parseFloat(rates[0].percentRate);
    const prev = rates[1] ? parseFloat(rates[1].percentRate) : cur;
    return { symbol: "SOFR", name: "SOFR", unit: "percent", price: cur, change: Math.round((cur - prev) * 1000) / 1000, changePercent: 0 };
  } catch (e) {
    console.error("sofr", e);
    return null;
  }
}

/** ICE BofA US High Yield OAS via FRED. Needs FRED_API_KEY (free at fred.stlouisfed.org). */
async function hySpread(): Promise<MarketQuote | null> {
  const key = Deno.env.get("FRED_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=BAMLH0A0HYM2&api_key=${key}&file_type=json&sort_order=desc&limit=5`);
    if (!r.ok) return null;
    const d = await r.json();
    const obs = (d.observations ?? []).filter((o: { value: string }) => o.value !== ".");
    if (!obs[0]) return null;
    const cur = parseFloat(obs[0].value) * 100; // percent → bps
    const prev = obs[1] ? parseFloat(obs[1].value) * 100 : cur;
    return { symbol: "HY_OAS", name: "HY spread", unit: "percent", price: cur / 100, change: Math.round(cur - prev) / 100, changePercent: 0 };
  } catch (e) {
    console.error("fred", e);
    return null;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const results = await Promise.all([
      yahoo("^GSPC", "S&P 500"),
      yahoo("^RUT", "Russell 2000"),
      yahoo("^TNX", "10Y UST", "percent"),
      sofr(),
      hySpread(),
    ]);
    const quotes = results.filter(Boolean) as MarketQuote[];
    return new Response(JSON.stringify({ quotes, fetched_at: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("market data", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
