import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessFormState, formValuesOf, parseBusinessForm, saveBusinessForm } from '../src/app/business-form.ts';
import * as expenses from '../src/app/expenses.ts';
import type { Business } from '../src/core/types.ts';
import * as store from '../src/store.ts';
import { makeCtx, seed } from './helpers.ts';

const complete = {
  name: 'Studio Voorbeeld',
  address_line: 'Dorpsstraat 1',
  postal_code: '1234ab',
  city: 'Utrecht',
  kvk_number: '1234 5678',
  vat_id: 'nl123456789b01',
  iban: 'nl91 abna 0417 1643 00',
  email: 'sam@voorbeeld.test',
  vat_period: 'year',
  kor: 'nee',
  payment_term_days: '14',
};

const fields = (values: Record<string, string>) => new URLSearchParams(values);

test('a complete form becomes a patch, normalised', () => {
  const parsed = parseBusinessForm(fields(complete));
  assert.ok('patch' in parsed, JSON.stringify(parsed));
  assert.equal(parsed.patch.postal_code, '1234 AB');
  assert.equal(parsed.patch.kvk_number, '12345678');
  assert.equal(parsed.patch.vat_id, 'NL123456789B01');
  assert.equal(parsed.patch.iban, 'NL91ABNA0417164300');
  assert.equal(parsed.patch.vat_period, 'year');
  assert.equal(parsed.patch.kor_since, null);
  assert.equal(parsed.patch.payment_term_days, 14);
  assert.equal(parsed.patch.owner_name, null);
});

test('required fields and patterns are checked per field', () => {
  const { vat_id: _omitted, ...rest } = complete;
  const parsed = parseBusinessForm(fields({ ...rest, name: '', kvk_number: '1234567', iban: 'NL91' }));
  assert.ok('errors' in parsed);
  assert.deepEqual(Object.keys(parsed.errors).sort(), ['iban', 'kvk_number', 'name', 'vat_id']);
  assert.equal(parsed.values.kvk_number, '1234567');
});

test('with the KOR the btw-id is optional but the start date is not', () => {
  const { vat_id: _omitted, ...rest } = complete;
  const missingDate = parseBusinessForm(fields({ ...rest, kor: 'ja' }));
  assert.ok('errors' in missingDate);
  assert.deepEqual(Object.keys(missingDate.errors), ['kor_since']);

  const withDate = parseBusinessForm(fields({ ...rest, kor: 'ja', kor_since: '2026-01-01' }));
  assert.ok('patch' in withDate, JSON.stringify(withDate));
  assert.equal(withDate.patch.kor_since, '2026-01-01');
});

test('fields a fixed form leaves out stay unchanged', () => {
  const { vat_period: _p, kor: _k, payment_term_days: _t, ...rest } = complete;
  const parsed = parseBusinessForm(fields(rest));
  assert.ok('patch' in parsed, JSON.stringify(parsed));
  assert.equal('vat_period' in parsed.patch, false);
  assert.equal('kor_since' in parsed.patch, false);
  assert.equal('payment_term_days' in parsed.patch, false);
});

test('formValuesOf prefills from the business or the sign-in address', () => {
  const values = formValuesOf(null, 'sam@voorbeeld.test');
  assert.equal(values.email, 'sam@voorbeeld.test');
  assert.equal(values.vat_period, 'quarter');
  assert.equal(values.payment_term_days, '30');
  assert.equal(values.kor, 'nee', 'an untouched KOR question is a no, so the btw-id rule applies');
});

const korBusiness: Business = {
  name: 'Studio Voorbeeld', owner_name: null, address_line: 'Dorpsstraat 1', postal_code: '1234 AB', city: 'Utrecht',
  kvk_number: '12345678', vat_id: null, iban: 'NL91ABNA0417164300', email: 'sam@voorbeeld.test', archive_email: null,
  kor_since: '2026-01-01', kor_until: null, vat_period: 'quarter' as const, payment_term_days: 30, books_start: null,
};

