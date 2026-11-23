import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { moneybirdBody, moneybirdFaq } from '../web/guides.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('Moneybird: bedragen volgen de facts en de FAQ houdt vijf zichtbare antwoorden', () => {
  const body = moneybirdBody({ retentionYears: 7, cloudPrice: 120, cloudPriceIncl: 145.2, trialDays: 45, q4Deadline: '31 januari', korOmzetgrens: '€ 20.000' }, (text) => text);
  assert.match(body, /€ 145,20 incl/);
  assert.match(body, /eerste 45 dagen gratis/);
  assert.match(body, /<td data-label="Totaal 2027">€ 138<\/td>/);
  assert.match(body, /<td data-label="Totaal 2027">€ 182<\/td>/);
  assert.match(body, /12 x € 15 = € 180/);
  assert.equal(moneybirdFaq().length, 5);
});

test('Moneybird: server-HTML, auteurschap en lastmod blijven onderling consistent', () => {
  execFileSync(process.execPath, ['web/build.ts'], { cwd: root, stdio: 'pipe' });
  const html = read('web/dist/overstappen/moneybird/index.html');
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/boekiehouder.nl\/overstappen\/moneybird\/"/);
  assert.match(html, /14 dagen/);
  assert.equal((html.match(/<table /g) ?? []).length, 2);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
  const article = schemas.find((s) => s['@type'] === 'Article');
  assert.equal(article.author['@type'], 'Person');
  assert.equal(article.author.name, 'Mees Tierolff');
  assert.equal(article.datePublished, '2026-11-17');
  assert.equal(article.dateModified, '2026-11-23');
  assert.match(html, /datetime="2026-11-23">23 november 2026/);
  assert.equal(schemas.find((s) => s['@type'] === 'FAQPage').mainEntity.length, 5);
  const sitemap = read('web/dist/sitemap.xml');
  assert.match(sitemap, /moneybird\/<\/loc><lastmod>2026-11-23<\/lastmod>/);
  for (const slug of ['overstappen', 'jaarafsluiting', 'goedkoop-boekhoudprogramma-zzp']) {
    assert.match(sitemap, new RegExp(`${slug}/</loc><lastmod>2026-11-17</lastmod>`));
  }
  for (const slug of ['', 'jaarafsluiting/', 'goedkoop-boekhoudprogramma-zzp/', 'overstappen/']) {
    const content = read(`web/dist/${slug}index.html`).split('<main')[1]?.split('</main>')[0] ?? '';
    assert.match(content, /href="\/overstappen\/moneybird\/"/);
  }
});
