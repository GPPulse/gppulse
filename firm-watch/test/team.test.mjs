import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { titleRank, normTitle, personName, personKey, looksLikeTitle, extractTeam, diffTeam, describe } from '../src/team.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const team = (...rows) => rows.map(([name, title]) => ({ name, title }));

test('titles rank on one ladder, most specific wording first', () => {
  const order = ['Analyst', 'Senior Analyst', 'Associate', 'Senior Associate', 'Vice President', 'Senior Vice President', 'Principal', 'Managing Director', 'Partner', 'Managing Partner'];
  const ranks = order.map(titleRank);
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
  assert.equal(new Set(ranks).size, ranks.length);
  assert.equal(titleRank('Vice President'), 30, 'not read as President');
  assert.equal(titleRank('VP, Business Development'), 30);
  assert.equal(titleRank('Sr. Associate'), 25);
  assert.equal(titleRank('Associate Director'), 32, 'not read as Associate or Director');
  assert.equal(titleRank('Principal'), titleRank('Director'), 'same rung at different firms');
  assert.equal(titleRank('Partner & Chief Compliance Officer'), 55, 'highest rung in a double title');
  assert.equal(titleRank('Co-Founder and Managing Partner'), 60);
  assert.equal(titleRank('Operating Partner'), null, 'off the ladder');
  assert.equal(titleRank('Senior Advisor'), null);
  assert.equal(titleRank('Office Manager'), null);
  assert.equal(titleRank('Former CFO, The Boeing Company'), null, 'a biography line, not a job here');
  assert.equal(titleRank('MD'), null, 'a physician on a healthcare board as often as a managing director');
  assert.equal(normTitle('SVP & Head of Capital Markets'), 'senior vice president and head of capital markets');
});

test('person names are told apart from everything else on a team page', () => {
  for (const n of ['Jane Doe', 'John A. Roe', "Samuel O'Neil Jr.", 'Mary-Kate van der Berg', 'J. Michael Smith III', 'Robert "Bob" Jones', 'Linda Park', 'Virginia West', 'Wayne Collins']) assert.ok(personName(n), n);
  assert.equal(personName('John A. Roe, CFA'), 'John A. Roe');
  assert.equal(personName('MARIA DE LA CRUZ'), 'Maria De La Cruz');
  for (const n of ['Our Team', 'Managing Director', 'New York', 'Read Bio', 'Huron Capital Partners', 'Investment Team', 'jane@firm.com', 'Chicago', 'Portfolio Operations', 'Since 2004', 'Vice President', 'Palm Beach', 'Case Studies']) assert.equal(personName(n), null, n);
  assert.equal(personKey('John A. Roe, CFA'.replace(', CFA', '')), personKey('John Roe'));
  assert.equal(personKey('Robert "Bob" Jones Jr.'), 'robert jones');
  assert.ok(looksLikeTitle('Chief Financial Officer & Chief Compliance Officer'));
  assert.ok(!looksLikeTitle('Jane joined the firm in 2014 as an associate.'));
  assert.ok(!looksLikeTitle('Meet our partners'));
  assert.ok(!looksLikeTitle('Your Partner for Unlocking'));
  for (const t of ['General Counsel', 'Fund Accountant', 'Office Manager', 'Talent Partner']) { assert.ok(looksLikeTitle(t), t); assert.equal(personName(t), null, t); }
  assert.ok(!looksLikeTitle('Jeff Rice, MD'));
  for (const n of ['Former EVP', 'Northwestern University', 'National Defense Industrial Association', 'Independent Sponsors']) assert.equal(personName(n), null, n);
});

test('card layout: one person per card, title on the next line', () => {
  const people = extractTeam(fx('team-cards.html'));
  assert.deepEqual(people, team(
    ['Jane Doe', 'Managing Partner'], ['John A. Roe', 'Partner'], ['Maria De La Cruz', 'Principal'], ["Samuel O'Neil Jr.", 'Vice President'],
    ['Priya Nair', 'Senior Associate'], ['Tom Becker', 'Associate'], ['Linda Park', 'Chief Financial Officer & Chief Compliance Officer'], ['Greg Holt', 'Operating Partner'],
  ));
});

test('inline layouts: comma, dash, line break and adjacent spans', () => {
  assert.deepEqual(extractTeam(fx('team-inline.html')), team(['Jane Doe', 'Partner'], ['John Roe', 'Managing Director'], ['Priya Nair', 'Vice President'], ['Tom Becker', 'Associate']));
});

test('names under "Managing Directors" headings take the heading as their title; portfolio names do not', () => {
  assert.deepEqual(extractTeam(fx('team-headings.html')), team(['Jane Doe', 'Managing Director'], ['John Roe', 'Managing Director'], ['Maria Cruz', 'Principal'], ['Priya Nair', 'Vice President'], ['Tom Becker', 'Vice President']));
});

test('titles printed above names are paired the right way round', () => {
  const html = '<main>' + [['Partner', 'Jane Doe'], ['Principal', 'John Roe'], ['Vice President', 'Priya Nair'], ['Associate', 'Tom Becker']].map(([t, n]) => `<div><small class="t">${t}</small><h3>${n}</h3></div>`).join('') + '</main>';
  assert.deepEqual(extractTeam(html), team(['Jane Doe', 'Partner'], ['John Roe', 'Principal'], ['Priya Nair', 'Vice President'], ['Tom Becker', 'Associate']));
});

const BASE = team(['Jane Doe', 'Managing Partner'], ['John Roe', 'Partner'], ['Maria Cruz', 'Principal'], ['Sam Lee', 'Vice President'], ['Priya Nair', 'Senior Associate'], ['Tom Becker', 'Associate'], ['Ann Wu', 'Analyst'], ['Greg Holt', 'Operating Partner']);
const swap = (name, title) => BASE.map((p) => (p.name === name ? { name, title } : p));

