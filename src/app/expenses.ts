import { BookizError } from '../errors.ts';
import { categoryFor } from '../core/categories.ts';
import { businessCost } from '../core/costs.ts';
import { assertDate, periodFor, yearOf } from '../core/dates.ts';
import { formatEur, toCents } from '../core/money.ts';
import type { Expense, ExpenseVatTreatment } from '../core/types.ts';
import { archiveReceipt, loadReceiptBytes, type ReceiptSource, uploadLink } from '../receipts.ts';
import { rulesFor, yearly } from '../rules.ts';
import * as store from '../store.ts';
import { type Ctx, openPeriodFor, todayOf } from './context.ts';
import { assertInBooks } from './invoices.ts';

export type ExpenseInput = {
  date: string;
  vendor: string;
  description?: string | undefined;
  amount: number;
  vat_amount?: number | undefined;
  vat_treatment?: ExpenseVatTreatment | undefined;
  category?: string | undefined;
  paid_from?: 'business' | 'private' | undefined;
  kind?: 'cost' | 'investment' | undefined;
  useful_life_years?: number | undefined;
  residual_value?: number | undefined;
  allow_duplicate?: boolean | undefined;
};

export function present(expense: Expense) {
  return {
    ref: expense.ref,
    date: expense.date,
    vendor: expense.vendor,
    description: expense.description,
    kind: expense.kind,
    category: expense.category,
    total_cents: expense.total_cents,
    vat_cents: expense.vat_cents,
    vat_treatment: expense.vat_treatment,
    vat_period: expense.vat_period,
    paid_from: expense.paid_from,
    ...(expense.km ? { km: expense.km } : {}),
    ...(expense.kind === 'investment'
      ? { useful_life_years: expense.useful_life_years, residual_cents: expense.residual_cents }
      : {}),
    receipt: expense.receipt
      ? { archived: expense.receipt.archive, location: expense.receipt.location, sha256: expense.receipt.sha256 }
      : null,
    ...(expense.voided_at ? { voided_at: expense.voided_at, void_reason: expense.void_reason } : {}),
  };
}

function receiptHelp(ctx: Ctx, expense: Expense): string {
  const link = uploadLink(ctx.config, expense.ref);
  if (link) {
    return `Het bewijsstuk ontbreekt nog. Geef het bestand door met attach_receipt, of laat de gebruiker de foto hier uploaden: ${link}`;
  }
  return 'Het bewijsstuk ontbreekt nog. Geef het pad naar de foto of pdf door met attach_receipt.';
}

