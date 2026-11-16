import { availableYears, rulesFor } from '../src/rules.ts';

/**
 * Fails the build when a rule file is malformed or cites a source outside the
 * official domains. It checks form, not truth: whether a figure is still what
 * the source says needs a human with the page open.
 */
const years = availableYears();
if (years.length === 0) throw new Error('No rule files found in /rules');

for (const year of years) {
  const set = rulesFor(year);
  const keys = Object.keys(set.rules);
  const ageDays = Math.round((Date.now() - Date.parse(set.checked_on)) / 86_400_000);
  console.log(`rules/nl-${year}.json: ${keys.length} rules, ${set.status}, checked ${set.checked_on} (${ageDays} days ago)`);
  if (ageDays > 400) console.warn(`  warning: nl-${year}.json has not been checked against its sources for over a year`);
}
