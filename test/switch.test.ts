import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as expenses from '../src/app/expenses.ts';
import * as invoices from '../src/app/invoices.ts';
import { addMonths, saveRecurringInvoice } from '../src/app/recurring.ts';
import * as reports from '../src/app/reports.ts';
import { importOpeningState } from '../src/app/switch.ts';
import * as store from '../src/store.ts';
import { makeCtx, seed } from './helpers.ts';

type Euros = Record<string, any>;

test('switching mid-year: numbering continues, open invoices and assets come along without counting twice', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);

  const result = await importOpeningState(ctx, {
    switch_date: '2026-11-01',
    last_invoice_number: { year: 2026, last_used: 14 },
    open_invoices: [
      { number: 'MB-2026-0013', contact_id: customer, issue_date: '2026-10-20', due_date: '2026-11-19', net: 1000, vat: 210 },
      // From a year Bookiz has no rule file for: taken as stated.
      { number: 'MB-2025-0031', contact_id: customer, issue_date: '2025-12-10', due_date: '2026-01-09', net: 500, vat: 105 },
    ],
    assets: [{ description: 'Laptop uit 2024', original_cost: 1500, book_value: 900, remaining_years: 3 }],
  });
  assert.equal(result.imported.length, 5);
  assert.match(result.notes.join(' '), /zeven jaar/);

  const next = await invoices.finalizeInvoice(
    ctx,
    (await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] })).draft_id,
  );
  assert.equal(next.number, '2026-015', 'the first invoice here follows the last one of the old package');

  const btw = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.equal(btw.rubrieken['1a'].omzet, 100, 'imported invoices were already declared elsewhere');
  assert.equal(btw['5b_voorbelasting'], 0);

  const year = (await reports.yearReport(ctx, { year: 2026 })) as Euros;
  assert.equal(year.omzet, 100);
  assert.equal(year.investeringen, 0, 'an imported asset is not a new investment');
  // € 900 over 3 remaining years, in use November and December: 2/12 of € 300, the maximum being 20% of the € 1.500 purchase price.
  assert.equal(year.afschrijving, 50);
  assert.equal(year.balance_items_year_end.debiteuren, 1210 + 605 + 121);

  const overview = (await reports.overview(ctx)) as Euros;
  // The imported 2025 invoice must not make old quarters look overdue: the books start on the switch date.
  assert.deepEqual(overview.btw.unfiled_periods, []);
  assert.equal(btw.period, '2026-Q4');
  assert.match(btw.warnings.join(' '), /overgestapt, midden in dit tijdvak/);
  assert.equal((await reports.vatReturn(ctx, {})).period, '2026-Q4', 'the default period is never one from before the switch');
  await assert.rejects(reports.vatReturn(ctx, { period: '2026-Q3' }), /vóór 2026-11-01, de dag waarop je naar Bookiz bent overgestapt/);
  await assert.rejects(expenses.recordExpense(ctx, { date: '2026-10-15', vendor: 'X', amount: 10, vat_amount: 0 }), /2026-10-15 ligt vóór 2026-11-01/);
  await assert.rejects(
    invoices.createInvoice(ctx, { contact_id: customer, issue_date: '2026-10-30', lines: [{ description: 'Werk', quantity: 1, unit_price: 1 }] }),
    /vóór 2026-11-01/,
  );
  assert.equal(overview.invoices.unpaid_count, 3);
  assert.deepEqual(overview.invoices.overdue.map((i: Euros) => i.number).sort(), ['MB-2025-0031']);

  const paid = await invoices.registerPayment(ctx, { number: 'MB-2026-0013' });
  assert.equal(paid.status, 'betaald');
  await assert.rejects(invoices.sendInvoice(ctx, { number: 'MB-2025-0031' }), /overgenomen uit je vorige pakket/);

  // Crediting an imported invoice is new: it lowers this period's turnover and btw.
  const credit = await invoices.creditInvoice(ctx, { number: 'MB-2025-0031' });
  assert.equal(credit.total_cents, -60500);
  assert.equal((await reports.vatReturn(ctx, { period: '2026-Q4' })).rubrieken['1a'].btw, 21 - 105);
});

