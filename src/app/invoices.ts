import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BookizError } from '../errors.ts';
import { addDays, assertDate, daysBetween, type IsoDate, periodFor, yearOf } from '../core/dates.ts';
import { korActive } from '../core/costs.ts';
import { formatEur, toCents } from '../core/money.ts';
import type { Business, Contact, Invoice, InvoiceLine, SaleVatCode } from '../core/types.ts';
import { invoiceTotals } from '../core/vat.ts';
import { invoiceRemarks, renderInvoicePdf } from '../pdf.ts';
import { invoiceLink } from '../receipts.ts';
import { rulesFor } from '../rules.ts';
import * as store from '../store.ts';
import { type Ctx, todayOf } from './context.ts';

/**
 * Invoice numbers must be unique and consecutive; the format is yours to choose.
 * Changing it later is fine as long as numbers keep increasing within a year.
 */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `${year}-${String(seq).padStart(3, '0')}`;
}

export type InvoiceInput = {
  draft_id?: number | undefined;
  contact_id: number;
  lines: { description: string; quantity: number; unit_price: number; vat_code?: SaleVatCode | undefined }[];
  issue_date?: string | undefined;
  supply_date?: string | undefined;
  payment_term_days?: number | undefined;
  note?: string | undefined;
};

/** After a switch, a date before the switch belongs to the old package, not here. */
export function assertInBooks(business: Business, date: string): void {
  if (business.books_start && date < business.books_start) {
    throw new BookizError(
      `${date} ligt vóór ${business.books_start}, de dag waarop je naar Bookiz bent overgestapt.`,
      'Boek dit in je oude pakket, want daar hoort dat tijdvak. Hier begint de administratie op de overstapdatum.',
    );
  }
}

export type InvoiceStatus = 'concept' | 'open' | 'te laat' | 'betaald';

export function statusOf(invoice: Invoice, todayDate: IsoDate): InvoiceStatus {
  if (invoice.status === 'draft') return 'concept';
  if (invoice.paid_on) return 'betaald';
  return invoice.due_date < todayDate ? 'te laat' : 'open';
}

export function summarize(invoice: Invoice, todayDate: IsoDate) {
  const status = statusOf(invoice, todayDate);
  return {
    id: invoice.id,
    number: invoice.number,
    status,
    customer: invoice.contact_snapshot?.name ?? null,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    net_cents: invoice.net_cents,
    vat_cents: invoice.vat_cents,
    total_cents: invoice.total_cents,
    paid_on: invoice.paid_on,
    sent_at: invoice.sent_at,
    ...(status === 'te laat' ? { days_overdue: daysBetween(invoice.due_date, todayDate) } : {}),
    ...(invoice.credit_of ? { credit_of_id: invoice.credit_of } : {}),
  };
}

function checkLines(lines: InvoiceLine[], business: Business, contact: Contact, issueDate: IsoDate): string[] {
  const notes: string[] = [];
  const codes = new Set(lines.map((line) => line.vat_code));
  if (codes.has('eu_reverse_charge')) {
    if (contact.country === 'NL') {
      throw new BookizError('Btw verleggen binnen de EU kan niet naar een Nederlandse klant.', 'Gebruik vat_code "high" of pas het land van de relatie aan.');
    }
    if (!contact.vat_id) {
      throw new BookizError(
        `Voor btw verlegd is het btw-identificatienummer van ${contact.name} verplicht op de factuur.`,
        'Vraag het nummer op en sla het op met save_contact.',
      );
    }
    notes.push('Btw verlegd binnen de EU: deze omzet hoort ook in de opgaaf intracommunautaire prestaties (ICP).');
  }
  if (codes.has('outside_eu') && contact.country === 'NL') {
    throw new BookizError('vat_code "outside_eu" past niet bij een Nederlandse klant.');
  }
  if (korActive(business, issueDate)) notes.push('Je gebruikt de KOR: deze factuur is zonder btw.');
  return notes;
}

