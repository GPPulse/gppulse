import { describe, expect, it } from "vitest";
import { lenderKey, lintIssue } from "../../supabase/functions/_shared/lint";

const good = {
  subject: "Falfurrias's second deal in three weeks had no press release",
  headline: "Two sponsors doubled up, and one did it quietly",
  paragraphs: ["Falfurrias Capital Partners took a majority stake in Freeman & Forrest.", "Rosewood sold StationServ to JF Group.", "Our read: a bet on the founders."],
  numbers: [{ value: "11 of 135", label: "deals with no press release" }, { value: "2", label: "Falfurrias deals since Nov 4" }, { value: "14 vs 8", label: "Industrials deals this week" }],
  closing: "Three portfolio pages changed before any press release did.",
  lenders: ["GOLUB CAPITAL BDC, Inc."],
};

describe("lintIssue", () => {
  it("passes a deal-led issue", () => { expect(lintIssue(good)).toEqual([]); });

  it("catches issue #15 as it was first drafted", () => {
    const problems = lintIssue({
      subject: "Golub's five new borrowers and a Falfurrias double",
      headline: "Golub's new borrower list is the quiet sourcing signal",
      paragraphs: ["Golub Capital BDC listed five borrowers for the first time in its schedule.", "The spread range is tight. Sponsors are getting tighter paper from Golub.", "Work the names backward. Golub's schedule is a better early indicator."],
      numbers: [{ value: "11 of 135", label: "deals with no press release" }, { value: "5", label: "new Golub BDC borrowers listed" }, { value: "14 vs 8", label: "Industrials deals this week" }],
      closing: "Five Golub borrowers appeared without a sponsor name, which is how Golub prefers it.",
      lenders: ["GOLUB CAPITAL BDC, Inc."],
    });
    expect(problems.length).toBeGreaterThanOrEqual(5);
    expect(problems.join(" ")).toMatch(/subject names a lender/);
    expect(problems.join(" ")).toMatch(/Lede opens on a lender/);
    expect(problems.join(" ")).toMatch(/sign-off/);
  });

  it("catches a markets-led subject and filler", () => {
    expect(lintIssue({ ...good, subject: "Russell down 4.2%, 10Y at 5.1%, and deals still printed" }).join(" ")).toMatch(/public markets/);
    expect(lintIssue({ ...good, paragraphs: ["Kian bought three companies. Terms were not disclosed.", "b", "c"] }).join(" ")).toMatch(/Filler/);
  });

  it("allows a lender in a later paragraph but not as the opening", () => {
    expect(lintIssue({ ...good, paragraphs: [good.paragraphs[0], "Golub financed it at 5.25% over the base rate.", good.paragraphs[2]] })).toEqual([]);
  });

  it("reduces a filer's name to what a reader would recognise", () => {
    expect(lenderKey("GOLUB CAPITAL BDC, Inc.")).toBe("golub");
    expect(lenderKey("Gladstone Investment Corporation")).toBe("gladstone");
    expect(lenderKey("Main Street Capital Corporation")).toBe("main street");
    expect(lenderKey("Ares Capital Corporation")).toBe("ares capital");
  });
});