test('first sight of a page is a baseline, and an unchanged page reports nothing', () => {
  assert.equal(diffTeam(null, BASE).reason, 'baseline');
  assert.deepEqual(diffTeam(null, BASE).moves, []);
  assert.equal(diffTeam(BASE, BASE.map((p) => ({ ...p }))).reason, 'unchanged');
  assert.equal(diffTeam(BASE, swap('Sam Lee', 'VP')).reason, 'unchanged', 'VP and Vice President are the same title');
});

test('a title that moves up the ladder is a promotion', () => {
  const d = diffTeam(BASE, swap('Maria Cruz', 'Partner'));
  assert.equal(d.moves.length, 1);
  assert.deepEqual({ ...d.moves[0] }, { move_type: 'promotion', person: 'Maria Cruz', person_key: 'maria cruz', old_title: 'Principal', new_title: 'Partner', old_rank: 40, new_rank: 55 });
  assert.equal(describe(d.moves[0], { name: 'Harbor Point Capital' }), 'Maria Cruz: Principal → Partner at Harbor Point Capital');
});

test('the same person is matched when the page adds a middle initial or credential', () => {
  const d = diffTeam(BASE, BASE.map((p) => (p.name === 'Sam Lee' ? { name: 'Sam T. Lee', title: 'Principal' } : p)));
  assert.deepEqual(d.moves.map((m) => [m.move_type, m.person]), [['promotion', 'Sam T. Lee']]);
});

test('sideways and off-ladder changes are recorded but are not promotions', () => {
  assert.equal(diffTeam(BASE, swap('Maria Cruz', 'Director')).moves[0].move_type, 'title_change');
  assert.equal(diffTeam(BASE, swap('John Roe', 'Senior Advisor')).moves[0].move_type, 'title_change');
  assert.equal(diffTeam(BASE, swap('Greg Holt', 'Partner')).moves[0].move_type, 'title_change', 'operating partner has no rung to rise from');
});

test('arrivals and departures', () => {
  const d = diffTeam(BASE, [...BASE.filter((p) => p.name !== 'John Roe'), { name: 'Dana Fox', title: 'Managing Director' }]);
  assert.deepEqual(d.moves.map((m) => [m.move_type, m.person, m.new_rank ?? m.old_rank]), [['hire', 'Dana Fox', 50], ['departure', 'John Roe', 55]]);
});

test('a year-end batch of promotions is reported, a reshuffled page is not', () => {
  const batch = BASE.map((p) => ({ ...p, title: { 'Maria Cruz': 'Partner', 'Sam Lee': 'Principal', 'Priya Nair': 'Vice President', 'Tom Becker': 'Senior Associate' }[p.name] ?? p.title }));
  assert.equal(diffTeam(BASE, batch).moves.filter((m) => m.move_type === 'promotion').length, 4);
  const strangers = team(['A One', 'Partner'], ['B Two', 'Partner'], ['C Three', 'Principal'], ['D Four', 'Associate'], ['E Five', 'Analyst'], ['F Six', 'Analyst']);
  assert.equal(diffTeam(BASE, strangers).reason, 'large change; treated as a redesign');
  assert.deepEqual(diffTeam(BASE, strangers).moves, []);
  // Every title shifted down one card: a parsing slip, not eight changes of job.
  const shifted = BASE.map((p, i) => ({ name: p.name, title: BASE[(i + 1) % BASE.length].title }));
  assert.deepEqual(diffTeam(BASE, shifted).moves, []);
  assert.equal(diffTeam(BASE, BASE.slice(0, 3)).reason, 'page looked incomplete; kept previous list');
  assert.deepEqual(diffTeam(BASE, BASE.slice(0, 3)).store, BASE);
});

test('advisory-board rows and shouting titles', () => {
  const html = '<main><div><h4>Jane Doe</h4><p>MANAGING PARTNER</p></div><div><h4>John Roe</h4><p>associate</p></div><div><h4>Mike Monahan</h4><p>Former EVP, COO, CFO Pitney Bowes</p></div><div><img alt=""><h4>Healthcare Bluebook</h4><p>Jeff Rice, MD</p></div><div><h4>Tom Pitera</h4><p>Operating Partner*</p></div><div><h4>Will Rabke</h4><p>General Counsel</p></div></main>';
  assert.deepEqual(extractTeam(html), team(['Jane Doe', 'Managing Partner'], ['John Roe', 'Associate'], ['Mike Monahan', 'Former EVP, COO, CFO Pitney Bowes'], ['Tom Pitera', 'Operating Partner'], ['Will Rabke', 'General Counsel']));
});

import { teamSubpages } from '../src/team.mjs';

test('team split over several pages: group and numbered pages are followed, biographies are not', () => {
  const html = `<a href="/team/investment-team">Investment Team</a><a href="/team/operations/">Operations</a><a href="/team/jane-doe">Jane Doe</a>
    <a href="/team/page/2/">2</a><a href="/team?group=associates">Associates</a><a href="/portfolio">Portfolio</a><a href="https://elsewhere.com/team/partners">Partners</a><a href="/team/">Our Team</a>`;
  const subs = teamSubpages(html, 'https://www.acme-capital.com/team/');
  assert.deepEqual(subs.sort(), [
    'https://www.acme-capital.com/team/investment-team',
    'https://www.acme-capital.com/team/operations/',
    'https://www.acme-capital.com/team/page/2/',
    'https://www.acme-capital.com/team?group=associates',
  ].sort());
});
