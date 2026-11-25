import { dailyMove } from "../market.ts";

const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const day = (iso: string) => Math.floor(new Date(`${iso}T14:30:00Z`).getTime() / 1000);
const off = -18000;

// Nov 23, 2026: the S&P closed at 7,237.17, up 326.78 on the day and down 2.4% on five days.
const sp = {
  meta: { regularMarketPrice: 7237.17, regularMarketTime: day("2026-11-23") + 23400, gmtoffset: off, chartPreviousClose: 7416.59 },
  timestamp: ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23"].map(day),
  indicators: { quote: [{ close: [7330.1, 7250.4, 7101.9, 6910.39, 7237.17] }] },
};
Deno.test("the day's move is against the prior session, not the start of the range", () => {
  const m = dailyMove(sp)!;
  eq(m.prev, 6910.39, "prev");
  eq(Math.round(((m.price - m.prev) / m.prev) * 10000) / 100, 4.73, "percent");
});
Deno.test("before today's bar exists, the last bar is the prior close", () => {
  const pre = { ...sp, meta: { ...sp.meta, regularMarketPrice: 7250, regularMarketTime: day("2026-11-24") } };
  eq(dailyMove(pre)!.prev, 7237.17, "prev");
});
Deno.test("holes in the series are skipped", () => {
  const holes = { ...sp, indicators: { quote: [{ close: [7330.1, null, 7101.9, null, 7237.17] }] } };
  eq(dailyMove(holes)!.prev, 7101.9, "prev");
});
Deno.test("no bars means no figure, never a guess", () => {
  eq(dailyMove({ meta: { regularMarketPrice: 7237.17, chartPreviousClose: 7416.59 } }), null, "null");
  eq(dailyMove(null), null, "null");
});
