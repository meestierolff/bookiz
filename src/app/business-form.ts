import type { Business } from '../core/types.ts';
import { IBAN, KVK_NUMBER, VAT_ID } from './business.ts';

/**
 * The business details as a Cloud customer fills them in on /app, once, before
 * the assistant takes over. The rules are the setup_business tool's; this only
 * turns what people type into what that tool accepts.
 */
export type BusinessFormField =
  | 'name'
  | 'owner_name'
  | 'address_line'
  | 'postal_code'
  | 'city'
  | 'kvk_number'
  | 'vat_id'
  | 'iban'
  | 'email'
  | 'vat_period'
  | 'kor'
  | 'kor_since'
  | 'payment_term_days';

export type BusinessFormValues = Record<BusinessFormField, string>;
export type BusinessFormErrors = Partial<Record<BusinessFormField, string>>;

const FIELDS: BusinessFormField[] = [
  'name',
  'owner_name',
  'address_line',
  'postal_code',
  'city',
  'kvk_number',
  'vat_id',
  'iban',
  'email',
  'vat_period',
  'kor',
  'kor_since',
  'payment_term_days',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formValuesOf(business: Business | null, signInEmail: string): BusinessFormValues {
  return {
    name: business?.name ?? '',
    owner_name: business?.owner_name ?? '',
    address_line: business?.address_line ?? '',
    postal_code: business?.postal_code ?? '',
    city: business?.city ?? '',
    kvk_number: business?.kvk_number ?? '',
    vat_id: business?.vat_id ?? '',
    iban: business?.iban ?? '',
    email: business?.email ?? signInEmail,
    vat_period: business?.vat_period ?? 'quarter',
    kor: business?.kor_since ? 'ja' : '',
    kor_since: business?.kor_since ?? '',
    payment_term_days: String(business?.payment_term_days ?? 30),
  };
}

/** What was posted, trimmed, for showing back after an error. */
export function valuesFrom(fields: URLSearchParams): BusinessFormValues {
  return Object.fromEntries(FIELDS.map((field) => [field, (fields.get(field) ?? '').trim()])) as BusinessFormValues;
}

export function parseBusinessForm(
  fields: URLSearchParams,
): { patch: Partial<Business> } | { values: BusinessFormValues; errors: BusinessFormErrors } {
  const values = valuesFrom(fields);
  const errors: BusinessFormErrors = {};
  const patch: Partial<Business> = {};
  const compact = (value: string) => value.replace(/[\s.]/g, '');

  const required: [BusinessFormField, string][] = [
    ['name', 'Vul de naam van je bedrijf in.'],
    ['address_line', 'Vul het adres in.'],
    ['postal_code', 'Vul de postcode in.'],
    ['city', 'Vul de plaats in.'],
  ];
  for (const [field, message] of required) {
    if (!values[field]) errors[field] = message;
  }
  patch.name = values.name;
  patch.address_line = values.address_line;
  patch.city = values.city;
  const postcode = /^(\d{4})\s?([a-zA-Z]{2})$/.exec(values.postal_code);
  patch.postal_code = postcode ? `${postcode[1]} ${(postcode[2] as string).toUpperCase()}` : values.postal_code;
  patch.owner_name = values.owner_name || null;

  const kvk = compact(values.kvk_number);
  if (!KVK_NUMBER.test(kvk)) errors.kvk_number = 'Een KvK-nummer heeft 8 cijfers.';
  else patch.kvk_number = kvk;

  const iban = compact(values.iban).toUpperCase();
  if (!IBAN.test(iban)) errors.iban = 'Dit is geen geldig IBAN.';
  else patch.iban = iban;

  if (!EMAIL.test(values.email)) errors.email = 'Vul een geldig e-mailadres in.';
  else patch.email = values.email;

  // A fixed form shows the period and the KOR as text; then they are not posted and stay as they are.
  const kor = fields.has('kor') ? values.kor === 'ja' : undefined;
  if (kor === true) {
    if (!DATE.test(values.kor_since)) errors.kor_since = 'Vul de datum in waarop je met de KOR begon.';
    else patch.kor_since = values.kor_since;
  } else if (kor === false) {
    patch.kor_since = null;
  }

  const vatId = compact(values.vat_id).toUpperCase();
  if (vatId) {
    if (!VAT_ID.test(vatId)) errors.vat_id = 'Een btw-id ziet eruit als NL123456789B01.';
    else patch.vat_id = vatId;
  } else if (kor === false) {
    // Only when the form says "no KOR": a fixed form does not post the KOR, and finalizing an invoice checks the btw-id anyway.
    errors.vat_id = 'Vul je btw-id in; zonder KOR staat het verplicht op je facturen.';
  }

  if (fields.has('vat_period')) {
    if (values.vat_period === 'month' || values.vat_period === 'quarter' || values.vat_period === 'year') patch.vat_period = values.vat_period;
    else errors.vat_period = 'Kies hoe vaak je btw-aangifte doet.';
  }

  if (values.payment_term_days) {
    const days = Number(values.payment_term_days);
    if (!Number.isInteger(days) || days < 0 || days > 365) errors.payment_term_days = 'De betaaltermijn is een aantal dagen, van 0 tot 365.';
    else patch.payment_term_days = days;
  }

  return Object.keys(errors).length > 0 ? { values, errors } : { patch };
}
