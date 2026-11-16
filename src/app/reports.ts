import { BookizError } from '../errors.ts';
import { CATEGORIES } from '../core/categories.ts';
import { assertDate, daysBetween, periodBounds, periodFor, yearOf } from '../core/dates.ts';
import { toCents } from '../core/money.ts';
import { korActive } from '../core/costs.ts';
import type { Business } from '../core/types.ts';
import { computeVatReturn, type VatReturn } from '../core/vat-return.ts';
import { computeYear, estimateTax } from '../core/year.ts';
import { availableYears, type RuleKey, rulesFor } from '../rules.ts';
import type { Queryable } from '../db.ts';
import * as store from '../store.ts';
import { type Ctx, inEuros, nextPeriod, todayOf, vatDeadline } from './context.ts';
import { needsReceipt, present } from './expenses.ts';
import { draftDueRecurring } from './recurring.ts';
import { summarize } from './invoices.ts';

async function loadBooks(q: Queryable) {
  const business = await store.requireBusiness(q);
  const invoices = await store.listInvoices(q);
  const expenses = await store.listExpenses(q);
  const filings = await store.listFilings(q);
  return { business, invoices, expenses, filings };
}

/** A quarterly filer has no monthly returns, and the other way round. */
function checkPeriod(period: string, business: Business): { from: string; to: string } {
  const bounds = periodBounds(period);
  if (bounds.kind !== business.vat_period) {
    const example = business.vat_period === 'quarter' ? '2026-Q4' : '2026-11';
    throw new BookizError(
      `Je doet ${business.vat_period === 'quarter' ? 'per kwartaal' : 'per maand'} aangifte; "${period}" is geen tijdvak van jou.`,
      `Gebruik een tijdvak zoals ${example}.`,
    );
  }
  return bounds;
}

/** Nothing owed, nothing to reclaim, nothing to report. */
function isEmpty(result: VatReturn): boolean {
  return (
    result['5a_verschuldigde_btw'] === 0 &&
    result['5b_voorbelasting'] === 0 &&
    Object.values(result.rubrieken).every((rubriek) => rubriek.omzet === 0 && rubriek.btw === 0)
  );
}

type Books = Awaited<ReturnType<typeof loadBooks>>;

function returnFor(period: string, books: Books): VatReturn {
  const filing = books.filings.find((candidate) => candidate.period === period);
  // A filed period shows what was filed, whatever has been recorded or reconfigured since.
  if (filing) return filing.figures as unknown as VatReturn;
  return computeVatReturn({ ...books, period, rules: rulesFor(yearOf(periodBounds(period).to)) });
}

/**
 * Ended periods, from the first document on, that still need a return. Under
 * the KOR a period only counts when there is something to report after all.
 */
function duePeriods(books: Books, todayDate: string): string[] {
  const { business, invoices, expenses, filings } = books;
  // What was taken over from another package was declared there; only our own documents open a period.
  const dates = business.books_start
    ? [business.books_start]
    : [...invoices.filter((i) => i.status === 'final' && !i.imported).map((i) => i.issue_date), ...expenses.filter((e) => !e.imported).map((e) => e.date)];
  if (dates.length === 0) return [];
  const filed = new Set(filings.map((filing) => filing.period));
  const years = availableYears();
  const due: string[] = [];
  let period = periodFor(dates.sort()[0] as string, business.vat_period);
  while (periodBounds(period).to < todayDate) {
    const { from, to } = periodBounds(period);
    const exempt =
      korActive(business, from) && korActive(business, to) && (!years.includes(yearOf(to)) || isEmpty(returnFor(period, books)));
    if (!filed.has(period) && !exempt) due.push(period);
    period = nextPeriod(period);
  }
  return due;
}

