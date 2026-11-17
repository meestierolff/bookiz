import type { Config } from '../config.ts';
import type { Db } from '../db.ts';
import type { Mailer } from '../mail.ts';
import { addDays, type IsoDate, periodBounds, periodFor, today } from '../core/dates.ts';
import type { Business, VatFiling } from '../core/types.ts';

export type Ctx = {
  db: Db;
  config: Config;
  mail: Mailer;
  now: () => Date;
  /** Set when changes are not allowed (an ended subscription); reading and exporting still work. */
  locked?: string | undefined;
};

export function todayOf(ctx: Ctx): IsoDate {
  return today(ctx.now());
}

export function nextPeriod(period: string): string {
  const { to, kind } = periodBounds(period);
  return periodFor(addDays(to, 1), kind);
}

/** The first period on or after `date` that has not been filed yet. */
export function openPeriodFor(date: IsoDate, business: Business, filings: VatFiling[], todayDate: IsoDate): string {
  const filed = new Set(filings.map((filing) => filing.period));
  let period = periodFor(date, business.vat_period);
  if (!filed.has(period)) return period;
  period = periodFor(todayDate, business.vat_period);
  while (filed.has(period)) period = nextPeriod(period);
  return period;
}

/**
 * Filing and payment are both due on the last day of the month after the
 * period; for a yearly return on 31 March of the next year (belastingdienst.nl,
 * uiterste aangifte- en betaaldatums).
 */
export function vatDeadline(period: string): IsoDate {
  const { to, kind } = periodBounds(period);
  if (kind === 'year') return `${Number(period) + 1}-03-31`;
  const firstOfNext = addDays(to, 1);
  const { to: lastOfNext } = periodBounds(firstOfNext.slice(0, 7));
  return lastOfNext;
}

/** Replace every `*_cents` field by the same field in euros, for output to an agent. */
export function inEuros(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inEuros);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
      key.endsWith('_cents')
        ? [key.slice(0, -6), typeof entry === 'number' ? Math.round(entry) / 100 : entry]
        : [key, inEuros(entry)],
    ),
  );
}
