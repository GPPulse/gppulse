// Mailing-list subscriber. Discovery records every firm whose site has a newsletter sign-up
// form (signup_page). This signs the watch inbox up to each one, once, so firm announcements
// arrive by email and feed the same classifier as everything else (inbound-email function).
//
// It signs up as what it is: The GP Pulse, at its own address. It reads robots.txt, leaves
// honeypot fields empty, never touches a form behind a CAPTCHA, and tries each firm once.
// Forms that only work in a browser are recorded as such and left for a person.
//
//   node src/subscribe.mjs [--limit 40] [--find 150] [--kind sponsor] [--dry] [--retry]
//
// --find N first looks for a sign-up form at N firms that have none on file. Discovery only reads
// the home page; many firms keep the form on a contact, news or insights page instead.
import { appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { get, pool, allowed, sleep, scanHome, sameSite } from './lib.mjs';
import { api, chunk } from './api.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

export const IDENTITY = {
  email: process.env.WATCH_EMAIL || 'watch@in.thegppulse.com',
  first: 'GP Pulse', last: 'Research', company: 'The GP Pulse', title: 'Editor',
};

const CAPTCHA = /g-recaptcha|grecaptcha|recaptcha\/api|hcaptcha|h-captcha|cf-turnstile|challenges\.cloudflare\.com\/turnstile|friendlycaptcha|arkoselabs/i;
const SIGNUP_TEXT = /(join|sign up for|subscribe to)\s+(our|the)\s+(mailing list|newsletter|email list|updates|distribution list|insights)|stay (informed|connected|up to date)|newsletter|subscribe|sign ?up|email updates|mailing list/i;

// What to put in a visible text field, judged by its name, id, placeholder and label.
export function valueFor(desc, id = IDENTITY) {
  const d = desc.toLowerCase();
  if (/e-?mail/.test(d)) return id.email;
  if (/first|fname|given/.test(d)) return id.first;
  if (/last|lname|surname|family/.test(d)) return id.last;
  if (/full.?name|your.?name|^name$|\bname\b/.test(d)) return `${id.first} ${id.last}`;
  if (/company|organi[sz]ation|firm|employer/.test(d)) return id.company;
  if (/title|position|role/.test(d)) return id.title;
  return null; // phone, address, anything else: leave empty
}

/**
 * Find the sign-up form on a page and work out how to submit it.
 * Returns { kind: 'form', method, url, fields } | { kind: 'hubspot', portalId, formId } |
 *         { kind: 'skip', reason }.
 */
export function planSignup(html, pageUrl, id = IDENTITY) {
  const $ = cheerio.load(html);
  const abs = (h) => { try { return new URL(h || pageUrl, pageUrl).href; } catch { return null; } };

  let best = null;
  $('form').each((_, el) => {
    if (best) return;
    const f = $(el);
    const emails = f.find('input[type="email"], input[name*="email" i], input[placeholder*="email" i]');
    if (!emails.length || f.find('input[type="password"]').length || f.find('textarea').length) return;
    if (f.find('input[type="search"]').length || /search/i.test(f.attr('role') || '')) return;
    const context = `${f.text()} ${f.prevAll().slice(0, 2).text()} ${f.parent().children('h1,h2,h3,h4,h5,p,label').text()} ${f.attr('id') || ''} ${f.attr('class') || ''} ${f.attr('action') || ''}`;
    if (!SIGNUP_TEXT.test(context) && !/list-manage|createsend|constantcontact|mailerlite|klaviyo|activehosted/i.test(context)) return;
    best = f;
  });

  if (best) {
    if (CAPTCHA.test($.html(best)) || (CAPTCHA.test(html) && best.find('[data-sitekey], .g-recaptcha, .h-captcha, .cf-turnstile').length)) return { kind: 'skip', reason: 'captcha' };
    const action = best.attr('action');
    const method = (best.attr('method') || 'get').toLowerCase();
    // A form with no action and no method is driven by script; a plain POST of it goes nowhere useful.
    if (!action && !best.attr('method')) return hubspotPlan(html) ?? { kind: 'skip', reason: 'script-only form' };
    const url = abs(action);
    if (!url || !/^https?:/.test(url)) return { kind: 'skip', reason: 'no usable form address' };
    const fields = [];
    let required = null;
    best.find('input, select').each((_, el) => {
      const i = $(el);
      const name = i.attr('name');
      const type = (i.attr('type') || (el.tagName === 'select' ? 'select' : 'text')).toLowerCase();
      if (!name || ['submit', 'button', 'image', 'reset', 'file'].includes(type)) return;
      const hiddenByStyle = /display:\s*none|visibility:\s*hidden|left:\s*-\d{3,}px|position:\s*absolute;\s*left:\s*-/i.test(`${i.attr('style') || ''} ${i.parent().attr('style') || ''} ${i.closest('div').attr('style') || ''}`) || i.attr('tabindex') === '-1' || i.closest('[aria-hidden="true"]').length > 0;
      if (type === 'hidden') { fields.push([name, i.attr('value') ?? '']); return; }
      if (hiddenByStyle) { fields.push([name, '']); return; } // honeypot: must stay empty
      if (type === 'checkbox' || type === 'radio') {
        // Tick consent and list-choice boxes that are required or already ticked; nothing else.
        if (i.attr('checked') !== undefined || i.attr('required') !== undefined) fields.push([name, i.attr('value') ?? 'on']);
        return;
      }
      if (type === 'select') {
        if (i.attr('required') !== undefined) { const v = i.find('option[value]').filter((_, o) => $(o).attr('value')).first().attr('value'); if (v) fields.push([name, v]); else required = name; }
        return;
      }
      const label = i.attr('id') ? $(`label[for="${i.attr('id')}"]`).text() : '';
      const v = valueFor(`${type === 'email' ? 'email' : ''} ${name} ${i.attr('id') || ''} ${i.attr('placeholder') || ''} ${i.attr('aria-label') || ''} ${label}`, id);
      if (v !== null) fields.push([name, v]);
      else if (i.attr('required') !== undefined) required = name;
      else fields.push([name, i.attr('value') ?? '']);
    });
    if (required) return { kind: 'skip', reason: `asks for something we do not give (${required})` };
    if (!fields.some(([, v]) => v === id.email)) return { kind: 'skip', reason: 'no email field found' };
    return { kind: 'form', method: method === 'post' ? 'post' : 'get', url, fields };
  }
  return hubspotPlan(html) ?? { kind: 'skip', reason: /<form/i.test(html) ? 'no sign-up form recognised' : 'form is built by script' };
}

// HubSpot embeds carry the portal and form ids in the page; the embed itself posts to this API.
export function hubspotPlan(html) {
  const m = html.match(/hbspt\.forms\.create\(\s*\{([\s\S]{0,600}?)\}\s*\)/);
  if (!m) return null;
  const portalId = (m[1].match(/portalId:\s*["']?(\d{4,12})["']?/) || [])[1];
  const formId = (m[1].match(/formId:\s*["']([0-9a-f-]{36})["']/i) || [])[1];
  return portalId && formId ? { kind: 'hubspot', portalId, formId } : null;
}

const UA = 'GPPulseBot/1.0 (+https://thegppulse.com/about; watch@in.thegppulse.com)';

export async function submit(plan, pageUrl, id = IDENTITY) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    let res;
    if (plan.kind === 'hubspot') {
      res = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${plan.portalId}/${plan.formId}`, {
        method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': UA },
        body: JSON.stringify({ fields: [{ name: 'email', value: id.email }, { name: 'firstname', value: id.first }, { name: 'lastname', value: id.last }, { name: 'company', value: id.company }], context: { pageUri: pageUrl, pageName: 'Newsletter sign-up' } }),
      });
      if (res.status === 400) {
        // Some forms reject fields they do not define; the email alone is always defined.
        res = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${plan.portalId}/${plan.formId}`, {
          method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': UA },
          body: JSON.stringify({ fields: [{ name: 'email', value: id.email }], context: { pageUri: pageUrl } }),
        });
      }
    } else {
      const body = new URLSearchParams(plan.fields);
      const url = plan.method === 'get' ? `${plan.url}${plan.url.includes('?') ? '&' : '?'}${body}` : plan.url;
      res = await fetch(url, {
        method: plan.method.toUpperCase(), signal: ctl.signal, redirect: 'follow',
        headers: { 'user-agent': UA, referer: pageUrl, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...(plan.method === 'post' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body: plan.method === 'post' ? body : undefined,
      });
    }
    const text = (await res.text().catch(() => '')).slice(0, 4000);
    if (CAPTCHA.test(text) && /captcha/i.test(text) && !res.ok) return { ok: false, note: `captcha on submit (HTTP ${res.status})` };
    if (/already subscribed|is already (a )?(subscriber|on the list)/i.test(text)) return { ok: true, note: 'already subscribed' };
    return res.ok ? { ok: true, note: `submitted (HTTP ${res.status})` } : { ok: false, note: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, note: String(err).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

// ---------- forms that only exist once the page's script has run ----------
// About a third of sign-up forms are drawn by script (Mailchimp pop-ins, HubSpot, Squarespace,
// Wix), so there is nothing in the page source to post. With --browser those are filled in a
// real headless browser, the way a person would: type the address, press the button. The rules
// do not change: a page that carries a CAPTCHA is left alone, hidden fields stay empty, and a
// form that asks for anything beyond name, company, title and email is skipped.
let browser = null;
export async function closeBrowser() { if (browser) { const b = await browser.catch(() => null); browser = null; await b?.close().catch(() => {}); } }

export async function submitInBrowser(pageUrl, id = IDENTITY, { timeout = 25000 } = {}) {
  let pw;
  try { pw = await import('playwright'); } catch { return { status: 'needs_browser', note: 'no headless browser installed' }; }
  try { browser ||= pw.chromium.launch(process.env.FW_CHROME_PATH ? { executablePath: process.env.FW_CHROME_PATH } : {}); await browser; } catch (err) { browser = null; return { status: 'needs_browser', note: `browser did not start: ${String(err?.message || err).slice(0, 60)}` }; }
  const ctx = await (await browser).newContext({ userAgent: UA });
  try {
    const page = await ctx.newPage();
    await page.route('**/*', (r) => (/^(image|media|font)$/.test(r.request().resourceType()) ? r.abort() : r.continue()));
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout }).catch(() => null);
    const html = await page.content();
    if (CAPTCHA.test(html)) return { status: 'captcha', note: 'page carries a CAPTCHA; left alone' };

    // Work out, inside the page, which email box belongs to a sign-up form and tag its parts.
    const plan = await page.evaluate(({ signupSrc }) => {
      const SIGNUP = new RegExp(signupSrc, 'i');
      const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && r.left > -500; };
      const describe = (el) => [el.type === 'email' ? 'email' : '', el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.id ? (document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? '') : '', el.closest('label')?.textContent ?? ''].join(' ');
      for (const email of document.querySelectorAll('input[type="email"], input[name*="email" i], input[placeholder*="email" i]')) {
        if (!visible(email)) continue;
        let box = email.closest('form');
        if (!box) { box = email.parentElement; for (let i = 0; i < 4 && box && !box.querySelector('button, input[type="submit"], [role="button"]'); i++) box = box.parentElement; }
        if (!box || box.querySelector('input[type="password"], textarea')) continue;
        const context = `${box.textContent} ${box.previousElementSibling?.textContent ?? ''} ${box.parentElement?.querySelector('h1,h2,h3,h4,h5')?.textContent ?? ''} ${box.id} ${box.className}`;
        if (!SIGNUP.test(context)) continue;
        const button = [...box.querySelectorAll('button, input[type="submit"], [role="button"]')].find((b) => visible(b) && !/search|close|cancel|dismiss/i.test(`${b.textContent} ${b.getAttribute('aria-label') ?? ''}`));
        if (!button) continue;
        const fields = [];
        let asksFor = null;
        box.querySelectorAll('input, select').forEach((el, n) => {
          const type = (el.getAttribute('type') || (el.tagName === 'SELECT' ? 'select' : 'text')).toLowerCase();
          if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type) || !visible(el)) return; // hidden boxes are honeypots: never filled
          el.setAttribute('data-gpp', String(n));
          if (type === 'checkbox' || type === 'radio') { if (el.required && !el.checked) fields.push({ n, tick: true }); return; }
          if (type === 'select') { if (el.required) asksFor = el.name || 'a choice'; return; }
          fields.push({ n, desc: describe(el), required: el.required });
        });
        button.setAttribute('data-gpp-go', '1');
        return { fields, asksFor };
      }
      return null;
    }, { signupSrc: SIGNUP_TEXT.source });

    if (!plan) return { status: 'skipped', note: 'no sign-up form on the rendered page' };
    if (plan.asksFor) return { status: 'skipped', note: `asks for something we do not give (${plan.asksFor})` };
    let gaveEmail = false;
    for (const f of plan.fields) {
      const el = page.locator(`[data-gpp="${f.n}"]`);
      if (f.tick) { await el.check({ timeout: 3000 }).catch(() => {}); continue; }
      const v = valueFor(f.desc, id);
      if (v === null) { if (f.required) return { status: 'skipped', note: 'asks for something we do not give' }; continue; }
      await el.fill(v, { timeout: 3000 });
      if (v === id.email) gaveEmail = true;
    }
    if (!gaveEmail) return { status: 'skipped', note: 'no email field found' };
    const before = (await page.locator('body').innerText().catch(() => '')).length;
    await page.locator('[data-gpp-go="1"]').click({ timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const after = await page.content();
    if (CAPTCHA.test(after) && /captcha/i.test(await page.locator('body').innerText().catch(() => ''))) return { status: 'captcha', note: 'CAPTCHA shown on submit; left alone' };
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 20000);
    if (/thank(s| you)|subscribed|you'?re (in|on the list|signed up)|success|check your (inbox|email)|almost (there|done)|confirm your|please confirm|been added|welcome aboard/i.test(text)) return { status: 'subscribed', note: 'submitted in a browser; the page confirmed' };
    if (/invalid|error|required|try again|something went wrong/i.test(text.slice(0, 20000)) && text.length - before < 400) return { status: 'failed', note: 'the form reported a problem' };
    return { status: 'subscribed', note: 'submitted in a browser; no confirmation text shown' };
  } catch (err) {
    return { status: 'failed', note: `browser: ${String(err?.message || err).slice(0, 90)}` };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// Pages other than the home page where firms tend to put the newsletter form.
const FORM_PATHS = ['/subscribe', '/newsletter', '/contact', '/contact-us', '/news', '/insights', '/connect', '/stay-connected'];
const FORM_LINK = /subscribe|newsletter|sign[- ]?up|mailing list|email (alerts|updates)|stay (connected|informed|in touch)|insights|contact/i;

/** Links on a page worth checking for a sign-up form, best first, same site only. */
export function formCandidates(html, baseUrl) {
  const $ = cheerio.load(html);
  const scored = new Map();
  $('a[href]').each((_, el) => {
    let u; try { u = new URL($(el).attr('href'), baseUrl); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.href, baseUrl)) return;
    const href = u.href.split('#')[0];
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 50 || /\.(pdf|jpg|png|zip)$/i.test(u.pathname) || /unsubscribe|login|sign-?in|careers|privacy|terms/i.test(href)) return;
    let score = 0;
    if (/subscribe|newsletter|mailing|sign[- ]?up/i.test(text)) score += 3;
    if (/subscribe|newsletter|signup|sign-up|mailing/i.test(u.pathname)) score += 3;
    if (!score && FORM_LINK.test(text)) score += 1;
    if (score && (scored.get(href) ?? 0) < score) scored.set(href, score);
  });
  let origin; try { origin = new URL(baseUrl).origin; } catch { return []; }
  for (const p of FORM_PATHS) if (!scored.has(origin + p) && !scored.has(`${origin}${p}/`)) scored.set(origin + p, 0.5);
  return [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([u]) => u).slice(0, 5);
}

/** Look past the home page for a mailing-list form. Returns { page, provider } or null. */
export async function findSignup(firm) {
  const home = await get(firm.website_url);
  if (!home.ok) return null;
  const onHome = scanHome(home.body, home.url).signup;
  if (onHome?.action || onHome?.provider) return { page: onHome.page, provider: onHome.provider ?? null };
  for (const url of formCandidates(home.body, home.url)) {
    if (!(await allowed(url))) continue;
    const res = await get(url);
    if (!res.ok || !sameSite(res.url, home.url)) continue;
    const found = scanHome(res.body, res.url).signup;
    // A bare "subscribe" link is not a form; keep looking for the page that has one.
    if (found && (found.action || found.provider) && planSignup(res.body, res.url).kind !== 'skip') return { page: res.url, provider: found.provider ?? null };
  }
  return null;
}

async function main() {
  let { firms, signup_tracking } = await api('firms');
  if (!signup_tracking && !flag('dry')) {
    // Without the status columns a failed sign-up would be retried on every run.
    console.log('Mailing lists: migration 20261124060000_signup_status.sql is not applied yet; nothing sent. Run with --dry to preview.');
    return;
  }
  // Stage one: find forms at firms that have none on file. Each firm is searched once.
  const findN = Number(opt('find', 0));
  if (findN > 0) {
    const rank0 = { sponsor: 0, advisor: 1, lender: 2, trade: 3 };
    const todo = firms.filter((f) => !f.signup_page && !f.signup_status && f.website_url && !/\/lmm-sweep$/.test(f.website_url) && (!opt('kind') || f.source_kind === opt('kind')))
      .sort((a, b) => (rank0[a.source_kind] ?? 9) - (rank0[b.source_kind] ?? 9) || (a.watch_tier ?? 9) - (b.watch_tier ?? 9)).slice(0, findN);
    const found = [];
    await pool(todo, 6, async (firm) => {
      const hit = await findSignup(firm).catch(() => null);
      found.push({ id: firm.id, name: firm.name, signup_page: hit?.page ?? null, signup_provider: hit?.provider ?? null });
      if (hit) { firm.signup_page = hit.page; firm.signup_provider = hit.provider; }
    });
    const hits = found.filter((f) => f.signup_page);
    console.log(`Form search: ${todo.length} firms checked, ${hits.length} sign-up forms found.`);
    for (const h of hits.slice(0, 40)) console.log(`  ${h.name}: ${h.signup_page}`);
    if (!flag('dry')) for (const part of chunk(found, 50)) await api('signup_found', { firms: part.map(({ id, signup_page, signup_provider }) => ({ id, signup_page, signup_provider })) });
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Sign-up form search\n${todo.length} firms checked, **${hits.length} forms found**.\n\n${hits.map((h) => `- [${h.name}](${h.signup_page})`).join('\n')}\n\n`);
    // Firms searched with nothing found are marked so they are not searched again; they are not sign-up candidates below.
    for (const f of found) if (!f.signup_page) { const firm = firms.find((x) => x.id === f.id); if (firm) firm.signup_status = 'no_form'; }
  }

  // With --browser, forms that earlier runs set aside as script-built get their one browser attempt.
  firms = firms.filter((f) => f.signup_page && !f.subscribed_at && (flag('retry') || !f.signup_status || (flag('browser') && f.signup_status === 'needs_browser')) && (!opt('kind') || f.source_kind === opt('kind')));
  // Sponsors first, then advisors, lenders and trade press; best tiers first.
  const rank = { sponsor: 0, advisor: 1, lender: 2, trade: 3 };
  firms.sort((a, b) => (rank[a.source_kind] ?? 9) - (rank[b.source_kind] ?? 9) || (a.watch_tier ?? 9) - (b.watch_tier ?? 9));
  firms = firms.slice(0, Number(opt('limit', 40)));
  const results = [];

  await pool(firms, 4, async (firm) => {
    const done = (status, note) => results.push({ id: firm.id, name: firm.name, page: firm.signup_page, status, note });
    if (!(await allowed(firm.signup_page))) return done('skipped', 'robots.txt disallows the page');
    const page = await get(firm.signup_page);
    if (!page.ok) return done('failed', `page unreadable (HTTP ${page.status})`);
    const plan = planSignup(page.body, page.url);
    if (plan.kind === 'skip') {
      const scripted = /script|no sign-up form recognised/.test(plan.reason);
      if (scripted && flag('browser') && !flag('dry') && !CAPTCHA.test(page.body)) {
        const r = await submitInBrowser(page.url);
        // "browser:" in the note marks the attempt as made, so the firm is not tried this way twice.
        return done(r.status, r.status === 'subscribed' ? r.note : `browser: ${r.note}`);
      }
      return done(plan.reason === 'captcha' ? 'captcha' : scripted ? 'needs_browser' : 'skipped', plan.reason);
    }
    if (plan.kind === 'form' && !(await allowed(plan.url))) return done('skipped', 'robots.txt disallows the form address');
    if (flag('dry')) return done('dry', plan.kind === 'hubspot' ? `HubSpot form ${plan.formId}` : `${plan.method.toUpperCase()} ${plan.url} (${plan.fields.length} fields)`);
    await sleep(500);
    const r = await submit(plan, page.url);
    done(r.ok ? 'subscribed' : 'failed', r.note);
  });

  await closeBrowser();
  const tally = results.reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
  console.log(`Mailing lists: ${firms.length} firms tried. ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing to do'}.`);
  for (const r of results) console.log(`  [${r.status}] ${r.name}: ${r.note}`);
  if (!flag('dry')) for (const part of chunk(results, 50)) await api('subscribed', { firms: part.map(({ id, status, note }) => ({ id, status, note })) });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## Mailing-list sign-ups', `As ${IDENTITY.email}. ${Object.entries(tally).map(([k, v]) => `**${v}** ${k.replace('_', ' ')}`).join(' · ')}`, '', '| Firm | Result | Note |', '|---|---|---|', ...results.map((r) => `| [${r.name}](${r.page}) | ${r.status} | ${r.note} |`)];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
