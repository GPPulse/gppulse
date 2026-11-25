import { describe, expect, it } from "vitest";
import { lintStyle, tidy } from "../../supabase/functions/_shared/lint.ts";
import { cleanUrl, extractReads, pageFacts, publisherFromHost } from "../../supabase/functions/_shared/reading.ts";
import { renderIssueEmail } from "../../supabase/functions/_shared/email.ts";
import { emptyContent } from "../../supabase/functions/_shared/content.ts";
import { capPerPublisher, weekendLabel } from "../../supabase/functions/generate-weekend/pick.ts";

const good = {
  subject: "Falfurrias's second deal in three weeks",
  headline: "A Charlotte sponsor is buying faster than it raises",
  paragraphs: ["Falfurrias took a majority stake in a Denver marketing firm on Tuesday. It is the firm's second platform since Nov 4, both founder-owned, both under $10M of EBITDA by our count of what was disclosed. Fund VI closed in March.", "Our read: two more before year end."],
  closing: "Eleven deals, four banks, one Tuesday.",
  takes: ["Third add-on for the platform since June.", "Founder seller. The bank on it has closed four of these in Ohio this year, all with the same lender, and the lender's hold size has gone up each time.", "Same sponsor, same sector, smaller cheque.", "Watch the Dallas platform next."],
};

describe("desk voice", () => {
  it("passes copy that reads like a desk wrote it", () => {
    expect(lintStyle(good)).toEqual([]);
  });
  it("catches any mention of how a deal was found", () => {
    for (const t of ["Found on a banker tombstone last week.", "Now listed on the sponsor's portfolio page.", "The loan shows up in a 10-Q.", "There was no press release for this one.", "Per the lender's schedule of investments."]) {
      expect(lintStyle({ ...good, takes: [t] }).some((p) => p.startsWith("Says how")), t).toBe(true);
    }
    expect(lintStyle({ ...good, takes: ["The seller's website business was carved out first."] }).some((p) => p.startsWith("Says how"))).toBe(false);
  });
  it("catches generated-copy tells", () => {
    expect(lintStyle({ ...good, paragraphs: ["This underscores a robust landscape."] }).join(" ")).toMatch(/banned word/);
    expect(lintStyle({ ...good, closing: "It isn't just a deal — it's a signal." }).join(" ")).toMatch(/dash/);
    expect(lintStyle({ ...good, closing: "This is not just a deal but a pattern." }).join(" ")).toMatch(/not just/);
    expect(lintStyle({ ...good, headline: "What does it mean for add-ons?" }).join(" ")).toMatch(/question/);
  });
  it("catches takes that are all one length or all open the same way", () => {
    const same = ["The sponsor adds a second HVAC platform in Texas.", "The sponsor buys a third towing company in Ohio.", "The sponsor closes a fourth dental add-on in Utah.", "The sponsor exits a fifth roofing business in Iowa."];
    const out = lintStyle({ ...good, takes: same }).join(" ");
    expect(out).toMatch(/all about/);
    expect(out).toMatch(/same word/);
  });
  it("tidy removes dashes and exclamation points without mangling the sentence", () => {
    expect(tidy("Two deals — both in Ohio — and one bank!")).toBe("Two deals, both in Ohio, and one bank.");
    expect(tidy("A pair of add-ons, one seller.")).toBe("A pair of add-ons, one seller.");
    expect(tidy(null)).toBeNull();
  });
});

describe("no source lines in what readers see", () => {
  it("the email prints a below-the-radar deal with no source chip, link or 'found at' line", () => {
    const c = { ...emptyContent("daily"), below_radar: [
      { headline: "Linx Partners acquired Palmetto State Transportation", body: "A South Carolina trucking company.", found_via: "Banker tombstone", source: "MelCap Partners", source_url: "https://melcap.example/transactions", confirmed: true },
      { headline: "Brydon Group appears to have added NLign", body: "Neither side has confirmed a deal.", found_via: "Portfolio page", source: "The Brydon Group", source_url: "https://brydon.example/portfolio", confirmed: false },
    ] };
    const html = renderIssueEmail(c as never, { siteUrl: "https://thegppulse.com", issueNumber: 16, issueDate: new Date("2026-11-25T12:00:00Z"), subject: "s", preheader: "p", webUrl: "https://thegppulse.com/archive/x", preferencesUrl: "https://thegppulse.com/preferences", unsubscribeUrl: "https://thegppulse.com/unsubscribe", postalAddress: "Austin, TX", editorName: "Carl Schlotman", referralCount: 0, referralUrl: "https://thegppulse.com/?r=1" } as never);
    expect(html).toContain("Palmetto State Transportation");
    expect(html).toContain("UNCONFIRMED");
    expect(html).not.toMatch(/tombstone|Portfolio page|Found at|melcap\.example|brydon\.example|no press release/i);
    expect(html).toContain("Closed a deal?");
  });
});

