import type { CreditBracket, KiaBracket, RuleSet, TaxBracket } from '../rules.ts';
import { rulesFor } from '../rules.ts';
import { categoryFor } from './categories.ts';
import { businessCost, deductibleCost, depreciate, type Depreciation } from './costs.ts';
import { yearOf } from './dates.ts';
import { type Cents, percentOf, roundCents, sum, toCents } from './money.ts';
import type { Business, Expense, Invoice, TaxYear } from './types.ts';

export function kiaFor(investedCents: Cents, brackets: KiaBracket[]): Cents {
  const bracket = brackets.find((b) => b.to === null || investedCents <= toCents(b.to));
  if (!bracket || bracket.kind === 'none') return 0;
  if (bracket.kind === 'percent') return percentOf(investedCents, bracket.percent ?? 0);
  if (bracket.kind === 'fixed') return toCents(bracket.amount ?? 0);
  const over = investedCents - toCents(bracket.over ?? 0);
  return Math.max(0, roundCents(toCents(bracket.amount ?? 0) - (over * (bracket.percent ?? 0)) / 100));
}

export type YearReport = {
  year: number;
  rules_status: RuleSet['status'];
  omzet_cents: Cents;
  kosten: { category: string; label: string; cost_cents: Cents; deductible_cents: Cents }[];
  kosten_cents: Cents;
  aftrekbare_kosten_cents: Cents;
  afschrijvingen: Depreciation[];
  afschrijving_cents: Cents;
  winst_cents: Cents;
  investeringen_cents: Cents;
  kia_cents: Cents;
  zelfstandigenaftrek_cents: Cents;
  startersaftrek_cents: Cents;
  mkb_winstvrijstelling_cents: Cents;
  belastbare_winst_cents: Cents;
  prive_betaald_cents: Cents;
  kor_omzet_cents: Cents | null;
  notes: string[];
};

/**
 * From documents to taxable profit (belastbare winst uit onderneming):
 * omzet − aftrekbare kosten − afschrijving = winst; then investeringsaftrek,
 * ondernemersaftrek and the MKB-winstvrijstelling, in that order.
 */
export function computeYear(input: {
  year: number;
  business: Business;
  taxYear: TaxYear;
  invoices: Invoice[];
  expenses: Expense[];
}): YearReport {
  const { year, business, taxYear } = input;
  const rules = rulesFor(year);
  const r = rules.rules;
  const notes: string[] = [];

  const invoices = input.invoices.filter((i) => i.status === 'final' && yearOf(i.issue_date) === year);
  const omzet = sum(invoices.map((i) => i.net_cents));

  const live = input.expenses.filter((e) => !e.voided_at);
  const byCategory = new Map<string, { cost: Cents; deductible: Cents }>();
  let privatePaid = 0;
  for (const expense of live) {
    if (yearOf(expense.date) !== year) continue;
    if (expense.paid_from === 'private' && expense.kind !== 'mileage') privatePaid += expense.total_cents;
    if (expense.kind === 'investment') continue;
    const cost = businessCost(expense, business, rules);
    const key = expense.kind === 'mileage' ? 'kilometers' : expense.category;
    const entry = byCategory.get(key) ?? { cost: 0, deductible: 0 };
    entry.cost += cost;
    entry.deductible += expense.kind === 'mileage' ? cost : deductibleCost(expense, cost, rules);
    byCategory.set(key, entry);
  }
  const kosten = [...byCategory].map(([category, entry]) => ({
    category,
    label: category === 'kilometers' ? 'Zakelijke kilometers met eigen auto' : categoryFor(category).label,
    cost_cents: entry.cost,
    deductible_cents: entry.deductible,
  }));

  const assets = live.filter((e) => e.kind === 'investment' && yearOf(e.date) <= year);
  const afschrijvingen = assets
    // An asset keeps the cost basis of its purchase year, whatever the rules are now.
    .map((asset) => depreciate(asset, businessCost(asset, business, rulesFor(yearOf(asset.date))), year, rules))
    .filter((d) => d.this_year_cents !== 0 || d.book_value_end_cents !== 0);
  const afschrijving = sum(afschrijvingen.map((d) => d.this_year_cents));
  const investeringen = sum(
    assets.filter((a) => yearOf(a.date) === year).map((a) => businessCost(a, business, rules)),
  );

  const aftrekbaar = sum(kosten.map((k) => k.deductible_cents));
  const winst = omzet - aftrekbaar - afschrijving;
  const kia = kiaFor(investeringen, r.kia.value);
  const winstNaInvesteringsaftrek = winst - kia;

  let zelfstandigenaftrek = 0;
  let startersaftrek = 0;
  if (taxYear.hours_criterion) {
    zelfstandigenaftrek = toCents(r.zelfstandigenaftrek.value);
    if (taxYear.starter) {
      startersaftrek = toCents(r.startersaftrek.value);
    } else if (zelfstandigenaftrek > Math.max(0, winstNaInvesteringsaftrek)) {
      // Without startersaftrek the deduction cannot exceed the profit; the rest carries forward.
      notes.push('De zelfstandigenaftrek is begrensd op de winst. Het niet-gebruikte deel kun je later verrekenen; Bookiz houdt dat nog niet bij.');
      zelfstandigenaftrek = Math.max(0, winstNaInvesteringsaftrek);
    }
  } else {
    notes.push(`Geen zelfstandigenaftrek: het urencriterium (${r.urencriterium.value} uur) is voor ${year} niet als gehaald opgegeven.`);
  }
  const naOndernemersaftrek = winstNaInvesteringsaftrek - zelfstandigenaftrek - startersaftrek;
  const mkb = percentOf(naOndernemersaftrek, r.mkb_winstvrijstelling.value);

  const kor =
    business.kor_since !== null &&
    yearOf(business.kor_since) <= year &&
    (business.kor_until === null || yearOf(business.kor_until) >= year);
  if (kor && omzet > toCents(r.kor_omzetgrens.value)) {
    notes.push(`De omzet is hoger dan de KOR-grens van € ${r.kor_omzetgrens.value}. De KOR vervalt vanaf de factuur waarmee je de grens overschrijdt.`);
  }
  if (rules.status === 'voorlopig') notes.push(`De regels voor ${year} zijn nog niet allemaal definitief gepubliceerd.`);

  return {
    year,
    rules_status: rules.status,
    omzet_cents: omzet,
    kosten,
    kosten_cents: sum(kosten.map((k) => k.cost_cents)),
    aftrekbare_kosten_cents: aftrekbaar,
    afschrijvingen,
    afschrijving_cents: afschrijving,
    winst_cents: winst,
    investeringen_cents: investeringen,
    kia_cents: kia,
    zelfstandigenaftrek_cents: zelfstandigenaftrek,
    startersaftrek_cents: startersaftrek,
    mkb_winstvrijstelling_cents: mkb,
    belastbare_winst_cents: naOndernemersaftrek - mkb,
    prive_betaald_cents: privatePaid,
    kor_omzet_cents: kor ? omzet : null,
    notes,
  };
}

