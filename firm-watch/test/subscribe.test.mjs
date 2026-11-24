import test from 'node:test';
import assert from 'node:assert/strict';
import { planSignup, hubspotPlan, valueFor, IDENTITY } from '../src/subscribe.mjs';

const E = IDENTITY.email;

test('Mailchimp embed: fills the email and name, keeps hidden values, leaves the honeypot empty', () => {
  const html = `<div id="mc_embed_signup"><form action="https://acme.us5.list-manage.com/subscribe/post?u=abc&amp;id=123" method="post" id="mc-embedded-subscribe-form">
    <h2>Subscribe to our newsletter</h2>
    <input type="email" name="EMAIL" required><input type="text" name="FNAME"><input type="text" name="LNAME"><input type="text" name="PHONE">
    <input type="hidden" name="tags" value="42">
    <div style="position: absolute; left: -5000px;" aria-hidden="true"><input type="text" name="b_abc_123" tabindex="-1" value=""></div>
    <input type="submit" name="subscribe" value="Subscribe"></form></div>`;
  const p = planSignup(html, 'https://acme.com/');
  assert.equal(p.kind, 'form');
  assert.equal(p.method, 'post');
  assert.equal(p.url, 'https://acme.us5.list-manage.com/subscribe/post?u=abc&id=123');
  const f = Object.fromEntries(p.fields);
  assert.equal(f.EMAIL, E);
  assert.equal(f.FNAME, 'GP Pulse');
  assert.equal(f.LNAME, 'Research');
  assert.equal(f.PHONE, '', 'phone is left empty');
  assert.equal(f.tags, '42');
  assert.equal(f.b_abc_123, '', 'honeypot stays empty');
  assert.equal('subscribe' in f, false, 'the submit button is not a field');
});

test('a form behind a CAPTCHA is never submitted', () => {
  const html = `<form action="/subscribe" method="post"><label>Join our mailing list</label><input type="email" name="email"><div class="g-recaptcha" data-sitekey="x"></div></form>`;
  assert.deepEqual(planSignup(html, 'https://x.com/'), { kind: 'skip', reason: 'captcha' });
});

test('contact, login and search forms are not sign-up forms', () => {
  const contact = `<form action="/contact" method="post">Subscribe<input type="email" name="email"><textarea name="msg"></textarea></form>`;
  const login = `<form action="/login" method="post">Sign up<input type="email" name="email"><input type="password" name="p"></form>`;
  const search = `<form role="search" action="/s"><input type="email" name="email"></form>`;
  for (const h of [contact, login, search]) assert.equal(planSignup(h, 'https://x.com/').kind, 'skip');
});

test('a required field we will not answer stops the sign-up', () => {
  const html = `<form action="/subscribe" method="post">Newsletter sign up<input type="email" name="email"><input type="text" name="phone" required></form>`;
  const p = planSignup(html, 'https://x.com/');
  assert.equal(p.kind, 'skip');
  assert.match(p.reason, /phone/);
});

test('required consent boxes are ticked; optional ones are not', () => {
  const html = `<form action="/subscribe" method="post">Subscribe to our newsletter<input type="email" name="email">
    <input type="checkbox" name="consent" value="yes" required><input type="checkbox" name="partners" value="1"></form>`;
  const f = Object.fromEntries(planSignup(html, 'https://x.com/').fields);
  assert.equal(f.consent, 'yes');
  assert.equal('partners' in f, false);
});

test('HubSpot embed: portal and form ids come from the page script', () => {
  const html = `<h3>Stay informed</h3><script>hbspt.forms.create({ region: "na1", portalId: "1234567", formId: "0a1b2c3d-1111-2222-3333-444455556666" });</script>`;
  assert.deepEqual(hubspotPlan(html), { kind: 'hubspot', portalId: '1234567', formId: '0a1b2c3d-1111-2222-3333-444455556666' });
  assert.equal(planSignup(html, 'https://x.com/').kind, 'hubspot');
});

test('script-built forms with nothing to post to are left for a person', () => {
  assert.equal(planSignup('<div id="newsletter-root"></div><script src="/app.js"></script>', 'https://x.com/').kind, 'skip');
  const noAction = planSignup('<form>Subscribe<input type="email" name="email"></form>', 'https://x.com/');
  assert.deepEqual(noAction, { kind: 'skip', reason: 'script-only form' });
});

test('field values: we give a name, the publication and the address, nothing else', () => {
  assert.equal(valueFor('email your-email'), E);
  assert.equal(valueFor('FNAME First Name'), 'GP Pulse');
  assert.equal(valueFor('company'), 'The GP Pulse');
  assert.equal(valueFor('phone'), null);
  assert.equal(valueFor('zip postal'), null);
});

import { formCandidates } from '../src/subscribe.mjs';

test('form search: looks at subscribe, newsletter and contact pages on the same site, best first', () => {
  const html = `<a href="/subscribe">Subscribe</a><a href="/news/">News</a><a href="https://other.com/newsletter">Partner newsletter</a>
    <a href="/contact-us">Contact</a><a href="/careers">Careers</a><a href="/files/deck.pdf">Newsletter PDF</a><a href="/login">Sign in</a>`;
  const c = formCandidates(html, 'https://www.acme-capital.com/');
  assert.equal(c[0], 'https://www.acme-capital.com/subscribe');
  assert.ok(c.includes('https://www.acme-capital.com/contact-us'));
  assert.ok(!c.some((u) => u.includes('other.com') || u.endsWith('.pdf') || u.includes('login') || u.includes('careers')));
  assert.ok(c.length <= 5);
});
