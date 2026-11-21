import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formValuesOf, parseBusinessForm } from '../src/app/business-form.ts';

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
  assert.equal(values.kor, '');
});

test('a fixed form of a KOR business saves without a btw-id', () => {
  const { vat_period: _p, kor: _k, vat_id: _v, ...rest } = complete;
  const parsed = parseBusinessForm(fields(rest));
  assert.ok('patch' in parsed, JSON.stringify(parsed));
  assert.equal('vat_id' in parsed.patch, false, 'an empty btw-id leaves the stored one alone');
});