function bracketTax(income: Cents, brackets: TaxBracket[]): Cents {
  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const upper = bracket.to === null ? Infinity : toCents(bracket.to);
    if (income > lower) tax += ((Math.min(income, upper) - lower) * bracket.rate) / 100;
    lower = upper;
  }
  return roundCents(tax);
}

function credit(income: Cents, brackets: CreditBracket[]): Cents {
  const euros = income / 100;
  const bracket = brackets.find((b) => euros > b.from && (b.to === null || euros <= b.to)) ?? brackets[0];
  if (!bracket) return 0;
  return Math.max(0, roundCents(toCents(bracket.base) + ((income - toCents(bracket.from)) * bracket.rate) / 100));
}

export type TaxEstimate = {
  year: number;
  extra_inkomstenbelasting_cents: Cents;
  zvw_cents: Cents;
  reserveren_cents: Cents;
  pct_van_winst: number;
  assumptions: string[];
};

/**
 * How much to set aside: box 1 tax and Zvw with the business, minus the tax on
 * the wage alone. An indication, not an assessment: it knows nothing about a
 * partner, a mortgage, box 3 or allowances.
 */
export function estimateTax(report: YearReport, wageCents: Cents): TaxEstimate | null {
  const r = rulesFor(report.year).rules;
  if (!r.ib_box1 || !r.algemene_heffingskorting || !r.arbeidskorting || !r.zvw_pct || !r.zvw_max_inkomen) return null;
  const box1 = r.ib_box1.value;
  const ahk = r.algemene_heffingskorting.value;
  const ak = r.arbeidskorting.value;

  const taxOn = (taxable: Cents, labourIncome: Cents) =>
    Math.max(0, bracketTax(Math.max(0, taxable), box1) - credit(Math.max(0, taxable), ahk) - credit(Math.max(0, labourIncome), ak));

  // Arbeidskorting looks at profit before ondernemersaftrek and MKB-winstvrijstelling.
  const labourProfit = Math.max(0, report.winst_cents - report.kia_cents);
  const wageOnly = taxOn(wageCents, wageCents);

  // In the top bracket ondernemersaftrek and MKB-winstvrijstelling are worth less than the top rate.
  // Measured on the real profit: with a loss there is no deduction to cap.
  const profit = report.winst_cents - report.kia_cents;
  const deductions = Math.max(0, profit - report.belastbare_winst_cents);
  const topFrom = toCents(box1.at(-2)?.to ?? 0);
  const inTopBracket = Math.max(0, Math.min(deductions, wageCents + profit - topFrom));
  const adjustment = r.ib_tariefsaanpassing ? percentOf(inTopBracket, r.ib_tariefsaanpassing.value) : 0;
  const withBusiness = taxOn(wageCents + report.belastbare_winst_cents, wageCents + labourProfit) + adjustment;

  const zvwBase = Math.max(0, Math.min(report.belastbare_winst_cents, toCents(r.zvw_max_inkomen.value) - wageCents));
  const zvw = percentOf(zvwBase, r.zvw_pct.value);
  const extra = withBusiness - wageOnly;
  const reserve = extra + zvw;

  return {
    year: report.year,
    extra_inkomstenbelasting_cents: extra,
    zvw_cents: zvw,
    reserveren_cents: reserve,
    pct_van_winst: report.winst_cents > 0 ? Math.round((reserve / report.winst_cents) * 1000) / 10 : 0,
    assumptions: [
      'Alleen box 1, algemene heffingskorting, arbeidskorting en de Zvw-bijdrage; onder de AOW-leeftijd.',
      'Geen fiscale partner, eigen woning, box 3, toeslagen of andere aftrekposten meegerekend.',
      wageCents > 0 ? 'Loon uit dienstbetrekking zoals door jou opgegeven.' : 'Geen ander inkomen opgegeven.',
    ],
  };
}
