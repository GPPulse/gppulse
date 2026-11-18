import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issuerOf, issuerOfMember, normIssuer, parseHoldings, newBorrowers } from '../src/bdc.mjs';

test('issuer name is cut from the instrument description', () => {
  assert.equal(issuerOf('Acme Industrial Holdings, LLC, First Lien Term Loan, SOFR + 6.00%, due 12/2029'), 'Acme Industrial Holdings, LLC');
  assert.equal(issuerOf('Investment, Identifier [Axis]: Brightline Pest Services, Inc. - Delayed Draw Term Loan'), 'Brightline Pest Services, Inc.');
  assert.equal(issuerOf('River City Fabrication LP, Preferred Equity (12,500 units)'), 'River City Fabrication LP');
  assert.equal(issuerOf('Total Investments'), null);
  assert.equal(issuerOf('Extrude Hone, LLC &#x2013; Term Debt'), 'Extrude Hone, LLC');
  assert.equal(issuerOf('Extrude Hone, LLC &#x2013; Preferred Stock'), 'Extrude Hone, LLC');
  assert.equal(issuerOf('Defiance Integrated Technologies, Inc.&#x2014;Term Debt'), 'Defiance Integrated Technologies, Inc.');
  assert.equal(issuerOf('AdCellerant LLC Term A Loan'), 'AdCellerant LLC');
  assert.equal(issuerOf('The Companion Brands Company LLC First Lien Secured Term Loan'), 'The Companion Brands Company LLC');
  assert.equal(issuerOf('LLC &#x2013; Term Debt'), null);
  assert.equal(issuerOfMember('main:AcmeIndustrialHoldingsLLCMember'), 'Acme Industrial Holdings LLC');
});

test('normalised issuer keys ignore legal suffixes and holdco words', () => {
  assert.equal(normIssuer('Acme Industrial Holdings, LLC'), normIssuer('Acme Industrial, Inc.'));
  assert.equal(normIssuer('Smith & Sons Buyer, LLC'), 'smith sons');
});

const ctx = (id, date, text) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001</xbrli:identifier><xbrli:segment><xbrldi:typedMember dimension="us-gaap:InvestmentIdentifierAxis"><us-gaap:InvestmentIdentifierAxis.domain>${text}</us-gaap:InvestmentIdentifierAxis.domain></xbrldi:typedMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>${date}</xbrli:instant></xbrli:period></xbrli:context>`;
const fact = (name, ref, v) => `<us-gaap:${name} contextRef="${ref}" unitRef="usd" decimals="-3">${v}</us-gaap:${name}>`;
const instance = (date, rows) => `<?xml version="1.0"?><xbrli:xbrl><dei:DocumentPeriodEndDate contextRef="d">${date}</dei:DocumentPeriodEndDate>${rows.map(([id, text, fv, spread]) => ctx(id, date, text) + fact('InvestmentOwnedAtFairValue', id, fv) + (spread ? fact('InvestmentBasisSpreadVariableRate', id, spread) : '')).join('')}${ctx('old', '2025-12-31', 'Stale Co, First Lien')}${fact('InvestmentOwnedAtFairValue', 'old', 9e6)}</xbrli:xbrl>`;

test('holdings parse sums an issuer across instruments and keeps the widest spread', () => {
  const { periodEnd, holdings } = parseHoldings(instance('2026-09-30', [
    ['a1', 'Acme Industrial Holdings, LLC, First Lien Term Loan', 10_000_000, 0.06],
    ['a2', 'Acme Industrial Holdings, LLC, Revolver', 1_000_000, 0.065],
    ['b1', 'Brightline Pest Services, Inc., Unitranche', 8_000_000, 0.0575],
  ]));
  assert.equal(periodEnd, '2026-09-30');
  assert.equal(holdings.length, 2, 'prior-period context is ignored');
  const acme = holdings.find((h) => h.issuer.startsWith('Acme'));
  assert.equal(acme.fair_value, 11_000_000);
  assert.equal(acme.spread, 6.5);
  assert.equal(acme.first_lien, true);
});

test('new borrowers are names absent last quarter, above a size floor', () => {
  const before = parseHoldings(instance('2026-06-30', [['a1', 'Acme Industrial Holdings, LLC, First Lien', 1e7]])).holdings;
  const now = parseHoldings(instance('2026-09-30', [
    ['a1', 'Acme Industrial, Inc., First Lien', 1e7],
    ['n1', 'Northgate Fire Protection, LLC, First Lien Term Loan', 12e6, 0.0625],
    ['w1', 'Tiny Warrant Co, Warrants', 50_000],
  ])).holdings;
  assert.deepEqual(newBorrowers(before, now).map((h) => h.issuer), ['Northgate Fire Protection, LLC']);
});
