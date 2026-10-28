// Email rendering for The GP Pulse. Table-based, inline-styled, 600px, tested against
// Gmail / Outlook / Apple Mail constraints (no flex, no grid, no web fonts required).

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
  Stat,
} from "./content.ts";

export const escapeHtml = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const INK = "#0b0b0b";
const MUTED = "#5f6368";
const RULE = "#0b0b0b";
const SOFT = "#f4f4f2";
const ACCENT = "#0f5c3a";
const UP = "#0f5c3a";
const DOWN = "#b42318";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace";

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

const sectionLabel = (text: string, sub?: string) => `
  <tr><td style="padding:28px 28px 0 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="border-top:2px solid ${RULE};padding-top:10px;">
        <span style="font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK};font-weight:700;">${escapeHtml(text)}</span>
        ${sub ? `<span style="font-family:${SANS};font-size:11px;color:${MUTED};margin-left:10px;">${escapeHtml(sub)}</span>` : ""}
      </td>
    </tr></table>
  </td></tr>`;

const body = (inner: string, pad = "12px 28px 0 28px") =>
  `<tr><td style="padding:${pad};">${inner}</td></tr>`;

const link = (href: string | null | undefined, text: string, bold = true) =>
  href
    ? `<a href="${escapeHtml(href)}" style="color:${INK};text-decoration:none;${bold ? "font-weight:700;" : ""}border-bottom:1px solid ${INK};">${escapeHtml(text)}</a>`
    : `<span style="${bold ? "font-weight:700;" : ""}">${escapeHtml(text)}</span>`;

const chip = (text: string, dark = false) =>
  `<span style="display:inline-block;font-family:${MONO};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:2px 7px;margin-right:6px;border:1px solid ${INK};${dark ? `background:${INK};color:#fff;` : `color:${INK};`}">${escapeHtml(text)}</span>`;

const takeLine = (label: string, text: string) => `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;"><tr>
    <td style="border-left:3px solid ${ACCENT};padding:2px 0 2px 12px;font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};">
      <span style="font-family:${MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:700;">${escapeHtml(label)}</span>
      <span style="display:block;margin-top:2px;">${escapeHtml(text)}</span>
    </td>
  </tr></table>`;

// ---- sections ----------------------------------------------------------------

function marketTicker(quotes: MarketQuote[]): string {
  if (!quotes?.length) return "";
  const cells = quotes
    .slice(0, 6)
    .map((q) => {
      const isRate = q.unit === "percent" || q.unit === "bps";
      const price = isRate
        ? `${q.price.toFixed(2)}%`
        : q.price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: q.price > 1000 ? 0 : 2 });
      const up = q.change >= 0;
      const delta = isRate ? `${up ? "+" : ""}${Math.round(q.change * 100)}bp` : `${up ? "+" : ""}${q.changePercent.toFixed(2)}%`;
      return `<td align="center" style="padding:10px 4px;">
        <div style="font-family:${MONO};font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${escapeHtml(q.name)}</div>
        <div style="font-family:${SANS};font-size:15px;font-weight:700;color:${INK};margin-top:2px;">${price}</div>
        <div style="font-family:${MONO};font-size:11px;color:${up ? UP : DOWN};">${delta}</div>
      </td>`;
    })
    .join("");
  return `<tr><td style="padding:0 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${SOFT};border-top:2px solid ${RULE};border-bottom:1px solid #d9d9d6;"><tr>${cells}</tr></table>
  </td></tr>`;
}

function editorsNote(c: NewsletterContentV2, o: IssueEmailOptions): string {
  const note = c.editors_note;
  if (!note) return "";
  const paras = note.paragraphs
    .map((p) => `<p style="font-family:${SERIF};font-size:17px;line-height:1.6;color:${INK};margin:0 0 14px 0;">${escapeHtml(p)}</p>`)
    .join("");
  return `
  <tr><td style="padding:28px 28px 0 28px;">
    <h2 style="font-family:${SANS};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.01em;color:${INK};margin:0 0 14px 0;">${escapeHtml(note.headline)}</h2>
    ${paras}
    <p style="font-family:${SANS};font-size:13px;color:${MUTED};margin:4px 0 0 0;">— ${escapeHtml(note.byline || o.editorName)}</p>
  </td></tr>`;
}

