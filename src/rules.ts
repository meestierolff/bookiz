import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { BookizError } from './errors.ts';

/**
 * Tax rules are data, not code: one JSON file per year in /rules, every figure
 * with the official page it comes from and the sentence that states it. The
 * engine refuses to calculate with a year it has no file for.
 */
const rule = <T extends z.ZodType>(value: T) =>
  z.object({
    title: z.string().min(3),
    value,
    unit: z.string().optional(),
    source: z.url({ protocol: /^https$/, hostname: /(^|\.)(belastingdienst\.nl|rijksoverheid\.nl|overheid\.nl)$/ }),
    quote: z.string().min(5),
    note: z.string().optional(),
  });

/** Applies to an invested amount up to and including `to`; null means no upper limit. */
const kiaBracket = z.object({
  to: z.number().nullable(),
  kind: z.enum(['none', 'percent', 'fixed', 'taper']),
  percent: z.number().optional(),
  amount: z.number().optional(),
  over: z.number().optional(),
});

/** credit = max(0, base + rate% × (income − from)) for from < income ≤ to. */
const creditBracket = z.object({
  from: z.number(),
  to: z.number().nullable(),
  base: z.number(),
  rate: z.number(),
});

const taxBracket = z.object({ to: z.number().nullable(), rate: z.number() });

const ruleSet = z.object({
  year: z.number().int(),
  status: z.enum(['definitief', 'voorlopig']),
  checked_on: z.iso.date(),
  rules: z.object({
    btw_tarief_hoog: rule(z.number()),
    btw_tarief_laag: rule(z.number()),
    btw_horeca_niet_aftrekbaar: rule(z.boolean()),
    btw_correctiegrens: rule(z.number()),
    kor_omzetgrens: rule(z.number()),
    urencriterium: rule(z.number()),
    zelfstandigenaftrek: rule(z.number()),
    startersaftrek: rule(z.number()),
    mkb_winstvrijstelling: rule(z.number()),
    kia: rule(z.array(kiaBracket).min(2)),
    investering_drempel: rule(z.number()),
    afschrijving_max_pct: rule(z.number()),
    kilometervergoeding: rule(z.number()),
    beperkt_aftrekbaar_pct: rule(z.number()),
    bewaarplicht_jaren: rule(z.number()),
    ib_box1: rule(z.array(taxBracket).min(2)).optional(),
    ib_tariefsaanpassing: rule(z.number()).optional(),
    algemene_heffingskorting: rule(z.array(creditBracket).min(2)).optional(),
    arbeidskorting: rule(z.array(creditBracket).min(2)).optional(),
    zvw_pct: rule(z.number()).optional(),
    zvw_max_inkomen: rule(z.number()).optional(),
  }),
});

export type RuleSet = z.infer<typeof ruleSet>;
export type RuleKey = keyof RuleSet['rules'];
export type KiaBracket = z.infer<typeof kiaBracket>;
export type CreditBracket = z.infer<typeof creditBracket>;
export type TaxBracket = z.infer<typeof taxBracket>;

export const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');

const cache = new Map<number, RuleSet>();

export function parseRuleSet(raw: unknown): RuleSet {
  return ruleSet.parse(raw);
}

export function availableYears(): number[] {
  return readdirSync(RULES_DIR)
    .map((file) => /^nl-(\d{4})\.json$/.exec(file)?.[1])
    .filter((year): year is string => Boolean(year))
    .map(Number)
    .sort();
}

export function rulesFor(year: number): RuleSet {
  const cached = cache.get(year);
  if (cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(join(RULES_DIR, `nl-${year}.json`), 'utf8');
  } catch {
    throw new BookizError(
      `Bookiz heeft geen belastingregels voor ${year}.`,
      `Beschikbare jaren: ${availableYears().join(', ')}. Een ontbrekend jaar wordt niet geschat.`,
    );
  }
  const parsed = parseRuleSet(JSON.parse(raw));
  if (parsed.year !== year) throw new Error(`rules/nl-${year}.json declares year ${parsed.year}`);
  cache.set(year, parsed);
  return parsed;
}
