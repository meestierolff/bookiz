import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { vatDeadline } from '../src/app/context.ts';
import * as expenses from '../src/app/expenses.ts';
import * as invoices from '../src/app/invoices.ts';
import * as reports from '../src/app/reports.ts';
import { toCents } from '../src/core/money.ts';
import { computeYear, estimateTax } from '../src/core/year.ts';
import * as store from '../src/store.ts';
import { makeCtx, PNG, seed } from './helpers.ts';

type Euros = Record<string, any>;

test('a quarter from first invoice to btw-aangifte and year report', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);

  const draft = await invoices.createInvoice(ctx, {
    contact_id: customer,
    lines: [{ description: 'Advies oktober', quantity: 10, unit_price: 85 }],
    issue_date: '2026-11-02',
  });
  assert.equal(draft.total_cents, toCents(1028.5));
  const invoice = await invoices.finalizeInvoice(ctx, draft.draft_id);
  assert.equal(invoice.number, '2026-001');
  assert.equal(invoice.due_date, '2026-12-02');
  assert.ok(existsSync(invoice.pdf), 'the PDF is written to the data folder in stdio mode');
  assert.equal(readFileSync(invoice.pdf).subarray(0, 5).toString(), '%PDF-');

  await expenses.recordExpense(ctx, { date: '2026-11-03', vendor: 'Kantoorhandel', amount: 121, vat_amount: 21, category: 'kantoor' });
  await expenses.recordExpense(ctx, { date: '2026-11-04', vendor: 'Google Ireland', amount: 100, vat_treatment: 'eu_reverse_charge', category: 'software' });
  await expenses.recordExpense(ctx, { date: '2026-11-05', vendor: 'Café De Hoek', amount: 54.5, vat_amount: 4.5, category: 'eten_drinken_horeca', paid_from: 'private' });

  const btw = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.deepEqual(
    [btw.rubrieken['1a'].omzet, btw.rubrieken['1a'].btw, btw.rubrieken['1a'].documents],
    [850, 178, ['2026-001']],
  );
  assert.deepEqual([btw.rubrieken['4b'].omzet, btw.rubrieken['4b'].btw], [100, 21]);
  assert.equal(btw['5a_verschuldigde_btw'], 199);
  // € 21 from the office shop plus the € 21 self-assessed on Google; the café btw is not deductible.
  assert.equal(btw['5b_voorbelasting'], 42);
  assert.equal(btw.totaal_te_betalen, 157);
  assert.equal(btw.deadline_aangifte_en_betaling, '2027-01-31');
  assert.equal(btw.status, 'tijdvak loopt nog');

  const year = (await reports.yearReport(ctx, { year: 2026 })) as Euros;
  assert.equal(year.omzet, 850);
  // 100 office + 100 software + 80% of the full € 54,50 café bill.
  assert.equal(year.aftrekbare_kosten, 243.6);
  assert.equal(year.winst, 606.4);
  assert.equal(year.zelfstandigenaftrek, 0);
  assert.equal(year.mkb_winstvrijstelling, 77.01);
  assert.equal(year.belastbare_winst, 529.39);
  assert.equal(year.prive_betaald, 54.5);
  assert.equal(year.balance_items_year_end.debiteuren, 1028.5);
});

test('final invoices are numbered consecutively and only reversed, never edited', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const line = [{ description: 'Workshop', quantity: 1, unit_price: 500 }];

  const first = await invoices.finalizeInvoice(ctx, (await invoices.createInvoice(ctx, { contact_id: customer, lines: line })).draft_id);
  const second = await invoices.finalizeInvoice(ctx, (await invoices.createInvoice(ctx, { contact_id: customer, lines: line })).draft_id);
  assert.deepEqual([first.number, second.number], ['2026-001', '2026-002']);

  await assert.rejects(invoices.createInvoice(ctx, { draft_id: first.id, contact_id: customer, lines: line }), /definitief/);

  const credit = await invoices.creditInvoice(ctx, { number: '2026-001', reason: 'Verkeerd bedrag' });
  assert.equal(credit.number, '2026-003');
  assert.equal(credit.total_cents, -toCents(605));
  assert.equal((await store.getInvoice(ctx.db, '2026-001')).paid_on, '2026-11-16', 'unpaid original and credit settle each other');
  await assert.rejects(invoices.creditInvoice(ctx, { number: '2026-001' }), /al gecrediteerd/);

  const btw = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.equal(btw.rubrieken['1a'].omzet, 500, 'invoice and credit cancel out, the second invoice remains');
});

