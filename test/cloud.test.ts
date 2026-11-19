import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import * as expenses from '../src/app/expenses.ts';
import * as invoices from '../src/app/invoices.ts';
import * as reports from '../src/app/reports.ts';
import type { CloudEnv } from '../src/cloud/env.ts';
import { type Cloud, checkoutUrl, handle, verifyStripeSignature } from '../src/cloud/handler.ts';
import { loginPage, messagePage } from '../src/cloud/pages.ts';
import type { Mail } from '../src/mail.ts';
import { type Account, accessOf, type Connector, ensureAccount, findAccount, isAdmin, tenantConfig, tenantSchema, withTenant } from '../src/cloud/tenants.ts';
import { type Db, openEmbedded, SCHEMA_VERSION } from '../src/db.ts';
import { invoiceLink, verifyLink } from '../src/receipts.ts';
import * as store from '../src/store.ts';

const env: CloudEnv = {
  publicUrl: 'https://bookiz.test',
  supabaseUrl: 'https://project.supabase.test',
  supabasePublishableKey: 'pk',
  supabaseSecretKey: 'sk',
  databaseUrl: '',
  linkSecret: 'link-secret-for-tests-0123456789abcdef',
  smtpUrl: undefined,
  mailFrom: undefined,
  stripeWebhookSecret: 'whsec_test_secret',
  stripePaymentLink: 'https://buy.stripe.test/abc',
  stripePaymentLinkId: 'plink_bookiz',
  stripeDfyPaymentLink: 'https://buy.stripe.test/dfy',
  stripeDfyPaymentLinkId: 'plink_dfy',
  operatorEmail: 'ops@bookiz.test',
  adminEmails: [],
  operatorToken: 'operator-token-for-tests-0123456789',
  cronSecret: undefined,
  trialDays: 30,
};

/** One embedded database standing in for the server: "connecting" just selects the schema. */
async function embeddedCloud(): Promise<{ cloud: Cloud; raw: Db; setNow: (iso: string) => void; sent: Mail[] }> {
  const raw = await openEmbedded();
  let now = new Date('2026-11-16T10:00:00Z');
  const connect: Connector = async (searchPath) => {
    await raw.exec(`set search_path to ${searchPath ?? 'public'}`);
    return { ...raw, close: async () => undefined };
  };
  const sent: Mail[] = [];
  const mail = async (message: Mail) => {
    sent.push(message);
    return { messageId: '<test>' };
  };
  const cloud: Cloud = { env, connect, mail, now: () => now };
  return { cloud, raw, setNow: (iso) => (now = new Date(iso)), sent };
}

