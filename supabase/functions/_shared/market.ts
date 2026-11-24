// The day's move for an index, from a Yahoo chart response.
//
// The ticker used to subtract `chartPreviousClose` from the last price. With range=5d that field
// is the close before the first bar of the range, so the strip printed the five-day move as the
// day's: on Nov 23, 2026 the S&P 500 rose 4.7% and the issue showed it down 2.4%. The previous
// session's close is the second-to-last daily bar (or the last one, before today's bar exists).

export interface ChartResult {
  meta?: { regularMarketPrice?: number; regularMarketTime?: number; gmtoffset?: number; chartPreviousClose?: number; previousClose?: number };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
}

export function dailyMove(r: ChartResult | null | undefined): { price: number; prev: number } | null {
  const meta = r?.meta;
  const price = meta?.regularMarketPrice;
  if (!meta || typeof price !== "number" || !isFinite(price) || price <= 0) return null;
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const stamps = r?.timestamp ?? [];
  const bars: { day: string; close: number }[] = [];
  const off = meta.gmtoffset ?? 0;
  const dayOf = (t: number) => new Date((t + off) * 1000).toISOString().slice(0, 10);
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && isFinite(c) && c > 0 && typeof stamps[i] === "number") bars.push({ day: dayOf(stamps[i]), close: c });
  }
  if (!bars.length) return null; // no bars, no honest day-over-day figure
  const last = bars[bars.length - 1];
  const priceDay = typeof meta.regularMarketTime === "number" ? dayOf(meta.regularMarketTime) : last.day;
  // The last bar is the session the price belongs to: compare with the bar before it.
  const prev = last.day === priceDay ? bars[bars.length - 2]?.close : last.close;
  if (typeof prev !== "number") return null;
  return { price, prev };
}
