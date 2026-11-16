import { type RuleSet, yearly } from '../rules.ts';
import { categoryFor } from './categories.ts';
import { type IsoDate, monthsInUse, yearOf } from './dates.ts';
import { type Cents, percentOf, roundCents, toCents } from './money.ts';
import type { Business, Expense } from './types.ts';

export function korActive(business: Business, date: IsoDate): boolean {
  return business.kor_since !== null && date >= business.kor_since && (business.kor_until === null || date <= business.kor_until);
}

/** Btw the business owes itself on a purchase where the supplier charged none (verlegging). */
export function reverseChargeVat(expense: Expense, rules: RuleSet): Cents {
  if (expense.vat_treatment !== 'eu_reverse_charge' && expense.vat_treatment !== 'non_eu_reverse_charge') return 0;
  return percentOf(expense.total_cents, rules.rules.btw_tarief_hoog.value);
}

/** Btw that may be deducted as voorbelasting for this purchase. */
export function deductibleVat(expense: Expense, business: Business, rules: RuleSet): Cents {
  if (expense.kind === 'mileage' || expense.vat_treatment === 'none') return 0;
  if (korActive(business, expense.date) || !categoryFor(expense.category).vat_deductible) return 0;
  return expense.vat_treatment === 'nl' ? expense.vat_cents : reverseChargeVat(expense, rules);
}

/**
 * What the purchase costs the business: the amount paid, plus btw it had to
 * self-assess, minus btw it gets back. `rules` must be those of the expense year.
 */
export function businessCost(expense: Expense, business: Business, rules: RuleSet): Cents {
  if (expense.kind === 'mileage') return roundCents((expense.km ?? 0) * toCents(yearly(rules, 'kilometervergoeding').value));
  return expense.total_cents + reverseChargeVat(expense, rules) - deductibleVat(expense, business, rules);
}

/** The part of a cost that lowers taxable profit. */
export function deductibleCost(expense: Expense, cost: Cents, rules: RuleSet): Cents {
  return categoryFor(expense.category).limited ? percentOf(cost, yearly(rules, 'beperkt_aftrekbaar_pct').value) : cost;
}

export type Depreciation = {
  ref: string;
  description: string;
  purchased: IsoDate;
  cost_cents: Cents;
  residual_cents: Cents;
  life_years: number;
  this_year_cents: Cents;
  book_value_end_cents: Cents;
};

/**
 * Straight-line depreciation from the month of purchase, capped at the legal
 * yearly maximum (a percentage of the purchase cost) and never below residual value.
 */
export function depreciate(asset: Expense, cost: Cents, year: number, rules: RuleSet): Depreciation {
  const life = asset.useful_life_years ?? 5;
  const depreciable = Math.max(0, cost - asset.residual_cents);
  // The yearly maximum is a share of the purchase price, also for an asset brought over at book value.
  const yearly = Math.min(depreciable / life, ((asset.original_cost_cents ?? cost) * rules.rules.afschrijving_max_pct.value) / 100);
  let written = 0;
  let thisYear = 0;
  for (let y = yearOf(asset.date); y <= year; y++) {
    const amount = Math.min(roundCents((yearly * monthsInUse(asset.date, y)) / 12), depreciable - written);
    written += amount;
    if (y === year) thisYear = amount;
  }
  return {
    ref: asset.ref,
    description: asset.description ?? asset.vendor,
    purchased: asset.date,
    cost_cents: cost,
    residual_cents: asset.residual_cents,
    life_years: life,
    this_year_cents: thisYear,
    book_value_end_cents: cost - written,
  };
}