test('an invoice cannot be finalized without the legally required details', async () => {
  const ctx = await makeCtx();
  await store.saveBusiness(ctx.db, { name: 'Kaal Bedrijf' });
  const contact = await store.saveContact(ctx.db, undefined, { name: 'Klant', address_line: 'Straat 1', city: 'Zwolle' });
  const draft = await invoices.createInvoice(ctx, { contact_id: contact.id, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
  await assert.rejects(invoices.finalizeInvoice(ctx, draft.draft_id), /adres, postcode, plaats, KvK-nummer, IBAN, btw-identificatienummer/);
});

test('services to an EU business: btw verlegd, rubriek 3b and the ICP list', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  const belgian = await store.saveContact(ctx.db, undefined, { name: 'Klant BV België', address_line: 'Meir 1', city: 'Antwerpen', country: 'BE' });
  const lines = [{ description: 'Consultancy', quantity: 1, unit_price: 2000, vat_code: 'eu_reverse_charge' as const }];
  await assert.rejects(invoices.createInvoice(ctx, { contact_id: belgian.id, lines }), /btw-identificatienummer/);

  await store.saveContact(ctx.db, belgian.id, { vat_id: 'BE0123456789' });
  const draft = await invoices.createInvoice(ctx, { contact_id: belgian.id, lines });
  assert.equal(draft.vat_cents, 0);
  assert.deepEqual(draft.remarks_on_invoice, ['Btw verlegd.']);
  await invoices.finalizeInvoice(ctx, draft.draft_id);

  const btw = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.equal(btw.rubrieken['3b'].omzet, 2000);
  assert.deepEqual(btw.icp, [{ vat_id: 'BE0123456789', customer: 'Klant BV België', amount: 2000 }]);
  assert.equal(btw.totaal_te_betalen, 0);
});

test('KOR: no btw on invoices, the limit is enforced, reverse-charged purchases still cost btw', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx, { kor_since: '2026-01-01', vat_id: null });

  const draft = await invoices.createInvoice(ctx, {
    contact_id: customer,
    lines: [{ description: 'Fotoreportage', quantity: 1, unit_price: 19500, vat_code: 'high' }],
  });
  assert.equal(draft.vat_cents, 0, 'the KOR overrides the tariff the agent asked for');
  await invoices.finalizeInvoice(ctx, draft.draft_id);

  const tooMuch = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Extra dag', quantity: 1, unit_price: 600 }] });
  await assert.rejects(invoices.finalizeInvoice(ctx, tooMuch.draft_id), /boven de KOR-grens/);

  const software = await expenses.recordExpense(ctx, { date: '2026-11-01', vendor: 'US SaaS Inc', amount: 100, vat_treatment: 'non_eu_reverse_charge', category: 'software' });
  await expenses.recordExpense(ctx, { date: '2026-11-02', vendor: 'Drukker', amount: 121, vat_amount: 21, category: 'marketing' });
  assert.ok(software.ref);

  const btw = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.equal(btw.kor, true);
  assert.equal(btw.rubrieken['1a'].omzet, 0);
  assert.equal(btw.rubrieken['4a'].btw, 21);
  assert.equal(btw['5b_voorbelasting'], 0);
  assert.equal(btw.totaal_te_betalen, 21);
  assert.match(btw.how_to_file, /incidentele aangifte/);

  const year = (await reports.yearReport(ctx, { year: 2026 })) as Euros;
  // Without deduction the btw is part of the cost: 121 for the SaaS and 121 for the printer.
  assert.equal(year.aftrekbare_kosten, 242);
});

test('expenses: duplicates, impossible btw, small investments and mileage', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  const receipt = { date: '2026-10-10', vendor: 'Coolblue', amount: 1815, vat_amount: 315 };

  const laptop = await expenses.recordExpense(ctx, { ...receipt, kind: 'investment', description: 'Laptop' });
  assert.equal(laptop.kind, 'investment');
  assert.equal(laptop.useful_life_years, 5);
  await assert.rejects(expenses.recordExpense(ctx, receipt), /lijkt al geboekt als K2026-001/);
  await assert.rejects(expenses.recordExpense(ctx, { date: '2026-10-11', vendor: 'X', amount: 100, vat_amount: 30 }), /kan niet bij een totaal/);
  await assert.rejects(expenses.recordExpense(ctx, { date: '2026-10-11', vendor: 'X', amount: 100 }), /btw-bedrag van de bon/);
  await assert.rejects(expenses.recordExpense(ctx, { date: '2027-01-01', vendor: 'X', amount: 1, vat_amount: 0 }), /toekomst/);

  const mouse = await expenses.recordExpense(ctx, { date: '2026-10-12', vendor: 'Coolblue', amount: 96.8, vat_amount: 16.8, kind: 'investment' });
  assert.equal(mouse.kind, 'cost', 'below € 450 it is an ordinary cost');

  const trip = await expenses.recordMileage(ctx, { date: '2026-10-13', km: 120, description: 'Utrecht - Zwolle, klantbezoek' });
  assert.equal(trip.total_cents, toCents(30));

  const year = (await reports.yearReport(ctx, { year: 2026 })) as Euros;
  // € 1.500 over 5 years, in use October to December: 3/12 of € 300.
  assert.equal(year.afschrijving, 75);
  assert.equal(year.afschrijvingen[0].book_value_end, 1425);
  assert.equal(year.aftrekbare_kosten, 80 + 30);
  assert.equal(year.kia, 0, 'one € 1.500 laptop stays below the KIA minimum of € 2.901');
});

