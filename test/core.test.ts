import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depreciate } from '../src/core/costs.ts';
import { assertDate, periodBounds, periodFor, today } from '../src/core/dates.ts';
import { formatEur, roundCents, toCents } from '../src/core/money.ts';
import type { Expense } from '../src/core/types.ts';
import { invoiceTotals } from '../src/core/vat.ts';
import { kiaFor } from '../src/core/year.ts';
import { availableYears, rulesFor, yearly } from '../src/rules.ts';

const rules = rulesFor(2026);

test('money: euros become exact cents and reject a third decimal', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.throws(() => toCents(1.005), /twee decimalen/);
  assert.equal(roundCents(-0.5), -1);
  assert.equal(formatEur(123456), '€ 1.234,56');
  assert.equal(formatEur(-5), '-€ 0,05');
});

test('dates: periods, bounds and the Dutch calendar day', () => {
  assert.equal(periodFor('2026-11-16', 'quarter'), '2026-Q4');
  assert.equal(periodFor('2026-11-16', 'month'), '2026-11');
  assert.deepEqual(periodBounds('2026-Q1'), { from: '2026-01-01', to: '2026-03-31', kind: 'quarter' });
  assert.equal(periodBounds('2028-02').to, '2028-02-29');
  assert.throws(() => assertDate('2026-02-30'), /Ongeldige/);
  // 23:30 UTC on New Year's Eve is already 1 January in Amsterdam.
  assert.equal(today(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('every rule file parses and cites an official source', () => {
  assert.ok(availableYears().includes(2026));
  for (const year of availableYears()) {
    for (const [key, rule] of Object.entries(rulesFor(year).rules)) {
      assert.match(rule.source, /^https:\/\/([a-z]+\.)*(belastingdienst|rijksoverheid|overheid)\.nl\//, key);
    }
  }
  assert.throws(() => rulesFor(1999), /geen belastingregels voor 1999/);
});

test('invoice: one btw amount per tariff, calculated on the group total', () => {
  const totals = invoiceTotals(
    [
      { description: 'a', quantity: 3, unit_price_cents: 333, vat_code: 'high' },
      { description: 'b', quantity: 1, unit_price_cents: 1000, vat_code: 'low' },
      { description: 'c', quantity: 7.5, unit_price_cents: 8500, vat_code: 'high' },
    ],
    rules,
  );
  const high = totals.groups.find((group) => group.vat_code === 'high');
  assert.equal(high?.net_cents, 999 + 63750);
  assert.equal(high?.vat_cents, Math.round((999 + 63750) * 0.21));
  assert.equal(totals.total_cents, totals.net_cents + totals.vat_cents);
});

test('KIA 2026 follows the published table at every boundary', () => {
  const kia = (euros: number) => kiaFor(toCents(euros), yearly(rules, 'kia').value) / 100;
  assert.equal(kia(2900), 0);
  assert.equal(kia(2901), 812.28);
  assert.equal(kia(71683), 20071.24);
  assert.equal(kia(71684), 20072);
  assert.equal(kia(132746), 20072);
  assert.equal(kia(200000), 14987.6);
  assert.equal(kia(398237), 0);
});

test('depreciation: the Belastingdienst example, 3/12 of € 2.500 in the purchase year', () => {
  const machine = { ref: 'K2026-001', date: '2026-10-01', vendor: 'Machine', description: null, useful_life_years: 5, residual_cents: 0 } as Expense;
  const first = depreciate(machine, toCents(12500), 2026, rules);
  assert.equal(first.this_year_cents, toCents(625));
  assert.equal(first.book_value_end_cents, toCents(11875));
  assert.equal(depreciate(machine, toCents(12500), 2027, rules).this_year_cents, toCents(2500));
  // The last year only takes what is left, so the asset never drops below zero.
  const last = depreciate(machine, toCents(12500), 2031, rules);
  assert.equal(last.this_year_cents, toCents(1875));
  assert.equal(last.book_value_end_cents, 0);
  assert.equal(depreciate(machine, toCents(12500), 2032, rules).this_year_cents, 0);
});

test('depreciation never goes below the residual value', () => {
  const laptop = { ref: 'K2026-002', date: '2026-01-10', vendor: 'Laptop', description: null, useful_life_years: 5, residual_cents: toCents(200) } as Expense;
  const result = depreciate(laptop, toCents(1700), 2030, rules);
  assert.equal(result.this_year_cents, toCents(300));
  assert.equal(result.book_value_end_cents, toCents(200));
});
