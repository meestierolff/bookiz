import writeExcelFile from 'write-excel-file/node';
import { CATEGORIES } from '../core/categories.ts';
import { yearOf } from '../core/dates.ts';
import { type Cents, percentOf } from '../core/money.ts';
import type { Expense, Invoice } from '../core/types.ts';
import { invoiceTotals, lineNet, SALE_VAT_LABELS } from '../core/vat.ts';
import { rulesFor } from '../rules.ts';
import * as store from '../store.ts';
import type { Ctx } from './context.ts';

/**
 * One year as two tables a bookkeeper can open in Excel: Inkomsten, one row per
 * invoice line, and Uitgaven, one row per expense. The selection is the year
 * report's: final invoices of the year that did not come from a previous
 * package, and expenses that were not voided. So the columns add up to the
 * figures Bookiz reports.
 */
export type Cell = string | number | Date | null;
export type Column = { header: string; kind: 'text' | 'date' | 'money' | 'number'; width: number };
export type Sheet = { name: 'Inkomsten' | 'Uitgaven'; columns: Column[]; rows: Cell[][] };

const euros = (cents: Cents) => cents / 100;
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

const INCOME: Column[] = [
  { header: 'Factuurnummer', kind: 'text', width: 14 },
  { header: 'Factuurdatum', kind: 'date', width: 12 },
  { header: 'Leverdatum', kind: 'date', width: 12 },
  { header: 'Klant', kind: 'text', width: 28 },
  { header: 'Btw-nummer klant', kind: 'text', width: 18 },
  { header: 'Omschrijving', kind: 'text', width: 40 },
  { header: 'Aantal', kind: 'number', width: 8 },
  { header: 'Prijs per eenheid excl. btw', kind: 'money', width: 14 },
  { header: 'Btw-tarief', kind: 'text', width: 16 },
  { header: 'Btw-percentage', kind: 'number', width: 10 },
  { header: 'Bedrag excl. btw', kind: 'money', width: 14 },
  { header: 'Btw', kind: 'money', width: 12 },
  { header: 'Bedrag incl. btw', kind: 'money', width: 14 },
  { header: 'Betaald op', kind: 'date', width: 12 },
  { header: 'Soort', kind: 'text', width: 14 },
];

const EXPENSES: Column[] = [
  { header: 'Bonnummer', kind: 'text', width: 12 },
  { header: 'Datum', kind: 'date', width: 12 },
  { header: 'Btw-tijdvak', kind: 'text', width: 10 },
  { header: 'Leverancier', kind: 'text', width: 26 },
  { header: 'Omschrijving', kind: 'text', width: 36 },
  { header: 'Categorie', kind: 'text', width: 24 },
  { header: 'Soort', kind: 'text', width: 12 },
  { header: 'Btw-behandeling', kind: 'text', width: 22 },
  { header: 'Btw-percentage', kind: 'number', width: 10 },
  { header: 'Bedrag excl. btw', kind: 'money', width: 14 },
  { header: 'Btw', kind: 'money', width: 12 },
  { header: 'Bedrag incl. btw', kind: 'money', width: 14 },
  { header: 'Betaald vanaf', kind: 'text', width: 12 },
  { header: 'Kilometers', kind: 'number', width: 10 },
  { header: 'Bon bewaard', kind: 'text', width: 10 },
];

const TREATMENT: Record<Expense['vat_treatment'], string> = {
  nl: 'Nederlandse btw',
  eu_reverse_charge: 'btw verlegd (EU)',
  non_eu_reverse_charge: 'btw verlegd (buiten de EU)',
  none: 'geen btw',
};
const KIND: Record<Expense['kind'], string> = { cost: 'kosten', investment: 'investering', mileage: 'kilometers' };

