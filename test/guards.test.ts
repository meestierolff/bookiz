import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupBusiness } from '../src/app/business.ts';
import * as expenses from '../src/app/expenses.ts';
import * as invoices from '../src/app/invoices.ts';
import * as reports from '../src/app/reports.ts';
import { toCents } from '../src/core/money.ts';
import { computeYear, estimateTax } from '../src/core/year.ts';
import { claimDataDir } from '../src/db.ts';
import * as store from '../src/store.ts';
import { makeCtx, seed } from './helpers.ts';

type Euros = Record<string, any>;
const work = (amount: number) => [{ description: 'Werk', quantity: 1, unit_price: amount }];

test('a data folder belongs to one running process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bookiz-lock-'));
  const lock = join(dir, 'bookiz.lock');

  // Our parent process is certainly alive and is not us.
  writeFileSync(lock, String(process.ppid));
  assert.throws(() => claimDataDir(dir), /draait al op de datamap/);

  // A lock left behind by a process that no longer exists is taken over.
  writeFileSync(lock, '2147483646');
  const release = claimDataDir(dir);
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
  release();
  assert.throws(() => readFileSync(lock), /ENOENT/);
});

test('KOR dates cannot change how booked documents are treated', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx, { kor_since: '2026-01-01', vat_id: null });
  await expenses.recordExpense(ctx, { date: '2026-02-10', vendor: 'Winkel', amount: 1210, vat_amount: 210 });
  const kor = await invoices.finalizeInvoice(
    ctx,
    (await invoices.createInvoice(ctx, { contact_id: customer, lines: work(500), issue_date: '2026-11-10' })).draft_id,
  );
  const before = (await reports.yearReport(ctx, { year: 2026 })) as Euros;
  assert.equal(before.aftrekbare_kosten, 1210);

  await assert.rejects(setupBusiness(ctx, { kor_since: null }), /achteraf anders behandelen/);
  await assert.rejects(setupBusiness(ctx, { kor_until: '2026-06-30' }), /factuur 2026-001/);
  await assert.rejects(setupBusiness(ctx, { kor_until: '2025-12-31' }), /op of na kor_since/);

  // Leaving the KOR on the day of the last KOR invoice keeps history intact.
  await setupBusiness(ctx, { kor_until: '2026-11-10', vat_id: 'NL123456789B01' });
  const after = (await reports.yearReport(ctx, { year: 2026 })) as Euros;
  assert.equal(after.aftrekbare_kosten, 1210);
  assert.equal((await store.getInvoice(ctx.db, kor.number as string)).vat_cents, 0);

  const taxed = await invoices.createInvoice(ctx, { contact_id: customer, lines: work(600), issue_date: '2026-11-12' });
  assert.equal(taxed.vat_cents, toCents(126), 'after kor_until invoices carry btw again');
});

test('a draft is checked again when it becomes final', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const withBtw = await invoices.createInvoice(ctx, { contact_id: customer, lines: work(500) });
  await setupBusiness(ctx, { kor_since: '2026-11-01' });
  await assert.rejects(invoices.finalizeInvoice(ctx, withBtw.draft_id), /klopt niet meer/);

  // Replacing the draft recalculates it under the KOR, and then it can be finalized.
  const redone = await invoices.createInvoice(ctx, { draft_id: withBtw.draft_id, contact_id: customer, lines: work(500) });
  assert.equal(redone.vat_cents, 0);
  const final = await invoices.finalizeInvoice(ctx, redone.draft_id);
  await assert.rejects(invoices.createInvoice(ctx, { draft_id: final.id, contact_id: customer, lines: work(1) }), /definitief/);

  const ctx2 = await makeCtx();
  await seed(ctx2);
  const belgian = await store.saveContact(ctx2.db, undefined, { name: 'BV België', address_line: 'Meir 1', city: 'Antwerpen', country: 'BE', vat_id: 'BE0123456789' });
  const verlegd = await invoices.createInvoice(ctx2, {
    contact_id: belgian.id,
    lines: [{ description: 'Advies', quantity: 1, unit_price: 100, vat_code: 'eu_reverse_charge' }],
  });
  await store.saveContact(ctx2.db, belgian.id, { country: 'NL' });
  await assert.rejects(invoices.finalizeInvoice(ctx2, verlegd.draft_id), /Nederlandse klant/);
});

