import { NewsletterContentV2 } from "./newsletter-content";

// Illustrative issue shown on the landing page until the first real issue ships.
// Firms, targets and figures are examples, not reporting.

export const SAMPLE_ISSUE: NewsletterContentV2 = {
  version: 2,
  edition: "daily",
  editors_note: {
    headline: "Two industrial recaps at 7x, and a lender blinked",
    paragraphs: [
      "Two sponsor-to-sponsor recaps printed yesterday in industrial services, both with disclosed terms, both inside 7.0–7.5x. That's a full turn below where the same assets were marketed in 2024. The sellers took the number anyway. Our read: the 2021–22 vintage is out of time, and the first movers would rather return 2.2x now than fight for 2.8x in 2027.",
      "The more interesting signal is the debt. One of the two was financed with a unitranche at S+525 and 4.0x total leverage, from a lender that was quoting S+575 and 3.5x in June on comparable credits. Fifty basis points and half a turn in four months is a lender that needs to deploy. If you've got a platform with $8–12M of EBITDA and a clean trailing twelve, go back to the lenders who passed on you in the spring.",
      "High conviction: the bid-ask in LMM industrials is closing from the seller side. Low conviction: that it lasts past year-end once the LP distributions start flowing and the pressure comes off.",
    ],
    byline: "Carl Schlotman",
  },
  market_data: [
    { symbol: "^GSPC", name: "S&P 500", price: 6812.4, change: 22.1, changePercent: 0.33, unit: "index" },
    { symbol: "^RUT", name: "Russell 2000", price: 2418.6, change: -9.4, changePercent: -0.39, unit: "index" },
    { symbol: "^TNX", name: "10Y UST", price: 4.14, change: -0.03, changePercent: 0, unit: "percent" },
    { symbol: "SOFR", name: "SOFR", price: 4.09, change: 0, changePercent: 0, unit: "percent" },
    { symbol: "HY_OAS", name: "HY spread", price: 3.02, change: -0.04, changePercent: 0, unit: "percent" },
  ],
  by_the_numbers: [
    { value: "7.2x", label: "Median disclosed EV/EBITDA", context: "across 6 LMM deals with terms, trailing 30 days" },
    { value: "S+525", label: "Unitranche pricing seen this week", context: "4.0x total leverage, $9M EBITDA industrial" },
    { value: "$410M", label: "Largest sub-$1B final close", context: "oversubscribed vs. $350M target" },
  ],
  top_headlines: [
    {
      id: "s1",
      title: "Riverbend Partners recaps Precision Coatings with Caldwell Equity at $118M EV",
      summary: "Caldwell takes a majority stake in the Ohio powder-coating platform Riverbend built from three add-ons since 2021. Riverbend rolls a minority position. Disclosed EBITDA of $16.4M implies 7.2x.",
      category: "headline",
      source: "Illustrative",
      source_url: null,
      why_it_matters: "A 2021 platform exiting at 7.2x after three add-ons is a buy-and-build that worked on multiple arbitrage, not on growth. Expect more of these as 2021 funds hit year five.",
    },
    {
      id: "s2",
      title: "Harbor Point Capital closes Fund IV at $410M, above $350M target",
      summary: "The Charlotte firm closed its fourth lower middle market buyout fund oversubscribed after nine months in market. Fund III was $265M. Strategy stays on business services and niche manufacturing at $3–15M EBITDA.",
      category: "headline",
      source: "Illustrative",
      source_url: null,
      why_it_matters: "Nine months to an oversubscribed close is the fastest we've tracked this year for a sub-$500M fund. LPs are rewarding firms that returned capital in 2024–25, and punishing the ones that didn't.",
    },
    {
      id: "s3",
      title: "Summit Ridge sells Atlas Fire Protection to a strategic after 4-year hold",
      summary: "Summit Ridge exited the Texas fire and life-safety services platform to a publicly traded strategic. Terms undisclosed. Atlas grew from $6M to a reported $19M of EBITDA under Summit Ridge's ownership through 11 acquisitions.",
      category: "headline",
      source: "Illustrative",
      source_url: null,
      why_it_matters: "Strategic buyers are back in fire and life safety, which means the next sponsor platform in the space gets a real exit bid. Watch for new entrants at the $3–5M EBITDA level trying to replicate the roll-up.",
    },
  ],
  deal_tracker: [
    { sponsor: "Caldwell Equity", target: "Precision Coatings", deal_type: "recap", sector: "Industrials", enterprise_value_millions: 118, ebitda_millions: 16.4, ev_ebitda_multiple: 7.2, figures_disclosed: true, summary: "Majority recap of an Ohio powder-coating platform from Riverbend Partners, which retains a minority stake.", source: "Illustrative", source_url: null, featured: true, editor_take: "The S+525 unitranche behind this one is the number to remember. That's a lender leaning in." },
    { sponsor: "Blue Heron Capital", target: "Meridian Dental Lab", deal_type: "add-on", sector: "Healthcare", enterprise_value_millions: null, ebitda_millions: null, ev_ebitda_multiple: null, figures_disclosed: false, summary: "Fourth add-on for Blue Heron's dental laboratory platform, adding a Pacific Northwest footprint.", source: "Illustrative", source_url: null, featured: false, editor_take: null },
    { sponsor: "Summit Ridge Partners", target: "Atlas Fire Protection", deal_type: "exit", sector: "Business Services", enterprise_value_millions: null, ebitda_millions: 19, ev_ebitda_multiple: null, figures_disclosed: false, summary: "Sale to a public strategic after an 11-acquisition roll-up. EV not disclosed.", source: "Illustrative", source_url: null, featured: false, editor_take: "Eleven add-ons in four years is a deal team that didn't sleep. Integration risk was the real bet here, and it paid." },
    { sponsor: "Granite Peak Equity", target: "Northwind HVAC Services", deal_type: "platform", sector: "Business Services", enterprise_value_millions: 64, ebitda_millions: 8.1, ev_ebitda_multiple: 7.9, figures_disclosed: true, summary: "New platform in residential HVAC services across Colorado and Utah, founder rolls 30%.", source: "Illustrative", source_url: null, featured: false, editor_take: null },
  ],
  fund_tracker: [
    { firm: "Harbor Point Capital", fund_name: "Fund IV", status: "oversubscribed", strategy: "LMM buyout, business services & manufacturing", target_millions: 350, raised_millions: 410, fund_number: 4, headquarters: "Charlotte, NC", summary: "Closed above target after nine months.", source: "Illustrative", source_url: null },
    { firm: "Lakeshore Growth", fund_name: "Fund II", status: "first_close", strategy: "Growth equity, healthcare services", target_millions: 200, raised_millions: 95, fund_number: 2, headquarters: "Chicago, IL", summary: "First close at $95M toward a $200M target.", source: "Illustrative", source_url: null },
    { firm: "Westfork Partners", fund_name: "Fund I", status: "launched", strategy: "Independent sponsor graduating to committed fund, industrials", target_millions: 150, raised_millions: null, fund_number: 1, headquarters: "Austin, TX", summary: "Debut fund in market with a placement agent after four independent-sponsor deals.", source: "Illustrative", source_url: null },
  ],
  people_moves: [
    { id: "p1", title: "Maria Oyelaran", summary: "Promotion — Partner at Harbor Point Capital, previously Principal. Led the Fund III business services deals.", category: "people_moves", source: "Illustrative", source_url: null },
    { id: "p2", title: "Dan Kessler", summary: "Hire — Managing Director, Head of Business Development at Granite Peak Equity, from a regional investment bank.", category: "people_moves", source: "Illustrative", source_url: null },
    { id: "p3", title: "Priya Nandakumar", summary: "Appointment — CFO at Atlas Fire Protection ahead of the strategic sale closing.", category: "people_moves", source: "Illustrative", source_url: null },
  ],
  on_the_market: [
    { id: "o1", kind: "on_the_market", headline: "Specialty industrial distributor, Southeast, ~$9M EBITDA", body: "Sell-side process launching next week, sponsor-owned, second-time sale. Teasers going to a tight list of sponsors with distribution platforms.", url: null, attribution: "Per a reader at a Southeast M&A boutique" },
    { id: "o2", kind: "on_the_market", headline: "Founder-owned commercial landscaping, Texas, $4–5M EBITDA", body: "Founder wants a majority recap and a three-year runway. No banker yet; a few sponsors have been approached directly.", url: null, attribution: "Per two readers" },
  ],
  overheard: [
    { id: "h1", kind: "overheard", headline: "\"We'll do 4.25x on a good services credit right now. Six months ago it was 3.5x and we meant it.\"", body: null, url: null, attribution: "A Midwest unitranche lender, on a $10M EBITDA process" },
  ],
  market_pulse: [
    { id: "m1", title: "High-yield spreads hit the tightest level since 2007", summary: "The ICE BofA HY index OAS closed at 302bp, the tightest since mid-2007, as inflows into credit funds continued for a sixth straight week.", category: "market_insight", source: "Illustrative", source_url: null, why_it_matters: "Private credit prices off public HY. Tight public spreads are why your unitranche quote dropped 50bp since summer, and why it'll snap back fast if the public market wobbles." },
  ],
  the_read: {
    title: "What actually happened to the 2021 vintage",
    source: "Illustrative",
    url: null,
    take: "A fund-by-fund look at where sub-$1B 2021 vintages sit on DPI four years in. The short version: the median is under 0.3x, the top quartile is above 0.8x, and the spread is almost entirely explained by who sold in 2024. Worth fifteen minutes if you're raising next year and need to explain your own number.",
  },
  jobs: [],
  closing_line: "If you're a lender and that S+525 quote wasn't you, now you know what you're bidding against.",
};