/** Spread the btw of each tariff over its lines; the last line takes the rounding, so each invoice adds up exactly. */
function incomeRows(invoice: Invoice): Cell[][] {
  const { groups } = invoiceTotals(invoice.lines, rulesFor(yearOf(invoice.issue_date)));
  const left = new Map(groups.map((group) => [group.vat_code, group.vat_cents]));
  const remaining = new Map(groups.map((group) => [group.vat_code, invoice.lines.filter((line) => line.vat_code === group.vat_code).length]));
  return invoice.lines.map((line) => {
    const group = groups.find((g) => g.vat_code === line.vat_code);
    const rate = group?.rate ?? 0;
    const net = lineNet(line);
    const last = (remaining.get(line.vat_code) ?? 1) === 1;
    const vat = last ? (left.get(line.vat_code) ?? 0) : percentOf(net, rate);
    left.set(line.vat_code, (left.get(line.vat_code) ?? 0) - vat);
    remaining.set(line.vat_code, (remaining.get(line.vat_code) ?? 1) - 1);
    return [
      invoice.number,
      day(invoice.issue_date),
      day(invoice.supply_date),
      invoice.contact_snapshot?.name ?? null,
      invoice.contact_snapshot?.vat_id ?? null,
      line.description,
      line.quantity,
      euros(line.unit_price_cents),
      SALE_VAT_LABELS[line.vat_code],
      rate,
      euros(net),
      euros(vat),
      euros(net + vat),
      day(invoice.paid_on),
      invoice.credit_of ? 'creditfactuur' : 'factuur',
    ];
  });
}

/** A btw percentage only where the receipt makes it unambiguous; otherwise the cell stays empty. */
function expenseRate(expense: Expense): number | null {
  if (expense.vat_treatment !== 'nl') return null;
  if (expense.vat_cents === 0) return 0;
  const net = expense.total_cents - expense.vat_cents;
  const rates = rulesFor(yearOf(expense.date)).rules;
  for (const rate of [rates.btw_tarief_hoog.value, rates.btw_tarief_laag.value]) {
    if (Math.abs(percentOf(net, rate) - expense.vat_cents) <= 1) return rate;
  }
  return null;
}

function expenseRow(expense: Expense): Cell[] {
  return [
    expense.ref,
    day(expense.date),
    expense.vat_period,
    expense.vendor,
    expense.description,
    CATEGORIES.find((category) => category.key === expense.category)?.label ?? expense.category,
    KIND[expense.kind],
    TREATMENT[expense.vat_treatment],
    expenseRate(expense),
    euros(expense.total_cents - expense.vat_cents),
    euros(expense.vat_cents),
    euros(expense.total_cents),
    expense.paid_from === 'private' ? 'privé' : 'zakelijk',
    expense.km,
    expense.kind === 'mileage' ? null : expense.receipt ? 'ja' : 'nee',
  ];
}

export async function bookkeeperSheets(ctx: Ctx, year: number): Promise<Sheet[]> {
  const invoices = (await store.listInvoices(ctx.db))
    .filter((invoice) => invoice.status === 'final' && !invoice.imported && yearOf(invoice.issue_date) === year)
    .sort((a, b) => String(a.number).localeCompare(String(b.number)));
  const expenses = (await store.listExpenses(ctx.db))
    .filter((expense) => !expense.voided_at && !expense.imported && yearOf(expense.date) === year)
    .sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  return [
    { name: 'Inkomsten', columns: INCOME, rows: invoices.flatMap(incomeRows) },
    { name: 'Uitgaven', columns: EXPENSES, rows: expenses.map(expenseRow) },
  ];
}

export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  return writeExcelFile(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      stickyRowsCount: 1,
      columns: sheet.columns.map((column) => ({ width: column.width })),
      data: [
        sheet.columns.map((column) => ({ value: column.header, fontWeight: 'bold' as const })),
        ...sheet.rows.map((row) =>
          row.map((value, i) => {
            if (value === null) return null;
            const kind = sheet.columns[i]?.kind;
            if (value instanceof Date) return { value, type: Date, format: 'dd-mm-yyyy' };
            if (kind === 'money' && typeof value === 'number') return { value, type: Number, format: '#,##0.00' };
            return { value };
          }),
        ),
      ],
    })),
  ).toBuffer();
}

/**
 * The way Dutch Excel opens a CSV without asking: semicolons, decimal comma,
 * day-month-year, UTF-8 with a byte order mark. Text that a spreadsheet would
 * run as a formula gets a leading apostrophe.
 */
export function toCsv(sheet: Sheet): string {
  const text = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const cell = (value: Cell, column: Column | undefined): string => {
    if (value === null) return '';
    if (value instanceof Date) {
      const [y, m, d] = value.toISOString().slice(0, 10).split('-');
      return `${d}-${m}-${y}`;
    }
    if (typeof value === 'number') return (column?.kind === 'money' ? value.toFixed(2) : String(value)).replace('.', ',');
    return text(value);
  };
  const lines = [sheet.columns.map((column) => text(column.header)), ...sheet.rows.map((row) => row.map((value, i) => cell(value, sheet.columns[i])))];
  return `﻿${lines.map((line) => line.join(';')).join('\r\n')}\r\n`;
}
