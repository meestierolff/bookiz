import { BookizError } from '../errors.ts';
import { assertDate, type IsoDate } from '../core/dates.ts';
import type { RecurringInvoice, SaleVatCode } from '../core/types.ts';
import { toCents } from '../core/money.ts';
import * as store from '../store.ts';
import { type Ctx, todayOf } from './context.ts';
import { createInvoice } from './invoices.ts';

/** The same day in a later month, clamped to that month's last day (31 January + 1 month = 28 February). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export type RecurringInput = {
  id?: number | undefined;
  contact_id?: number | undefined;
  lines?: { description: string; quantity: number; unit_price: number; vat_code?: SaleVatCode | undefined }[] | undefined;
  every_months?: 1 | 3 | 12 | undefined;
  next_date?: string | undefined;
  note?: string | null | undefined;
  active?: boolean | undefined;
};

export async function saveRecurringInvoice(ctx: Ctx, input: RecurringInput) {
  const current = input.id === undefined ? undefined : (await store.listRecurring(ctx.db)).find((r) => r.id === input.id);
  if (input.id !== undefined && !current) throw new BookizError(`Periodieke factuur ${input.id} bestaat niet.`);
  const lines =
    input.lines?.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      unit_price_cents: toCents(line.unit_price),
      vat_code: line.vat_code ?? ('high' as const),
    })) ?? current?.lines;
  const contactId = input.contact_id ?? current?.contact_id;
  const every = input.every_months ?? current?.every_months;
  const nextDate = input.next_date ? assertDate(input.next_date, 'eerstvolgende datum') : current?.next_date;
  if (!lines || lines.length === 0 || contactId === undefined || !every || !nextDate) {
    throw new BookizError('Een periodieke factuur heeft een relatie, regels, een interval en een eerstvolgende datum nodig.');
  }
  await store.getContact(ctx.db, contactId);
  const id = await store.saveRecurring(ctx.db, input.id, {
    contact_id: contactId,
    lines,
    note: input.note === undefined ? (current?.note ?? null) : input.note,
    every_months: every,
    next_date: nextDate,
    active: input.active ?? current?.active ?? true,
  });
  return {
    ...(await listRecurring(ctx)).recurring.find((r) => r.id === id),
    note_for_owner:
      'Op de datum maakt Bookiz een concept klaar, geen definitieve factuur. Het concept verschijnt bij de volgende keer dat je het overzicht opvraagt en wacht daar op je akkoord.',
  };
}

export async function listRecurring(ctx: Ctx) {
  const recurring = (await store.listRecurring(ctx.db)).map((r: RecurringInvoice) => ({
    id: r.id,
    contact_id: r.contact_id,
    every_months: r.every_months,
    next_date: r.next_date,
    active: r.active,
    lines: r.lines,
    note: r.note,
  }));
  return { count: recurring.length, recurring };
}

/**
 * Turn every recurring invoice that has come due into a draft. Runs when the
 * overview is requested rather than on a timer: it works the same on a laptop
 * that was closed for a month, and nothing becomes final without the owner.
 */
export async function draftDueRecurring(ctx: Ctx): Promise<{ draft_id: number; customer: string; for_date: IsoDate }[]> {
  const todayDate = todayOf(ctx);
  const created: { draft_id: number; customer: string; for_date: IsoDate }[] = [];
  for (const recurring of await store.listRecurring(ctx.db)) {
    let next = recurring.next_date;
    // Catch up at most a year of missed periods, one draft each.
    for (let i = 0; recurring.active && next <= todayDate && i < 12; i++) {
      const draft = await createInvoice(ctx, {
        contact_id: recurring.contact_id,
        lines: recurring.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price_cents / 100,
          vat_code: line.vat_code === 'kor' ? undefined : line.vat_code,
        })),
        issue_date: todayDate,
        supply_date: next,
        note: recurring.note ?? undefined,
      });
      created.push({ draft_id: draft.draft_id, customer: draft.customer, for_date: next });
      next = addMonths(next, recurring.every_months);
      // Move the date forward straight away, so a failure further on cannot create the same draft twice.
      await store.saveRecurring(ctx.db, recurring.id, { ...recurring, next_date: next });
    }
  }
  return created;
}