const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test' };
const bob = { id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.test' };

async function invoiceFor(cloud: Cloud, account: Awaited<ReturnType<typeof ensureAccount>>, name: string) {
  return withTenant(
    cloud.connect,
    cloud.env,
    account,
    cloud.mail,
    async (ctx) => {
      await store.saveBusiness(ctx.db, { name, address_line: 'Straat 1', postal_code: '1234 AB', city: 'Utrecht', kvk_number: '12345678', vat_id: 'NL123456789B01', iban: 'NL00BANK0123456789' });
      const contact = await store.saveContact(ctx.db, undefined, { name: `Klant van ${name}`, address_line: 'Kade 1', city: 'Zwolle' });
      const draft = await invoices.createInvoice(ctx, { contact_id: contact.id, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
      return invoices.finalizeInvoice(ctx, draft.draft_id);
    },
    cloud.now,
  );
}

test('every customer has an administration of their own', async () => {
  const { cloud, raw } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const a = await ensureAccount(cloud.connect, env, alice);
  const b = await ensureAccount(cloud.connect, env, bob);
  assert.notEqual(a.tenant, b.tenant);
  assert.match(tenantSchema(a.tenant), /^t_[0-9a-f]{20}$/);
  assert.equal(a.schema_version, SCHEMA_VERSION);
  assert.equal((await ensureAccount(cloud.connect, env, alice)).tenant, a.tenant, 'signing in again reuses the administration');

  const first = await invoiceFor(cloud, a, 'Alice');
  const second = await invoiceFor(cloud, b, 'Bob');
  // Both are the first invoice of their own books: same number, different administrations.
  assert.equal(first.number, '2026-001');
  assert.equal(second.number, '2026-001');
  assert.notEqual(first.pdf, second.pdf);
  assert.ok(String(first.pdf).startsWith(`https://bookiz.test/k/${a.tenant}/factuur/2026-001/`));

  const seen = await withTenant(cloud.connect, env, b, cloud.mail, async (ctx) => (await store.requireBusiness(ctx.db)).name, cloud.now);
  assert.equal(seen, 'Bob');

  // A link signed for Alice does not verify inside Bob's administration, though the invoice number matches.
  const signature = /\/([0-9a-f]+)\.pdf$/.exec(String(first.pdf))?.[1] as string;
  await withTenant(cloud.connect, env, a, cloud.mail, async (ctx) => assert.equal(verifyLink(ctx.config, 'factuur', '2026-001', signature), true), cloud.now);
  await withTenant(
    cloud.connect,
    env,
    b,
    cloud.mail,
    async (ctx) => {
      assert.equal(verifyLink(ctx.config, 'factuur', '2026-001', signature), false);
      assert.notEqual(invoiceLink(ctx.config, '2026-001'), first.pdf);
    },
    cloud.now,
  );
  assert.throws(() => tenantSchema('public; drop schema bookiz_cloud'), /invalid tenant/);
});

test('after the trial the books can be read and exported, not changed', async () => {
  const { cloud, raw, setNow } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const account = await ensureAccount(cloud.connect, env, alice);
  await invoiceFor(cloud, account, 'Alice');
  assert.equal(accessOf(account, env, cloud.now()).allowed, true);

  setNow('2027-01-20T10:00:00Z');
  assert.equal(accessOf(account, env, cloud.now()).allowed, false);
  await withTenant(
    cloud.connect,
    env,
    account,
    cloud.mail,
    async (ctx) => {
      assert.match(ctx.locked ?? '', /proefperiode of abonnement/);
      const exported = (await reports.exportBooks(ctx, { year: 2026 })) as Record<string, any>;
      assert.equal(exported.invoices.length, 1, 'your data is never held hostage');
    },
    cloud.now,
  );

  const paid = { ...account, status: 'active' as const, paid_until: '2028-01-01T00:00:00Z' };
  assert.equal(accessOf(paid, env, cloud.now()).allowed, true);
  // The terms promise access until the end of the paid period, also after cancelling.
  assert.equal(accessOf({ ...paid, status: 'cancelled' }, env, cloud.now()).allowed, true);
  assert.equal(accessOf({ ...paid, status: 'cancelled', paid_until: '2026-12-01T00:00:00Z' }, env, cloud.now()).allowed, false);
  assert.equal(accessOf({ ...paid, paid_until: '2026-12-01T00:00:00Z' }, env, cloud.now()).allowed, false);
});

test('cloud receipts go to the account address and respect the smaller upload limit', async () => {
  const { cloud, raw } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const account = await ensureAccount(cloud.connect, env, alice);
  const sent: { to: string }[] = [];
  const mail = async (m: { to: string }) => {
    sent.push(m);
    return { messageId: '<m1>' };
  };
  await withTenant(
    cloud.connect,
    env,
    account,
    mail as never,
    async (ctx) => {
      await store.saveBusiness(ctx.db, { name: 'Alice' });
      const expense = await expenses.recordExpense(ctx, { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8 });
      assert.match(expense.receipt_help, new RegExp(`https://bookiz.test/k/${account.tenant}/bon/K2026-001/`));
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      const stored = await expenses.attachReceipt(ctx, expense.ref, { content_base64: png.toString('base64') });
      assert.equal(stored.receipt.archive, 'email');
      const big = await expenses.recordExpense(ctx, { date: '2026-11-11', vendor: 'X', amount: 5, vat_amount: 0 });
      const tooBig = Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]).toString('base64');
      await assert.rejects(expenses.attachReceipt(ctx, big.ref, { content_base64: tooBig }), /groter dan 4 MB/);
    },
    cloud.now,
  );
  assert.equal(sent[0]?.to, 'alice@example.test');
});

test('an account that has not paid can only mail its own owner', async () => {
  const { cloud, raw } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const account = await ensureAccount(cloud.connect, env, alice);
  const sent: { to: string; cc?: string }[] = [];
  const mail = (async (m: { to: string; cc?: string }) => {
    sent.push(m);
    return { messageId: '<m>' };
  }) as never;
  const stranger = async (acc: typeof account) =>
    withTenant(
      cloud.connect,
      env,
      acc,
      mail,
      async (ctx) => {
        await store.saveBusiness(ctx.db, { name: 'Alice', address_line: 'Straat 1', postal_code: '1234 AB', city: 'Utrecht', kvk_number: '12345678', vat_id: 'NL123456789B01', iban: 'NL00BANK0123456789', email: 'alice-zaak@example.test', archive_email: 'elders@example.test' });
        const contact = await store.saveContact(ctx.db, undefined, { name: 'Onbekende', address_line: 'Kade 1', city: 'Zwolle', email: 'victim@example.test' });
        const draft = await invoices.createInvoice(ctx, { contact_id: contact.id, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
        const invoice = await invoices.finalizeInvoice(ctx, draft.draft_id);
        return invoices.sendInvoice(ctx, { number: invoice.number as string });
      },
      cloud.now,
    );
  const onTrial = await stranger(account);
  assert.equal(onTrial.sent_to, 'alice@example.test');
  assert.match(onTrial.note ?? '', /alleen naar je eigen adres/);
  assert.deepEqual([sent[0]?.to, sent[0]?.cc], ['alice@example.test', undefined]);

  const paying = await stranger({ ...account, status: 'active', paid_until: '2028-01-01T00:00:00Z' });
  assert.equal(paying.sent_to, 'victim@example.test');
  assert.equal(sent[1]?.cc, 'alice-zaak@example.test');
});

function stripeHeader(body: string, secret: string, at: number): string {
  return `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;
}

test('only Stripe can activate a subscription, and only once per event', async () => {
  const { cloud, raw } = await embeddedCloud();
  const server = createServer((req, res) => void handle(cloud, req, res)).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(health).sort(), ['ok', 'version'], 'anonymous callers learn nothing about the configuration');
    const detail = (await (await fetch(`${base}/api/health`, { headers: { authorization: 'Bearer operator-token-for-tests-0123456789' } })).json()) as Record<string, any>;
    assert.equal(detail.mail.configured, false);
    assert.equal(detail.mail.library, true);
    const meta = (await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, any>;
    assert.deepEqual(meta.authorization_servers, ['https://project.supabase.test/auth/v1']);

    const unauthorized = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get('www-authenticate') ?? '', /resource_metadata="https:\/\/bookiz\.test\/\.well-known\/oauth-protected-resource\/mcp"/);

    const account = await ensureAccount(cloud.connect, env, alice);
    const event = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', payment_link: 'plink_bookiz', payment_status: 'paid', client_reference_id: alice.id, customer: 'cus_1' } },
    });
    const at = Math.floor(cloud.now().getTime() / 1000);

    const forged = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', body: event, headers: { 'stripe-signature': stripeHeader(event, 'wrong-secret', at) } });
    assert.equal(forged.status, 400);
    const stale = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', body: event, headers: { 'stripe-signature': stripeHeader(event, 'whsec_test_secret', at - 3600) } });
    assert.equal(stale.status, 400);
    const control = await cloud.connect();
    assert.equal((await findAccount(control, alice.id))?.status, 'trial');

    // Another product sold from the same Stripe account, with our customer's id pasted into its link: not a Bookiz payment.
    const other = JSON.stringify({
      id: 'evt_other',
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_link: 'plink_cheap', payment_status: 'paid', client_reference_id: alice.id, customer: 'cus_x' } },
    });
    assert.equal((await fetch(`${base}/api/stripe/webhook`, { method: 'POST', body: other, headers: { 'stripe-signature': stripeHeader(other, 'whsec_test_secret', at) } })).status, 200);
    assert.equal((await findAccount(control, alice.id))?.status, 'trial');

    const good = { method: 'POST', body: event, headers: { 'stripe-signature': stripeHeader(event, 'whsec_test_secret', at) } };
    assert.equal((await fetch(`${base}/api/stripe/webhook`, good)).status, 200);
    const active = await findAccount(control, alice.id);
    assert.equal(active?.status, 'active');
    assert.equal(active?.stripe_customer_id, 'cus_1');
    const paidUntil = active?.paid_until;
    assert.ok(paidUntil && new Date(paidUntil) > new Date('2027-11-16T00:00:00Z'));

    // Stripe may deliver the same event again; it must not extend the subscription twice.
    assert.equal((await fetch(`${base}/api/stripe/webhook`, good)).status, 200);
    assert.equal((await findAccount(control, alice.id))?.paid_until, paidUntil);

    assert.equal((await fetch(`${base}/k/${'0'.repeat(20)}/factuur/2026-001/abc.pdf`)).status, 404);
    assert.equal((await fetch(`${base}/k/${account.tenant}/factuur/2026-001/${'a'.repeat(32)}.pdf`)).status, 404);
    const crossSite = await fetch(`${base}/app/logout`, { method: 'POST', headers: { origin: 'https://evil.example' } });
    assert.equal(crossSite.status, 403);
    const login = await fetch(`${base}/app/login`);
    // With `no-referrer` a browser posts our own form with `Origin: null`, and sign-in would refuse itself.
    assert.equal(login.headers.get('referrer-policy'), 'same-origin');
    assert.match(login.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    const closed = await fetch(`${base}/app/login`, { method: 'POST', headers: { origin: 'https://bookiz.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a%40example.test' });
    assert.equal(closed.status, 503, 'without mail configured nobody is created and no code is issued');
    assert.equal(verifyStripeSignature('s', Buffer.from('x'), 'garbage', at), false);
    void raw;
  } finally {
    server.close();
    server.closeAllConnections();
  }
});

test('Done For You is paid through its own link after sign-in, the operator hears of it, and one subscription runs at a time', async () => {
  const { cloud, raw, sent, setNow } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const server = createServer((req, res) => void handle(cloud, req, res)).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const webhook = (body: string) =>
    fetch(`${base}/api/stripe/webhook`, { method: 'POST', body, headers: { 'stripe-signature': stripeHeader(body, 'whsec_test_secret', Math.floor(cloud.now().getTime() / 1000)) } });
  try {
    // A visitor who picks a plan on the site signs in first and then goes on to pay.
    // On Vercel the rewrite to the function adds `path=…` to the query; the way back must survive that.
    for (const path of ['/app/betalen?plan=dfy', '/app/betalen?plan=dfy&path=betalen']) {
      const anonymous = await fetch(`${base}${path}`, { redirect: 'manual' });
      assert.equal(anonymous.status, 303);
      assert.equal(anonymous.headers.get('location'), '/app/login?next=%2Fapp%2Fbetalen%3Fplan%3Ddfy', path);
    }
    assert.match(await (await fetch(`${base}/app/login?next=${encodeURIComponent('/app/betalen?plan=dfy')}`)).text(), /name="next" value="\/app\/betalen\?plan=dfy"/);
    const smuggled = await (await fetch(`${base}/app/login?next=${encodeURIComponent('/app/betalen?plan=dfy&to=https://evil.example')}`)).text();
    assert.match(smuggled, /name="next" value="\/app"/, 'only the exact pay paths survive sign-in');

    const account = await ensureAccount(cloud.connect, env, bob);
    const checkout = new URL(checkoutUrl(cloud, account, 'dfy') as string);
    assert.equal(`${checkout.origin}${checkout.pathname}`, 'https://buy.stripe.test/dfy');
    assert.equal(checkout.searchParams.get('client_reference_id'), bob.id);
    assert.equal(checkout.searchParams.get('prefilled_email'), bob.email);

    const bought = JSON.stringify({
      id: 'evt_dfy_1',
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', payment_link: 'plink_dfy', payment_status: 'paid', client_reference_id: bob.id, customer: 'cus_dfy' } },
    });
    assert.equal((await webhook(bought)).status, 200);
    const control = await cloud.connect();
    const paid = (await findAccount(control, bob.id)) as Account;
    assert.equal(paid.status, 'active');
    assert.equal(paid.plan, 'dfy');
    assert.deepEqual(
      sent.map((m) => m.to),
      ['ops@bookiz.test'],
    );
    assert.match(sent[0]?.text ?? '', /bob@example\.test/);

    // While a subscription can still renew, a second checkout would start a second subscription that nobody sees.
    assert.equal(checkoutUrl(cloud, paid, 'cloud'), null);
    assert.equal(checkoutUrl(cloud, paid, 'dfy'), null);

    // Cancelling keeps the paid year, as the terms promise; after it, the books are read-only and buying again is possible.
    assert.equal((await webhook(JSON.stringify({ id: 'evt_dfy_2', type: 'customer.subscription.deleted', data: { object: { customer: 'cus_dfy' } } }))).status, 200);
    const cancelled = (await findAccount(control, bob.id)) as Account;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(accessOf(cancelled, env, cloud.now()).allowed, true);
    assert.equal(checkoutUrl(cloud, cancelled, 'cloud'), null);
    setNow('2028-01-01T00:00:00Z');
    assert.equal(accessOf(cancelled, env, cloud.now()).allowed, false);
    assert.notEqual(checkoutUrl(cloud, cancelled, 'cloud'), null);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});

test('the operator accounts always have access, and an empty list grants nobody anything', async () => {
  const { cloud, raw, setNow } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const account = await ensureAccount(cloud.connect, env, alice);
  setNow('2028-01-01T00:00:00Z');
  assert.equal(accessOf(account, env, cloud.now()).allowed, false, 'an expired trial is closed');
  assert.equal(isAdmin(env, account), false, 'no list, no admins');

  const admins = { ...env, adminEmails: ['ALICE@example.test'.toLowerCase()] };
  assert.equal(isAdmin(admins, { ...account, email: ' Alice@Example.test ' }), true, 'matched on the normalised address');
  assert.equal(accessOf(account, admins, cloud.now()).allowed, true);
  assert.equal(tenantConfig(admins, account).mailOnlyTo, undefined, 'an admin can mail customers, also on a trial');
  assert.equal(tenantConfig(env, account).mailOnlyTo, account.email);
  assert.equal(isAdmin(admins, { ...account, email: 'bob@example.test' }), false);
});

test('the daily keep-alive answers only to Vercel Cron and touches the database', async () => {
  const { cloud, raw } = await embeddedCloud();
  await raw.exec((await import('../src/cloud/tenants.ts')).CONTROL_SCHEMA);
  const serve = (c: Cloud) => createServer((req, res) => void handle(c, req, res)).listen(0);
  const off = serve(cloud);
  const on = serve({ ...cloud, env: { ...env, cronSecret: 'cron-secret-for-tests-0123456789' } });
  const at = (server: ReturnType<typeof serve>) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/cron/keepalive`;
  try {
    assert.equal((await fetch(at(off))).status, 404, 'without a secret there is no endpoint');
    assert.equal((await fetch(at(on))).status, 401);
    assert.equal((await fetch(at(on), { headers: { authorization: 'Bearer wrong' } })).status, 401);
    const ok = await fetch(at(on), { headers: { authorization: 'Bearer cron-secret-for-tests-0123456789' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
  } finally {
    for (const server of [off, on]) {
      server.close();
      server.closeAllConnections();
    }
  }
});

test('Bookiz Cloud pages count no visits; only the public site does', () => {
  for (const html of [loginPage('nonce', { next: '/app' }), messagePage('nonce', 'Klaar', 'Gelukt.')]) {
    assert.doesNotMatch(html, /_vercel\/insights/);
  }
});