test('a final invoice keeps the sender it was issued by', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const invoice = await invoices.finalizeInvoice(ctx, (await invoices.createInvoice(ctx, { contact_id: customer, lines: work(100) })).draft_id);
  await setupBusiness(ctx, { name: 'Nieuwe Naam', iban: 'NL99BANK9999999999' });
  const stored = await store.getInvoice(ctx.db, invoice.number as string);
  assert.equal(stored.business_snapshot?.name, 'Studio Voorbeeld');
  assert.equal(stored.business_snapshot?.iban, 'NL00BANK0123456789');
});

test('the filing frequency is fixed once there are bookings, and periods must match it', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  await setupBusiness(ctx, { vat_period: 'month' });
  await setupBusiness(ctx, { vat_period: 'quarter' });
  await expenses.recordExpense(ctx, { date: '2026-08-20', vendor: 'Winkel', amount: 121, vat_amount: 21 });
  await assert.rejects(setupBusiness(ctx, { vat_period: 'month' }), /aangiftetijdvak kan niet meer wijzigen/);
  await assert.rejects(reports.vatReturn(ctx, { period: '2026-08' }), /geen tijdvak van jou/);
  await assert.rejects(reports.markVatReturnFiled(ctx, { period: '2026-08' }), /geen tijdvak van jou/);
});

test('joining the KOR does not hide a return that is still owed', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  await invoices.finalizeInvoice(
    ctx,
    (await invoices.createInvoice(ctx, { contact_id: customer, lines: work(1000), issue_date: '2026-08-15' })).draft_id,
  );
  await setupBusiness(ctx, { kor_since: '2026-10-01' });
  const overview = (await reports.overview(ctx)) as Euros;
  assert.deepEqual(overview.btw.unfiled_periods.map((p: Euros) => p.period), ['2026-Q3']);

  // Crediting the pre-KOR invoice during the KOR still has to be reported.
  await invoices.creditInvoice(ctx, { number: '2026-001' });
  const q4 = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.equal(q4.rubrieken['1a'].btw, -210);
  assert.match(q4.how_to_file, /toch btw aan te geven/);
});

test('a business loss next to a high wage lowers the tax at the full top rate', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  await expenses.recordExpense(ctx, { date: '2026-05-01', vendor: 'Adviseur', amount: 10000, vat_amount: 0, vat_treatment: 'nl', category: 'advies' });
  const report = computeYear({
    year: 2026,
    business: await store.requireBusiness(ctx.db),
    taxYear: { year: 2026, hours_criterion: false, starter: false, wage_income_cents: null },
    invoices: [],
    expenses: await store.listExpenses(ctx.db),
  });
  assert.equal(report.belastbare_winst_cents, -toCents(8730));
  const estimate = estimateTax(report, toCents(90000));
  // 8.730 × 49,5%: all of the loss falls in the top bracket.
  assert.equal(estimate?.extra_inkomstenbelasting_cents, -toCents(4321.35));
  assert.equal(estimate?.zvw_cents, 0);
});

test('receipt download refuses addresses that are not public', async () => {
  const ctx = await makeCtx({ mode: 'http' });
  await seed(ctx);
  const expense = await expenses.recordExpense(ctx, { date: '2026-11-10', vendor: 'X', amount: 5, vat_amount: 0 });
  for (const host of ['100.64.0.1', '198.18.0.1', '169.254.169.254', '[::1]', '[fe90::1]', '[::ffff:10.0.0.1]']) {
    await assert.rejects(expenses.attachReceipt(ctx, expense.ref, { url: `https://${host}/bon.png` }), /openbaar adres/, host);
  }
  await assert.rejects(expenses.attachReceipt(ctx, expense.ref, { url: 'http://example.com/bon.png' }), /alleen via https/);
});
