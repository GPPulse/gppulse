// Email rendering for The GP Pulse. Table-based, inline-styled, 600px, tested against
// Gmail / Outlook / Apple Mail constraints (no flex, no grid, no web fonts required).
//
// Visual format matches the original Lovable build of The GP Pulse: a 600px card with a
// 2px ink border, "Issue #N" masthead, grey index strip, pill section badges (solid /
// grey / outline), full-width 2px rules between sections, bold headlines over grey
// summaries with "Read more →", and a light centered footer.

import {
  Article,
  DealRow,
  DEAL_TYPE_LABEL,
  EditorItem,
  fmtMillions,
  fmtMultiple,
  FUND_STATUS_LABEL,
  FundRow,
  MarketQuote,
  NewsletterContentV2,
  RadarItem,
  Scoreboard,
  Stat,
} from "./content.ts";

export const escapeHtml = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Lovable palette (Tailwind gray scale)
const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";
const SOFT = "#f9fafb";
const CHIP = "#f3f4f6";
const PAGE = "#f4f4f4";
const UP = "#16a34a";
const DOWN = "#dc2626";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const MONO = "'Courier New', Courier, monospace";

// Every block after the masthead/ticker opens with this marker. The first one in the
// issue is dropped (the ticker or masthead already draws a rule), the rest become a
// full-width 2px rule — so sections are separated exactly like the Lovable card.
const RULE_MARK = "__GPP_RULE__";
const RULE_CSS = `border-top:2px solid ${INK};`;

export interface IssueEmailOptions {
  siteUrl: string;
  issueNumber: number;
  issueDate: Date;
  subject: string;
  preheader: string | null;
  webUrl: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
  referralUrl: string;
  referralCount: number;
  firstName: string | null;
  postalAddress: string;
  editorName: string;
  editorTitle: string;
  trackingPixel?: string;
}

// ---- small building blocks --------------------------------------------------

type BadgeVariant = "default" | "secondary" | "outline";

const badge = (text: string, variant: BadgeVariant = "default") => {
  const base = `display:inline-block;padding:4px 12px;font-family:${SANS};font-size:12px;font-weight:600;line-height:1.4;border-radius:6px;`;
  const v: Record<BadgeVariant, string> = {
    default: `background-color:${INK};color:#ffffff;border:1px solid ${INK};`,
    secondary: `background-color:${CHIP};color:${INK};border:1px solid ${CHIP};`,
    outline: `background-color:#ffffff;color:${INK};border:1px solid ${INK};`,
  };
  return `<span style="${base}${v[variant]}">${escapeHtml(text)}</span>`;
};

const sectionLabel = (text: string, sub?: string, variant: BadgeVariant = "default") => `
  <tr><td style="${RULE_MARK}padding:24px 24px 0 24px;">
    ${badge(text, variant)}
    ${sub ? `<span style="font-family:${SANS};font-size:12px;color:${MUTED};margin-left:8px;">${escapeHtml(sub)}</span>` : ""}
  </td></tr>`;

const body = (inner: string, pad = "16px 24px 24px 24px") =>
  `<tr><td style="padding:${pad};">${inner}</td></tr>`;

const link = (href: string | null | undefined, text: string, bold = true) =>
  href
    ? `<a href="${escapeHtml(href)}" style="color:${INK};text-decoration:none;${bold ? "font-weight:700;" : ""}">${escapeHtml(text)}</a>`
    : `<span style="color:${INK};${bold ? "font-weight:700;" : ""}">${escapeHtml(text)}</span>`;

const readMore = (href: string | null | undefined) =>
  href ? ` <a href="${escapeHtml(href)}" style="color:${INK};text-decoration:none;font-weight:500;margin-left:4px;white-space:nowrap;">Read more &rarr;</a>` : "";

const chip = (text: string, dark = false) =>
  `<span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:600;padding:2px 8px;margin-right:6px;border-radius:4px;border:1px solid ${INK};${dark ? `background-color:${INK};color:#fff;` : `background-color:#fff;color:${INK};`}">${escapeHtml(text)}</span>`;

const meta = (text: string) =>
  `<div style="font-family:${MONO};font-size:11px;color:${MUTED};margin-top:4px;">${escapeHtml(text)}</div>`;