export async function vatReturn(ctx: Ctx, input: { period?: string | undefined }) {
  const books = await loadBooks(ctx.db);
  const todayDate = todayOf(ctx);
  const period = input.period ?? duePeriods(books, todayDate)[0] ?? periodFor(todayDate, books.business.vat_period);
  const { from, to } = checkPeriod(period, books.business);
  const start = books.business.books_start;
  if (start && to < start) {
    throw new BookizError(
      `Het tijdvak ${period} ligt vóór ${start}, de dag waarop je naar Bookiz bent overgestapt.`,
      'Die aangifte doe je op basis van je oude pakket.',
    );
  }
  const filing = books.filings.find((candidate) => candidate.period === period);
  const result = returnFor(period, books);
  if (start && start > from && !filing) {
    result.warnings.push(
      `Je bent op ${start} overgestapt, midden in dit tijdvak. Deze cijfers dekken alleen de periode vanaf die dag: ` +
        'tel de cijfers van je oude pakket over het eerste deel van het tijdvak erbij voordat je aangifte doet.',
    );
  }
  const deadline = vatDeadline(period);
  const how = filing
    ? 'Deze aangifte is gedaan; dit zijn de vastgelegde cijfers.'
    : result.kor && isEmpty(result)
      ? 'Je gebruikt de KOR en er is niets aan te geven: je doet geen btw-aangifte over dit tijdvak.'
      : result.kor
        ? 'Je gebruikt de KOR, maar in dit tijdvak is er toch btw aan te geven (bijvoorbeeld btw die naar jou is verlegd, of een ' +
          'correctie op een factuur van vóór de KOR). Vraag na afloop van het kwartaal schriftelijk een incidentele aangifte aan ' +
          'bij je belastingkantoor en neem de rubrieken over. Verlegde btw mag je onder de KOR niet aftrekken.'
        : to >= todayDate
          ? `Dit tijdvak loopt nog tot en met ${to}; de cijfers zijn een tussenstand.`
          : 'Log in op Mijn Belastingdienst Zakelijk, open de aangifte omzetbelasting voor dit tijdvak en neem de rubrieken over. ' +
            'Bookiz dient niet zelf in. Roep daarna mark_vat_return_filed aan.';
  return {
    ...result,
    status: filing ? `aangegeven op ${filing.filed_on}` : to >= todayDate ? 'tijdvak loopt nog' : 'nog aangeven',
    deadline_aangifte_en_betaling: deadline,
    days_until_deadline: filing ? null : daysBetween(todayDate, deadline),
    how_to_file: how,
  };
}

export async function markVatReturnFiled(ctx: Ctx, input: { period: string; filed_on?: string | undefined }) {
  const todayDate = todayOf(ctx);
  const filedOn = assertDate(input.filed_on ?? todayDate, 'datum van aangifte');
  // One transaction behind the business lock: nothing can be booked into the
  // period between calculating the figures and freezing them.
  const figures = await ctx.db.transaction(async (tx) => {
    await store.lockBusiness(tx);
    const books = await loadBooks(tx);
    const { to } = checkPeriod(input.period, books.business);
    if (to >= todayDate) throw new BookizError(`Het tijdvak ${input.period} is nog niet afgelopen.`);
    if (books.filings.some((filing) => filing.period === input.period)) {
      throw new BookizError(`De aangifte over ${input.period} staat al als gedaan geregistreerd.`);
    }
    const computed = returnFor(input.period, books);
    await store.saveFiling(tx, {
      period: input.period,
      filed_on: filedOn,
      figures: computed as unknown as Record<string, unknown>,
      payable_euros: computed.totaal_te_betalen,
    });
    return computed;
  });
  return {
    period: input.period,
    filed_on: filedOn,
    totaal_te_betalen: figures.totaal_te_betalen,
    note:
      `Het tijdvak is afgesloten: de cijfers zijn vastgelegd en documenten in ${input.period} kunnen niet meer wijzigen. ` +
      (figures.totaal_te_betalen > 0
        ? `Betaal € ${figures.totaal_te_betalen} uiterlijk ${vatDeadline(input.period)}; aangeven en betalen zijn twee aparte stappen.`
        : 'Er is niets te betalen.'),
  };
}

