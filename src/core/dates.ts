import { BookizError } from '../errors.ts';

/** Calendar dates are 'YYYY-MM-DD' strings everywhere; they compare and sort as text. */
export type IsoDate = string;
export type VatPeriodKind = 'month' | 'quarter';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string, label = 'datum'): IsoDate {
  if (!ISO.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || fromUtc(toUtc(value)) !== value) {
    throw new BookizError(`Ongeldige ${label}: "${value}".`, 'Gebruik het formaat JJJJ-MM-DD, bijvoorbeeld 2026-11-16.');
  }
  return value;
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): IsoDate {
  // Dutch tax deadlines follow the Dutch calendar day, not UTC.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(now);
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: IsoDate): number {
  return Number(date.slice(5, 7));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const utc = toUtc(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return fromUtc(utc);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

function lastDayOfMonth(year: number, month: number): IsoDate {
  return fromUtc(new Date(Date.UTC(year, month, 0)));
}

/** '2026-Q4' or '2026-11', depending on how often the business files. */
export function periodFor(date: IsoDate, kind: VatPeriodKind): string {
  const year = yearOf(date);
  if (kind === 'month') return date.slice(0, 7);
  return `${year}-Q${Math.ceil(monthOf(date) / 3)}`;
}

export function periodBounds(period: string): { from: IsoDate; to: IsoDate; kind: VatPeriodKind } {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) {
    const year = Number(quarter[1]);
    const q = Number(quarter[2]);
    return { from: `${year}-${String(q * 3 - 2).padStart(2, '0')}-01`, to: lastDayOfMonth(year, q * 3), kind: 'quarter' };
  }
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (month) {
    const year = Number(month[1]);
    return { from: `${period}-01`, to: lastDayOfMonth(year, Number(month[2])), kind: 'month' };
  }
  throw new BookizError(`Onbekend tijdvak "${period}".`, 'Gebruik 2026-Q4 (kwartaal) of 2026-11 (maand).');
}

export function inRange(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}

/** Whole calendar months an asset is in use during `year`, counting the purchase month. */
export function monthsInUse(purchased: IsoDate, year: number): number {
  const purchaseYear = yearOf(purchased);
  if (purchaseYear > year) return 0;
  if (purchaseYear < year) return 12;
  return 13 - monthOf(purchased);
}

export function formatDutchDate(date: IsoDate): string {
  return `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`;
}
