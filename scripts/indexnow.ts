import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tells the search engines that take part in IndexNow (Bing, Yandex, Seznam,
 * Naver; not Google) which pages changed. Run by hand after an approved
 * deploy: `npm run seo:indexnow` sends every page in the built sitemap, or
 * `npm run seo:indexnow -- <url> …` only those. A 200 or 202 means the list
 * was received, not that anything was indexed.
 */
const here = dirname(fileURLToPath(import.meta.url));
const keyFile = readdirSync(join(here, '..', 'web', 'assets')).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
if (!keyFile) throw new Error('No IndexNow key file (32 hex characters + .txt) in web/assets');
const key = keyFile.replace(/\.txt$/, '');

const sitemap = readFileSync(join(here, '..', 'web', 'dist', 'sitemap.xml'), 'utf8');
const fromSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] as string);
const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : fromSitemap;
if (urls.length === 0) throw new Error('No URLs to submit');
const host = new URL(urls[0] as string).host;
const keyLocation = `https://${host}/${keyFile}`;

// The engines fetch the key from the site; without it live, the submission is rejected.
const live = await fetch(keyLocation).then((r) => (r.ok ? r.text() : ''));
if (live.trim() !== key) throw new Error(`${keyLocation} does not serve the key yet; deploy first`);

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
});
console.log(`IndexNow: ${response.status} ${response.statusText} for ${urls.length} URL(s) on ${host}`);
if (!response.ok) process.exit(1);