export async function overview(ctx: Ctx) {
  const business = await store.getBusiness(ctx.db);
  const todayDate = todayOf(ctx);
  if (!business) {
    return {
      today: todayDate,
      setup: 'nog niet ingericht',
      next_actions: [
        'Vraag de gebruiker naar bedrijfsnaam, adres, KvK-nummer, btw-id en IBAN, en of de KOR van toepassing is. Roep dan setup_business aan.',
      ],
    };
  }
  const year = yearOf(todayDate);
  const actions: string[] = [];
  const due = ctx.locked || !availableYears().includes(year) ? [] : await draftDueRecurring(ctx);
  for (const draft of due) {
    actions.push(`Periodieke factuur voor ${draft.customer} (periode vanaf ${draft.for_date}) staat klaar als concept ${draft.draft_id}: laat controleren en maak definitief.`);
  }
  const books = await loadBooks(ctx.db);
  const { invoices, expenses } = books;
  // Without rules for the running year the past can still be shown and filed.
  const rules = availableYears().includes(year) ? rulesFor(year) : null;
  if (!rules) {
    actions.push(
      `De belastingregels voor ${year} ontbreken (rules/nl-${year}.json). Werk Bookiz bij; tot die tijd kun je niets in ${year} boeken, ` +
        'maar eerdere tijdvakken wel bekijken en afsluiten.',
    );
  }

  const missing = (['address_line', 'postal_code', 'city', 'kvk_number', 'iban'] as const).filter((f) => !business[f]);
  if (missing.length > 0) actions.push(`Bedrijfsgegevens aanvullen voordat je kunt factureren: ${missing.join(', ')}.`);

  const overdue = duePeriods(books, todayDate).map((period) => ({
    period,
    deadline: vatDeadline(period),
    days_until_deadline: daysBetween(todayDate, vatDeadline(period)),
  }));
  const kor = korActive(business, todayDate);
  for (const item of overdue) {
    actions.push(
      item.days_until_deadline < 0
        ? `Btw-aangifte ${item.period} is te laat (deadline was ${item.deadline}).`
        : `Btw-aangifte ${item.period} doen en betalen vóór ${item.deadline} (nog ${item.days_until_deadline} dagen).`,
    );
  }

  const currentPeriod = periodFor(todayDate, business.vat_period);
  const current = rules ? computeVatReturn({ period: currentPeriod, business, invoices, expenses, rules }) : null;

  const unpaid = invoices
    .filter((invoice) => invoice.status === 'final' && !invoice.paid_on)
    .map((invoice) => summarize(invoice, todayDate));
  const late = unpaid.filter((invoice) => invoice.status === 'te laat');
  if (late.length > 0) actions.push(`${late.length} factuur/facturen over de vervaldatum: ${late.map((i) => i.number).join(', ')}.`);
  const drafts = invoices.filter((invoice) => invoice.status === 'draft');
  if (drafts.length > 0) actions.push(`${drafts.length} conceptfactuur/-facturen wachten op akkoord.`);

  const withoutReceipt = expenses.filter(needsReceipt);
  if (withoutReceipt.length > 0) {
    actions.push(`${withoutReceipt.length} uitgave(n) zonder bewijsstuk: ${withoutReceipt.slice(0, 10).map((e) => e.ref).join(', ')}.`);
  }

  const taxYear = await store.getTaxYear(ctx.db, year);
  let report: ReturnType<typeof computeYear> | null = null;
  if (rules) {
    try {
      report = computeYear({ year, business, taxYear, invoices, expenses });
    } catch (error) {
      if (!(error instanceof BookizError)) throw error;
      // Early in a year the yearly figures may not be published; booking goes on without a profit figure.
      actions.push(`Winst en belastingindicatie voor ${year} volgen zodra de Belastingdienst de cijfers heeft gepubliceerd.`);
    }
  }
  const estimate = report ? estimateTax(report, taxYear.wage_income_cents ?? 0) : null;
  if (rules && report && kor) {
    const korLimit = toCents(rules.rules.kor_omzetgrens.value);
    if (report.omzet_cents > korLimit * 0.8) {
      actions.push(`Let op de KOR: de omzet dit jaar is ${Math.round((report.omzet_cents / korLimit) * 100)}% van de grens van € ${rules.rules.kor_omzetgrens.value}.`);
    }
  }

  return inEuros({
    today: todayDate,
    business: business.name,
    kor,
    btw: {
      current_period: currentPeriod,
      tussenstand_te_betalen: kor || !current ? null : current.totaal_te_betalen,
      unfiled_periods: overdue,
    },
    invoices: {
      unpaid_count: unpaid.length,
      unpaid_total_cents: unpaid.reduce((total, invoice) => total + invoice.total_cents, 0),
      overdue: late,
      drafts: drafts.length,
    },
    expenses_without_receipt: withoutReceipt.length,
    year_to_date: report && {
      year,
      omzet_cents: report.omzet_cents,
      kosten_cents: report.aftrekbare_kosten_cents + report.afschrijving_cents,
      winst_cents: report.winst_cents,
      reserveren_voor_belasting_cents: estimate?.reserveren_cents ?? null,
      reserve_is_indicatie: true,
      wage_income_known: taxYear.wage_income_cents !== null,
    },
    next_actions: actions.length > 0 ? actions : ['Niets dringends. De administratie is bij.'],
  });
}