const summary = (text: string | null | undefined, href?: string | null) =>
  text ? `<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};margin:4px 0 0 0;">${escapeHtml(text)}${readMore(href)}</p>` : "";

const takeLine = (label: string, text: string) => `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;"><tr>
    <td style="border-left:3px solid ${INK};padding:2px 0 2px 12px;font-family:${SANS};font-size:13px;line-height:1.55;color:${BODY};">
      <span style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};font-weight:700;">${escapeHtml(label)}</span>
      <span style="display:block;margin-top:2px;">${escapeHtml(text)}</span>
    </td>
  </tr></table>`;

// "The file": what our archive says about the parties. Small, mono label, factual.
const fileBlock = (lines?: string[]) =>
  lines?.length
    ? `<div style="margin-top:8px;background-color:${SOFT};border:1px solid ${LINE};padding:10px 12px;">
        <span style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};font-weight:700;">The file</span>
        ${lines.map((l) => `<div style="font-family:${SANS};font-size:12px;line-height:1.5;color:${BODY};margin-top:2px;">&bull; ${escapeHtml(l)}</div>`).join("")}
      </div>`
    : "";

const item = (inner: string, i: number) =>
  `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:${i === 0 ? 0 : 16}px;"><tr><td valign="top">${inner}</td></tr></table>`;

const headline = (href: string | null | undefined, text: string) =>
  `<div style="font-family:${SANS};font-size:14px;line-height:1.4;">${link(href, text)}</div>`;

// ---- sections ----------------------------------------------------------------

function belowRadar(items: RadarItem[] | undefined): string {
  if (!items?.length) return "";
  const rows = items
    .map((r, i) => {
      const take = (r as RadarItem & { take?: string }).take;
      return item(`
        <div style="border-left:3px solid ${INK};padding-left:12px;">
          ${r.confirmed ? "" : `<div style="margin-bottom:6px;"><span style="display:inline-block;font-family:${MONO};font-size:11px;padding:1px 6px;border-radius:4px;border:1px solid ${DOWN};color:${DOWN};">UNCONFIRMED</span></div>`}
          ${headline(null, r.headline)}
          ${summary(r.body)}
          ${take ? takeLine("Our read", take) : ""}
          ${fileBlock(r.file)}
        </div>`, i);
    })
    .join("");
  return sectionLabel("Below the Radar", "deals you won't read anywhere else", "default") + body(rows);
}

function scoreboard(sb: Scoreboard | null | undefined, weekly = false): string {
  if (!sb) return "";
  const block = (title: string, headers: [string, string], rows: [string, string][]) =>
    rows.length
      ? `<div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin:0 0 4px 0;">${escapeHtml(title)}</div>
         <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:16px;">
           <tr>
             <th align="left" style="padding:6px 0;font-family:${SANS};font-size:13px;font-weight:700;color:${INK};border-bottom:1px solid ${MUTED};">${headers[0]}</th>
             <th align="right" style="padding:6px 0;font-family:${SANS};font-size:13px;font-weight:700;color:${INK};border-bottom:1px solid ${MUTED};">${headers[1]}</th>
           </tr>
           ${rows.map(([a, b]) => `<tr>
             <td style="padding:6px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${INK};">${a}</td>
             <td align="right" style="padding:6px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;font-weight:700;color:${INK};white-space:nowrap;">${b}</td>
           </tr>`).join("")}
         </table>`
      : "";
  const parts = [
    block("Busiest sponsors", ["Sponsor", "Deals"], sb.sponsors.map((s) => [escapeHtml(s.sponsor), String(s.n)])),
    block("Banks posting closings", ["Bank", "Closings"], sb.banks.map((b) => [escapeHtml(b.name), String(b.n)])),
    block("Platforms stacking add-ons", ["Platform", "Add-ons"], sb.platforms.map((p) => [`${escapeHtml(p.platform)} <span style="color:${MUTED};">(${escapeHtml(p.sponsor)})</span>`, String(p.n)])),
    weekly
      ? block("Sector pace: week vs 4-wk avg", ["Sector", "Week / avg"], sb.sectors.filter((s) => s.this_week || s.weekly_avg).map((s) => [escapeHtml(s.sector), `${s.this_week} <span style="font-weight:400;color:${MUTED};">/ ${s.weekly_avg}</span>`]))
      : "",
  ].filter(Boolean);
  if (!parts.length) return "";
  const sub = sb.radar?.total ? `last ${sb.window_days} days · ${sb.radar.total} deals tracked · ${sb.radar.below} reported only here` : `last ${sb.window_days} days`;
  return sectionLabel("The Scoreboard", sub, "secondary") + body(parts.join(""), "16px 24px 8px 24px");
}

