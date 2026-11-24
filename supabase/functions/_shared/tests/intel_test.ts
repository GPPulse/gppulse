import { fileLines, isBelowRadar, isCaughtUp } from "../intel.ts";

const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const base = { tracker: [], platform_addons: [], tombstone_banks: [], tombstone_total: 0, fund: null, press_mentions: 0 };

Deno.test("a deal we already had says when and how we first had it", () => {
  const prior = { announced_on: "2026-11-18", first_seen_on: "2026-11-18", found_via: "tombstone", source: "Infinity Capital Partners" };
  eq(fileLines({ sponsor: "Rosewood Private Investments", deal_type: "exit" }, { ...base, prior_report: prior }),
    ["In our tracker since Nov 18, from a banker tombstone (Infinity Capital Partners)"], "file line");
  eq(isCaughtUp("news", prior), true, "press caught up with a tombstone");
  eq(isCaughtUp("tombstone", prior), false, "a second tombstone is only a repeat");
  eq(isCaughtUp("news", { ...prior, found_via: "press_release" }), false, "a release we already ran is only a repeat");
});

Deno.test("without a prior report nothing changes", () => {
  eq(fileLines({ sponsor: "Kian Capital", deal_type: "platform" }, base), [], "empty file");
  eq(isBelowRadar("tombstone", base), true, "tombstone with no press is below the radar");
  eq(isBelowRadar("press_release", base), false, "a release is not");
});
