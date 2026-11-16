import { BookizError } from '../errors.ts';
import { korActive } from '../core/costs.ts';
import { assertDate } from '../core/dates.ts';
import type { Business } from '../core/types.ts';
import * as store from '../store.ts';
import type { Ctx } from './context.ts';

/**
 * Update the business profile. Two settings decide how existing documents are
 * treated, so they may not change underneath them: the KOR period and the
 * filing frequency.
 */
export async function setupBusiness(ctx: Ctx, patch: Partial<Business>): Promise<Business> {
  if (patch.kor_since) assertDate(patch.kor_since, 'startdatum van de KOR');
  if (patch.kor_until) assertDate(patch.kor_until, 'einddatum van de KOR');

  return ctx.db.transaction(async (tx) => {
    const current = await store.getBusiness(tx);
    if (!current) return store.saveBusiness(tx, patch);
    await store.lockBusiness(tx);
    const next: Business = { ...current, ...patch };

    if (next.kor_until && (!next.kor_since || next.kor_until < next.kor_since)) {
      throw new BookizError('kor_until moet op of na kor_since liggen.');
    }

    const invoices = (await store.listInvoices(tx)).filter((invoice) => invoice.status === 'final');
    const expenses = (await store.listExpenses(tx)).filter((expense) => !expense.voided_at);

    if (next.kor_since !== current.kor_since || next.kor_until !== current.kor_until) {
      const documents = [
        ...invoices.map((invoice) => ({ ref: `factuur ${invoice.number}`, date: invoice.issue_date })),
        ...expenses.map((expense) => ({ ref: `uitgave ${expense.ref}`, date: expense.date })),
      ];
      const flipped = documents.find((doc) => korActive(current, doc.date) !== korActive(next, doc.date));
      if (flipped) {
        throw new BookizError(
          `Deze wijziging zou ${flipped.ref} van ${flipped.date} achteraf anders behandelen voor de btw.`,
          'Kies de KOR-datums zo dat geboekte documenten aan dezelfde kant blijven: kor_since na je laatste document met btw, ' +
            'kor_until op of na je laatste document zonder btw.',
        );
      }
    }

    if (next.vat_period !== current.vat_period) {
      const filings = await store.listFilings(tx);
      if (filings.length > 0 || expenses.length > 0) {
        throw new BookizError(
          'Het aangiftetijdvak kan niet meer wijzigen nu er uitgaven of aangiftes zijn vastgelegd.',
          'Bookiz kan bestaande boekingen nog niet over andere tijdvakken verdelen. Blijf bij het huidige tijdvak of begin een nieuwe administratie.',
        );
      }
    }
    return store.saveBusiness(tx, patch);
  });
}