export async function recordExpense(ctx: Ctx, input: ExpenseInput) {
  const business = await store.requireBusiness(ctx.db);
  const todayDate = todayOf(ctx);
  const date = assertDate(input.date);
  if (date > todayDate) throw new BookizError(`De datum ${date} ligt in de toekomst.`);
  assertInBooks(business, date);
  const year = yearOf(date);
  const rules = rulesFor(year);
  const category = categoryFor(input.category ?? 'overig');
  const treatment = input.vat_treatment ?? 'nl';
  const total = toCents(input.amount);
  if (total === 0) throw new BookizError('Het bedrag kan niet nul zijn.');
  const notes: string[] = [];

  let vat = 0;
  if (treatment === 'nl') {
    if (input.vat_amount === undefined) {
      throw new BookizError(
        'Geef het btw-bedrag van de bon mee (vat_amount), of 0 als er geen btw op staat.',
        'Lees het bedrag van de bon af; schat het niet. Staat er geen btw op en is de leverancier buitenlands, kies dan de juiste vat_treatment.',
      );
    }
    vat = toCents(input.vat_amount);
    const highest = (Math.abs(total) * rules.rules.btw_tarief_hoog.value) / (100 + rules.rules.btw_tarief_hoog.value);
    if (Math.sign(vat) * Math.sign(total) < 0 || Math.abs(vat) > highest + 1) {
      throw new BookizError(
        `Een btw-bedrag van ${formatEur(vat)} kan niet bij een totaal van ${formatEur(total)}: meer dan ${rules.rules.btw_tarief_hoog.value}% btw bestaat niet.`,
        'amount is het totaal inclusief btw; vat_amount het btw-deel daarvan.',
      );
    }
  } else if (input.vat_amount) {
    throw new BookizError(
      `Bij vat_treatment "${treatment}" staat er geen Nederlandse btw op de factuur; laat vat_amount weg.`,
      'Bij een verlegging rekent Bookiz de btw zelf uit.',
    );
  }

  let kind = input.kind ?? 'cost';
  const draft: store.NewExpense = {
    date,
    vat_period: '',
    vendor: input.vendor.trim(),
    description: input.description?.trim() || null,
    kind,
    category: category.key,
    total_cents: total,
    vat_cents: vat,
    vat_treatment: treatment,
    paid_from: input.paid_from ?? 'business',
    km: null,
    useful_life_years: null,
    residual_cents: 0,
  };

  if (kind === 'investment') {
    const cost = businessCost(
      { ...draft, id: 0, ref: '', receipt: null, voided_at: null, void_reason: null, imported: false, original_cost_cents: null },
      business,
      rules,
    );
    const threshold = toCents(rules.rules.investering_drempel.value);
    if (cost < threshold) {
      kind = 'cost';
      draft.kind = 'cost';
      notes.push(`Onder ${formatEur(threshold)} is het geen investering: de aankoop is als gewone kosten geboekt en telt dit jaar volledig mee.`);
    } else {
      const minLife = Math.ceil(100 / rules.rules.afschrijving_max_pct.value);
      const life = input.useful_life_years ?? minLife;
      if (life < minLife) {
        throw new BookizError(
          `Afschrijven mag met hooguit ${rules.rules.afschrijving_max_pct.value}% per jaar, dus in minimaal ${minLife} jaar.`,
        );
      }
      draft.useful_life_years = life;
      draft.residual_cents = toCents(input.residual_value ?? 0);
      notes.push(`Investering: wordt in ${life} jaar afgeschreven en telt mee voor de kleinschaligheidsinvesteringsaftrek.`);
    }
  }

  if (!category.vat_deductible && vat !== 0) notes.push('De btw op eten en drinken in de horeca is niet aftrekbaar; het hele bedrag telt als kosten.');
  if (category.limited) {
    const pct = rules.rules.beperkt_aftrekbaar_pct?.value;
    notes.push(pct === undefined ? 'Deze kosten zijn beperkt aftrekbaar van de winst.' : `Deze kosten zijn voor ${pct}% aftrekbaar van de winst.`);
  }
  if (draft.paid_from === 'private') notes.push('Privé betaald: telt als zakelijke kosten en als privéstorting. Je hoeft het bedrag niet terug te boeken.');
  if (treatment !== 'nl' && treatment !== 'none') {
    notes.push('Btw verlegd: Bookiz geeft de btw aan in rubriek 4 en trekt haar, als dat mag, weer af als voorbelasting.');
  }

  const expense = await ctx.db.transaction(async (tx) => {
    await store.lockBusiness(tx);
    if (!input.allow_duplicate) {
      const twin = (await store.listExpenses(tx)).find(
        (other) =>
          !other.voided_at &&
          other.date === date &&
          other.total_cents === total &&
          other.vendor.toLowerCase() === draft.vendor.toLowerCase(),
      );
      if (twin) {
        throw new BookizError(
          `Deze uitgave lijkt al geboekt als ${twin.ref} (${twin.vendor}, ${twin.date}, ${formatEur(twin.total_cents)}).`,
          'Is het echt een tweede aankoop? Roep record_expense dan opnieuw aan met allow_duplicate: true.',
        );
      }
    }
    const filings = await store.listFilings(tx);
    draft.vat_period = openPeriodFor(date, business, filings, todayDate);
    return store.insertExpense(tx, draft, year);
  });

  if (expense.vat_period !== periodFor(date, business.vat_period)) {
    const limit = rules.rules.btw_correctiegrens.value;
    notes.push(
      `De aangifte over het tijdvak van ${date} is al gedaan. De btw van deze uitgave loopt daarom mee in ${expense.vat_period}. ` +
        `Dat mag zolang het saldo van zulke correcties onder € ${limit} blijft; daarboven is een suppletie nodig.`,
    );
  }
  return { ...present(expense), notes, receipt_help: receiptHelp(ctx, expense) };
}