function byTheNumbers(stats: Stat[]): string {
  if (!stats?.length) return "";
  const cells = stats
    .slice(0, 3)
    .map(
      (s) => `<td width="33%" valign="top" style="padding:14px 10px 14px 0;">
        <div style="font-family:${SANS};font-size:30px;font-weight:800;letter-spacing:-0.02em;color:${INK};line-height:1;">${escapeHtml(s.value)}</div>
        <div style="font-family:${SANS};font-size:13px;font-weight:700;color:${INK};margin-top:6px;">${escapeHtml(s.label)}</div>
        ${s.context ? `<div style="font-family:${SANS};font-size:12px;color:${MUTED};margin-top:2px;line-height:1.4;">${escapeHtml(s.context)}</div>` : ""}
      </td>`,
    )
    .join("");
  return sectionLabel("By the numbers") + body(`<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells}</tr></table>`, "0 28px");
}

function headlines(items: Article[]): string {
  if (!items?.length) return "";
  const rows = items
    .map(
      (a, i) => `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:${i === 0 ? 0 : 18}px;"><tr>
        <td width="28" valign="top" style="font-family:${MONO};font-size:13px;color:${MUTED};padding-top:3px;">${String(i + 1).padStart(2, "0")}</td>
        <td valign="top">
          <div style="font-family:${SANS};font-size:16px;line-height:1.35;">${link(a.source_url, a.title)}</div>
          ${a.summary ? `<div style="font-family:${SANS};font-size:14px;line-height:1.55;color:#333;margin-top:5px;">${escapeHtml(a.summary)}</div>` : ""}
          ${a.why_it_matters ? takeLine("Why it matters", a.why_it_matters) : ""}
          <div style="font-family:${MONO};font-size:10px;color:${MUTED};margin-top:6px;">${escapeHtml(a.source)}</div>
        </td>
      </tr></table>`,
    )
    .join("");
  return sectionLabel("The headlines") + body(rows);
}

function dealTracker(deals: DealRow[]): string {
  if (!deals?.length) return "";
  const rows = deals
    .map((d, i) => {
      const facts: string[] = [];
      if (d.sector) facts.push(d.sector);
      if (d.enterprise_value_millions) facts.push(`EV ${fmtMillions(d.enterprise_value_millions)}`);
      if (d.ebitda_millions) facts.push(`EBITDA ${fmtMillions(d.ebitda_millions)}`);
      if (d.ev_ebitda_multiple) facts.push(fmtMultiple(d.ev_ebitda_multiple));
      if (!d.figures_disclosed && !d.enterprise_value_millions) facts.push("terms undisclosed");
      const verb = d.deal_type === "exit" ? "exits" : d.deal_type === "add-on" ? "adds on" : d.deal_type === "recap" ? "recaps" : "acquires";
      return `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:${i === 0 ? 0 : 14}px;border-bottom:1px solid #e3e3e0;"><tr>
        <td valign="top" style="padding-bottom:12px;">
          <div style="margin-bottom:6px;">${chip(DEAL_TYPE_LABEL[d.deal_type] ?? "Deal", d.featured)}${d.featured ? chip("Deal of the day", true) : ""}</div>
          <div style="font-family:${SANS};font-size:15px;line-height:1.4;color:${INK};"><strong>${escapeHtml(d.sponsor)}</strong> ${verb} ${link(d.source_url, d.target)}</div>
          <div style="font-family:${MONO};font-size:11px;color:${MUTED};margin-top:3px;">${escapeHtml(facts.join("  ·  "))}</div>
          ${d.summary ? `<div style="font-family:${SANS};font-size:13.5px;line-height:1.5;color:#333;margin-top:5px;">${escapeHtml(d.summary)}</div>` : ""}
          ${d.editor_take ? takeLine("Our read", d.editor_take) : ""}
        </td>
      </tr></table>`;
    })
    .join("");
  return sectionLabel("Deal tracker", "disclosed figures only") + body(rows);
}