function marketTicker(quotes: MarketQuote[]): string {
  if (!quotes?.length) return "";
  const cells = quotes
    .slice(0, 6)
    .map((q) => {
      const isRate = q.unit === "percent" || q.unit === "bps";
      const price = isRate
        ? `${q.price.toFixed(2)}%`
        : q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const up = q.change >= 0;
      const delta = isRate ? `${up ? "+" : ""}${Math.round(q.change * 100)} bps` : `${up ? "+" : ""}${q.changePercent.toFixed(2)}%`;
      return `<td align="center" style="padding:8px 4px;">
        <p style="font-family:${MONO};font-size:11px;color:${MUTED};margin:0;white-space:nowrap;">${escapeHtml(q.name)}</p>
        <p style="font-family:${SANS};font-size:14px;font-weight:700;color:${INK};margin:4px 0 2px 0;">${price}</p>
        <p style="font-family:${MONO};font-size:12px;color:${up ? UP : DOWN};margin:0;">${delta}</p>
      </td>`;
    })
    .join("");
  return `<tr><td style="padding:16px 12px;border-bottom:2px solid ${INK};background-color:#f7f7f7;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells}</tr></table>
  </td></tr>`;
}

function editorsNote(c: NewsletterContentV2, o: IssueEmailOptions, greeting: string): string {
  const note = c.editors_note;
  const greet = greeting ? `<p style="font-family:${SANS};font-size:13px;color:${MUTED};margin:0 0 12px 0;">${greeting}</p>` : "";
  if (!note) return greet ? `<tr><td style="${RULE_MARK}padding:24px 24px 12px 24px;">${greet}</td></tr>` : "";
  const paras = note.paragraphs
    .map((p) => `<p style="font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK};margin:0 0 14px 0;">${escapeHtml(p)}</p>`)
    .join("");
  return `
  <tr><td style="${RULE_MARK}padding:24px;">
    ${greet}
    <h2 style="font-family:${SANS};font-size:22px;line-height:1.25;font-weight:700;color:${INK};margin:0 0 12px 0;">${escapeHtml(note.headline)}</h2>
    ${paras}
    <p style="font-family:${MONO};font-size:12px;color:${MUTED};margin:4px 0 0 0;">— ${escapeHtml(note.byline || o.editorName)}</p>
  </td></tr>`;
}

function byTheNumbers(stats: Stat[]): string {
  if (!stats?.length) return "";
  const shown = stats.slice(0, 3);
  const cells = shown
    .map(
      (s) => `<td width="${Math.floor(100 / shown.length)}%" valign="top" align="center" style="padding:8px 6px;">
        <div style="font-family:${SANS};font-size:24px;font-weight:700;color:${INK};line-height:1.1;">${escapeHtml(s.value)}</div>
        <div style="font-family:${MONO};font-size:11px;color:${MUTED};margin-top:6px;line-height:1.4;">${escapeHtml(s.label)}</div>
        ${s.context ? `<div style="font-family:${SANS};font-size:12px;color:${FAINT};margin-top:2px;line-height:1.4;">${escapeHtml(s.context)}</div>` : ""}
      </td>`,
    )
    .join("");
  return sectionLabel("By the Numbers", undefined, "secondary") + body(`<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells}</tr></table>`);
}

function headlines(items: Article[]): string {
  if (!items?.length) return "";
  const rows = items
    .map((a, i) =>
      item(`
        ${headline(a.source_url, a.title)}
        ${summary(a.summary, a.source_url)}
        ${a.why_it_matters ? takeLine("Why it matters", a.why_it_matters) : ""}
        ${meta(a.source)}`, i),
    )
    .join("");
  return sectionLabel("Top Headlines", undefined, "default") + body(rows);
}

