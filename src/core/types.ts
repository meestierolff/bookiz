import type { Cents } from './money.ts';
import type { IsoDate, VatPeriodKind } from './dates.ts';

export type Business = {
  name: string;
  owner_name: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  kvk_number: string | null;
  vat_id: string | null;
  iban: string | null;
  email: string | null;
  archive_email: string | null;
  /** First day of the kleineondernemersregeling; null when the business never used it. */
  kor_since: IsoDate | null;
  /** Last day the KOR applied; null while it is still running. */
  kor_until: IsoDate | null;
  vat_period: VatPeriodKind;
  payment_term_days: number;
  /** Set when the owner switched from another package: earlier dates belong to the old one. */
  books_start: IsoDate | null;
};

/** Facts about a year that no document can tell us; the owner states them. */
export type TaxYear = {
  year: number;
  hours_criterion: boolean;
  starter: boolean;
  wage_income_cents: Cents | null;
};

export type Contact = {
  id: number;
  name: string;
  email: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  vat_id: string | null;
  kvk_number: string | null;
};

export const SALE_VAT_CODES = ['high', 'low', 'zero', 'exempt', 'eu_reverse_charge', 'outside_eu', 'kor'] as const;
export type SaleVatCode = (typeof SALE_VAT_CODES)[number];

export type InvoiceLine = {
  description: string;
  quantity: number;
  unit_price_cents: Cents;
  vat_code: SaleVatCode;
};

export type Invoice = {
  id: number;
  status: 'draft' | 'final';
  number: string | null;
  contact_id: number;
  contact_snapshot: Contact | null;
  /** The sender as it was on the day the invoice became final. */
  business_snapshot: Business | null;
  issue_date: IsoDate;
  supply_date: IsoDate | null;
  due_date: IsoDate;
  lines: InvoiceLine[];
  net_cents: Cents;
  vat_cents: Cents;
  total_cents: Cents;
  credit_of: number | null;
  note: string | null;
  paid_on: IsoDate | null;
  sent_at: string | null;
  /** Brought over from another package: already counted there for turnover and btw. */
  imported: boolean;
};

export const EXPENSE_VAT_TREATMENTS = ['nl', 'eu_reverse_charge', 'non_eu_reverse_charge', 'none'] as const;
export type ExpenseVatTreatment = (typeof EXPENSE_VAT_TREATMENTS)[number];
export type ExpenseKind = 'cost' | 'investment' | 'mileage';

export type Receipt = {
  sha256: string;
  filename: string;
  bytes: number;
  archive: 'email' | 'folder';
  /** Message-ID of the archive e-mail, or the path below the data directory. */
  location: string;
  archived_at: string;
};

export type Expense = {
  id: number;
  ref: string;
  date: IsoDate;
  /** The btw period this document is declared in; later than `date` for a late receipt. */
  vat_period: string;
  vendor: string;
  description: string | null;
  kind: ExpenseKind;
  category: string;
  /** What was actually paid, including any Dutch btw on the receipt. */
  total_cents: Cents;
  vat_cents: Cents;
  vat_treatment: ExpenseVatTreatment;
  paid_from: 'business' | 'private';
  km: number | null;
  useful_life_years: number | null;
  residual_cents: Cents;
  receipt: Receipt | null;
  voided_at: string | null;
  void_reason: string | null;
  /** An asset brought over at its book value; its purchase counted in the old package. */
  imported: boolean;
  /** Purchase price of an imported asset, the base for the yearly depreciation maximum. */
  original_cost_cents: Cents | null;
};

export type RecurringInvoice = {
  id: number;
  contact_id: number;
  lines: InvoiceLine[];
  note: string | null;
  every_months: 1 | 3 | 12;
  next_date: IsoDate;
  active: boolean;
};

export type VatFiling = {
  period: string;
  filed_on: IsoDate;
  figures: Record<string, unknown>;
  payable_euros: number;
};