test('a fixed form of a KOR business saves without a btw-id', () => {
  const { vat_period: _p, kor: _k, vat_id: _v, ...rest } = complete;
  const parsed = parseBusinessForm(fields(rest), korBusiness);
  assert.ok('patch' in parsed, JSON.stringify(parsed));
  assert.equal('vat_id' in parsed.patch, false, 'an empty btw-id leaves the stored one alone');
});

test('without a KOR answer and without a KOR on file, the btw-id is required', () => {
  const { kor: _k, vat_id: _v, ...rest } = complete;
  const parsed = parseBusinessForm(fields(rest), null);
  assert.ok('errors' in parsed);
  assert.deepEqual(Object.keys(parsed.errors), ['vat_id']);
});

test('a KOR date without choosing ja is refused, not dropped', () => {
  for (const kor of ['nee', undefined]) {
    const { kor: _k, ...rest } = complete;
    const posted = kor ? { ...rest, kor, kor_since: '2026-01-01' } : { ...rest, kor_since: '2026-01-01' };
    const parsed = parseBusinessForm(fields(posted), null);
    assert.ok('errors' in parsed, String(kor));
    assert.deepEqual(Object.keys(parsed.errors), ['kor_since']);
  }
});

async function lastAudit(ctx: Awaited<ReturnType<typeof makeCtx>>) {
  const rows = await ctx.db.query<{ tool: string; outcome: string; approval: string | null }>('select tool, outcome, approval from audit_log order by id desc limit 1');
  return rows[0];
}

test('the form saves the business and the audit log says the owner did it', async () => {
  const ctx = await makeCtx();
  assert.deepEqual(await saveBusinessForm(ctx, fields(complete)), { ok: true });
  assert.equal((await store.getBusiness(ctx.db))?.kvk_number, '12345678');
  assert.deepEqual(await lastAudit(ctx), { tool: 'setup_business', outcome: 'ok', approval: 'owner' });
});

test('a locked administration saves nothing', async () => {
  const ctx = await makeCtx();
  ctx.locked = 'Je proefperiode is afgelopen.';
  const result = await saveBusinessForm(ctx, fields(complete));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.message, 'Je proefperiode is afgelopen.');
  assert.equal(!result.ok && result.values.name, 'Studio Voorbeeld');
  assert.equal(await store.getBusiness(ctx.db), null);
  assert.equal(await lastAudit(ctx), undefined);
});

test("the engine's own refusal reaches the form", async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  await expenses.recordExpense(ctx, { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8, category: 'reiskosten' });
  const result = await saveBusinessForm(ctx, fields({ ...complete, vat_period: 'month' }));
  assert.equal(result.ok, false);
  assert.match((!result.ok && result.message) || '', /Het aangiftetijdvak kan niet meer wijzigen/);
  assert.equal((await store.getBusiness(ctx.db))?.vat_period, 'quarter');
  assert.match((await lastAudit(ctx))?.outcome ?? '', /^error: /);
});

test('the form is fixed once there are bookings', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  assert.equal((await businessFormState(ctx, 'sam@voorbeeld.test')).fixed, false);
  await expenses.recordExpense(ctx, { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8, category: 'reiskosten' });
  const state = await businessFormState(ctx, 'sam@voorbeeld.test');
  assert.equal(state.fixed, true);
  assert.equal(state.values.kvk_number, '12345678');
});

test('after an error a fixed form shows the stored period and KOR, not blanks', async () => {
  const ctx = await makeCtx();
  await seed(ctx, { kor_since: '2026-01-01', vat_id: null });
  await expenses.recordExpense(ctx, { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 0, category: 'reiskosten' });
  const { vat_period: _p, kor: _k, ...rest } = complete;
  const result = await saveBusinessForm(ctx, fields({ ...rest, kvk_number: '1234' }));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fixed);
  assert.equal(!result.ok && result.values.vat_period, 'quarter');
  assert.equal(!result.ok && result.values.kor, 'ja');
  assert.equal(!result.ok && result.values.kor_since, '2026-01-01');
  assert.equal(!result.ok && result.values.kvk_number, '1234', 'what was typed stays');
});
