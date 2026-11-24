import { describe, expect, it } from "vitest";
import { isFridayIssue, issueDateLabel, issueDay } from "../../supabase/functions/_shared/issue-day";

const day = (s: string) => issueDay(new Date(s)).toISOString().slice(0, 10);

describe("issueDay", () => {
  it("treats the Thursday evening build as Friday's issue", () => {
    expect(day("2026-11-19T21:50:00Z")).toBe("2026-11-20");
    expect(isFridayIssue(new Date("2026-11-19T22:53:00Z"))).toBe(true);
    expect(issueDateLabel(new Date("2026-11-19T21:50:00Z"))).toBe("Friday, November 20, 2026");
  });
  it("moves weekday evening builds to the next morning", () => {
    expect(day("2026-11-23T22:35:00Z")).toBe("2026-11-24");
    expect(isFridayIssue(new Date("2026-11-23T22:35:00Z"))).toBe(false);
  });
  it("rolls weekend builds to Monday", () => {
    expect(day("2026-11-22T22:27:00Z")).toBe("2026-11-23");
    expect(day("2026-11-20T22:00:00Z")).toBe("2026-11-23");
    expect(day("2026-11-21T14:00:00Z")).toBe("2026-11-23");
  });
  it("keeps a morning rebuild on the same day", () => {
    expect(day("2026-11-20T14:00:00Z")).toBe("2026-11-20");
  });
  it("uses New York time, in summer and across the UTC date line", () => {
    expect(day("2026-07-09T21:50:00Z")).toBe("2026-07-10");
    expect(day("2026-11-20T02:00:00Z")).toBe("2026-11-20");
  });
});
