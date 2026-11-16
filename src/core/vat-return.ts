import type { RuleSet } from '../rules.ts';
import { deductibleVat, korActive, reverseChargeVat } from './costs.ts';
import { inRange, periodBounds } from './dates.ts';
import { type Cents, toEuros } from './money.ts';
import type { Business, Expense, Invoice, SaleVatCode } from './types.ts';
import { invoiceTotals, lineNet } from './vat.ts';

export const RUBRIEKEN = {
  '1a': 'Leveringen/diensten belast met hoog tarief',
  '1b': 'Leveringen/diensten belast met laag tarief',
  '1e': 'Leveringen/diensten belast met 0% of niet bij u belast',
  '3b': 'Leveringen naar of diensten in landen binnen de EU',
  '4a': 'Leveringen/diensten uit landen buiten de EU',
  '4b': 'Leveringen/diensten uit landen binnen de EU',
} as const;

export type RubriekCode = keyof typeof RUBRIEKEN;

const SALE_RUBRIEK: Partial<Record<SaleVatCode, RubriekCode>> = {
  high: '1a',
  low: '1b',
  zero: '1e',
  eu_reverse_charge: '3b',
};

export type Rubriek = {
  label: string;
  /** Whole euros, as the form asks; rounded in the taxpayer's favour. */
  omzet: number;
  btw: number;
  exact: { omzet: number; btw: number };
  documents: string[];
};

export type VatReturn = {
  period: string;
  from: string;
  to: string;
  kor: boolean;
  rubrieken: Record<RubriekCode, Rubriek>;
  '5a_verschuldigde_btw': number;
  '5b_voorbelasting': number;
  /** Positive: to pay. Negative: to reclaim. The form calculates this line itself. */
  totaal_te_betalen: number;
  voorbelasting_documents: string[];
  icp: { vat_id: string | null; customer: string; amount: number }[];
  not_reported: { reason: string; amount: number; documents: string[] }[];
  warnings: string[];
};

type Bucket = { base: Cents; vat: Cents; documents: Set<string> };

/**
 * The btw-aangifte for one period on the invoice basis (factuurstelsel): sales
 * count on their invoice date, purchases in the period they were assigned to.
 */
export function computeVatReturn(input: {
  period: string;
  business: Business;
  invoices: Invoice[];
  expenses: Expense[];
  rules: RuleSet;
}): VatReturn {
  const { period, business, rules } = input;
  const { from, to } = periodBounds(period);
  const buckets = Object.fromEntries(
    Object.keys(RUBRIEKEN).map((code) => [code, { base: 0, vat: 0, documents: new Set<string>() }]),
  ) as Record<RubriekCode, Bucket>;
  const warnings: string[] = [];
  const icp = new Map<string, { vat_id: string | null; customer: string; amount: Cents }>();
  const notReported = new Map<string, { amount: Cents; documents: Set<string> }>();
  const skip = (reason: string, amount: Cents, document: string) => {
    const entry = notReported.get(reason) ?? { amount: 0, documents: new Set<string>() };
    entry.amount += amount;
    entry.documents.add(document);
    notReported.set(reason, entry);
  };

  for (const invoice of input.invoices) {
    if (invoice.status !== 'final' || !inRange(invoice.issue_date, from, to)) continue;
    const number = invoice.number as string;
    // The btw owed is what the invoices charged, cent for cent, not a recalculation of the period total.
    for (const group of invoiceTotals(invoice.lines, rules).groups) {
      const rubriek = SALE_RUBRIEK[group.vat_code];
      if (rubriek) buckets[rubriek].vat += group.vat_cents;
    }
    for (const line of invoice.lines) {
      const net = lineNet(line);
      const rubriek = SALE_RUBRIEK[line.vat_code];
      if (!rubriek) {
        const reasons: Partial<Record<SaleVatCode, string>> = {
          kor: 'Omzet onder de KOR: geen btw, niet in de aangifte',
          exempt: 'Vrijgestelde omzet: niet in de aangifte',
          outside_eu: 'Diensten aan afnemers buiten de EU: niet in de Nederlandse aangifte',
        };
        skip(reasons[line.vat_code] ?? line.vat_code, net, number);
        continue;
      }
      buckets[rubriek].base += net;
      buckets[rubriek].documents.add(number);
      if (line.vat_code === 'eu_reverse_charge') {
        const customer = invoice.contact_snapshot;
        const key = customer?.vat_id ?? `zonder-btw-id-${invoice.contact_id}`;
        const entry = icp.get(key) ?? { vat_id: customer?.vat_id ?? null, customer: customer?.name ?? '', amount: 0 };
        entry.amount += net;
        icp.set(key, entry);
        if (!customer?.vat_id) warnings.push(`Factuur ${number}: btw verlegd binnen de EU, maar de klant heeft geen btw-id.`);
      }
    }
  }

  let voorbelasting = 0;
  const voorbelastingDocuments = new Set<string>();
  for (const expense of input.expenses) {
    if (expense.voided_at || expense.vat_period !== period) continue;
    const owed = reverseChargeVat(expense, rules);
    if (owed !== 0) {
      const rubriek = expense.vat_treatment === 'eu_reverse_charge' ? '4b' : '4a';
      buckets[rubriek].base += expense.total_cents;
      buckets[rubriek].vat += owed;
      buckets[rubriek].documents.add(expense.ref);
    }
    const deductible = deductibleVat(expense, business, rules);
    if (deductible !== 0) {
      voorbelasting += deductible;
      voorbelastingDocuments.add(expense.ref);
    }
    if (!inRange(expense.date, from, to)) {
      warnings.push(`${expense.ref} is van ${expense.date} maar wordt in dit tijdvak aangegeven (later ontvangen of geboekt).`);
    }
  }

  const kor = korActive(business, to);
  if (kor && (buckets['4a'].vat !== 0 || buckets['4b'].vat !== 0)) {
    warnings.push(
      'Je gebruikt de KOR, maar hebt diensten uit het buitenland ingekocht waarbij de btw naar jou is verlegd. ' +
        'Die btw moet je wel aangeven en betalen, zonder aftrek.',
    );
  }

  const rubrieken = Object.fromEntries(
    (Object.keys(RUBRIEKEN) as RubriekCode[]).map((code) => {
      const bucket = buckets[code];
      return [
        code,
        {
          label: RUBRIEKEN[code],
          omzet: Math.floor(bucket.base / 100),
          btw: Math.floor(bucket.vat / 100),
          exact: { omzet: toEuros(bucket.base), btw: toEuros(bucket.vat) },
          documents: [...bucket.documents].sort(),
        },
      ];
    }),
  ) as Record<RubriekCode, Rubriek>;

  const verschuldigd = Object.values(rubrieken).reduce((total, rubriek) => total + rubriek.btw, 0);
  const voorbelastingEuros = Math.ceil(voorbelasting / 100);

  return {
    period,
    from,
    to,
    kor,
    rubrieken,
    '5a_verschuldigde_btw': verschuldigd,
    '5b_voorbelasting': voorbelastingEuros,
    totaal_te_betalen: verschuldigd - voorbelastingEuros,
    voorbelasting_documents: [...voorbelastingDocuments].sort(),
    icp: [...icp.values()].map((entry) => ({ ...entry, amount: toEuros(entry.amount) })),
    not_reported: [...notReported].map(([reason, entry]) => ({
      reason,
      amount: toEuros(entry.amount),
      documents: [...entry.documents].sort(),
    })),
    warnings,
  };
}