function fundTracker(funds: FundRow[]): string {
  if (!funds?.length) return "";
  const rows = funds
    .map((f) => {
      const size = f.raised_millions
        ? `${fmtMillions(f.raised_millions)} raised${f.target_millions ? ` / ${fmtMillions(f.target_millions)} target` : ""}`
        : f.target_millions
          ? `${fmtMillions(f.target_millions)} target`
          : "size undisclosed";
      return `<tr>
        <td valign="top" style="padding:9px 0;border-bottom:1px solid #e3e3e0;font-family:${SANS};font-size:14px;line-height:1.4;color:${INK};">
          ${link(f.source_url, `${f.firm} — ${f.fund_name}`)}
          <div style="font-family:${SANS};font-size:12.5px;color:#333;margin-top:2px;">${escapeHtml([f.strategy, f.headquarters].filter(Boolean).join(" · "))}</div>
        </td>
        <td valign="top" width="150" align="right" style="padding:9px 0;border-bottom:1px solid #e3e3e0;">
          <div style="font-family:${SANS};font-size:13px;font-weight:700;color:${INK};">${escapeHtml(size)}</div>
          <div style="font-family:${MONO};font-size:10px;color:${MUTED};margin-top:2px;">${escapeHtml(FUND_STATUS_LABEL[f.status] ?? "Update")}</div>
        </td>
      </tr>`;
    })
    .join("");
  return sectionLabel("Fund tracker", "sub-$1B vehicles") + body(`<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`);
}

function peopleMoves(items: Article[]): string {
  if (!items?.length) return "";
  const rows = items
    .map((a) => {
      const parts = (a.summary ?? "").split(" — ");
      const detail = parts.length > 1 ? parts.slice(1).join(" — ") : a.summary ?? "";
      return `<tr><td style="padding:7px 0;border-bottom:1px solid #e3e3e0;font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};">
        ${link(a.source_url, a.title)}${detail ? ` <span style="color:#333;">${escapeHtml(detail)}</span>` : ""}
      </td></tr>`;
    })
    .join("");
  return sectionLabel("People moves") + body(`<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`);
}

