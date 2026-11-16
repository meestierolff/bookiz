import { BookizError } from '../errors.ts';
import { assertDate, yearOf } from '../core/dates.ts';
import { formatEur, toCents } from '../core/money.ts';
import type { InvoiceLine, SaleVatCode } from '../core/types.ts';
import { availableYears, rulesFor } from '../rules.ts';
import * as store from '../store.ts';
import { type Ctx, openPeriodFor, todayOf } from './context.ts';

/**
 * Switching from another bookkeeping package. Bookiz does not re-create the
 * old administration: that stays in an export of the old package, which the
 * owner must keep for seven years. It takes over the things that are still
 * alive on the day of the switch: where invoice numbering stands, invoices
 * that are still unpaid, and assets that are still being depreciated.
 */
export type OpeningInput = {
  last_invoice_number?: { year: number; last_used: number } | undefined;
  open_invoices?:
    | {
        number: string;
        contact_id: number;
        issue_date: string;
        due_date: string;
        net: number;
        vat: number;
        vat_code?: SaleVatCode | undefined;
        description?: string | undefined;
      }[]
    | undefined;
  assets?:
    | {
        description: string;
        original_cost: number;
        book_value: number;
        remaining_years: number;
        residual_value?: number | undefined;
        opening_date: string;
      }[]
    | undefined;
};

export async function importOpeningState(ctx: Ctx, input: OpeningInput) {
  const todayDate = todayOf(ctx);
  const done: string[] = [];
  const notes: string[] = [
    'Bewaar zelf een volledige export van je oude pakket: Bookiz neemt de oude jaren niet over en je moet ze zeven jaar kunnen tonen.',
  ];

  await ctx.db.transaction(async (tx) => {
    const business = await store.lockBusiness(tx);

    if (input.last_invoice_number) {
      const { year, last_used } = input.last_invoice_number;
      const highestHere = (await store.nextInvoiceSeq(tx, year)) - 1;
      const issuedHere = (await tx.query<{ n: number }>('select count(*)::int as n from invoice where year = $1', [year]))[0]?.n ?? 0;
      if (issuedHere > 0 && last_used < highestHere) {
        throw new BookizError(
          `In ${year} is hier al factuur ${highestHere} uitgegeven; de nummering kan niet terug naar ${last_used}.`,
        );
      }
      await store.setInvoiceCounter(tx, year, last_used);
      done.push(`Factuurnummering ${year} gaat verder na nummer ${last_used}.`);
    }

    for (const open of input.open_invoices ?? []) {
      const issueDate = assertDate(open.issue_date, 'factuurdatum');
      const dueDate = assertDate(open.due_date, 'vervaldatum');
      if (issueDate > todayDate) throw new BookizError(`Factuur ${open.number} heeft een datum in de toekomst.`);
      const contact = await store.getContact(tx, open.contact_id);
      const net = toCents(open.net);
      const vat = toCents(open.vat);
      const code: SaleVatCode = open.vat_code ?? (vat === 0 ? 'zero' : 'high');
      // Check the btw against the tariff when the rules of that year are known; older years are taken as stated.
      if (availableYears().includes(yearOf(issueDate)) && (code === 'high' || code === 'low')) {
        const rate = code === 'high' ? rulesFor(yearOf(issueDate)).rules.btw_tarief_hoog.value : rulesFor(yearOf(issueDate)).rules.btw_tarief_laag.value;
        if (Math.abs(Math.round((net * rate) / 100) - vat) > 2) {
          throw new BookizError(
            `Bij factuur ${open.number} past ${formatEur(vat)} btw niet bij ${formatEur(net)} tegen ${rate}%.`,
            'Controleer de bedragen of geef het juiste vat_code mee.',
          );
        }
      }
      const exists = await tx.query('select 1 from invoice where number = $1', [open.number.trim()]);
      if (exists.length > 0) throw new BookizError(`Factuurnummer ${open.number} bestaat hier al.`);
      const lines: InvoiceLine[] = [
        { description: open.description?.trim() || `Overgenomen factuur ${open.number.trim()}`, quantity: 1, unit_price_cents: net, vat_code: code },
      ];
      await store.insertImportedInvoice(tx, {
        number: open.number.trim(),
        contact_id: contact.id,
        contact_snapshot: contact,
        business_snapshot: business,
        issue_date: issueDate,
        supply_date: null,
        due_date: dueDate,
        lines,
        net_cents: net,
        vat_cents: vat,
        total_cents: net + vat,
        credit_of: null,
        note: 'Overgenomen uit het vorige boekhoudpakket. Omzet en btw zijn daar al verwerkt.',
      });
      done.push(`Openstaande factuur ${open.number.trim()} van ${contact.name}, ${formatEur(net + vat)}.`);
    }

    const filings = await store.listFilings(tx);
    for (const asset of input.assets ?? []) {
      const openingDate = assertDate(asset.opening_date, 'overnamedatum');
      if (openingDate > todayDate) throw new BookizError(`De overnamedatum ${openingDate} ligt in de toekomst.`);
      rulesFor(yearOf(openingDate));
      const book = toCents(asset.book_value);
      const original = toCents(asset.original_cost);
      const residual = toCents(asset.residual_value ?? 0);
      if (book <= 0 || book > original) throw new BookizError(`De boekwaarde van "${asset.description}" moet tussen nul en de aanschafprijs liggen.`);
      if (residual > book) throw new BookizError(`De restwaarde van "${asset.description}" is hoger dan de boekwaarde.`);
      const expense = await store.insertExpense(
        tx,
        {
          date: openingDate,
          vat_period: openPeriodFor(openingDate, business, filings, todayDate),
          vendor: 'Overgenomen bedrijfsmiddel',
          description: asset.description.trim(),
          kind: 'investment',
          category: 'overig',
          total_cents: book,
          vat_cents: 0,
          vat_treatment: 'none',
          paid_from: 'business',
          km: null,
          useful_life_years: asset.remaining_years,
          residual_cents: residual,
          imported: true,
          original_cost_cents: original,
        },
        yearOf(openingDate),
      );
      done.push(`Bedrijfsmiddel ${expense.ref} "${asset.description.trim()}": boekwaarde ${formatEur(book)}, nog ${asset.remaining_years} jaar afschrijven.`);
    }
  });

  if ((input.open_invoices ?? []).length > 0) {
    notes.push('Overgenomen facturen tellen niet opnieuw mee voor omzet en btw. Registreer de betaling met register_payment zodra het geld binnen is.');
  }
  if ((input.assets ?? []).length > 0) {
    notes.push('Overgenomen bedrijfsmiddelen tellen niet mee voor de investeringsaftrek; die hoort bij het jaar van aanschaf.');
  }
  if (done.length === 0) throw new BookizError('Er is niets opgegeven om over te nemen.', 'Geef last_invoice_number, open_invoices of assets mee.');
  return { imported: done, notes };
}
