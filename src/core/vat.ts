import { BookizError } from '../errors.ts';
import type { RuleSet } from '../rules.ts';
import { type Cents, percentOf, roundCents, sum } from './money.ts';
import type { InvoiceLine, SaleVatCode } from './types.ts';

export const SALE_VAT_LABELS: Record<SaleVatCode, string> = {
  high: 'hoog tarief',
  low: 'laag tarief',
  zero: '0%',
  exempt: 'vrijgesteld',
  eu_reverse_charge: 'btw verlegd (EU)',
  outside_eu: 'buiten de EU',
  kor: 'KOR',
};

export function saleRate(code: SaleVatCode, rules: RuleSet): number {
  if (code === 'high') return rules.rules.btw_tarief_hoog.value;
  if (code === 'low') return rules.rules.btw_tarief_laag.value;
  return 0;
}

export function lineNet(line: InvoiceLine): Cents {
  return roundCents(line.quantity * line.unit_price_cents);
}

export type VatGroup = { vat_code: SaleVatCode; rate: number; net_cents: Cents; vat_cents: Cents };

/**
 * Btw is calculated once per tariff on the invoice total, not per line, so the
 * invoice shows exactly one btw amount per rate.
 */
export function invoiceTotals(
  lines: InvoiceLine[],
  rules: RuleSet,
): { groups: VatGroup[]; net_cents: Cents; vat_cents: Cents; total_cents: Cents } {
  if (lines.length === 0) throw new BookizError('Een factuur heeft minstens één regel nodig.');
  const netByCode = new Map<SaleVatCode, Cents>();
  for (const line of lines) {
    netByCode.set(line.vat_code, (netByCode.get(line.vat_code) ?? 0) + lineNet(line));
  }
  const groups = [...netByCode].map(([vat_code, net_cents]) => {
    const rate = saleRate(vat_code, rules);
    return { vat_code, rate, net_cents, vat_cents: percentOf(net_cents, rate) };
  });
  const net_cents = sum(groups.map((group) => group.net_cents));
  const vat_cents = sum(groups.map((group) => group.vat_cents));
  return { groups, net_cents, vat_cents, total_cents: net_cents + vat_cents };
}
