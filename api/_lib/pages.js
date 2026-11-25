// What each public page says, as HTML and structured data. See core.js for why.

import { cleanDeals, crumbs, deadline, DEAL_TYPE, esc, fmtMillions, fmtMultiple, FUND_STATUS, ISSUE_LIST, issuePath, longDate, ORG, rankSponsors, safeUrl, sb, shortDate, SITE } from "./core.js";
import { EDITOR, FAQS, PRINCIPLES, TITLES } from "./copy.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/i;
const CTX = "https://schema.org";
const link = (url, text) => (safeUrl(url) ? `<a href="${esc(url)}" rel="noopener">${esc(text)}</a>` : esc(text));
const src = (name, url) => (name ? ` <span class="m">Source: ${link(url, name)}.</span>` : "");
const DEAL_COLS = "deals?select=*&hidden=eq.false&order=announced_on.desc.nullslast";

const webPage = (type, path, name, description, extra = {}) => ({
  "@context": CTX, "@type": type, "@id": `${SITE.url}${path}`, url: `${SITE.url}${path}`, name, description,
  isPartOf: { "@id": `${SITE.url}/#website` }, publisher: { "@id": `${SITE.url}/#org` }, inLanguage: "en-US", ...extra,
});
const dataset = (path, name, description, variables, modified) => ({
  "@context": CTX, "@type": "Dataset", "@id": `${SITE.url}${path}#dataset`, name, description, url: `${SITE.url}${path}`,
  creator: { "@id": `${SITE.url}/#org` }, publisher: { "@id": `${SITE.url}/#org` }, isAccessibleForFree: true,
  spatialCoverage: "United States and Canada", variableMeasured: variables, keywords: ["private equity", "lower middle market", "M&A", "buyouts"],
  ...(modified ? { dateModified: modified } : {}),
});

function issueList(issues) {
  if (!issues?.length) return "";
  return `<ul>${issues.map((n) => `<li><a href="${issuePath(n)}">${esc(n.subject)}</a> <span class="m">Issue #${esc(n.issue_number)}, ${esc(longDate(n.sent_at))}</span>${n.preheader ? `<br><span class="m">${esc(n.preheader)}</span>` : ""}</li>`).join("")}</ul>`;
}

