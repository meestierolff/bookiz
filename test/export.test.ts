import assert from 'node:assert/strict';
import { test } from 'node:test';
import readExcelFile from 'read-excel-file/node';
import * as expenses from '../src/app/expenses.ts';
import * as invoices from '../src/app/invoices.ts';
import * as reports from '../src/app/reports.ts';
import { type Sheet, bookkeeperSheets, toCsv, toXlsx } from '../src/app/spreadsheet.ts';
import { importOpeningState } from '../src/app/switch.ts';
import { makeCtx, seed } from './helpers.ts';

const column = (sheet: Sheet, header: string) => sheet.columns.findIndex((c) => c.header === header);
const total = (sheet: Sheet, header: string) => Math.round(sheet.rows.reduce((sum, row) => sum + (row[column(sheet, header)] as number), 0) * 100) / 100;

test('the bookkeeper export adds up to the year report and opens as a real spreadsheet', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  await importOpeningState(ctx, {
    switch_date: '2026-11-01',
    open_invoices: [{ number: 'MB-2026-0013', contact_id: customer, issue_date: '2026-10-20', due_date: '2026-11-19', net: 1000, vat: 210 }],
  });

  const a = await invoices.createInvoice(ctx, {
    contact_id: customer,
    issue_date: '2026-11-02',
    lines: [
      { description: 'Advies', quantity: 3, unit_price: 33.33 },
      { description: 'Reistijd', quantity: 1, unit_price: 10 },
      { description: 'Boek', quantity: 2, unit_price: 50, vat_code: 'low' },
    ],
  });
  const first = await invoices.finalizeInvoice(ctx, a.draft_id);
  await invoices.registerPayment(ctx, { number: first.number as string, paid_on: '2026-11-10' });
  const b = await invoices.createInvoice(ctx, { contact_id: customer, issue_date: '2026-11-03', lines: [{ description: 'Workshop', quantity: 1, unit_price: 500 }] });
  const second = await invoices.finalizeInvoice(ctx, b.draft_id);
  await invoices.creditInvoice(ctx, { number: second.number as string, reason: 'geannuleerd' });

  await expenses.recordExpense(ctx, { date: '2026-11-03', vendor: 'Kantoorhandel', amount: 121, vat_amount: 21, category: 'kantoor' });
  await expenses.recordExpense(ctx, { date: '2026-11-04', vendor: 'Café De Hoek', amount: 54.5, vat_amount: 4.5, category: 'eten_drinken_horeca', paid_from: 'private' });
  await expenses.recordExpense(ctx, { date: '2026-11-04', vendor: 'Google Ireland', amount: 100, vat_treatment: 'eu_reverse_charge', category: 'software' });
  await expenses.recordExpense(ctx, { date: '2026-11-05', vendor: 'Laptopwinkel', amount: 1210, vat_amount: 210, kind: 'investment', category: 'kantoor' });
  await expenses.recordMileage(ctx, { date: '2026-11-05', km: 40, description: 'Utrecht naar Zwolle, klantbezoek' });
  await expenses.recordExpense(ctx, { date: '2026-11-06', vendor: '=Gekke BV', amount: 24.2, vat_amount: 4.2, category: 'kantoor' });
  const mistake = await expenses.recordExpense(ctx, { date: '2026-11-06', vendor: 'Dubbel geboekt', amount: 12.1, vat_amount: 2.1, category: 'kantoor' });
  await expenses.voidExpense(ctx, { ref: mistake.ref, reason: 'per ongeluk dubbel' });

  const [income, spent] = (await bookkeeperSheets(ctx, 2026)) as [Sheet, Sheet];
  const year = (await reports.yearReport(ctx, { year: 2026 })) as Record<string, any>;

  // Inkomsten: every line of every own invoice; the invoice taken over from the old package already counted there.
  const numbers = income.rows.map((row) => row[0]);
  assert.deepEqual(numbers, ['2026-001', '2026-001', '2026-001', '2026-002', '2026-003']);
  assert.equal(total(income, 'Bedrag excl. btw'), year.omzet);
  // The btw per line adds up to the btw on each invoice: 23,10 at 21% and 9,00 at 9% on the first.
  const firstVat = income.rows.filter((row) => row[0] === '2026-001').reduce((sum, row) => sum + (row[column(income, 'Btw')] as number), 0);
  assert.equal(Math.round(firstVat * 100) / 100, 32.1);
  const credit = income.rows.find((row) => row[0] === '2026-003') as unknown[];
  assert.equal(credit[column(income, 'Soort')], 'creditfactuur');
  assert.ok((credit[column(income, 'Bedrag excl. btw')] as number) < 0);
  assert.ok(income.rows[0]?.[column(income, 'Betaald op')] instanceof Date);

  // Uitgaven: the voided expense is gone, the rest is there with an unambiguous btw percentage or none.
  const byVendor = (vendor: string) => spent.rows.find((row) => row[column(spent, 'Leverancier')] === vendor) as unknown[];
  assert.equal(spent.rows.length, 6);
  assert.equal(byVendor('Dubbel geboekt'), undefined);
  assert.equal(byVendor('Kantoorhandel')[column(spent, 'Btw-percentage')], 21);
  assert.equal(byVendor('Café De Hoek')[column(spent, 'Btw-percentage')], 9);
  assert.equal(byVendor('Café De Hoek')[column(spent, 'Betaald vanaf')], 'privé');
  assert.equal(byVendor('Google Ireland')[column(spent, 'Btw-percentage')], null);
  assert.equal(byVendor('Google Ireland')[column(spent, 'Btw-behandeling')], 'btw verlegd (EU)');
  assert.equal(byVendor('Laptopwinkel')[column(spent, 'Soort')], 'investering');
  const mileage = spent.rows.find((row) => row[column(spent, 'Soort')] === 'kilometers') as unknown[];
  assert.deepEqual([mileage[column(spent, 'Kilometers')], mileage[column(spent, 'Bedrag incl. btw')]], [40, 10]);

  // Read the workbook back with an independent reader.
  const book = await readExcelFile(await toXlsx([income, spent]));
  assert.deepEqual(book.map((s) => s.sheet), ['Inkomsten', 'Uitgaven']);
  const read = book[0]?.data as unknown[][];
  assert.equal(read[0]?.[0], 'Factuurnummer');
  assert.equal(read.length, income.rows.length + 1);
  assert.ok(read[1]?.[1] instanceof Date, 'dates are real dates');
  assert.equal(typeof read[1]?.[column(income, 'Bedrag excl. btw')], 'number', 'amounts are numbers');

  // CSV the way Dutch Excel opens it, with formula-looking text neutralised.
  const csv = toCsv(spent);
  assert.ok(csv.startsWith('﻿Bonnummer;Datum;'));
  assert.match(csv, /;'=Gekke BV;/);
  assert.match(csv, /;03-11-2026;/);
  assert.match(csv, /;100,00;21,00;121,00;/);
  assert.match(toCsv(income), /;-500,00;-105,00;-605,00;/);
});

test('the export of a KOR business shows invoices without btw', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx, { kor_since: '2026-01-01' });
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, issue_date: '2026-11-02', lines: [{ description: 'Les', quantity: 2, unit_price: 40 }] });
  await invoices.finalizeInvoice(ctx, draft.draft_id);
  const [income] = (await bookkeeperSheets(ctx, 2026)) as [Sheet];
  const row = income.rows[0] as unknown[];
  assert.deepEqual([row[column(income, 'Btw-tarief')], row[column(income, 'Btw')], row[column(income, 'Bedrag incl. btw')]], ['KOR', 0, 80]);
});
