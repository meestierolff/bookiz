import { writeFileSync } from 'node:fs';
import writeExcelFile from 'write-excel-file/node';
import { type RuleKey, rulesFor } from '../src/rules.ts';

/**
 * A review sheet for a bookkeeper: every rule with its value, the quote and
 * the source, the limitations Bookiz knows of, and empty columns for a verdict.
 * A second tab lists situations to work out by hand; the expected outcome is
 * the bookkeeper's to fill in, then each case becomes a test.
 *
 *   npm run rules:review -- 2026 path/to/review.xlsx
 */
const year = Number(process.argv[2] ?? new Date().getFullYear());
const out = process.argv[3] ?? `belastingregels-${year}-review.xlsx`;
const set = rulesFor(year);

const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
const value = (key: RuleKey) => {
  const rule = set.rules[key];
  if (!rule) return '';
  if (typeof rule.value === 'number') return rule.value;
  if (typeof rule.value === 'boolean') return rule.value ? 'ja' : 'nee';
  return 'tabel, zie citaat';
};

const rules = [
  ['Regel', 'Omschrijving', `Waarde ${year}`, 'Eenheid', 'Citaat Belastingdienst', 'Bron', 'Toelichting en beperkingen in Bookiz', 'Klopt het? (ja/nee)', 'Opmerking'].map(bold),
  ...(Object.keys(set.rules) as RuleKey[]).map((key) => {
    const rule = set.rules[key];
    return [key, rule?.title ?? '', value(key), rule?.unit ?? '', rule?.quote ?? '', rule?.source ?? '', rule?.note ?? '', null, null];
  }),
];

const scenarios = [
  ['Nr', 'Situatie', 'Wat je Bookiz vertelt', 'Verwachte uitkomst (boekhouder)', 'Uitkomst Bookiz', 'Klopt het? (ja/nee)', 'Opmerking'].map(bold),
  ...[
    ['Training in Nederland gefactureerd aan een Nederlandse klant', 'Factuur, 1 regel, btw hoog tarief'],
    ['Reis buiten de EU gefactureerd met 0% btw (reisbureauregeling?)', 'Factuur met btw-code 0%: in welke rubriek, over welk bedrag?'],
    ['Lokale operator buiten de EU voert de reis uit en factureert zonder btw', 'Uitgave zonder btw: geen btw, of btw verlegd?'],
    ['Btw-aangifte per jaar over het hele kalenderjaar', 'Aangiftetijdvak jaar; deadline aangifte en betaling'],
    ['Lunch met een klant, € 54,50 inclusief 9% btw', 'Uitgave horeca, privé betaald'],
    ['Laptop van € 1.210 inclusief btw', 'Investering, 5 jaar gebruiksduur'],
    ['Abonnement bij Google Ireland zonder btw', 'Uitgave, btw verlegd (EU)'],
    ['Urencriterium gehaald, geen starter', 'Jaargegevens: urencriterium ja'],
    ['Omzet rond de KOR-grens', 'KOR actief, laatste factuur gaat over de grens'],
    ['Zakelijke kilometers met de eigen auto', '1.000 km in het jaar'],
  ].map(([situation, input], i) => [i + 1, situation as string, input as string, null, null, null, null]),
];

const buffer = await writeExcelFile([
  { sheet: 'Regels', data: rules, stickyRowsCount: 1, columns: [24, 36, 12, 10, 70, 40, 50, 14, 30].map((width) => ({ width })) },
  { sheet: "Scenario's", data: scenarios, stickyRowsCount: 1, columns: [5, 50, 45, 40, 30, 14, 30].map((width) => ({ width })) },
]).toBuffer();
writeFileSync(out, buffer);
console.log(`${out}: ${rules.length - 1} rules for ${year} (${set.status}, checked ${set.checked_on}), ${scenarios.length - 1} situations`);