test('filing a period locks it; a late receipt moves to the open period', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  const early = await expenses.recordExpense(ctx, { date: '2026-08-20', vendor: 'Boekhandel', amount: 54.5, vat_amount: 4.5, category: 'opleiding' });
  assert.equal(early.vat_period, '2026-Q3');

  const before = (await reports.overview(ctx)) as Euros;
  assert.deepEqual(before.btw.unfiled_periods.map((p: Euros) => p.period), ['2026-Q3']);
  assert.match(before.next_actions.join(' '), /Btw-aangifte 2026-Q3 is te laat/);

  await assert.rejects(reports.markVatReturnFiled(ctx, { period: '2026-Q4' }), /nog niet afgelopen/);
  const filed = await reports.markVatReturnFiled(ctx, { period: '2026-Q3', filed_on: '2026-10-20' });
  assert.equal(filed.totaal_te_betalen, -5, 'voorbelasting is rounded up in the taxpayer’s favour');

  const late = await expenses.recordExpense(ctx, { date: '2026-09-01', vendor: 'Trein', amount: 21.8, vat_amount: 1.8, category: 'reiskosten' });
  assert.equal(late.vat_period, '2026-Q4');
  assert.match(late.notes.join(' '), /suppletie/);

  await assert.rejects(expenses.voidExpense(ctx, { ref: early.ref, reason: 'dubbel' }), /al gedaan/);
  const voided = await expenses.voidExpense(ctx, { ref: late.ref, reason: 'privé-uitgave' });
  assert.equal(voided.void_reason, 'privé-uitgave');
  assert.equal(vatDeadline('2026-Q4'), '2027-01-31');
  assert.equal(vatDeadline('2027-01'), '2027-02-28');
});

test('receipts: archived to a folder or to the owner’s mailbox, never to the database', async () => {
  const folder = await makeCtx();
  await seed(folder);
  const first = await expenses.recordExpense(folder, { date: '2026-11-10', vendor: 'Albert Heijn', amount: 12.4, vat_amount: 1.02 });
  const stored = await expenses.attachReceipt(folder, first.ref, { content_base64: PNG.toString('base64') });
  assert.equal(stored.receipt.archive, 'folder');
  assert.deepEqual(readFileSync(join(folder.config.dataDir, stored.receipt.location)), PNG);
  await assert.rejects(expenses.attachReceipt(folder, first.ref, { content_base64: PNG.toString('base64') }), /al een bewijsstuk/);
  await assert.rejects(
    expenses.attachReceipt(folder, (await expenses.recordExpense(folder, { date: '2026-11-11', vendor: 'X', amount: 5, vat_amount: 0 })).ref, {
      content_base64: Buffer.from('gewoon tekst').toString('base64'),
    }),
    /geen foto of pdf/,
  );

  const email = await makeCtx({ receiptArchive: 'email' });
  await seed(email, { archive_email: 'bonnen@voorbeeld.test' });
  const second = await expenses.recordExpense(email, { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8 });
  const mailed = await expenses.attachReceipt(email, second.ref, { content_base64: PNG.toString('base64') });
  assert.equal(mailed.receipt.archive, 'email');
  assert.equal(email.sent[0]?.to, 'bonnen@voorbeeld.test');
  assert.match(email.sent[0]?.subject ?? '', /\[Bookiz bon\] K2026-001 · 2026-11-10 · NS · € 21,80/);
  assert.deepEqual(email.sent[0]?.attachments[0]?.content, PNG);
  const row = await email.db.query<{ receipt: Euros }>('select receipt from expense');
  assert.equal(row[0]?.receipt.location, '<test-1@bookiz.test>');
  assert.equal(JSON.stringify(row).includes(PNG.toString('base64')), false);

  const remote = await makeCtx({ mode: 'http' });
  await seed(remote);
  const third = await expenses.recordExpense(remote, { date: '2026-11-10', vendor: 'Y', amount: 5, vat_amount: 0 });
  await assert.rejects(expenses.attachReceipt(remote, third.ref, { file_path: '/etc/passwd' }), /alleen als Bookiz lokaal draait/);
  await assert.rejects(expenses.attachReceipt(remote, third.ref, { url: 'https://127.0.0.1/bon.png' }), /openbaar adres/);
});

