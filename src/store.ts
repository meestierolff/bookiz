import type { Approval } from './approval.ts';
import type { Queryable } from './db.ts';
import { BookizError } from './errors.ts';
import type { IsoDate } from './core/dates.ts';
import type { Business, Contact, Expense, Invoice, Receipt, RecurringInvoice, TaxYear, VatFiling } from './core/types.ts';

const BUSINESS_FIELDS = [
  'name',
  'owner_name',
  'address_line',
  'postal_code',
  'city',
  'kvk_number',
  'vat_id',
  'iban',
  'email',
  'archive_email',
  'kor_since',
  'kor_until',
  'vat_period',
  'payment_term_days',
  'books_start',
] as const satisfies readonly (keyof Business)[];

const CONTACT_FIELDS = [
  'name',
  'email',
  'address_line',
  'postal_code',
  'city',
  'country',
  'vat_id',
  'kvk_number',
] as const satisfies readonly (keyof Contact)[];

const INVOICE_COLUMNS =
  'id, status, number, contact_id, contact_snapshot, business_snapshot, issue_date, supply_date, due_date, lines, net_cents, vat_cents, total_cents, credit_of, note, paid_on, sent_at, imported';

const EXPENSE_COLUMNS =
  'id, ref, date, vat_period, vendor, description, kind, category, total_cents, vat_cents, vat_treatment, paid_from, km, useful_life_years, residual_cents, receipt, voided_at, void_reason, imported, original_cost_cents';

export async function getBusiness(q: Queryable): Promise<Business | null> {
  const rows = await q.query<Business>(`select ${BUSINESS_FIELDS.join(', ')} from business where id = 1`);
  return rows[0] ?? null;
}

export async function requireBusiness(q: Queryable): Promise<Business> {
  const business = await getBusiness(q);
  if (!business) {
    throw new BookizError(
      'De administratie is nog niet ingericht.',
      'Roep eerst setup_business aan met minimaal de bedrijfsnaam.',
    );
  }
  return business;
}

export async function saveBusiness(q: Queryable, patch: Partial<Business>): Promise<Business> {
  const current = await getBusiness(q);
  if (!current && !patch.name) throw new BookizError('Een bedrijfsnaam is verplicht bij de eerste inrichting.');
  const merged = { ...(current ?? { vat_period: 'quarter', payment_term_days: 30 }), ...patch } as Business;
  const values = BUSINESS_FIELDS.map((field) => merged[field] ?? null);
  await q.query(
    `insert into business (id, ${BUSINESS_FIELDS.join(', ')})
     values (1, ${BUSINESS_FIELDS.map((_, i) => `$${i + 1}`).join(', ')})
     on conflict (id) do update set ${BUSINESS_FIELDS.map((f) => `${f} = excluded.${f}`).join(', ')}, updated_at = now()`,
    values,
  );
  return (await getBusiness(q)) as Business;
}

/** Row lock that serialises numbering; call it first inside a transaction. */
export async function lockBusiness(tx: Queryable): Promise<Business> {
  const rows = await tx.query<Business>(`select ${BUSINESS_FIELDS.join(', ')} from business where id = 1 for update`);
  if (!rows[0]) return requireBusiness(tx);
  return rows[0];
}

export async function getTaxYear(q: Queryable, year: number): Promise<TaxYear> {
  const rows = await q.query<TaxYear>(
    'select year, hours_criterion, starter, wage_income_cents from tax_year where year = $1',
    [year],
  );
  return rows[0] ?? { year, hours_criterion: false, starter: false, wage_income_cents: null };
}

export async function saveTaxYear(q: Queryable, taxYear: TaxYear): Promise<void> {
  await q.query(
    `insert into tax_year (year, hours_criterion, starter, wage_income_cents) values ($1, $2, $3, $4)
     on conflict (year) do update set hours_criterion = excluded.hours_criterion,
       starter = excluded.starter, wage_income_cents = excluded.wage_income_cents`,
    [taxYear.year, taxYear.hours_criterion, taxYear.starter, taxYear.wage_income_cents],
  );
}