/** Create or replace a draft. Drafts have no number and can change freely. */
export async function createInvoice(ctx: Ctx, input: InvoiceInput) {
  const business = await store.requireBusiness(ctx.db);
  const contact = await store.getContact(ctx.db, input.contact_id);
  const issueDate = assertDate(input.issue_date ?? todayOf(ctx), 'factuurdatum');
  assertInBooks(business, issueDate);
  const supplyDate = input.supply_date ? assertDate(input.supply_date, 'leverdatum') : null;
  const rules = rulesFor(yearOf(issueDate));
  const kor = korActive(business, issueDate);

  const lines: InvoiceLine[] = input.lines.map((line) => ({
    description: line.description.trim(),
    quantity: line.quantity,
    unit_price_cents: toCents(line.unit_price),
    // Under the KOR no btw may be charged, whatever the agent asked for.
    vat_code: kor ? 'kor' : (line.vat_code ?? 'high'),
  }));
  if (!kor && lines.some((line) => line.vat_code === 'kor')) {
    throw new BookizError('vat_code "kor" kan alleen als de KOR is ingesteld.', 'Stel kor_since in met setup_business.');
  }
  const notes = checkLines(lines, business, contact, issueDate);
  const totals = invoiceTotals(lines, rules);

  const draft: store.InvoiceDraft = {
    contact_id: contact.id,
    issue_date: issueDate,
    supply_date: supplyDate,
    due_date: addDays(issueDate, input.payment_term_days ?? business.payment_term_days),
    lines,
    net_cents: totals.net_cents,
    vat_cents: totals.vat_cents,
    total_cents: totals.total_cents,
    credit_of: null,
    note: input.note?.trim() || null,
  };

  let id = input.draft_id;
  if (id !== undefined) {
    const existing = await store.getInvoice(ctx.db, id);
    if (existing.status !== 'draft') {
      throw new BookizError(
        `Factuur ${existing.number} is definitief en kan niet meer worden gewijzigd.`,
        'Maak een creditfactuur met credit_invoice en daarna een nieuwe factuur.',
      );
    }
    await store.updateDraftInvoice(ctx.db, id, draft);
  } else {
    id = await store.insertInvoice(ctx.db, draft);
  }
  const saved = await store.getInvoice(ctx.db, id);
  return {
    draft_id: id,
    status: 'concept',
    customer: contact.name,
    issue_date: saved.issue_date,
    due_date: saved.due_date,
    lines: saved.lines.map((line) => ({ ...line })),
    vat_groups: totals.groups,
    net_cents: totals.net_cents,
    vat_cents: totals.vat_cents,
    total_cents: totals.total_cents,
    remarks_on_invoice: invoiceRemarks(saved),
    notes,
    next: 'Laat de gebruiker dit concept controleren. Pas na akkoord: finalize_invoice. Een definitieve factuur krijgt een nummer en kan niet meer worden aangepast.',
  };
}

function missingForInvoicing(business: Business, kor: boolean): string[] {
  const required: [keyof Business, string][] = [
    ['address_line', 'adres'],
    ['postal_code', 'postcode'],
    ['city', 'plaats'],
    ['kvk_number', 'KvK-nummer'],
    ['iban', 'IBAN'],
  ];
  if (!kor) required.push(['vat_id', 'btw-identificatienummer']);
  return required.filter(([field]) => !business[field]).map(([, label]) => label);
}