export async function recordMileage(ctx: Ctx, input: { date: string; km: number; description: string }) {
  const business = await store.requireBusiness(ctx.db);
  const date = assertDate(input.date);
  const todayDate = todayOf(ctx);
  if (date > todayDate) throw new BookizError(`De datum ${date} ligt in de toekomst.`);
  assertInBooks(business, date);
  const rules = rulesFor(yearOf(date));
  const rate = yearly(rules, 'kilometervergoeding').value;
  const expense = await ctx.db.transaction(async (tx) => {
    await store.lockBusiness(tx);
    return store.insertExpense(
      tx,
      {
        date,
        vat_period: openPeriodFor(date, business, await store.listFilings(tx), todayDate),
        vendor: 'Eigen auto',
        description: input.description.trim(),
        kind: 'mileage',
        category: 'reiskosten',
        total_cents: Math.round(input.km * toCents(rate)),
        vat_cents: 0,
        vat_treatment: 'none',
        paid_from: 'private',
        km: input.km,
        useful_life_years: null,
        residual_cents: 0,
      },
      yearOf(date),
    );
  });
  return {
    ...present(expense),
    notes: [`${input.km} km × € ${rate.toFixed(2).replace('.', ',')} per kilometer met je eigen auto. Bewaar zelf een rittenadministratie (datum, van, naar, doel).`],
  };
}

export type ReceiptInput = ReceiptSource & { file?: { download_url: string; file_id: string } | undefined };

export async function attachReceipt(ctx: Ctx, ref: string, input: ReceiptInput) {
  const expense = await store.getExpense(ctx.db, ref);
  if (expense.receipt) {
    throw new BookizError(`Bij ${expense.ref} is al een bewijsstuk bewaard (${expense.receipt.filename}).`);
  }
  const business = await store.requireBusiness(ctx.db);
  const source: ReceiptSource = input.file ? { url: input.file.download_url } : input;
  const bytes = await loadReceiptBytes(source, ctx.config);
  return storeReceipt(ctx, expense, bytes, business);
}

export async function storeReceipt(
  ctx: Ctx,
  expense: Expense,
  bytes: Buffer,
  business: Awaited<ReturnType<typeof store.requireBusiness>>,
) {
  if (ctx.locked) throw new BookizError(ctx.locked);
  // Behind the business lock: two uploads for the same expense cannot both be archived,
  // and the daily allowance cannot be overdrawn.
  const receipt = await ctx.db.transaction(async (tx) => {
    await store.lockBusiness(tx);
    const current = await store.getExpense(tx, expense.ref);
    if (current.receipt) throw new BookizError(`Bij ${expense.ref} is al een bewijsstuk bewaard (${current.receipt.filename}).`);
    const limit = ctx.config.dailyReceiptLimit;
    if (limit !== undefined && !(await store.claimDaily(tx, 'receipt_quota', limit, { ref: expense.ref }))) {
      throw new BookizError(`Je hebt in de afgelopen 24 uur al ${limit} bonnen bewaard; meer kan pas later.`);
    }
    const stored = await archiveReceipt(bytes, expense, business, ctx);
    await store.setReceipt(tx, expense.ref, stored);
    return stored;
  });
  const to = ctx.config.receiptsOnlyTo ?? business.archive_email ?? business.email ?? ctx.config.fallbackArchiveEmail;
  return {
    ref: expense.ref,
    receipt,
    note:
      receipt.archive === 'email'
        ? `Het bewijsstuk is gemaild naar ${to}. Die e-mail is het archief; Bookiz bewaart alleen het controlegetal.`
        : `Het bewijsstuk staat in de datamap onder ${receipt.location}.`,
  };
}

export async function voidExpense(ctx: Ctx, input: { ref: string; reason: string }) {
  const expense = await store.getExpense(ctx.db, input.ref);
  if (expense.voided_at) throw new BookizError(`${expense.ref} is al vervallen.`);
  const filed = (await store.listFilings(ctx.db)).some((filing) => filing.period === expense.vat_period);
  if (filed) {
    throw new BookizError(
      `${expense.ref} zit in de btw-aangifte over ${expense.vat_period}, en die is al gedaan.`,
      'Corrigeer dit via een suppletie bij de Belastingdienst of overleg met je boekhouder; Bookiz kan een ingediend tijdvak niet herschrijven.',
    );
  }
  await store.voidExpense(ctx.db, expense.ref, input.reason.trim());
  return present(await store.getExpense(ctx.db, expense.ref));
}

export async function listExpenses(
  ctx: Ctx,
  input: { year?: number | undefined; missing_receipt?: boolean | undefined; include_voided?: boolean | undefined },
) {
  const expenses = (await store.listExpenses(ctx.db))
    .filter((expense) => !input.year || yearOf(expense.date) === input.year)
    .filter((expense) => input.include_voided || !expense.voided_at)
    .filter((expense) => !input.missing_receipt || needsReceipt(expense))
    .map(present);
  return { count: expenses.length, expenses };
}

/** Mileage has no receipt; the trip log is the evidence. */
export function needsReceipt(expense: Expense): boolean {
  return !expense.voided_at && expense.kind !== 'mileage' && !expense.receipt;
}