function editorItems(label: string, sub: string | undefined, items: EditorItem[], boxed = false): string {
  if (!items?.length) return "";
  const rows = items
    .map(
      (it) => `<tr><td style="padding:${boxed ? "10px 14px" : "8px 0"};${boxed ? `background:${SOFT};border:1px solid #d9d9d6;` : "border-bottom:1px solid #e3e3e0;"}font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};">
        <div>${link(it.url, it.headline)}</div>
        ${it.body ? `<div style="color:#333;margin-top:3px;">${escapeHtml(it.body)}</div>` : ""}
        ${it.attribution ? `<div style="font-family:${MONO};font-size:10px;color:${MUTED};margin-top:4px;">${escapeHtml(it.attribution)}</div>` : ""}
      </td></tr>${boxed ? `<tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>` : ""}`,
    )
    .join("");
  return sectionLabel(label, sub) + body(`<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`);
}

function marketPulse(items: Article[]): string {
  if (!items?.length) return "";
  const rows = items
    .map(
      (a) => `<div style="margin-bottom:14px;">
        <div style="font-family:${SANS};font-size:15px;line-height:1.35;">${link(a.source_url, a.title)}</div>
        ${a.summary ? `<div style="font-family:${SANS};font-size:13.5px;line-height:1.5;color:#333;margin-top:4px;">${escapeHtml(a.summary)}</div>` : ""}
        ${a.why_it_matters ? takeLine("For the LMM", a.why_it_matters) : ""}
      </div>`,
    )
    .join("");
  return sectionLabel("Macro & credit") + body(rows);
}

function theRead(c: NewsletterContentV2): string {
  const r = c.the_read;
  if (!r) return "";
  return sectionLabel("The read", "one piece worth your time") + body(`
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:2px solid ${INK};"><tr><td style="padding:16px 18px;">
      <div style="font-family:${SANS};font-size:16px;line-height:1.35;">${link(r.url, r.title)}</div>
      <div style="font-family:${MONO};font-size:10px;color:${MUTED};margin-top:4px;">${escapeHtml(r.source)}</div>
      <div style="font-family:${SERIF};font-size:15px;line-height:1.55;color:${INK};margin-top:10px;">${escapeHtml(r.take)}</div>
    </td></tr></table>`);
}

function referralBlock(o: IssueEmailOptions): string {
  const next = o.referralCount < 3 ? 3 : o.referralCount < 10 ? 10 : o.referralCount < 25 ? 25 : null;
  const progress = next ? `${o.referralCount} of ${next} toward your next unlock.` : `${o.referralCount} referrals. You're carrying this thing.`;
  return `
  <tr><td style="padding:28px 28px 0 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${INK};"><tr><td style="padding:20px 22px;">
      <div style="font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#bfbfbf;">Know a GP who'd read this?</div>
      <div style="font-family:${SANS};font-size:15px;line-height:1.5;color:#fff;margin-top:6px;">Forward this, or share your link. 3 referrals unlocks the deal database; 10 gets you the quarterly LMM multiples report.</div>
      <div style="margin-top:12px;"><a href="${escapeHtml(o.referralUrl)}" style="font-family:${MONO};font-size:12px;color:#fff;border-bottom:1px solid #fff;text-decoration:none;word-break:break-all;">${escapeHtml(o.referralUrl)}</a></div>
      <div style="font-family:${SANS};font-size:12px;color:#bfbfbf;margin-top:8px;">${escapeHtml(progress)}</div>
    </td></tr></table>
  </td></tr>`;
}

// ---- whole issue -------------------------------------------------------------

export function renderIssueEmail(c: NewsletterContentV2, o: IssueEmailOptions): string {
  const dateStr = o.issueDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const preheader = o.preheader ?? "";
  const greeting = o.firstName ? `Morning, ${escapeHtml(o.firstName)}.` : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${escapeHtml(o.subject)}</title>
<style>
  body { margin:0; padding:0; background:#e9e9e6; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; }
  a { color:${INK}; }
  @media only screen and (max-width: 620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:18px !important; padding-right:18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e9e9e6;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#e9e9e6;">${escapeHtml(preheader)}${"&nbsp;&zwnj;".repeat(60)}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#e9e9e6;"><tr><td align="center" style="padding:18px 8px;">
  <table class="wrap" width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:600px;background:#ffffff;border:2px solid ${INK};">

    <!-- masthead -->
    <tr><td style="padding:18px 28px;border-bottom:2px solid ${INK};">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td valign="bottom">
          <div style="font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${INK};">THE GP PULSE</div>
          <div style="font-family:${MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-top:2px;">Lower middle market, every weekday</div>
        </td>
        <td valign="bottom" align="right" style="font-family:${MONO};font-size:11px;color:${MUTED};line-height:1.6;">
          No. ${o.issueNumber}<br>${escapeHtml(dateStr)}<br><a href="${escapeHtml(o.webUrl)}" style="color:${MUTED};">Read online</a>
        </td>
      </tr></table>
    </td></tr>

    ${marketTicker(c.market_data)}

    ${greeting ? `<tr><td style="padding:22px 28px 0 28px;font-family:${SANS};font-size:14px;color:${MUTED};">${greeting}</td></tr>` : ""}

    ${editorsNote(c, o)}
    ${byTheNumbers(c.by_the_numbers)}
    ${headlines(c.top_headlines)}
    ${dealTracker(c.deal_tracker)}
    ${editorItems("On the market", "processes we're hearing about", c.on_the_market, true)}
    ${fundTracker(c.fund_tracker)}
    ${peopleMoves(c.people_moves)}
    ${marketPulse(c.market_pulse)}
    ${editorItems("Overheard", undefined, c.overheard)}
    ${theRead(c)}
    ${editorItems("Jobs", "open seats in the LMM", c.jobs)}

    ${c.closing_line ? `<tr><td style="padding:26px 28px 0 28px;font-family:${SERIF};font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(c.closing_line)}<br><span style="font-family:${SANS};font-size:13px;color:${MUTED};">— ${escapeHtml(o.editorName)}, ${escapeHtml(o.editorTitle)}</span></td></tr>` : ""}

    ${referralBlock(o)}

    <!-- footer -->
    <tr><td style="padding:22px 28px 24px 28px;margin-top:28px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:2px solid ${INK};"><tr><td style="padding-top:14px;font-family:${SANS};font-size:11.5px;line-height:1.7;color:${MUTED};">
        You're getting this because you subscribed to The GP Pulse. Got a deal, a process, or a tip? Reply to this email or use <a href="${escapeHtml(o.siteUrl)}/tip" style="color:${MUTED};">the tip form</a> — a human reads every one. Want a note the evening a deal in your sector prints? Turn on <a href="${escapeHtml(o.preferencesUrl)}" style="color:${MUTED};">deal alerts</a>.<br>
        <a href="${escapeHtml(o.webUrl)}" style="color:${MUTED};">Read online</a> &nbsp;·&nbsp;
        <a href="${escapeHtml(o.preferencesUrl)}" style="color:${MUTED};">Preferences</a> &nbsp;·&nbsp;
        <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe</a><br>
        ${escapeHtml(o.postalAddress)}
      </td></tr></table>
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