export async function finalizeInvoice(ctx: Ctx, draftId: number) {
  const number = await ctx.db.transaction(async (tx) => {
    const business = await store.lockBusiness(tx);
    const invoice = await store.getInvoice(tx, draftId, true);
    if (invoice.status !== 'draft') throw new BookizError(`Factuur ${invoice.number} is al definitief.`);
    const contact = await store.getContact(tx, invoice.contact_id);
    const year = yearOf(invoice.issue_date);

    // The draft was checked when it was made; settings and the customer may have changed since.
    const stale = new BookizError(
      'Dit concept klopt niet meer met je huidige instellingen of met de gegevens van de klant.',
      'Maak het opnieuw met create_invoice (geef draft_id mee) en laat het nog een keer controleren.',
    );
    const kor = korActive(business, invoice.issue_date);
    if (invoice.lines.some((line) => (line.vat_code === 'kor') !== kor)) throw stale;
    checkLines(invoice.lines, business, contact, invoice.issue_date);
    const totals = invoiceTotals(invoice.lines, rulesFor(year));
    if (totals.vat_cents !== invoice.vat_cents || totals.total_cents !== invoice.total_cents) throw stale;

    const missing = missingForInvoicing(business, kor);
    if (missing.length > 0) {
      throw new BookizError(
        `Op een factuur zijn verplicht en ontbreken nog: ${missing.join(', ')}.`,
        'Vul ze aan met setup_business.',
      );
    }
    if (!contact.address_line || !contact.city) {
      throw new BookizError(
        `Het adres van ${contact.name} ontbreekt; naam en adres van de afnemer zijn verplicht op een factuur.`,
        'Vul het aan met save_contact.',
      );
    }
    const filed = new Set((await store.listFilings(tx)).map((filing) => filing.period));
    if (filed.has(periodFor(invoice.issue_date, business.vat_period))) {
      throw new BookizError(
        `De factuurdatum ${invoice.issue_date} valt in een tijdvak waarvan de btw-aangifte al is gedaan.`,
        'Maak het concept opnieuw met de datum van vandaag.',
      );
    }
    if (kor) {
      const limit = toCents(rulesFor(year).rules.kor_omzetgrens.value);
      const soFar = (await store.listInvoices(tx, { from: `${year}-01-01`, to: `${year}-12-31` }))
        .filter((other) => other.status === 'final')
        .reduce((total, other) => total + other.net_cents, 0);
      if (soFar + invoice.net_cents > limit) {
        throw new BookizError(
          `Met deze factuur komt de omzet van ${year} op ${formatEur(soFar + invoice.net_cents)}, boven de KOR-grens van ${formatEur(limit)}. ` +
            'De KOR vervalt dan direct en over deze hele factuur moet je btw rekenen.',
          'Meld je af voor de KOR bij de Belastingdienst. Zet daarna met setup_business kor_until op de laatste dag waarop de KOR gold ' +
            '(de datum van je laatste factuur zonder btw) en maak dit concept opnieuw met een latere factuurdatum, nu met btw.',
        );
      }
    }
    const seq = await store.nextInvoiceSeq(tx, year);
    const assigned = formatInvoiceNumber(year, seq);
    await store.markInvoiceFinal(tx, draftId, {
      number: assigned,
      year,
      seq,
      contact_snapshot: contact,
      business_snapshot: business,
    });
    return assigned;
  });
  const invoice = await store.getInvoice(ctx.db, number);
  return {
    ...summarize(invoice, todayOf(ctx)),
    pdf: await pdfLocation(ctx, invoice),
    next: 'Verstuur de factuur met send_invoice, of geef de pdf aan de gebruiker. Registreer de betaling later met register_payment.',
  };
}

/** A final invoice always renders as it was issued: sender, customer and tariffs of that moment. */
export async function invoicePdf(ctx: Ctx, invoice: Invoice): Promise<Buffer> {
  const business = invoice.business_snapshot ?? (await store.requireBusiness(ctx.db));
  const contact = invoice.contact_snapshot ?? (await store.getContact(ctx.db, invoice.contact_id));
  // A credit invoice repeats the tariffs of the invoice it reverses.
  const original = invoice.credit_of ? await store.getInvoice(ctx.db, invoice.credit_of) : null;
  // An imported original may date from a year Bookiz has no rules for; then today's tariffs label the lines.
  const priced = original && !original.imported ? original : invoice;
  return renderInvoicePdf(invoice, business, contact, rulesFor(yearOf(priced.issue_date)));
}

