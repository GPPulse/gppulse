// Landing-page copy that is printed twice: by the React components, and by the server in the
// page's HTML so search engines and AI assistants can read it. One copy, so they cannot drift.

export const EDITOR = { name: "Carl Schlotman", title: "Partner, Eaglehead Capital Management" };

export const FAQS = [
  {
    q: "What is The GP Pulse?",
    a: "A free email briefing on lower middle market private equity, sent weekday mornings at 6:00am ET. Each issue has a short opinion from the editor, the deals we found that never got a press release, announced deals with only the figures that were disclosed, sub-$1B funds in market, and promotions and people moves.",
  },
  {
    q: "What counts as lower middle market here?",
    a: "Companies with roughly $2–25M of EBITDA, deals under $500M in total price, and funds under $1B, in the US and Canada. Larger deals and mega-cap sponsors are filtered out before the draft is written.",
  },
  {
    q: "Where do the deals come from?",
    a: "Software reads the websites of more than 1,500 sponsors, plus bankers, law firms and lenders, every night, along with the wires, trade press, local press and SEC filings. Banker tombstones and sponsor portfolio pages are where most of the unannounced deals turn up. A deal found only on a portfolio page is printed as a signal, not as a closed deal.",
  },
  {
    q: "Is it free?",
    a: "Yes. The daily issue is free and will stay free. If we ever add a paid product it'll be something separate, like the deal database or the quarterly multiples report, and current subscribers will hear first.",
  },
  {
    q: "How is this different from PE Hub, Axios Pro Rata or PitchBook?",
    a: "Those are good at the whole market. This is only the lower middle market. Mega-cap firms are filtered out by rule, fund coverage stops at $1B, and every deal figure is disclosed or marked undisclosed. The Lede is an opinion from a working GP, not a wire summary.",
  },
  {
    q: "Who writes it?",
    a: `${EDITOR.name}, ${EDITOR.title.replace(/^Partner/, "partner")}. Software does the gathering overnight. A person writes the Lede, picks what makes the cut, and signs it.`,
  },
  {
    q: "Can I send you a deal, a process, or a tip?",
    a: "Please. Reply to any issue or use the tip form at /tip. Everything is off the record and attributed by role only unless you say otherwise. If you're a banker with a process launching, \"On the market\" is read by exactly the buyers you want.",
  },
  {
    q: "What's the conflict-of-interest policy?",
    a: "The editor is a partner at an active PE firm. The newsletter doesn't cover deals or processes that firm is party to while they're live, and it doesn't take payment for placement. Nothing here is investment advice.",
  },
];

export const PRINCIPLES = [
  {
    n: "01",
    title: "Lower middle market only. By rule, not by vibe.",
    body: "Apollo, Blackstone, KKR and the rest of the mega-cap list are filtered out before a human ever sees the draft. If a fund is over $1B or a deal is a $4B take-private, it isn't in here. Your competitors are, and so are the firms you'll be bidding against next quarter.",
  },
  {
    n: "02",
    title: "If we print a multiple, someone disclosed it.",
    body: "No estimated EBITDA, no inferred EV, no \"sources say roughly 9x.\" The Deal tracker shows the figures that were actually released and says \"undisclosed\" when they weren't. You've seen enough made-up comps.",
  },
  {
    n: "03",
    title: "Written by someone who's sat on your side of the table.",
    body: `${EDITOR.name} is a partner at a lower middle market firm. The Lede is a point of view, tagged with how much conviction is behind it. When the material is thin, it says so instead of manufacturing significance.`,
  },
  {
    n: "04",
    title: "Reply, and a person reads it.",
    body: "Processes you're seeing, a lender quote worth repeating, a hire we missed. The best replies become the \"On the market\" and \"Overheard\" sections, attributed by role, never by name.",
  },
];

// Page titles as they appear in search results and browser tabs. Used by the server (api/_lib/pages.js)
// and by the app when you move between pages (src/components/SeoSync.tsx).
export const TITLES = {
  "/": "The GP Pulse: Lower Middle Market Private Equity Newsletter",
  "/about": "About The GP Pulse: Who Writes It and How It's Made",
  "/archive": "Archive: Every Issue of The GP Pulse",
  "/deals": "Lower Middle Market PE Deal Tracker | The GP Pulse",
  "/sponsors": "Most Active Lower Middle Market PE Sponsors | The GP Pulse",
  "/comps": "LMM Private Equity Comps: Disclosed EV/EBITDA Multiples | The GP Pulse",
  "/funds": "Sub-$1B Private Equity Fund Tracker | The GP Pulse",
  "/people-moves": "Private Equity People Moves and Promotions | The GP Pulse",
  "/pricing": "Lower Middle Market Loan Pricing: First-Lien Spreads | The GP Pulse",
  "/deal-stats": "The GP Pulse Index: Weekly LMM Deal Stats | The GP Pulse",
  "/tip": "Send a Tip | The GP Pulse",
  "/referrals": "Referral Program | The GP Pulse",
  "/privacy": "Privacy | The GP Pulse",
};