function dealTracker(deals: DealRow[], weekly = false): string {
  if (!deals?.length) return "";
  const rows = deals
    .map((d, i) => {
      const facts: string[] = [];
      if (d.sector) facts.push(d.sector);
      if (d.enterprise_value_millions) facts.push(`EV ${fmtMillions(d.enterprise_value_millions)}`);
      if (d.ebitda_millions) facts.push(`EBITDA ${fmtMillions(d.ebitda_millions)}`);
      if (d.ev_ebitda_multiple) facts.push(fmtMultiple(d.ev_ebitda_multiple));
      if (d.hq_state) facts.push(d.hq_state);
      if (d.seller_type && d.seller_type !== "unknown") facts.push(`${d.seller_type}-owned seller`.replace("sponsor-owned seller", "sponsor seller").replace("corporate-owned seller", "corporate carve-out"));
      const verb = d.deal_type === "exit" ? "exits" : d.deal_type === "add-on" ? "adds on" : d.deal_type === "recap" ? "recaps" : d.deal_type === "growth" ? "invests in" : "acquires";
      const parties = [d.advisors ? `Advisors: ${d.advisors}` : "", d.lender ? `Debt: ${d.lender}` : ""].filter(Boolean).join("  ·  ");
      return item(`
        <div style="margin-bottom:6px;">${chip(DEAL_TYPE_LABEL[d.deal_type] ?? "Deal", !!d.featured)}${d.featured ? chip("Deal of the day", true) : ""}${d.first_seen ? chip(`First here ${new Date(d.first_seen + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, true) : ""}</div>
        <div style="font-family:${SANS};font-size:14px;line-height:1.4;color:${INK};"><strong>${escapeHtml(d.sponsor)}</strong> ${verb} ${link(d.source_url, d.target)}${d.platform && d.deal_type === "add-on" ? ` <span style="color:${MUTED};">via ${escapeHtml(d.platform)}</span>` : ""}</div>
        ${facts.length ? meta(facts.join("  ·  ")) : ""}
        ${summary(d.summary)}
        ${parties ? `<div style="font-family:${SANS};font-size:12px;color:${BODY};margin-top:4px;">${escapeHtml(parties)}</div>` : ""}
        ${d.editor_take ? takeLine("Our read", d.editor_take) : ""}
        ${fileBlock(d.file)}`, i);
    })
    .join("");
  return sectionLabel(weekly ? "This Week's Deals" : "Deal Tracker", weekly ? `${deals.length} tracked · ${deals.filter((d) => d.ev_ebitda_multiple).length} with disclosed multiples` : "announced today, with our file on each", "default") + body(rows);
}

function fundTracker(funds: FundRow[], weekly = false): string {
  if (!funds?.length) return "";
  const th = (t: string, align = "left") =>
    `<th align="${align}" style="padding:8px 0;font-family:${SANS};font-size:13px;font-weight:700;color:${INK};border-bottom:1px solid ${MUTED};">${t}</th>`;
  const rows = funds
    .map((f) => {
      const size = f.raised_millions
        ? `${fmtMillions(f.raised_millions)} raised${f.target_millions ? ` / ${fmtMillions(f.target_millions)}` : ""}`
        : f.target_millions
          ? fmtMillions(f.target_millions)
          : "n/d";
      const sub = [f.strategy, f.headquarters].filter(Boolean).join(" · ");
      return `<tr>
        <td valign="top" style="padding:8px 8px 8px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;line-height:1.4;color:${INK};">
          ${/sec form d/i.test(f.source) ? chip("SEC filing") : ""}${link(f.source_url, `${f.firm} — ${f.fund_name}`, false)}
          ${sub ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${escapeHtml(sub)}</div>` : ""}
        </td>
        <td valign="top" style="padding:8px 8px 8px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${INK};white-space:nowrap;">${escapeHtml(size)}</td>
        <td valign="top" style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${INK};white-space:nowrap;">${escapeHtml(FUND_STATUS_LABEL[f.status] ?? "Update")}</td>
      </tr>`;
    })
    .join("");
  return sectionLabel(weekly ? "This Week's Funds" : "Fund Tracker", "sub-$1B vehicles", "secondary") +
    body(`<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${th("Fund")}${th("Target")}${th("Status")}</tr>${rows}</table>`);
}

function peopleMoves(items: Article[]): string {
  if (!items?.length) return "";
  const lis = items
    .map((a) => {
      const parts = (a.summary ?? "").split(" — ");
      const detail = parts.length > 1 ? parts.slice(1).join(" — ") : a.summary ?? "";
      return `<li style="padding:4px 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${BODY};">${link(a.source_url, a.title)}${detail ? ` ${escapeHtml(detail)}` : ""}</li>`;
    })
    .join("");
  return sectionLabel("People Moves", undefined, "outline") + body(`<ul style="margin:0;padding-left:20px;list-style-type:disc;">${lis}</ul>`);
}

function editorItems(label: string, sub: string | undefined, items: EditorItem[], variant: BadgeVariant, boxed = false): string {
  if (!items?.length) return "";
  const rows = items
    .map((it, i) =>
      item(
        `<div style="${boxed ? `background-color:${SOFT};border:1px solid ${LINE};padding:12px 14px;` : ""}">
          ${headline(it.url, it.headline)}
          ${summary(it.body)}
          ${it.attribution ? meta(it.attribution) : ""}
        </div>`,
        i,
      ),
    )
    .join("");
  return sectionLabel(label, sub, variant) + body(rows);
}

function overheard(items: EditorItem[]): string {
  if (!items?.length) return "";
  const rows = items
    .map((it, i) =>
      item(`
        <p style="font-family:${SERIF};font-style:italic;font-size:15px;line-height:1.6;color:${INK};margin:0;">&ldquo;${escapeHtml(it.headline.trim().replace(/^["“”']+|["“”']+$/g, ""))}&rdquo;</p>
        ${it.body ? `<p style="font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};margin:4px 0 0 0;">${escapeHtml(it.body)}</p>` : ""}
        ${it.attribution ? meta(`— ${it.attribution}`) : ""}`, i),
    )
    .join("");
  return sectionLabel("Overheard", undefined, "outline") + body(rows);
}

function marketPulse(items: Article[]): string {
  if (!items?.length) return "";
  const rows = items
    .map((a, i) =>
      item(`
        ${headline(a.source_url, a.title)}
        ${summary(a.summary, a.source_url)}
        ${a.why_it_matters ? takeLine("For the LMM", a.why_it_matters) : ""}`, i),
    )
    .join("");
  return sectionLabel("Macro & Credit", undefined, "secondary") + body(rows);
}

function theRead(c: NewsletterContentV2): string {
  const r = c.the_read;
  if (!r) return "";
  return sectionLabel("The Read", "one piece worth your time", "default") + body(`
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:2px solid ${INK};"><tr><td style="padding:16px 18px;">
      ${headline(r.url, r.title)}
      ${meta(r.source)}
      <div style="font-family:${SERIF};font-size:15px;line-height:1.6;color:${INK};margin-top:10px;">${escapeHtml(r.take)}${readMore(r.url)}</div>
    </td></tr></table>`);
}

function weekendReads(c: NewsletterContentV2): string {
  const reads = c.weekend_reads ?? [];
  if (!reads.length) return "";
  const rows = reads.map((r, i) => item(`
      <div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:4px;">${String(i + 1).padStart(2, "0")} &middot; ${escapeHtml(r.publisher)}${r.minutes ? ` &middot; ${r.minutes} min` : ""}</div>
      <div style="font-family:${SANS};font-size:16px;line-height:1.35;font-weight:700;">${link(r.url, r.title)}</div>
      <div style="font-family:${SERIF};font-size:15px;line-height:1.6;color:${INK};margin-top:6px;">${escapeHtml(r.note)}</div>`, i)).join("");
  return sectionLabel("Weekend Reading", "the week's best long reads, picked by the desk", "default") + body(rows);
}

// The standing ask. Bankers, lenders and sponsors want their closings seen; most never issue a
// release. Daily and Friday issues only.
function sendUsYourClosing(c: NewsletterContentV2, o: IssueEmailOptions): string {
  if ((c.weekend_reads ?? []).length) return "";
  return `
  <tr><td style="${RULE_MARK}padding:18px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${INK};"><tr><td style="padding:14px 16px;">
      <div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};font-weight:700;margin-bottom:4px;">Closed a deal?</div>
      <div style="font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};">Sponsors, bankers and lenders: send us your closing and it runs here, with your firm credited on the Scoreboard. No release needed. Reply to this email or use <a href="${escapeHtml(o.siteUrl)}/tip?kind=closing" style="color:${INK};font-weight:700;text-decoration:underline;">the closing form</a>.</div>
    </td></tr></table>
  </td></tr>`;
}

function referralBlock(o: IssueEmailOptions): string {
  const next = o.referralCount < 3 ? 3 : o.referralCount < 10 ? 10 : o.referralCount < 25 ? 25 : null;
  const progress = next ? `${o.referralCount} of ${next} toward your next unlock.` : `${o.referralCount} referrals. You're carrying this thing.`;
  return `
  <tr><td style="${RULE_MARK}padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${INK};border-radius:6px;"><tr><td style="padding:20px 22px;">
      <div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${FAINT};">Know a GP who'd read this?</div>
      <div style="font-family:${SANS};font-size:14px;line-height:1.55;color:#fff;margin-top:6px;">Forward this, or share your link. 3 referrals unlocks the deal database; 10 gets you the quarterly LMM multiples report.</div>
      <div style="margin-top:12px;"><a href="${escapeHtml(o.referralUrl)}" style="font-family:${MONO};font-size:12px;color:#fff;text-decoration:underline;word-break:break-all;">${escapeHtml(o.referralUrl)}</a></div>
      <div style="font-family:${SANS};font-size:12px;color:${FAINT};margin-top:8px;">${escapeHtml(progress)}</div>
    </td></tr></table>
  </td></tr>`;
}

// One-click reader question. Each option is a link carrying the reader's own token, so a vote
// is one tap and one vote per reader. Shown only when the issue carries a poll.
function pollBlock(c: NewsletterContentV2, o: IssueEmailOptions): string {
  const token = (o.preferencesUrl.match(/[?&]token=([^&]+)/) ?? [])[1] ?? "";
  let out = "";
  if (c.poll_result && c.poll_result.total > 0) {
    const r = c.poll_result;
    const rows = r.options.map((opt, i) => {
      const pct = Math.round((r.counts[i] / r.total) * 100);
      return `<tr><td style="padding:5px 0;font-family:${SANS};font-size:14px;color:${INK};">${escapeHtml(opt)}</td><td align="right" style="padding:5px 0 5px 12px;font-family:${MONO};font-size:13px;font-weight:700;color:${INK};white-space:nowrap;">${pct}%</td></tr>
      <tr><td colspan="2" style="padding:0 0 6px 0;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td width="${Math.max(pct, 1)}%" style="background-color:${INK};height:6px;font-size:0;line-height:0;">&nbsp;</td><td style="background-color:${CHIP};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
    }).join("");
    out += `<tr><td style="${RULE_MARK}padding:24px;">
      <div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Last week you said · ${r.total} answers</div>
      <div style="font-family:${SANS};font-size:16px;font-weight:700;line-height:1.4;color:${INK};margin:6px 0 10px 0;">${escapeHtml(r.question)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>
    </td></tr>`;
  }
  if (c.poll && token) {
    const p = c.poll;
    const links = p.options.map((opt, i) => `<tr><td style="padding:4px 0;"><a href="${escapeHtml(`${o.siteUrl}/vote?p=${p.id}&o=${i}&t=${token}`)}" style="display:block;border:1px solid ${INK};border-radius:6px;padding:10px 14px;font-family:${SANS};font-size:14px;color:${INK};text-decoration:none;">${escapeHtml(opt)}</a></td></tr>`).join("");
    out += `<tr><td style="${RULE_MARK}padding:24px;">
      <div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">One question · one click</div>
      <div style="font-family:${SANS};font-size:16px;font-weight:700;line-height:1.4;color:${INK};margin:6px 0 10px 0;">${escapeHtml(p.question)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${links}</table>
      <div style="font-family:${SANS};font-size:12px;color:${MUTED};margin-top:8px;">Answers are counted, never attributed. Results in next Tuesday's issue.</div>
    </td></tr>`;
  }
  return out;
}

// ---- whole issue -------------------------------------------------------------

export function renderIssueEmail(c: NewsletterContentV2, o: IssueEmailOptions): string {
  const dateStr = o.issueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const preheader = o.preheader ?? "";
  const greeting = o.firstName ? `Morning, ${escapeHtml(o.firstName)}.` : "";
  const weekly = c.edition === "weekly";

  const closing = c.closing_line
    ? `<tr><td style="${RULE_MARK}padding:24px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(c.closing_line)}<br><span style="font-family:${MONO};font-size:12px;color:${MUTED};">— ${escapeHtml(o.editorName)}, ${escapeHtml(o.editorTitle)}</span></td></tr>`
    : "";

  // First block sits directly under the ticker/masthead rule: drop its top rule.
  const blocks = [
    editorsNote(c, o, greeting),
    byTheNumbers(c.by_the_numbers),
    belowRadar(c.below_radar),
    dealTracker(c.deal_tracker, weekly),
    editorItems("On the Market", "processes we're hearing about", c.on_the_market, "outline", true),
    scoreboard(c.scoreboard, weekly),
    fundTracker(c.fund_tracker, weekly),
    headlines(c.top_headlines),
    peopleMoves(c.people_moves),
    marketPulse(c.market_pulse),
    overheard(c.overheard),
    weekendReads(c),
    theRead(c),
    editorItems("Jobs", "open seats in the LMM", c.jobs, "secondary"),
    pollBlock(c, o),
    closing,
    sendUsYourClosing(c, o),
    referralBlock(o),
  ].join("\n");
  const sections = blocks.replace(RULE_MARK, "").split(RULE_MARK).join(RULE_CSS);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${escapeHtml(o.subject)}</title>
<style>
  body { margin:0; padding:0; background:${PAGE}; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; }
  a { color:${INK}; }
  @media only screen and (max-width: 620px) {
    .wrap { width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(preheader)}${"&nbsp;&zwnj;".repeat(60)}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${PAGE};"><tr><td align="center" style="padding:20px 8px;">
  <table class="wrap" width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:600px;background-color:#ffffff;border:2px solid ${INK};">

    <!-- masthead -->
    <tr><td style="padding:24px;border-bottom:2px solid ${INK};">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td valign="top">
          <p style="font-family:${MONO};font-size:12px;color:${MUTED};margin:0;">Issue #${o.issueNumber}</p>
          <h1 style="font-family:${SANS};font-size:24px;font-weight:700;color:${INK};margin:4px 0 0 0;">The GP Pulse</h1>
          ${weekly ? `<div style="margin-top:8px;">${badge("Week in Review", "default")}</div>` : ""}
        </td>
        <td valign="top" align="right" style="font-family:${MONO};font-size:12px;color:${MUTED};line-height:1.6;">
          ${escapeHtml(dateStr)}<br><a href="${escapeHtml(o.webUrl)}" style="color:${MUTED};text-decoration:underline;">Read online</a>
        </td>
      </tr></table>
    </td></tr>

    ${marketTicker(c.market_data)}

    ${sections}

    <!-- footer -->
    <tr><td style="padding:20px 24px;border-top:2px solid ${INK};background-color:${SOFT};">
      <p style="font-family:${SANS};font-size:11px;line-height:1.7;color:${MUTED};margin:0;text-align:center;">
        You're receiving this because you subscribed to The GP Pulse.<br>
        Got a deal, a process, or a tip? Reply to this email or use <a href="${escapeHtml(o.siteUrl)}/tip" style="color:${INK};text-decoration:underline;">the tip form</a>. Want a note the evening a deal in your sector prints? Turn on <a href="${escapeHtml(o.preferencesUrl)}" style="color:${INK};text-decoration:underline;">deal alerts</a>.<br>
        <a href="${escapeHtml(o.webUrl)}" style="color:${INK};text-decoration:underline;">Read online</a> |
        <a href="${escapeHtml(o.preferencesUrl)}" style="color:${INK};text-decoration:underline;">Manage Preferences</a> |
        <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:${INK};text-decoration:underline;">Unsubscribe</a>
      </p>
      <p style="font-family:${SANS};font-size:10px;color:${FAINT};margin:12px 0 0 0;text-align:center;">${escapeHtml(o.postalAddress)}<br>&copy; ${o.issueDate.getFullYear()} The GP Pulse. All rights reserved.</p>
    </td></tr>

  </table>
  ${o.trackingPixel ?? ""}
</td></tr></table>
</body>
</html>`;
}

// ---- welcome -----------------------------------------------------------------

export interface WelcomeOptions {
  siteUrl: string;
  firstName: string | null;
  referralUrl: string;
  latestIssueUrl: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
  postalAddress: string;
  editorName: string;
  editorTitle: string;
}

export function renderWelcomeEmail(o: WelcomeOptions): string {
  const p = (t: string) => `<p style="font-family:${SERIF};font-size:16px;line-height:1.6;color:${INK};margin:0 0 14px 0;">${t}</p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to The GP Pulse</title></head>
<body style="margin:0;padding:0;background:#e9e9e6;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#e9e9e6;"><tr><td align="center" style="padding:18px 8px;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:600px;background:#fff;border:2px solid ${INK};">
  <tr><td style="padding:18px 28px;border-bottom:2px solid ${INK};font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:-0.02em;">THE GP PULSE</td></tr>
  <tr><td style="padding:26px 28px 8px 28px;">
    ${p(`${o.firstName ? `${escapeHtml(o.firstName)}, welcome` : "Welcome"} aboard. Quick orientation so you know what's coming and why.`)}
    ${p(`Every weekday before the market opens you'll get one email: a short lede on the thing that matters most, the deals that printed in the $2–25M EBITDA range with the terms that were actually disclosed, which sub-$1B funds are in market, who moved where, and the credit and rate moves that change your leverage math. Ten minutes, no filler.`)}
    ${p(`Two things that make it better for everyone:`)}
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 14px 0;">
      <tr><td valign="top" style="font-family:${MONO};font-size:13px;color:${INK};padding:0 10px 8px 0;">01</td><td style="font-family:${SANS};font-size:14.5px;line-height:1.55;color:${INK};padding-bottom:8px;"><strong>Reply.</strong> Processes you're seeing, a multiple that surprised you, a hire we missed. Everything is off the record unless you say otherwise, and the best tips end up in "On the market" and "Overheard."</td></tr>
      <tr><td valign="top" style="font-family:${MONO};font-size:13px;color:${INK};padding:0 10px 0 0;">02</td><td style="font-family:${SANS};font-size:14.5px;line-height:1.55;color:${INK};"><strong>Share it.</strong> Three referrals unlocks the searchable deal database. Ten gets you the quarterly LMM multiples report. Your link:<br><a href="${escapeHtml(o.referralUrl)}" style="font-family:${MONO};font-size:12px;color:${INK};">${escapeHtml(o.referralUrl)}</a></td></tr>
    </table>
    ${o.latestIssueUrl ? p(`Want a taste now? <a href="${escapeHtml(o.latestIssueUrl)}" style="color:${INK};font-weight:700;">Read the latest issue.</a>`) : ""}
    ${p(`Add this address to your contacts so we don't end up in Promotions. See you tomorrow morning.`)}
    <p style="font-family:${SANS};font-size:13px;color:${MUTED};margin:0;">— ${escapeHtml(o.editorName)}, ${escapeHtml(o.editorTitle)}</p>
  </td></tr>
  <tr><td style="padding:18px 28px 22px 28px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:2px solid ${INK};"><tr><td style="padding-top:12px;font-family:${SANS};font-size:11.5px;line-height:1.7;color:${MUTED};">
    <a href="${escapeHtml(o.preferencesUrl)}" style="color:${MUTED};">Preferences</a> &nbsp;·&nbsp; <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe</a><br>${escapeHtml(o.postalAddress)}
  </td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
}
