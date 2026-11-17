import { availableYears, type RuleKey, rulesFor } from '../src/rules.ts';

/**
 * Checks that every rule's quote still appears on its source page. It answers
 * one question only: has the Belastingdienst page changed under us? Whether a
 * value follows from its quote, and whether Bookiz calculates with it
 * correctly, needs a bookkeeper and worked examples. A page that cannot be
 * fetched counts as a failure, never as a pass. Needs the network, so it is
 * not part of `npm run verify`.
 *
 *   npm run rules:sources            all years with a rule file
 *   npm run rules:sources -- 2026    one year
 */
const normalise = (text: string) =>
  text
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;| /g, ' ')
    .replace(/&euro;|&#8364;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/&[lr]squo;|&#8216;|&#8217;|[‘’]/g, "'")
    .replace(/&[lr]dquo;|&#8220;|&#8221;|[“”]/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const pages = new Map<string, Promise<string>>();
const page = (url: string) => {
  if (!pages.has(url)) {
    pages.set(
      url,
      fetch(url, { headers: { 'user-agent': 'bookiz-rules-check (+https://boekiehouder.nl/belastingregels-2026/)' } }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalise(await response.text());
      }),
    );
  }
  return pages.get(url) as Promise<string>;
};

const years = process.argv.slice(2).map(Number).filter(Boolean);
let failures = 0;
for (const year of years.length > 0 ? years : availableYears()) {
  const set = rulesFor(year);
  console.log(`rules/nl-${year}.json (${set.status}, checked ${set.checked_on})`);
  for (const key of Object.keys(set.rules) as RuleKey[]) {
    const rule = set.rules[key];
    if (!rule) continue;
    // Table quotes are stored as "cell | cell / row"; each cell must appear on the page.
    const fragments = rule.quote
      .split(/ \/ | \| /)
      .map((fragment) => normalise(fragment))
      .filter((fragment) => fragment.length >= 3);
    try {
      const text = await page(rule.source);
      const missing = fragments.filter((fragment) => !text.includes(fragment));
      if (missing.length === 0) console.log(`  ok        ${key}`);
      else {
        failures += 1;
        console.log(`  CHANGED   ${key}: not found on the page: "${missing[0]}"${missing.length > 1 ? ` (+${missing.length - 1} more)` : ''}`);
      }
    } catch (error) {
      failures += 1;
      console.log(`  NO PAGE   ${key}: ${(error as Error).message} (${rule.source})`);
    }
  }
}
if (failures > 0) {
  console.log(`\n${failures} rule(s) need a person to look at the source.`);
  process.exit(1);
}
console.log('\nEvery quote is still on its source page.');
