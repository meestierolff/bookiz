import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Checks the built site the way a crawler sees it. Every page in the sitemap
 * must exist, have one title, a description, a canonical that points at
 * itself and one h1; its JSON-LD must parse; its internal links and anchors
 * must resolve; no page may be an orphan; llms.txt may only list real pages.
 * Run after `npm run web:build`.
 */
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] as string));
if (locs.length === 0) throw new Error('sitemap.xml lists no pages');
const origin = (locs[0] as URL).origin;
/** Paths served by the Cloud function, not by static files. */
const DYNAMIC = ['/app', '/mcp', '/oauth', '/k', '/api', '/.well-known'];

const problems: string[] = [];
const notes: string[] = [];
const pages = new Map<string, string>();
const ids = new Map<string, Set<string>>();
const linkedFrom = new Map<string, Set<string>>();

for (const loc of locs) {
  const file = join(dist, loc.pathname, 'index.html');
  if (!existsSync(file)) {
    problems.push(`${loc.pathname}: in the sitemap, but there is no page`);
    continue;
  }
  const html = readFileSync(file, 'utf8');
  pages.set(loc.pathname, html);
  ids.set(loc.pathname, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] as string)));
}

for (const [path, html] of pages) {
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] as string);
  if (titles.length !== 1) problems.push(`${path}: ${titles.length} titles`);
  else if ((titles[0] as string).length > 75) notes.push(`${path}: title is ${(titles[0] as string).length} characters; search results may cut it`);
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!description) problems.push(`${path}: no meta description`);
  else if (description.length > 175) notes.push(`${path}: description is ${description.length} characters; search results may cut it`);
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
  if (canonical !== `${origin}${path}`) problems.push(`${path}: canonical is ${canonical ?? 'missing'}, expected ${origin}${path}`);
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) problems.push(`${path}: ${h1s} h1 elements`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1] as string);
    } catch {
      problems.push(`${path}: JSON-LD does not parse`);
    }
  }

  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = (m[1] as string).replace(/&amp;/g, '&');
    if (href.startsWith('#')) {
      if (href !== '#top' && !ids.get(path)?.has(href.slice(1))) problems.push(`${path}: anchor ${href} does not exist on the page`);
      continue;
    }
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const url = new URL(href, origin);
    if (DYNAMIC.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) continue;
    if (/\.[a-z0-9]+$/i.test(url.pathname)) {
      if (!existsSync(join(dist, url.pathname))) problems.push(`${path}: link to a missing file ${href}`);
      continue;
    }
    const target = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    if (!pages.has(target)) {
      problems.push(`${path}: link to ${href}, which is not a page in the sitemap`);
      continue;
    }
    if (url.hash && !ids.get(target)?.has(decodeURIComponent(url.hash.slice(1)))) problems.push(`${path}: link to ${href}, but that anchor does not exist`);
    if (target !== path) linkedFrom.set(target, (linkedFrom.get(target) ?? new Set()).add(path));
  }
}

for (const path of pages.keys()) {
  if (path !== '/' && !linkedFrom.has(path)) problems.push(`${path}: no other page links to it`);
}

const llms = readFileSync(join(dist, 'llms.txt'), 'utf8');
for (const m of llms.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
  const url = new URL(m[1] as string);
  if (url.origin === origin && !pages.has(url.pathname)) problems.push(`llms.txt: ${url.href} is not a page in the sitemap`);
}

for (const note of notes) console.warn(`  note: ${note}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`  problem: ${problem}`);
  process.exit(1);
}
console.log(`site check: ${pages.size} pages, titles, canonicals, h1, JSON-LD, internal links and llms.txt in order`);
