// Single place for the things you'll want to change once, not in twelve files.

export const SITE = {
  name: "The GP Pulse",
  tagline: "The lower middle market, every weekday morning.",
  description:
    "A daily briefing for private equity investors in the $2–25M EBITDA market: the deals that printed and what they cleared at, sub-$1B funds in market, people moves, and the credit moves that change your leverage math. Written by a practitioner, not a content farm.",
  sendTime: "6:00am ET, Monday–Friday",
  // Editor shown on the site and in the sign-off. Also set NEWSLETTER_EDITOR_NAME /
  // NEWSLETTER_EDITOR_TITLE as edge function secrets so emails match.
  editor: {
    name: "Carl Schlotman",
    title: "Partner, Eaglehead Capital Management",
    bio: "Carl is a partner at a lower middle market PE firm with offices in Savannah and Austin. He writes The GP Pulse because the briefing he wanted — deals with the terms actually disclosed, funds under $1B, no mega-cap noise — didn't exist.",
  },
  // Who this is for, in the reader's own words. Used on the landing page.
  audience: ["GPs and deal teams", "Independent sponsors", "LPs and fund-of-funds", "Lenders and BDCs", "Investment bankers", "Operators and CFOs"],
  focus: {
    ebitdaRange: "$2–25M EBITDA",
    fundCap: "funds under $1B",
    geography: "US & Canada",
  },
  referralMilestones: [
    { threshold: 3, label: "Early Advocate", reward: "Searchable LMM deal database" },
    { threshold: 10, label: "Dealmaker", reward: "Quarterly LMM multiples & terms report" },
    { threshold: 25, label: "Rainmaker", reward: "Quarterly subscriber call with the editor" },
    { threshold: 50, label: "Founding Member", reward: "Permanent founding-member credit" },
  ],
} as const;

export const SECTOR_OPTIONS = ["Industrials", "Business Services", "Healthcare", "Technology", "Consumer", "Financial Services", "Energy", "Aerospace & Defense", "Infrastructure"] as const;

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "gp", label: "PE investor (GP / deal team)" },
  { value: "independent_sponsor", label: "Independent sponsor" },
  { value: "lp", label: "LP / allocator" },
  { value: "lender", label: "Lender / private credit" },
  { value: "banker", label: "Investment banker / advisor" },
  { value: "operator", label: "Operator / portfolio exec" },
  { value: "service_provider", label: "Service provider" },
  { value: "other", label: "Other" },
];
