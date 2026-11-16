import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import pg from 'pg';

/**
 * End-to-end check of a deployed Bookiz Cloud: an assistant registers itself,
 * the owner consents, the assistant books an invoice and an expense, and a
 * second customer sees none of it. Creates two throwaway users and removes
 * them and their data afterwards.
 *
 *   PUBLIC_URL=… SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SECRET_KEY=… DATABASE_URL=… node scripts/cloud-e2e.mjs
 */
for (const name of ['PUBLIC_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'DATABASE_URL']) {
  if (!process.env[name]) throw new Error(`missing ${name}`);
}
const SITE = process.env.PUBLIC_URL.replace(/\/+$/, ''), AUTH = `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
const pk = process.env.SUPABASE_PUBLISHABLE_KEY.trim(), sk = process.env.SUPABASE_SECRET_KEY.trim();
let failed = 0;
const api = async (path, key, body) => (await fetch(AUTH + path, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const ok = (label, cond, extra = '') => { if (!cond) failed++; console.log(cond ? 'PASS' : 'FAIL', label, extra); };
const emails = [];
async function signIn(tag) {
  const email = `selftest-${tag}-${Date.now()}@example.com`; emails.push(email);
  const link = await api('/admin/generate_link', sk, { type: 'magiclink', email });
  const s = await api('/verify', pk, { type: 'email', email, token: link.email_otp });
  return { email, cookie: `__Host-bz_at=${encodeURIComponent(s.access_token)}; __Host-bz_rt=${encodeURIComponent(s.refresh_token)}`, id: s.user.id };
}
async function oauthToken(user) {
  const reg = await (await fetch(AUTH + '/oauth/clients/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Bookiz zelftest', redirect_uris: ['http://localhost:9999/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })).json();
  ok('assistant can register itself', Boolean(reg.client_id), reg.client_id ? '' : JSON.stringify(reg).slice(0, 200));
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://localhost:9999/callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: SITE + '/mcp' });
  const a = await fetch(AUTH + '/oauth/authorize?' + q, { redirect: 'manual' });
  const consentUrl = a.headers.get('location') ?? '';
  ok('authorize sends the browser to our consent page', consentUrl.startsWith(SITE + '/oauth/consent?authorization_id='), consentUrl.slice(0, 80));
  const anon = await fetch(consentUrl, { redirect: 'manual' });
  ok('consent page demands a login first', anon.status === 303 && (anon.headers.get('location') ?? '').includes('/app/login?next='));
  const page = await fetch(consentUrl, { headers: { cookie: user.cookie }, redirect: 'manual' });
  const html = await page.text();
  ok('consent page names the client and the return address', page.status === 200 && html.includes('Bookiz zelftest') && html.includes('localhost:9999'), `status ${page.status}`);
  const id = new URL(consentUrl).searchParams.get('authorization_id');
  const cross = await fetch(SITE + '/oauth/consent', { method: 'POST', headers: { cookie: user.cookie, origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ authorization_id: id, decision: 'approve' }), redirect: 'manual' });
  ok('approval from another site is refused', cross.status === 403);
  const approve = await fetch(SITE + '/oauth/consent', { method: 'POST', headers: { cookie: user.cookie, origin: SITE, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ authorization_id: id, decision: 'approve' }), redirect: 'manual' });
  // The approval answers with a page that forwards the browser, because a redirect to another site from a form post is blocked by the content policy.
  const forward = await approve.text();
  const back = (forward.match(/id="go" href="([^"]+)"/)?.[1] ?? '').replaceAll('&amp;', '&');
  ok('approval hands the browser back to the client with a code', approve.status === 200 && back.startsWith('http://localhost:9999/callback?') && back.includes('code='), back.slice(0, 60) || `status ${approve.status} ${forward.slice(0, 150)}`);
  const code = new URL(back).searchParams.get('code');
  const tok = await (await fetch(AUTH + '/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:9999/callback', client_id: reg.client_id, code_verifier: verifier }) })).json();
  ok('code is exchanged for a token', Boolean(tok.access_token), tok.access_token ? '' : JSON.stringify(tok).slice(0, 200));
  return tok.access_token;
}
async function mcpClient(token) {
  const client = new Client({ name: 'zelftest', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(SITE + '/mcp'), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const t = r.content[0]?.text ?? ''; return r.isError ? { error: t } : JSON.parse(t); };
  return { client, call };
}
try {
  const a = await signIn('a'), b = await signIn('b');
  const dash = await fetch(SITE + '/app', { headers: { cookie: a.cookie } });
  const dashHtml = await dash.text();
  ok('dashboard opens for a signed-in owner', dash.status === 200 && dashHtml.includes('Mijn Bookiz') && dashHtml.includes(SITE + '/mcp'), `status ${dash.status} ${dash.status !== 200 ? dashHtml.slice(0, 200) : ''}`);
  const tokenA = await oauthToken(a);
  const A = await mcpClient(tokenA);
  ok('assistant sees the tools', (await A.client.listTools()).tools.length === 24);
  ok('new administration is empty', (await A.call('get_overview')).setup === 'nog niet ingericht');
  await A.call('setup_business', { name: 'Zelftest BV', address_line: 'Teststraat 1', postal_code: '1234 AB', city: 'Utrecht', kvk_number: '12345678', vat_id: 'NL123456789B01', iban: 'NL00BANK0123456789' });
  const c = await A.call('save_contact', { name: 'Klant A', address_line: 'Kade 5', city: 'Rotterdam' });
  const d = await A.call('create_invoice', { contact_id: c.id, lines: [{ description: 'Advies', quantity: 2, unit_price: 100 }] });
  const inv = await A.call('finalize_invoice', { draft_id: d.draft_id });
  ok('invoice finalized in the cloud', inv.number === '2026-001' && String(inv.pdf).startsWith(SITE + '/k/'), JSON.stringify(inv).slice(0, 160));
  const pdf = await fetch(inv.pdf);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  ok('invoice PDF renders on Vercel', pdf.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-', `status ${pdf.status} ${bytes.subarray(0, 120).toString()}`);
  const e = await A.call('record_expense', { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8 });
  const up = String(e.receipt_help ?? '').match(/https:\/\/\S+/)?.[0] ?? '';
  const upPage = await fetch(up);
  ok('receipt upload link works', upPage.status === 200 && (await upPage.text()).includes('Kies een foto'), up.slice(0, 70));
  const tokenB = await oauthToken(b);
  const B = await mcpClient(tokenB);
  // An assistant often opens with several calls at once; the very first use must survive that.
  const burst = await Promise.all([1, 2, 3, 4, 5].map(() => B.call('get_overview')));
  ok('five parallel first calls all succeed', burst.every((r) => r.setup === 'nog niet ingericht'), JSON.stringify(burst.find((r) => r.setup !== 'nog niet ingericht') ?? '').slice(0, 160));
  ok('second customer sees nothing of the first', (await B.call('get_overview')).setup === 'nog niet ingericht' && (await B.call('list_invoices')).count === 0);
  const foreign = inv.pdf.replace(/\/k\/[0-9a-f]{20}\//, (m) => m.replace(/[0-9a-f]{20}/, '0'.repeat(20)));
  ok('invoice link is worthless under another tenant', (await fetch(foreign)).status === 404);
  const anon = await fetch(SITE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tokenA.slice(0, -6) + 'AAAAAA' }, body: '{}' });
  ok('tampered token is refused', anon.status === 401);
  const exp = await fetch(SITE + '/app/export?year=2026', { headers: { cookie: a.cookie } });
  const expJson = await exp.json();
  ok('export downloads the year', exp.status === 200 && expJson.invoices?.length === 1 && expJson.business?.name === 'Zelftest BV');
  await A.client.close(); await B.client.close();
} finally {
  const list = await (await fetch(AUTH + '/admin/users?per_page=200', { headers: { apikey: sk } })).json();
  for (const u of list.users ?? []) if (/^selftest-.*@example\.com$/.test(u.email ?? '')) await fetch(AUTH + '/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: sk } });
  const clients = await (await fetch(AUTH + '/admin/oauth/clients', { headers: { apikey: sk } })).json().catch(() => ({}));
  for (const c of clients.clients ?? []) if ((c.client_name ?? c.name) === 'Bookiz zelftest') await fetch(AUTH + '/admin/oauth/clients/' + (c.client_id ?? c.id), { method: 'DELETE', headers: { apikey: sk } });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query("select tenant from bookiz_cloud.account where email like 'selftest-%@example.com'");
  for (const row of rows) await db.query(`drop schema if exists t_${row.tenant.replace(/[^0-9a-f]/g, '')} cascade`);
  await db.query("delete from bookiz_cloud.account where email like 'selftest-%@example.com'");
  await db.end();
  console.log(`cleaned up ${rows.length} test customers`);
}
process.exit(failed === 0 ? 0 : 1);