test('sending an invoice mails the PDF to the customer with a copy to the owner', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 2, unit_price: 100 }] });
  await assert.rejects(invoices.sendInvoice(ctx, { number: String(draft.draft_id) }), /bestaat niet/);
  const invoice = await invoices.finalizeInvoice(ctx, draft.draft_id);
  const result = await invoices.sendInvoice(ctx, { number: invoice.number as string });
  assert.equal(result.sent_to, 'administratie@klant.test');
  assert.equal(ctx.sent[0]?.cc, 'sam@voorbeeld.test');
  assert.equal(ctx.sent[0]?.attachments[0]?.filename, 'factuur-2026-001.pdf');
  assert.ok((await store.getInvoice(ctx.db, '2026-001')).sent_at);
});

test('tax to set aside: hand-calculated against the 2026 tables', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const bill = async (amount: number) =>
    invoices.finalizeInvoice(
      ctx,
      (await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: amount }] })).draft_id,
    );
  await bill(10000);
  const books = async () => ({
    year: 2026,
    business: await store.requireBusiness(ctx.db),
    invoices: await store.listInvoices(ctx.db),
    expenses: await store.listExpenses(ctx.db),
  });
  const facts = { year: 2026, hours_criterion: false, starter: false, wage_income_cents: null };

  // Next to a € 50.000 job: belastbare winst 8.730; extra box 1 tax 4.488,54; Zvw 4,85% = 423,41.
  const beside = estimateTax(computeYear({ ...(await books()), taxYear: facts }), toCents(50000));
  assert.ok(beside);
  assert.ok(Math.abs(beside.extra_inkomstenbelasting_cents - toCents(4488.54)) <= 2);
  assert.equal(beside.zvw_cents, toCents(423.41));

  // Full-time, € 20.000 profit, no job: the heffingskortingen cover the tax, only Zvw remains.
  await bill(10000);
  const alone = estimateTax(computeYear({ ...(await books()), taxYear: facts }), 0);
  assert.equal(alone?.extra_inkomstenbelasting_cents, 0);
  assert.equal(alone?.zvw_cents, toCents(846.81));

  // With the urencriterium and startersaftrek the deductions come first.
  const starter = computeYear({ ...(await books()), taxYear: { ...facts, hours_criterion: true, starter: true } });
  assert.equal(starter.zelfstandigenaftrek_cents + starter.startersaftrek_cents, toCents(3323));
  assert.equal(starter.mkb_winstvrijstelling_cents, toCents(2117.98));
  assert.equal(starter.belastbare_winst_cents, toCents(14559.02));
});

test('a filed return keeps its figures, and January works before the new rules exist', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, {
    contact_id: customer,
    lines: [{ description: 'Werk', quantity: 1, unit_price: 1000 }],
    issue_date: '2026-11-10',
  });
  await invoices.finalizeInvoice(ctx, draft.draft_id);

  ctx.setNow('2027-01-05T09:00:00Z');
  const january = (await reports.overview(ctx)) as Euros;
  assert.match(january.next_actions.join(' '), /belastingregels voor 2027 ontbreken/);
  assert.match(january.next_actions.join(' '), /Btw-aangifte 2026-Q4 doen en betalen vóór 2027-01-31/);
  assert.equal(january.year_to_date, null);
  await assert.rejects(
    expenses.recordExpense(ctx, { date: '2027-01-04', vendor: 'X', amount: 10, vat_amount: 0 }),
    /geen belastingregels voor 2027/,
  );

  const open = await reports.vatReturn(ctx, {});
  assert.equal(open.period, '2026-Q4', 'without a period it picks the oldest one still to file');
  assert.equal(open.totaal_te_betalen, 210);
  await reports.markVatReturnFiled(ctx, { period: '2026-Q4' });

  // Reconfiguring the business afterwards must not rewrite what was filed.
  await store.saveBusiness(ctx.db, { kor_since: '2026-01-01' });
  const frozen = await reports.vatReturn(ctx, { period: '2026-Q4' });
  assert.equal(frozen.totaal_te_betalen, 210);
  assert.equal(frozen.status, 'aangegeven op 2027-01-05');
});