describe("weekend reading", () => {
  const digest = `<p>This week:</p>
    <a href="https://click.letter.example/r?u=abc&amp;utm_source=x">Why the best compounders look boring for a decade</a>
    <a href="https://www.oaktree.example/insights/memo/the-thing?utm_campaign=y#top">The memo: on bubble watch, again</a>
    <a href="https://twitter.com/someone/status/1">A long thread about serial acquirers worth reading</a>
    <a href="https://letter.example/unsubscribe?id=1">Unsubscribe from this list entirely</a>
    <a href="https://letter.example/p/short">Read more</a>
    <a href="https://www.oaktree.example/insights/memo/the-thing">The memo: on bubble watch, again</a>
    <a href="https://shop.example/store/item">Buy the book in our store today</a>`;
  it("keeps article links and drops housekeeping, social links and repeats", () => {
    const reads = extractReads(digest);
    expect(reads.map((r) => r.text)).toEqual(["Why the best compounders look boring for a decade", "The memo: on bubble watch, again"]);
  });
  it("cleans tracking off a link", () => {
    expect(cleanUrl("https://www.oaktree.example/insights/memo/the-thing?utm_campaign=y&page=2#top")).toBe("https://www.oaktree.example/insights/memo/the-thing?page=2");
    expect(cleanUrl("mailto:a@b.com")).toBeNull();
  });
  it("reads a page's own title and publisher", () => {
    const f = pageFacts(`<html><head><title>Fallback</title><meta property="og:title" content="On Bubble Watch"><meta property="og:site_name" content="Oaktree Capital"><meta name="description" content="A memo."></head><body><nav>Menu</nav><p>Body text here.</p></body></html>`);
    expect(f).toMatchObject({ title: "On Bubble Watch", site: "Oaktree Capital", description: "A memo." });
    expect(f.opening).toContain("Body text here.");
    expect(f.opening).not.toContain("Menu");
    expect(publisherFromHost("https://www.verdad-cap.com/insights/x")).toBe("Verdad Cap");
  });
  it("never takes more than two picks from one publisher", () => {
    const picks = ["A", "A", "A", "B", "a "].map((publisher, i) => ({ publisher, i }));
    expect(capPerPublisher(picks).map((p) => p.i)).toEqual([0, 1, 3]);
    expect(weekendLabel(new Date("2026-11-25T12:00:00Z"))).toBe("the weekend of Nov 28");
  });
  it("renders the Saturday edition", () => {
    const c = { ...emptyContent("special"), editors_note: { headline: "Three memos and a history lesson", paragraphs: ["Read the second one first."], byline: "Carl Schlotman" }, weekend_reads: [{ title: "On Bubble Watch", publisher: "Oaktree Capital", url: "https://www.oaktree.example/memo", note: "Marks lays out what he checks before calling a top.", minutes: 20 }] };
    const html = renderIssueEmail(c as never, { siteUrl: "https://thegppulse.com", issueNumber: 17, issueDate: new Date("2026-11-28T12:00:00Z"), subject: "s", preheader: "p", webUrl: "w", preferencesUrl: "p", unsubscribeUrl: "u", postalAddress: "Austin, TX", editorName: "Carl Schlotman", referralCount: 0, referralUrl: "r" } as never);
    expect(html).toContain("Weekend Reading");
    expect(html).toContain("Oaktree Capital");
    expect(html).toContain("20 min");
    expect(html).not.toContain("Closed a deal?");
  });
});