/** A link when the server is reachable over http, otherwise a file on the user's own disk. */
async function pdfLocation(ctx: Ctx, invoice: Invoice): Promise<string> {
  const link = invoiceLink(ctx.config, invoice.number as string);
  if (link) return link;
  const dir = join(ctx.config.dataDir, 'invoices');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `factuur-${invoice.number}.pdf`);
  await writeFile(path, await invoicePdf(ctx, invoice));
  return path;
}

async function requireFinal(ctx: Ctx, number: string): Promise<Invoice> {
  const invoice = await store.getInvoice(ctx.db, number.trim());
  if (invoice.status !== 'final') throw new BookizError('Deze factuur is nog een concept.');
  return invoice;
}

export async function sendInvoice(ctx: Ctx, input: { number: string; to?: string | undefined; message?: string | undefined }) {
  const invoice = await requireFinal(ctx, input.number);
  if (invoice.imported) {
    throw new BookizError(
      `Factuur ${invoice.number} is overgenomen uit je vorige pakket; Bookiz heeft het origineel niet.`,
      'Stuur de factuur uit je oude pakket opnieuw, of maak hier een herinnering in je eigen woorden.',
    );
  }
  const business = await store.requireBusiness(ctx.db);
  const intended = input.to ?? invoice.contact_snapshot?.email;
  // An account that has not paid yet can try sending, but only to itself.
  const to = ctx.config.mailOnlyTo ?? intended;
  if (!to) {
    throw new BookizError(
      `Er is geen e-mailadres bekend van ${invoice.contact_snapshot?.name ?? 'deze klant'}.`,
      'Geef "to" mee of sla het adres op met save_contact.',
    );
  }
  const limit = ctx.config.dailyMailLimit;
  if (limit !== undefined) {
    // Claim a slot before sending, behind the business lock: two parallel calls
    // cannot both take the last one, and a failed send still counts.
    await ctx.db.transaction(async (tx) => {
      await store.lockBusiness(tx);
      if (!(await store.claimDaily(tx, 'mail_quota', limit, { number: invoice.number, to }))) {
        throw new BookizError(
          `Je hebt in de afgelopen 24 uur al ${limit} facturen verstuurd; meer kan pas later.`,
          'De pdf kun je altijd zelf downloaden en versturen.',
        );
      }
    });
  }
  const isCredit = invoice.total_cents < 0;
  const text =
    input.message ??
    [
      `Beste ${invoice.contact_snapshot?.name ?? 'klant'},`,
      '',
      isCredit
        ? `In de bijlage vind je creditfactuur ${invoice.number} van ${formatEur(invoice.total_cents)}.`
        : `In de bijlage vind je factuur ${invoice.number} van ${formatEur(invoice.total_cents)}. ` +
          `Wil je het bedrag uiterlijk ${invoice.due_date.split('-').reverse().join('-')} overmaken?`,
      '',
      'Met vriendelijke groet,',
      business.owner_name ?? business.name,
    ].join('\n');
  const { messageId } = await ctx.mail({
    to,
    // A copy to the owner keeps the sent invoice in their own mailbox.
    ...(business.email && !ctx.config.mailOnlyTo ? { cc: business.email, replyTo: business.email } : {}),
    subject: `${isCredit ? 'Creditfactuur' : 'Factuur'} ${invoice.number} van ${business.name}`,
    text,
    attachments: [
      { filename: `factuur-${invoice.number}.pdf`, content: await invoicePdf(ctx, invoice), contentType: 'application/pdf' },
    ],
  });
  await store.setInvoiceSent(ctx.db, invoice.id);
  return {
    number: invoice.number,
    sent_to: to,
    copy_to: ctx.config.mailOnlyTo ? null : business.email,
    message_id: messageId,
    ...(ctx.config.mailOnlyTo
      ? {
          note: `Tijdens de proefperiode stuurt Bookiz facturen alleen naar je eigen adres (${to}), niet naar ${intended ?? 'je klant'}. Stuur de e-mail zelf door, of neem een abonnement om rechtstreeks te versturen.`,
        }
      : {}),
  };
}

