import { BookizError } from '../errors.ts';

/** All amounts inside the engine are integer euro cents. Euros only at the edges. */
export type Cents = number;

export function toCents(euros: number): Cents {
  const cents = Math.round(euros * 100);
  if (!Number.isFinite(euros) || Math.abs(euros * 100 - cents) > 1e-6) {
    throw new BookizError(`Bedrag ${euros} is geen geldig eurobedrag met hooguit twee decimalen.`);
  }
  return cents;
}

export function toEuros(cents: Cents): number {
  return Math.round(cents) / 100;
}

/** Round half away from zero, so a credit note mirrors its invoice exactly. */
export function roundCents(value: number): Cents {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) + 1e-9);
  return rounded === 0 ? 0 : rounded;
}

export function percentOf(amount: Cents, percent: number): Cents {
  return roundCents((amount * percent) / 100);
}

export function sum(values: Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

export function formatEur(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}€ ${whole},${(abs % 100).toString().padStart(2, '0')}`;
}
