import { describe, expect, it } from "vitest";
import { cardHtml } from "../../api/issue.js";

describe("issue link-preview card", () => {
  it("uses the issue's subject and preheader, escaped", () => {
    const html = cardHtml({ subject: `Falfurrias's second deal & a "quiet" one <b>`, preheader: "Plus Rosewood's second transaction since Nov 18.", issue_number: 15, sent_at: "2026-11-24T10:51:00Z" }, "2026-11-23-15");
    expect(html).toContain('<meta property="og:title" content="Falfurrias\'s second deal &amp; a &quot;quiet&quot; one &lt;b&gt;">');
    expect(html).toContain('content="Plus Rosewood\'s second transaction since Nov 18."');
    expect(html).toContain('<meta property="og:url" content="https://thegppulse.com/archive/2026-11-23-15">');
    expect(html).toContain('<meta property="og:image" content="https://thegppulse.com/og.png">');
    expect(html).not.toContain("<b>");
  });
  it("falls back to the site card when the issue is not found", () => {
    const html = cardHtml(null, "nope");
    expect(html).toContain("The GP Pulse: the lower middle market, every weekday morning");
  });
});