test('the import refuses figures that cannot be right', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const base = { switch_date: '2026-11-01' };
  await assert.rejects(
    importOpeningState(ctx, { ...base, open_invoices: [{ number: 'X1', contact_id: customer, issue_date: '2026-10-01', due_date: '2026-10-31', net: 1000, vat: 90 }] }),
    /past .* btw niet bij/,
  );
  await assert.rejects(
    importOpeningState(ctx, { ...base, assets: [{ description: 'Camera', original_cost: 1000, book_value: 1200, remaining_years: 2 }] }),
    /boekwaarde .* tussen nul en de aanschafprijs/,
  );
  await invoices.finalizeInvoice(
    ctx,
    (await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] })).draft_id,
  );
  await importOpeningState(ctx, { ...base, last_invoice_number: { year: 2026, last_used: 20 } });
  await assert.rejects(importOpeningState(ctx, { ...base, last_invoice_number: { year: 2026, last_used: 0 } }), /kan niet terug/);
  // An invoice dated on or after the switch belongs in Bookiz itself, and the switch cannot be moved past existing bookings.
  await assert.rejects(
    importOpeningState(ctx, { ...base, open_invoices: [{ number: 'X2', contact_id: customer, issue_date: '2026-11-05', due_date: '2026-12-05', net: 100, vat: 21 }] }),
    /op of na de overstapdatum/,
  );
  await assert.rejects(importOpeningState(ctx, { switch_date: '2026-11-17' }), /toekomst/);
  ctx.setNow('2026-11-20T10:00:00Z');
  await assert.rejects(importOpeningState(ctx, { switch_date: '2026-11-18' }), /vóór de overstapdatum/);
  assert.equal((await store.listInvoices(ctx.db)).length, 1, 'a refused import leaves nothing behind');
});

test('a recurring invoice becomes a draft on its date, never a final invoice', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');

  const saved = (await saveRecurringInvoice(ctx, {
    contact_id: customer,
    lines: [{ description: 'Maandelijks onderhoud', quantity: 1, unit_price: 250 }],
    every_months: 1,
    next_date: '2026-10-01',
  })) as Euros;
  assert.equal(saved.next_date, '2026-10-01');

  const overview = (await reports.overview(ctx)) as Euros;
  // Two periods came due (October and November); each is a draft waiting for the owner.
  assert.equal(overview.invoices.drafts, 2);
  assert.match(overview.next_actions.join(' '), /Periodieke factuur voor Klant BV \(periode vanaf 2026-10-01\)/);
  assert.equal((await store.listInvoices(ctx.db)).every((invoice) => invoice.status === 'draft'), true);
  assert.equal((await store.listRecurring(ctx.db))[0]?.next_date, '2026-12-01');

  const again = (await reports.overview(ctx)) as Euros;
  assert.equal(again.invoices.drafts, 2, 'asking again does not create them twice');

  await saveRecurringInvoice(ctx, { id: saved.id, active: false });
  ctx.setNow('2026-12-15T10:00:00Z');
  assert.equal(((await reports.overview(ctx)) as Euros).invoices.drafts, 2, 'a stopped one stays stopped');
  await expenses.recordExpense(ctx, { date: '2026-12-01', vendor: 'X', amount: 1, vat_amount: 0 });
});

test('switching on 1 January: a clean first quarter, nothing from the old year looks overdue', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  ctx.setNow('2027-01-05T09:00:00Z');
  await importOpeningState(ctx, {
    switch_date: '2027-01-01',
    open_invoices: [{ number: 'MB-2026-0040', contact_id: customer, issue_date: '2026-12-12', due_date: '2027-01-11', net: 800, vat: 168 }],
  });
  const first = await invoices.finalizeInvoice(
    ctx,
    (await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 300 }] })).draft_id,
  );
  assert.equal(first.number, '2027-001');

  const overview = (await reports.overview(ctx)) as Euros;
  assert.deepEqual(overview.btw.unfiled_periods, [], 'the fourth quarter of 2026 is filed from the old package, not here');
  assert.equal(overview.invoices.unpaid_count, 2);

  const btw = await reports.vatReturn(ctx, {});
  assert.equal(btw.period, '2027-Q1');
  assert.equal(btw.rubrieken['1a'].omzet, 300);
  assert.deepEqual(btw.warnings, [], 'a switch on the first day of a period needs no warning');
  await assert.rejects(reports.vatReturn(ctx, { period: '2026-Q4' }), /2026-Q4 ligt vóór 2027-01-01/);
});