const HOW = [
  ["5:00pm CT", "Software reads the websites of more than 1,500 sponsors, plus bankers, law firms and lenders, along with the wires, the trades, local press and SEC filings. Mega-cap firms and anything outside the US and Canada are discarded."],
  ["Evening", "A draft lands on the editor's desk: below-the-radar finds, announced deals with our file on each party, funds, promotions and moves. Figures only when disclosed."],
  ["Evening", "The editor writes the Lede, cuts what doesn't belong and adds what readers sent in."],
  ["6:00am ET", "It sends. A reply goes to a person."],
];
const SECTIONS = [
  ["The Lede", "A short opinion from the editor on the one thing that mattered, tagged with how much conviction is behind it."],
  ["Below the Radar", "Deals you won't read anywhere else. One we have not been able to confirm is marked unconfirmed and never printed as closed."],
  ["Deal Tracker", "Announced platforms, add-ons, exits and recaps, with sponsor, target, sector and state. Enterprise value, EBITDA and multiple appear only when a party disclosed them."],
  ["Funds", "Sub-$1B funds in market, at first close and at final close, with targets and amounts raised as disclosed."],
  ["People", "Promotions and moves at lower middle market firms, from Senior Associate to Partner."],
  ["Macro & credit", "The rate and credit numbers that change leverage math, including SOFR and the 10-year Treasury."],
  ["The Read", "One piece worth fifteen minutes. Left empty when nothing qualifies."],
];
const faqHtml = () => FAQS.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
const faqLd = (path) => ({ "@context": CTX, "@type": "FAQPage", "@id": `${SITE.url}${path}#faq`, mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
const editorLd = { "@type": "Person", "@id": `${SITE.url}/about#editor`, name: EDITOR.name, jobTitle: EDITOR.title, url: `${SITE.url}/about`, worksFor: { "@type": "Organization", name: "Eaglehead Capital Management" } };

// ---------------------------------------------------------------------------------------------

async function home() {
  const issues = (await sb(`${ISSUE_LIST}&limit=10`)) ?? [];
  const main = `
<h1>${esc(SITE.tagline)}</h1>
<p>The GP Pulse is a free weekday email briefing for lower middle market private equity. It covers the $2–25M EBITDA deals that never get a press release, the sub-$1B funds in market, who moved where, and the credit numbers that change your leverage math. Ten minutes, before the open.</p>
<ul><li>1,500+ sponsors watched daily</li><li>Sent weekdays at 6:00am ET</li><li>Written by a GP: ${esc(EDITOR.name)}, ${esc(EDITOR.title)}</li><li>Free</li></ul>
<p><a href="/#subscribe"><strong>Get tomorrow's issue</strong></a></p>
${issues.length ? `<h2>Latest issues</h2>${issueList(issues)}<p><a href="/archive">Every issue, archived</a></p>` : ""}
<h2>What is in an issue</h2>
<dl>${SECTIONS.map(([t, d]) => `<dt><strong>${t}</strong></dt><dd>${d}</dd>`).join("")}</dl>
<h2>There's plenty of PE news. Very little of it is about your market.</h2>
<p>Trade press skews to the funds with the biggest PR budgets. This doesn't.</p>
${PRINCIPLES.map((p) => `<h3>${esc(p.title)}</h3><p>${esc(p.body)}</p>`).join("")}
<h2>Who reads it</h2>
<p>GPs and deal teams, independent sponsors, LPs and fund-of-funds, lenders, investment bankers, and operators and CFOs of sponsor-backed companies.</p>
<h2>The data behind it</h2>
<ul>
<li><a href="/deals">Deal tracker</a>: every lower middle market deal we've covered, with the terms that were disclosed.</li>
<li><a href="/sponsors">Most active sponsors</a>: who is doing deals, ranked from the tracker.</li>
<li><a href="/comps">Comps</a>: disclosed EV/EBITDA multiples by sector and size.</li>
<li><a href="/pricing">Loan pricing</a>: spreads on new first-lien loans, from lender filings.</li>
<li><a href="/funds">Fund tracker</a>: sub-$1B funds in market and closed.</li>
<li><a href="/people-moves">People moves</a>: promotions and hires.</li>
</ul>
<h2>How an issue gets made</h2>
<ol>${HOW.map(([t, d]) => `<li><strong>${t}.</strong> ${d}</li>`).join("")}</ol>
<h2>Questions</h2>
${faqHtml()}`;
  return {
    path: "/",
    title: TITLES["/"],
    ogTitle: "The GP Pulse: the lower middle market, every weekday morning",
    description: "Free weekday newsletter for lower middle market private equity: deals that never got a press release, disclosed terms, sub-$1B funds, people moves. Written by a GP.",
    main,
    jsonld: [
      { "@context": CTX, ...ORG },
      { "@context": CTX, "@type": "WebSite", "@id": `${SITE.url}/#website`, url: SITE.url, name: SITE.name, alternateName: ["GP Pulse", "thegppulse.com"], description: SITE.description, publisher: { "@id": `${SITE.url}/#org` }, inLanguage: "en-US" },
      { "@context": CTX, "@type": "Periodical", "@id": `${SITE.url}/#newsletter`, name: SITE.name, url: SITE.url, description: SITE.description, publisher: { "@id": `${SITE.url}/#org` }, editor: editorLd, isAccessibleForFree: true, inLanguage: "en-US", about: ["Private equity", "Lower middle market", "Mergers and acquisitions", "Private credit"], audience: { "@type": "Audience", audienceType: "Private equity investors, independent sponsors, lenders and investment bankers" } },
      faqLd("/"),
    ],
    cache: 300,
  };
}

async function about() {
  const d = "Who writes The GP Pulse, what it covers, how each issue is made, and its rules on figures and conflicts of interest.";
  const main = `
<p class="k">About</p>
<h1>A briefing for the part of private equity that does most of the deals and gets the least coverage.</h1>
<p>Most of private equity by deal count happens below $100M of enterprise value. Most of the coverage doesn't. The trades follow the funds with PR teams; the wires print whatever lands on them. If you run a fund under $1B and buy $2–25M EBITDA companies, the news about your market is scattered across nine hundred firm newsrooms and a dozen regional bankers' inboxes.</p>
<p>The GP Pulse gathers it every night, throws out everything that isn't lower middle market, extracts the deals and funds into a table with only the figures that were disclosed, and puts it in front of an editor who has done this for a living. He writes a short opinion on the one thing that matters, cuts what doesn't belong, and it sends at six.</p>
<p>It is free, it is weekdays only, and it does not take money for placement.</p>
<h2>Rules</h2>
<dl>
<dt><strong>Coverage</strong></dt><dd>US and Canada. $2–25M EBITDA targets. Funds under $1B.</dd>
<dt><strong>Figures</strong></dt><dd>Disclosed only. Undisclosed is marked undisclosed. No estimates, no "sources say."</dd>
<dt><strong>Conflicts</strong></dt><dd>The editor's firm and its live processes are excluded from coverage. Nothing here is investment advice.</dd>
</dl>
<h2>The editor</h2>
<p><strong>${esc(EDITOR.name)}</strong>, ${esc(EDITOR.title)}. Carl is a partner at a lower middle market private equity firm with offices in Savannah and Austin. He writes The GP Pulse because the briefing he wanted (deals with the terms actually disclosed, funds under $1B, no mega-cap noise) didn't exist.</p>
<h2>How an issue gets made</h2>
<ol>${HOW.map(([t, x]) => `<li><strong>${t}.</strong> ${x}</li>`).join("")}</ol>
<h2>Questions</h2>
${faqHtml()}`;
  return {
    path: "/about", title: TITLES["/about"], description: d, main,
    jsonld: [webPage("AboutPage", "/about", "About The GP Pulse", d, { mainEntity: { "@id": `${SITE.url}/#org` } }), { "@context": CTX, ...editorLd }, faqLd("/about"), crumbs([["Home", "/"], ["About", "/about"]])],
    cache: 3600,
  };
}

async function archive() {
  const issues = (await sb(`${ISSUE_LIST}&limit=1000`)) ?? [];
  const d = "Every issue of The GP Pulse as it went out: the Lede, below-the-radar deals, the deal tracker, funds and people moves in lower middle market private equity.";
  return {
    path: "/archive", title: TITLES["/archive"], description: d,
    main: `<p class="k">Newsletter archive</p><h1>Every issue, archived.</h1><p>The Lede, the deals, the funds and the moves, exactly as they went out.</p>${issues.length ? issueList(issues) : "<p>The first issue lands here the morning it sends.</p>"}`,
    jsonld: [
      webPage("CollectionPage", "/archive", "The GP Pulse archive", d, issues.length ? { mainEntity: { "@type": "ItemList", numberOfItems: issues.length, itemListElement: issues.slice(0, 100).map((n, i) => ({ "@type": "ListItem", position: i + 1, url: SITE.url + issuePath(n), name: n.subject })) } } : {}),
      crumbs([["Home", "/"], ["Archive", "/archive"]]),
    ],
    cache: 300,
  };
}

function dealLine(d) {
  const figs = [d.enterprise_value_millions != null ? `EV ${fmtMillions(d.enterprise_value_millions)}` : "", d.ebitda_millions != null ? `EBITDA ${fmtMillions(d.ebitda_millions)}` : "", d.ev_ebitda_multiple != null ? `${fmtMultiple(d.ev_ebitda_multiple)} EV/EBITDA` : ""].filter(Boolean).join(", ");
  const meta = [DEAL_TYPE[d.deal_type] ?? "Deal", d.platform ? `platform: ${d.platform}` : "", d.sector, d.hq_state, figs || "terms not disclosed", d.first_seen ? `first here ${shortDate(d.first_seen)}` : ""].filter(Boolean).map(esc).join(" · ");
  return `<li><strong>${esc(d.sponsor)}</strong> / ${esc(d.target)} <span class="m">(${meta})</span>${d.summary ? `<br>${esc(d.summary)}` : ""}${d.editor_take ? `<br><em>Our read:</em> ${esc(d.editor_take)}` : ""}${(d.file ?? []).length ? `<br><span class="m">Our file: ${d.file.map(esc).join("; ")}</span>` : ""}${src(d.source, d.source_url)}</li>`;
}

export function issueMain(n) {
  const c = n.content && typeof n.content === "object" ? n.content : {};
  const arr = (k) => (Array.isArray(c[k]) ? c[k] : []);
  const items = (title, list) => (list.length ? `<h2>${title}</h2><ul>${list.map((i) => `<li><strong>${esc(i.headline)}</strong>${i.body ? `<br>${esc(i.body)}` : ""}${i.attribution ? ` <span class="m">${esc(i.attribution)}</span>` : ""}${safeUrl(i.url) ? ` ${link(i.url, "Link")}` : ""}</li>`).join("")}</ul>` : "");
  const heads = (title, list, label) => (list.length ? `<h2>${title}</h2><ul>${list.map((a) => `<li><strong>${esc(a.title)}</strong>${a.summary ? `<br>${esc(a.summary)}` : ""}${a.why_it_matters ? `<br><em>${label}:</em> ${esc(a.why_it_matters)}` : ""}${src(a.source, a.source_url)}</li>`).join("")}</ul>` : "");
  const note = c.editors_note;
  const market = arr("market_data");
  const parts = [
    `<p class="k">Issue #${esc(n.issue_number)} · ${esc(longDate(n.sent_at))}${n.edition === "weekly" ? " · Friday edition" : ""}</p>`,
    `<h1>${esc(n.subject)}</h1>`,
    n.preheader ? `<p>${esc(n.preheader)}</p>` : "",
    `<p class="m">By ${esc(note?.byline || EDITOR.name)}, The GP Pulse</p>`,
    market.length ? `<p class="m">${market.map((q) => `${esc(q.name)} ${q.unit === "percent" ? `${Number(q.price).toFixed(2)}%` : Number(q.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}${q.unit === "percent" ? "" : ` (${q.changePercent > 0 ? "+" : ""}${Number(q.changePercent).toFixed(2)}%)`}`).join(" · ")}</p>` : "",
    note ? `<h2>The Lede: ${esc(note.headline)}</h2>${(note.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("")}` : "",
    arr("by_the_numbers").length ? `<h2>By the numbers</h2><ul>${arr("by_the_numbers").map((s) => `<li><strong>${esc(s.value)}</strong> ${esc(s.label)}${s.context ? `. <span class="m">${esc(s.context)}</span>` : ""}</li>`).join("")}</ul>` : "",
    arr("below_radar").length ? `<h2>Below the Radar</h2><p class="m">Deals you won't read anywhere else.</p><ul>${arr("below_radar").map((r) => `<li><strong>${esc(r.headline)}</strong>${r.confirmed === false ? ` <span class="m">(unconfirmed)</span>` : ""}${r.body ? `<br>${esc(r.body)}` : ""}${r.take && r.take !== r.body ? `<br><em>Our read:</em> ${esc(r.take)}` : ""}</li>`).join("")}</ul>` : "",
    arr("weekend_reads").length ? `<h2>Weekend Reading</h2><ol>${arr("weekend_reads").map((r) => `<li><strong><a href="${esc(r.url)}" rel="noopener">${esc(r.title)}</a></strong> <span class="m">(${esc(r.publisher)})</span><br>${esc(r.note)}</li>`).join("")}</ol>` : "",
    heads("Headlines", arr("top_headlines"), "Why it matters"),
    arr("deal_tracker").length ? `<h2>Deal Tracker</h2><ul>${arr("deal_tracker").map(dealLine).join("")}</ul>` : "",
    arr("fund_tracker").length ? `<h2>Funds</h2><ul>${arr("fund_tracker").map((f) => `<li><strong>${esc(f.firm)}</strong>, ${esc(f.fund_name)} <span class="m">(${[FUND_STATUS[f.status] ?? "Update", f.raised_millions != null ? `raised ${fmtMillions(f.raised_millions)}` : "", f.target_millions != null ? `target ${fmtMillions(f.target_millions)}` : "", f.headquarters].filter(Boolean).map(esc).join(" · ")})</span>${f.summary ? `<br>${esc(f.summary)}` : ""}${src(f.source, f.source_url)}</li>`).join("")}</ul>` : "",
    heads("People", arr("people_moves"), "Why it matters"),
    items("On the market", arr("on_the_market")),
    heads("Macro &amp; credit", arr("market_pulse"), "For the LMM"),
    items("Overheard", arr("overheard")),
    c.the_read ? `<h2>The Read</h2><p><strong>${link(c.the_read.url, c.the_read.title)}</strong> <span class="m">${esc(c.the_read.source)}</span><br>${esc(c.the_read.take)}</p>` : "",
    items("Jobs", arr("jobs")),
    c.closing_line ? `<p><em>${esc(c.closing_line)}</em></p>` : "",
    `<p><a href="/archive">All issues</a> · <a href="/deals">Deal tracker</a> · <a href="/#subscribe">Subscribe free</a></p>`,
  ];
  return parts.filter(Boolean).join("\n");
}

async function issue(slug) {
  if (!(UUID.test(slug) || SLUG.test(slug))) return null;
  const filter = UUID.test(slug) ? `id=eq.${slug}` : `slug=eq.${encodeURIComponent(slug)}`;
  const rows = await sb(`newsletters?select=id,slug,subject,preheader,issue_number,edition,sent_at,updated_at,content&status=eq.sent&${filter}&limit=1`);
  if (rows === null) return { soft: true };   // database unreachable: serve the app, don't call it missing
  const n = rows[0];
  if (!n) return null;
  const path = issuePath(n);
  const c = n.content && typeof n.content === "object" ? n.content : {};
  const lede = c.editors_note?.paragraphs?.[0];
  const description = (n.preheader || lede || `Issue #${n.issue_number} of The GP Pulse, ${longDate(n.sent_at)}.`).slice(0, 300);
  const names = [...new Set((Array.isArray(c.deal_tracker) ? c.deal_tracker : []).flatMap((d) => [d.sponsor, d.target]).filter(Boolean))].slice(0, 20);
  return {
    path, type: "article", published: n.sent_at, modified: n.updated_at ?? n.sent_at,
    title: `${n.subject} | The GP Pulse`, ogTitle: n.subject, description,
    main: issueMain(n),
    jsonld: [
      {
        "@context": CTX, "@type": "NewsArticle", "@id": `${SITE.url}${path}#article`, mainEntityOfPage: `${SITE.url}${path}`,
        headline: String(n.subject).slice(0, 110), description, image: [SITE.image],
        datePublished: n.sent_at, dateModified: n.updated_at ?? n.sent_at,
        author: [editorLd], publisher: { "@id": `${SITE.url}/#org`, "@type": "NewsMediaOrganization", name: SITE.name, logo: { "@type": "ImageObject", url: SITE.image } },
        isAccessibleForFree: true, inLanguage: "en-US", articleSection: "Private equity",
        isPartOf: { "@id": `${SITE.url}/#newsletter`, "@type": "Periodical", name: SITE.name },
        ...(names.length ? { mentions: names.map((x) => ({ "@type": "Organization", name: x })) } : {}),
      },
      crumbs([["Home", "/"], ["Archive", "/archive"], [`Issue #${n.issue_number}`, path]]),
    ],
    cache: 3600,
  };
}

async function deals() {
  const rows = cleanDeals(await sb(`${DEAL_COLS}&limit=300`));
  const disclosed = rows.filter((d) => d.ev_ebitda_multiple != null).length;
  const quiet = rows.filter((d) => d.below_radar).length;
  const d = "Every lower middle market private equity deal The GP Pulse has covered: sponsor, target, type and sector, with enterprise value, EBITDA and multiple only where disclosed.";
  const table = rows.length ? `<table><thead><tr><th>Date</th><th>Sponsor</th><th>Target</th><th>Type</th><th>Sector</th><th>EV</th><th>EBITDA</th><th>EV/EBITDA</th><th>Source</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${x.date ? esc(shortDate(x.date)) : "n/d"}</td><td>${esc(x.sponsor)}</td><td>${esc(x.target)}${x.hq_state ? ` (${esc(x.hq_state)})` : ""}</td><td>${DEAL_TYPE[x.deal_type] ?? "Deal"}${x.below_radar ? " · only here" : ""}</td><td>${esc(x.sector ?? "")}</td><td>${fmtMillions(x.enterprise_value_millions)}</td><td>${fmtMillions(x.ebitda_millions)}</td><td>${fmtMultiple(x.ev_ebitda_multiple)}</td><td>${x.below_radar ? "The GP Pulse" : link(x.source_url, x.source ?? "")}</td></tr>`).join("")}</tbody></table>` : "<p>The tracker fills in as issues go out.</p>";
  return {
    path: "/deals", title: TITLES["/deals"], description: d,
    main: `<p class="k">Deal tracker</p><h1>Every LMM deal we've covered, with the terms that were actually disclosed.</h1><p>Sponsor, target, type and sector for all of them. EV, EBITDA and multiple only where a party released them. Updated with each issue.</p>${rows.length ? `<p><strong>${rows.length}</strong> most recent deals shown. <strong>${disclosed}</strong> disclosed a multiple. <strong>${quiet}</strong> were reported only here.</p>` : ""}${table}<p class="m">n/d = not disclosed. We don't estimate. Medians by sector and size are on <a href="/comps">Comps</a>; sponsors ranked by activity are on <a href="/sponsors">Sponsors</a>.</p>`,
    jsonld: [webPage("CollectionPage", "/deals", "Lower middle market PE deal tracker", d), dataset("/deals", "The GP Pulse lower middle market deal tracker", d, ["Sponsor", "Target company", "Deal type", "Sector", "Enterprise value", "EBITDA", "EV/EBITDA multiple", "Announcement date"], rows[0]?.updated_at), crumbs([["Home", "/"], ["Deals", "/deals"]])],
    cache: 600,
  };
}

async function sponsors() {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const all = cleanDeals(await sb(`${DEAL_COLS}&limit=2000`));
  const rows = all.filter((x) => x.date && x.date >= cutoff);
  const lines = rankSponsors(rows);
  const d = "The most active lower middle market private equity sponsors, ranked by platforms, add-ons and exits in The GP Pulse deal tracker over the last 90 days.";
  const table = lines.length ? `<table><thead><tr><th>#</th><th>Sponsor</th><th>Deals</th><th>Platforms</th><th>Add-ons</th><th>Exits</th><th>Only here</th><th>Companies</th></tr></thead><tbody>${lines.slice(0, 150).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.sponsor)}</td><td>${l.deals.length}</td><td>${l.platforms || ""}</td><td>${l.addOns || ""}</td><td>${l.exits || ""}</td><td>${l.quiet || ""}</td><td>${l.deals.slice(0, 6).map((x) => esc(x.target)).join(", ")}</td></tr>`).join("")}</tbody></table>` : "<p>No tracked deals in the window yet.</p>";
  return {
    path: "/sponsors", title: TITLES["/sponsors"], description: d,
    main: `<p class="k">Sponsors</p><h1>Who is actually doing deals in the lower middle market.</h1><p>Sponsors ranked by the deals in our tracker over the last 90 days: platforms, add-ons and exits, including the ones that never got a press release. Counts are deals we found, not deals done; a quiet firm may simply announce less.</p>${lines.length ? `<p><strong>${rows.length}</strong> deals tracked across <strong>${lines.length}</strong> sponsors; <strong>${lines.filter((l) => l.deals.length >= 2).length}</strong> with two or more.</p>` : ""}${table}`,
    jsonld: [webPage("CollectionPage", "/sponsors", "Most active lower middle market sponsors", d), dataset("/sponsors", "Most active lower middle market PE sponsors, trailing 90 days", d, ["Sponsor", "Deals tracked", "Platforms", "Add-ons", "Exits", "Deals with no press release"]), crumbs([["Home", "/"], ["Sponsors", "/sponsors"]])],
    cache: 600,
  };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

async function comps() {
  const rows = cleanDeals(await sb(`${DEAL_COLS}&ev_ebitda_multiple=not.is.null&limit=1000`));
  const med = median(rows.map((x) => Number(x.ev_ebitda_multiple)).filter((x) => Number.isFinite(x)));
  const d = "Disclosed EV/EBITDA multiples for lower middle market private equity deals, by sector and EBITDA size, with the deals behind each median. No estimates.";
  const stat = rows.length ? `<p>Across the <strong>${rows.length}</strong> deal${rows.length === 1 ? "" : "s"} in our tracker with a disclosed multiple, the median is <strong>${fmtMultiple(med)}</strong> EV/EBITDA.${rows.length < 20 ? " That is a small sample; read it as an indication." : ""}</p>` : "<p>No deals with a disclosed multiple on file yet. Most lower middle market deals disclose nothing; this page fills in as they do.</p>";
  return {
    path: "/comps", title: TITLES["/comps"], description: d,
    main: `<p class="k">Comps</p><h1>What lower middle market deals actually cleared at.</h1><p>The median and interquartile range of disclosed EV/EBITDA multiples by sector, EBITDA band and window, and the deals behind them. No estimates, no "sources say." Small samples are flagged.</p>${stat}${rows.length ? `<table><thead><tr><th>Date</th><th>Sponsor</th><th>Target</th><th>Sector</th><th>EV</th><th>EBITDA</th><th>EV/EBITDA</th><th>Source</th></tr></thead><tbody>${rows.slice(0, 200).map((x) => `<tr><td>${x.date ? esc(shortDate(x.date)) : "n/d"}</td><td>${esc(x.sponsor)}</td><td>${esc(x.target)}</td><td>${esc(x.sector ?? "")}</td><td>${fmtMillions(x.enterprise_value_millions)}</td><td>${fmtMillions(x.ebitda_millions)}</td><td>${fmtMultiple(x.ev_ebitda_multiple)}</td><td>${x.below_radar ? "The GP Pulse" : link(x.source_url, x.source ?? "")}</td></tr>`).join("")}</tbody></table>` : ""}`,
    jsonld: [webPage("WebPage", "/comps", "Lower middle market comps", d), dataset("/comps", "Disclosed EV/EBITDA multiples, lower middle market PE deals", d, ["EV/EBITDA multiple", "Enterprise value", "EBITDA", "Sector"]), crumbs([["Home", "/"], ["Comps", "/comps"]])],
    cache: 600,
  };
}

async function funds() {
  const rows = ((await sb("funds?select=*&hidden=eq.false&order=announced_on.desc.nullslast&limit=300")) ?? []).filter((f) => f.firm && f.fund_name);
  const d = "Sub-$1B private equity funds in market, at first close and at final close, with targets and amounts raised as disclosed by the firm or its placement agent.";
  return {
    path: "/funds", title: TITLES["/funds"], description: d,
    main: `<p class="k">Who's raising</p><h1>Every sub-$1B fund we've tracked: in market, first close, final close.</h1><p>Targets and amounts raised as disclosed by the firm or its placement agent. If you're an LP, this is the pipeline. If you're a GP, these are the vehicles you'll be bidding against in 18 months.</p>${rows.length ? `<table><thead><tr><th>Date</th><th>Firm</th><th>Fund</th><th>Status</th><th>Target</th><th>Raised</th><th>Strategy</th><th>HQ</th><th>Source</th></tr></thead><tbody>${rows.map((f) => `<tr><td>${f.announced_on ? esc(shortDate(f.announced_on)) : "n/d"}</td><td>${esc(f.firm)}</td><td>${esc(f.fund_name)}</td><td>${FUND_STATUS[f.status] ?? "Update"}</td><td>${fmtMillions(f.target_millions)}</td><td>${fmtMillions(f.raised_millions)}</td><td>${esc(f.strategy ?? "")}</td><td>${esc(f.headquarters ?? "")}</td><td>${link(f.source_url, f.source ?? "")}</td></tr>`).join("")}</tbody></table>` : "<p>Fills in as issues go out.</p>"}<p class="m">n/d = not disclosed. Status reflects the last announcement we saw, not a live check with the firm.</p>`,
    jsonld: [webPage("CollectionPage", "/funds", "Sub-$1B PE fund tracker", d), dataset("/funds", "The GP Pulse sub-$1B private equity fund tracker", d, ["Firm", "Fund name", "Status", "Target size", "Amount raised", "Strategy", "Headquarters"]), crumbs([["Home", "/"], ["Funds", "/funds"]])],
    cache: 600,
  };
}

async function people() {
  const rows = (await sb("articles?select=id,title,summary,source,source_url,scraped_at&category=eq.people_moves&order=scraped_at.desc&limit=100")) ?? [];
  const d = "Promotions, hires and appointments at lower middle market private equity firms and their portfolio companies, from Senior Associate to Partner.";
  return {
    path: "/people-moves", title: TITLES["/people-moves"], description: d,
    main: `<p class="k">People</p><h1>People moves</h1><p>Promotions, hires and appointments across lower middle market private equity: Senior Associate, Vice President, Principal, Managing Director and Partner, plus portfolio company executives.</p>${rows.length ? `<ul>${rows.map((a) => `<li><strong>${esc(a.title)}</strong> <span class="m">${esc(shortDate(a.scraped_at))}</span>${a.summary ? `<br>${esc(a.summary)}` : ""}${src(a.source, a.source_url)}</li>`).join("")}</ul>` : "<p>Moves appear here once they have run in an issue.</p>"}`,
    jsonld: [webPage("CollectionPage", "/people-moves", "Private equity people moves", d), crumbs([["Home", "/"], ["People", "/people-moves"]])],
    cache: 600,
  };
}

async function pricing() {
  const base = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let s = null;
  if (base && key) {
    try {
      const r = await fetch(`${base}/rest/v1/rpc/lmm_pricing_summary`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: "{}", signal: deadline(4500) });
      if (r.ok) s = await r.json();
    } catch { /* page still renders */ }
  }
  const q = (s?.quarters ?? []).find((x) => x.quarter_end === s?.latest_quarter_end);
  const pct = (v) => (v === null || v === undefined ? "n/a" : `${Number(v).toFixed(2)}%`);
  const qLabel = (iso) => { const [y, m] = String(iso).split("-").map(Number); return `Q${Math.ceil(m / 3)} ${y}`; };
  const d = "What new first-lien loans to lower middle market companies priced at: median spread over SOFR and the middle half, by quarter, taken loan by loan from lender filings.";
  const line = q && q.new_n > 0 ? `<p>New first-lien loans, ${qLabel(q.quarter_end)}: median spread <strong>${pct(q.new_median)}</strong> over SOFR, middle half ${pct(q.new_p25)} to ${pct(q.new_p75)}, n = ${esc(q.new_n)} loans across ${esc(q.lenders)} lenders' filings.${q.new_n < 20 ? " Small sample." : ""}</p>` : "<p>No new loans with a disclosed spread on file yet. This page fills in as lenders file each quarter.</p>";
  return {
    path: "/pricing", title: TITLES["/pricing"], description: d,
    main: `<p class="k">Loan pricing</p><h1>What new first-lien loans actually priced at.</h1><p>Spreads over SOFR on loans that appeared for the first time in a lender's quarterly schedule of investments. Taken from the filings, loan by loan. No surveys, no "market talk." Small samples are flagged.</p>${line}`,
    jsonld: [webPage("WebPage", "/pricing", "Lower middle market loan pricing", d), dataset("/pricing", "First-lien loan spreads, lower middle market, by quarter", d, ["Median spread over SOFR", "25th and 75th percentile spread", "Number of new loans", "Median tenor"], q?.last_filed), crumbs([["Home", "/"], ["Loan pricing", "/pricing"]])],
    cache: 3600,
  };
}

const simple = (path, title, description, main, cache = 3600) => async () => ({ path, title, description, main, jsonld: [webPage("WebPage", path, title.split(" | ")[0], description), crumbs([["Home", "/"], [title.split(" | ")[0].split(":")[0], path]])], cache });

const ROUTES = {
  "/": home, "/about": about, "/archive": archive, "/deals": deals, "/sponsors": sponsors, "/comps": comps, "/funds": funds, "/people-moves": people, "/pricing": pricing,
  "/deal-stats": simple("/deal-stats", TITLES["/deal-stats"], "Weekly charts of lower middle market private equity deal volume, sector trends, deal types and disclosed valuation multiples, built from The GP Pulse tracker.", `<p class="k">Index</p><h1>Weekly deal stats</h1><p>Charts tracking lower middle market deal volume, sector trends, the mix of platforms and add-ons, fund activity and disclosed valuation multiples, built from the deals and funds in our tracker. The table behind them is on <a href="/deals">Deals</a>; medians are on <a href="/comps">Comps</a>.</p>`),
  "/tip": simple("/tip", TITLES["/tip"], "Send The GP Pulse a deal, a process or a number. Off the record, attributed by role only, and read by an editor before anything runs.", `<p class="k">Send a tip</p><h1>Seen a process? Heard a number? Tell the room.</h1><p>Everything here is off the record. We print it attributed by role only ("per a Southeast M&amp;A banker") unless you ask for credit. An editor reads every submission before anything runs, and nothing identifying a live, confidential process gets published without the sender's say-so.</p><p>The form needs JavaScript. You can also reply to any issue.</p>`),
  "/referrals": simple("/referrals", TITLES["/referrals"], "Share The GP Pulse and earn access to the searchable deal database, the quarterly multiples report and a subscriber call with the editor.", `<p class="k">Referrals</p><h1>Referral program</h1><p>Share The GP Pulse with people who work in the lower middle market.</p><ul><li><strong>3 referrals:</strong> searchable LMM deal database</li><li><strong>10 referrals:</strong> quarterly LMM multiples and terms report</li><li><strong>25 referrals:</strong> quarterly subscriber call with the editor</li><li><strong>50 referrals:</strong> permanent founding-member credit</li></ul><p>Subscribe and you get your own referral link to send to people in your network.</p>`),
  "/privacy": simple("/privacy", TITLES["/privacy"], "How The GP Pulse handles subscriber data: what is collected, what it is used for, and how to leave.", `<p class="k">Privacy</p><h1>Short, because there isn't much to say.</h1><p>We collect your email address when you subscribe and, if you tell us, your first name, firm, role and sector interests. Our email provider reports whether an issue was opened and which links were clicked. We use all of it to send The GP Pulse and any sector deal alerts you opted into. We don't sell, rent or share subscriber data with anyone, and the site carries no advertising trackers or third-party analytics scripts. Every issue has a one-click unsubscribe link.</p>`),
};

export const PUBLIC_PATHS = Object.keys(ROUTES);

/** → { status, page } for a public path, or { status: 404 } with the not-found page. */
export async function render(path) {
  const p = path === "/" ? "/" : path.replace(/\/+$/, "");
  let page = null, soft = false;
  if (ROUTES[p]) page = await ROUTES[p]();
  else {
    const m = /^\/archive\/([^/]+)$/.exec(p);
    if (m) {
      let slug = m[1];
      try { slug = decodeURIComponent(slug); } catch { /* keep as is */ }
      const r = await issue(slug);
      if (r?.soft) soft = true; else page = r;
    }
  }
  if (page) return { status: 200, page };
  if (soft) {
    return { status: 200, page: { path: p, title: "The GP Pulse", description: SITE.description, robots: "noindex, follow", main: `<h1>The GP Pulse</h1><p>This issue is loading. If it does not appear, <a href="/archive">see the archive</a>.</p>`, cache: 0 } };
  }
  return {
    status: 404,
    page: { path: p, title: "Page not found | The GP Pulse", description: "That page does not exist.", robots: "noindex, follow", main: `<h1>Page not found</h1><p>That address doesn't match anything here. Try the <a href="/archive">archive</a>, the <a href="/deals">deal tracker</a> or the <a href="/">home page</a>.</p>`, cache: 60 },
  };
}