export async function yearReport(ctx: Ctx, input: { year?: number | undefined }) {
  const { business, invoices, expenses, filings } = await loadBooks(ctx.db);
  const todayDate = todayOf(ctx);
  const year = input.year ?? yearOf(todayDate);
  const taxYear = await store.getTaxYear(ctx.db, year);
  const report = computeYear({ year, business, taxYear, invoices, expenses });
  const estimate = estimateTax(report, taxYear.wage_income_cents ?? 0);
  const yearEnd = `${year}-12-31`;
  const debiteuren = invoices.filter(
    (invoice) => invoice.status === 'final' && invoice.issue_date <= yearEnd && (!invoice.paid_on || invoice.paid_on > yearEnd),
  );
  return inEuros({
    ...report,
    complete: year < yearOf(todayDate) ? 'heel jaar' : `tussenstand tot en met ${todayDate}`,
    facts: {
      hours_criterion: taxYear.hours_criterion,
      starter: taxYear.starter,
      wage_income_cents: taxYear.wage_income_cents,
      change_with: 'set_year_facts',
    },
    balance_items_year_end: {
      debiteuren_cents: debiteuren.reduce((total, invoice) => total + invoice.total_cents, 0),
      boekwaarde_bedrijfsmiddelen_cents: report.afschrijvingen.reduce((total, d) => total + d.book_value_end_cents, 0),
      btw_periods_not_filed: filings.length === 0 ? 'geen aangiftes geregistreerd' : undefined,
      note: 'Banksaldo en privéopnamen kent Bookiz niet; een volledige balans maak je met je bankafschriften of je boekhouder.',
    },
    tax_estimate: estimate ?? 'Voor dit jaar zijn de tarieven van de inkomstenbelasting nog niet in de regelset opgenomen.',
    disclaimer: 'Dit is een berekening volgens de openbare regels in /rules, geen aangifte en geen belastingadvies.',
  });
}

export async function exportBooks(ctx: Ctx, input: { year: number }) {
  const { business, invoices, expenses, filings } = await loadBooks(ctx.db);
  const todayDate = todayOf(ctx);
  const inYear = (date: string) => yearOf(date) === input.year;
  const taxYear = await store.getTaxYear(ctx.db, input.year);
  return inEuros({
    exported_on: todayDate,
    year: input.year,
    business,
    invoices: invoices.filter((invoice) => inYear(invoice.issue_date)),
    expenses: expenses.filter((expense) => inYear(expense.date)).map(present),
    vat_filings: filings.filter((filing) => filing.period.startsWith(String(input.year))),
    year_report: computeYear({ year: input.year, business, taxYear, invoices, expenses }),
    rules: rulesFor(input.year),
  });
}

export function taxRules(input: { year?: number | undefined; key?: string | undefined }, todayDate: string) {
  const year = input.year ?? yearOf(todayDate);
  const set = rulesFor(year);
  if (input.key) {
    const found = set.rules[input.key as RuleKey];
    if (!found) {
      throw new BookizError(`Onbekende regel "${input.key}".`, `Beschikbaar: ${Object.keys(set.rules).join(', ')}.`);
    }
    return { year, status: set.status, checked_on: set.checked_on, key: input.key, ...found };
  }
  return {
    year,
    status: set.status,
    checked_on: set.checked_on,
    available_years: availableYears(),
    rules: Object.fromEntries(
      Object.entries(set.rules).map(([key, entry]) => [key, { title: entry.title, value: entry.value, unit: entry.unit, source: entry.source }]),
    ),
    expense_categories: CATEGORIES,
    note: 'Vraag één regel op met "key" voor het letterlijke citaat van de bron.',
  };
}