export async function registerPayment(ctx: Ctx, input: { number: string; paid_on?: string | null | undefined }) {
  const invoice = await requireFinal(ctx, input.number);
  const paidOn = input.paid_on === null ? null : assertDate(input.paid_on ?? todayOf(ctx), 'betaaldatum');
  if (paidOn && paidOn < invoice.issue_date) {
    throw new BookizError(`De betaaldatum ${paidOn} ligt vóór de factuurdatum ${invoice.issue_date}.`);
  }
  await store.setInvoicePaid(ctx.db, invoice.id, paidOn);
  return summarize(await store.getInvoice(ctx.db, invoice.id), todayOf(ctx));
}

/** A final invoice is never edited or deleted; it is reversed by a credit invoice. */
export async function creditInvoice(ctx: Ctx, input: { number: string; reason?: string | undefined }) {
  const todayDate = todayOf(ctx);
  const creditNumber = await ctx.db.transaction(async (tx) => {
    const business = await store.lockBusiness(tx);
    const original = await store.getInvoice(tx, input.number.trim(), true);
    if (original.status !== 'final') throw new BookizError('Een concept kun je gewoon aanpassen; crediteren is niet nodig.');
    if (original.credit_of) throw new BookizError('Een creditfactuur kan niet opnieuw worden gecrediteerd.');
    const already = await tx.query<{ number: string }>('select number from invoice where credit_of = $1', [original.id]);
    if (already[0]) throw new BookizError(`Factuur ${original.number} is al gecrediteerd met ${already[0].number}.`);

    // Mirror the stored amounts exactly; never recalculate a reversal.
    const lines = original.lines.map((line) => ({ ...line, quantity: -line.quantity }));
    const totals = { net_cents: -original.net_cents, vat_cents: -original.vat_cents, total_cents: -original.total_cents };
    const id = await store.insertInvoice(tx, {
      contact_id: original.contact_id,
      issue_date: todayDate,
      supply_date: original.supply_date ?? original.issue_date,
      due_date: todayDate,
      lines,
      net_cents: totals.net_cents,
      vat_cents: totals.vat_cents,
      total_cents: totals.total_cents,
      credit_of: original.id,
      note: `Creditfactuur bij factuur ${original.number}.${input.reason ? ` ${input.reason.trim()}` : ''}`,
    });
    const year = yearOf(todayDate);
    const seq = await store.nextInvoiceSeq(tx, year);
    const assigned = formatInvoiceNumber(year, seq);
    await store.markInvoiceFinal(tx, id, {
      number: assigned,
      year,
      seq,
      contact_snapshot: original.contact_snapshot ?? (await store.getContact(tx, original.contact_id)),
      business_snapshot: business,
    });
    if (!original.paid_on) {
      // Nothing was paid, so the two documents settle each other.
      await store.setInvoicePaid(tx, original.id, todayDate);
      await store.setInvoicePaid(tx, id, todayDate);
    }
    return assigned;
  });
  const credit = await store.getInvoice(ctx.db, creditNumber);
  return {
    ...summarize(credit, todayDate),
    pdf: await pdfLocation(ctx, credit),
    note: credit.paid_on
      ? 'De oorspronkelijke factuur was nog niet betaald; beide zijn nu afgehandeld.'
      : 'De oorspronkelijke factuur was al betaald: betaal het bedrag terug en registreer dat met register_payment op de creditfactuur.',
  };
}

export async function listInvoices(
  ctx: Ctx,
  input: { year?: number | undefined; status?: InvoiceStatus | undefined },
) {
  const todayDate = todayOf(ctx);
  const range = input.year ? { from: `${input.year}-01-01`, to: `${input.year}-12-31` } : undefined;
  const invoices = (await store.listInvoices(ctx.db, range))
    .map((invoice) => summarize(invoice, todayDate))
    .filter((invoice) => !input.status || invoice.status === input.status);
  return { count: invoices.length, invoices };
}