export async function saveContact(q: Queryable, id: number | undefined, patch: Partial<Contact>): Promise<Contact> {
  if (id === undefined) {
    if (!patch.name) throw new BookizError('Een nieuwe relatie heeft een naam nodig.');
    const merged = { country: 'NL', ...patch };
    const rows = await q.query<{ id: number }>(
      `insert into contact (${CONTACT_FIELDS.join(', ')})
       values (${CONTACT_FIELDS.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      CONTACT_FIELDS.map((field) => merged[field] ?? null),
    );
    return getContact(q, (rows[0] as { id: number }).id);
  }
  const merged = { ...(await getContact(q, id)), ...patch };
  await q.query(
    `update contact set ${CONTACT_FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')} where id = $1`,
    [id, ...CONTACT_FIELDS.map((field) => merged[field] ?? null)],
  );
  return getContact(q, id);
}

export async function getContact(q: Queryable, id: number): Promise<Contact> {
  const rows = await q.query<Contact>(`select id, ${CONTACT_FIELDS.join(', ')} from contact where id = $1`, [id]);
  if (!rows[0]) throw new BookizError(`Relatie ${id} bestaat niet.`, 'Zoek de relatie op met find_contacts.');
  return rows[0];
}

export async function findContacts(q: Queryable, search: string | undefined): Promise<Contact[]> {
  return q.query<Contact>(
    `select id, ${CONTACT_FIELDS.join(', ')} from contact
     where $1::text is null or name ilike '%' || $1 || '%' or email ilike '%' || $1 || '%'
     order by name limit 50`,
    [search?.trim() || null],
  );
}

export type InvoiceDraft = Pick<
  Invoice,
  'contact_id' | 'issue_date' | 'supply_date' | 'due_date' | 'lines' | 'net_cents' | 'vat_cents' | 'total_cents' | 'credit_of' | 'note'
>;

export async function insertInvoice(q: Queryable, draft: InvoiceDraft): Promise<number> {
  const rows = await q.query<{ id: number }>(
    `insert into invoice (contact_id, issue_date, supply_date, due_date, lines, net_cents, vat_cents, total_cents, credit_of, note)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10) returning id`,
    invoiceParams(draft),
  );
  return (rows[0] as { id: number }).id;
}

export async function updateDraftInvoice(q: Queryable, id: number, draft: InvoiceDraft): Promise<void> {
  const updated = await q.query(
    `update invoice set contact_id = $1, issue_date = $2, supply_date = $3, due_date = $4, lines = $5::jsonb,
       net_cents = $6, vat_cents = $7, total_cents = $8, credit_of = $9, note = $10
     where id = $11 and status = 'draft' returning id`,
    [...invoiceParams(draft), id],
  );
  // Zero rows means the draft became final in the meantime; say so instead of pretending.
  if (updated.length === 0) throw new BookizError('Dit concept is intussen definitief gemaakt en kan niet meer worden gewijzigd.');
}

function invoiceParams(draft: InvoiceDraft): unknown[] {
  return [
    draft.contact_id,
    draft.issue_date,
    draft.supply_date,
    draft.due_date,
    JSON.stringify(draft.lines),
    draft.net_cents,
    draft.vat_cents,
    draft.total_cents,
    draft.credit_of,
    draft.note,
  ];
}

/** Accepts the internal id of a draft or the number of a final invoice. `lock` holds the row until commit. */
export async function getInvoice(q: Queryable, idOrNumber: number | string, lock = false): Promise<Invoice> {
  const tail = lock ? ' for update' : '';
  const rows =
    typeof idOrNumber === 'number'
      ? await q.query<Invoice>(`select ${INVOICE_COLUMNS} from invoice where id = $1${tail}`, [idOrNumber])
      : await q.query<Invoice>(`select ${INVOICE_COLUMNS} from invoice where number = $1${tail}`, [idOrNumber]);
  if (!rows[0]) throw new BookizError(`Factuur ${idOrNumber} bestaat niet.`, 'Bekijk de facturen met list_invoices.');
  return rows[0];
}

export async function listInvoices(q: Queryable, range?: { from: IsoDate; to: IsoDate }): Promise<Invoice[]> {
  return q.query<Invoice>(
    `select ${INVOICE_COLUMNS} from invoice
     where ($1::date is null or issue_date >= $1) and ($2::date is null or issue_date <= $2)
     order by issue_date, id`,
    [range?.from ?? null, range?.to ?? null],
  );
}

export async function deleteDraftInvoice(q: Queryable, id: number): Promise<void> {
  await q.query(`delete from invoice where id = $1 and status = 'draft'`, [id]);
}

/** Continues after the highest number used here or, after a switch, in the previous package. */
export async function nextInvoiceSeq(tx: Queryable, year: number): Promise<number> {
  const rows = await tx.query<{ next: number }>(
    `select greatest(
       coalesce((select max(seq) from invoice where year = $1), 0),
       coalesce((select last_used from invoice_counter where year = $1), 0)
     ) + 1 as next`,
    [year],
  );
  return (rows[0] as { next: number }).next;
}

export async function setInvoiceCounter(tx: Queryable, year: number, lastUsed: number): Promise<void> {
  await tx.query(
    'insert into invoice_counter (year, last_used) values ($1, $2) on conflict (year) do update set last_used = excluded.last_used',
    [year, lastUsed],
  );
}

export async function insertImportedInvoice(
  tx: Queryable,
  invoice: InvoiceDraft & { number: string; contact_snapshot: Contact; business_snapshot: Business },
): Promise<void> {
  await tx.query(
    `insert into invoice (status, number, contact_id, contact_snapshot, business_snapshot, issue_date, supply_date, due_date,
       lines, net_cents, vat_cents, total_cents, note, imported)
     values ('final', $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, true)`,
    [
      invoice.number,
      invoice.contact_id,
      JSON.stringify(invoice.contact_snapshot),
      JSON.stringify(invoice.business_snapshot),
      invoice.issue_date,
      invoice.supply_date,
      invoice.due_date,
      JSON.stringify(invoice.lines),
      invoice.net_cents,
      invoice.vat_cents,
      invoice.total_cents,
      invoice.note,
    ],
  );
}

export async function markInvoiceFinal(
  tx: Queryable,
  id: number,
  final: { number: string; year: number; seq: number; contact_snapshot: Contact; business_snapshot: Business },
): Promise<void> {
  await tx.query(
    `update invoice set status = 'final', number = $2, year = $3, seq = $4, contact_snapshot = $5::jsonb,
       business_snapshot = $6::jsonb
     where id = $1 and status = 'draft'`,
    [id, final.number, final.year, final.seq, JSON.stringify(final.contact_snapshot), JSON.stringify(final.business_snapshot)],
  );
}

export async function setInvoicePaid(q: Queryable, id: number, paidOn: IsoDate | null): Promise<void> {
  await q.query('update invoice set paid_on = $2 where id = $1', [id, paidOn]);
}

export async function setInvoiceSent(q: Queryable, id: number): Promise<void> {
  await q.query('update invoice set sent_at = now() where id = $1', [id]);
}

export type NewExpense = Omit<Expense, 'id' | 'ref' | 'receipt' | 'voided_at' | 'void_reason' | 'imported' | 'original_cost_cents'> & {
  imported?: boolean;
  original_cost_cents?: number | null;
};

export async function insertExpense(tx: Queryable, expense: NewExpense, year: number): Promise<Expense> {
  const rows = await tx.query<{ next: number }>(
    'select coalesce(max(seq), 0) + 1 as next from expense where year = $1',
    [year],
  );
  const seq = (rows[0] as { next: number }).next;
  const ref = `K${year}-${String(seq).padStart(3, '0')}`;
  await tx.query(
    `insert into expense (ref, year, seq, date, vat_period, vendor, description, kind, category, total_cents,
       vat_cents, vat_treatment, paid_from, km, useful_life_years, residual_cents, imported, original_cost_cents)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      ref,
      year,
      seq,
      expense.date,
      expense.vat_period,
      expense.vendor,
      expense.description,
      expense.kind,
      expense.category,
      expense.total_cents,
      expense.vat_cents,
      expense.vat_treatment,
      expense.paid_from,
      expense.km,
      expense.useful_life_years,
      expense.residual_cents,
      expense.imported ?? false,
      expense.original_cost_cents ?? null,
    ],
  );
  return getExpense(tx, ref);
}

export async function getExpense(q: Queryable, ref: string): Promise<Expense> {
  const rows = await q.query<Expense>(`select ${EXPENSE_COLUMNS} from expense where ref = $1`, [ref.trim().toUpperCase()]);
  if (!rows[0]) throw new BookizError(`Uitgave ${ref} bestaat niet.`, 'Bekijk de uitgaven met list_expenses.');
  return rows[0];
}

/** Every expense ever recorded: depreciation needs earlier years, and the set stays small. */
export async function listExpenses(q: Queryable): Promise<Expense[]> {
  return q.query<Expense>(`select ${EXPENSE_COLUMNS} from expense order by date, id`);
}

export async function voidExpense(q: Queryable, ref: string, reason: string): Promise<void> {
  await q.query('update expense set voided_at = now(), void_reason = $2 where ref = $1', [ref, reason]);
}

export async function setReceipt(q: Queryable, ref: string, receipt: Receipt): Promise<void> {
  await q.query('update expense set receipt = $2::jsonb where ref = $1', [ref, JSON.stringify(receipt)]);
}

const RECURRING_COLUMNS = 'id, contact_id, lines, note, every_months, next_date, active';

export async function listRecurring(q: Queryable): Promise<RecurringInvoice[]> {
  return q.query<RecurringInvoice>(`select ${RECURRING_COLUMNS} from recurring_invoice order by id`);
}

export async function saveRecurring(q: Queryable, id: number | undefined, value: Omit<RecurringInvoice, 'id'>): Promise<number> {
  const params = [value.contact_id, JSON.stringify(value.lines), value.note, value.every_months, value.next_date, value.active];
  if (id === undefined) {
    const rows = await q.query<{ id: number }>(
      `insert into recurring_invoice (contact_id, lines, note, every_months, next_date, active)
       values ($1, $2::jsonb, $3, $4, $5, $6) returning id`,
      params,
    );
    return (rows[0] as { id: number }).id;
  }
  const rows = await q.query<{ id: number }>(
    `update recurring_invoice set contact_id = $1, lines = $2::jsonb, note = $3, every_months = $4, next_date = $5, active = $6
     where id = $7 returning id`,
    [...params, id],
  );
  if (!rows[0]) throw new BookizError(`Periodieke factuur ${id} bestaat niet.`);
  return id;
}

export async function listFilings(q: Queryable): Promise<VatFiling[]> {
  return q.query<VatFiling>('select period, filed_on, figures, payable_euros from vat_filing order by period');
}

export async function saveFiling(q: Queryable, filing: VatFiling): Promise<void> {
  await q.query(
    'insert into vat_filing (period, filed_on, figures, payable_euros) values ($1, $2, $3::jsonb, $4)',
    [filing.period, filing.filed_on, JSON.stringify(filing.figures), filing.payable_euros],
  );
}

/**
 * Claim one slot of a daily allowance, or refuse. Must run inside a transaction
 * that holds the business lock, so parallel requests cannot share the last slot.
 */
export async function claimDaily(tx: Queryable, kind: string, limit: number, detail: unknown): Promise<boolean> {
  const used = await tx.query<{ n: number }>("select count(*)::int as n from audit_log where tool = $1 and at > now() - interval '1 day'", [kind]);
  if ((used[0]?.n ?? 0) >= limit) return false;
  await logAudit(tx, kind, detail, 'reserved');
  return true;
}

export async function logAudit(q: Queryable, tool: string, input: unknown, outcome: string, approval: Approval | null = null): Promise<void> {
  await q.query('insert into audit_log (tool, input, outcome, approval) values ($1, $2::jsonb, $3, $4)', [
    tool,
    JSON.stringify(input ?? {}),
    outcome.slice(0, 500),
    approval,
  ]);
}

export type AuditEntry = { at: string; tool: string; input: unknown; outcome: string; approval: Approval | null };

/**
 * Every line written during one calendar year in Dutch time. Each line lands
 * in exactly one year, so the yearly exports together hold the whole log; a
 * filing in January about December is in the next year's.
 */
export async function listAudit(q: Queryable, year: number): Promise<AuditEntry[]> {
  // 1 January is always winter time in the Netherlands: UTC+1.
  const rows = await q.query<Omit<AuditEntry, 'at'> & { at: Date | string }>(
    'select at, tool, input, outcome, approval from audit_log where at >= $1::timestamptz and at < $2::timestamptz order by id',
    [`${year}-01-01T00:00:00+01:00`, `${year + 1}-01-01T00:00:00+01:00`],
  );
  return rows.map((row) => ({ ...row, at: new Date(row.at).toISOString() }));
}
