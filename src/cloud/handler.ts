import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { needsReceipt } from '../app/expenses.ts';
import * as reports from '../app/reports.ts';
import { yearOf } from '../core/dates.ts';
import { BookizError } from '../errors.ts';
import { fail, handleDocumentLink, handleMcp, readBody, secretMatches, send, sendHtml } from '../http.ts';
import { createMailer, type Mailer } from '../mail.ts';
import { uploadLink, verifyLink } from '../receipts.ts';
import { availableYears } from '../rules.ts';
import { VERSION } from '../server.ts';
import * as store from '../store.ts';
import {
  bearerToken,
  createLoginCode,
  currentSession,
  readCookies,
  revokeSession,
  type Session,
  sessionCookies,
  verifyAccessToken,
  verifyLoginCode,
} from './auth.ts';
import { type CloudEnv, loadCloudEnv } from './env.ts';
import { bookkeeperSheets, toCsv, toXlsx } from '../app/spreadsheet.ts';
import { businessPage, codePage, consentPage, dashboardPage, forwardPage, loginMail, loginPage, messagePage } from './pages.ts';
import { businessFormState, saveBusinessForm } from '../app/business-form.ts';
import {
  ACCOUNT_COLUMNS,
  type Account,
  accessOf,
  type Connector,
  ensureAccount,
  ensureControlSchema,
  isAdmin,
  type Plan,
  pgConnector,
  tenantConfig,
  withTenant,
} from './tenants.ts';

export type Cloud = { env: CloudEnv; connect: Connector; mail: Mailer; now: () => Date };

/**
 * The signed-in user's account. A new one is reported to the operator, who
 * writes to each person starting a trial to help them get going.
 */
export async function accountFor(cloud: Cloud, user: { id: string; email: string }): Promise<Account> {
  const account = await ensureAccount(cloud.connect, cloud.env, user);
  if (account.created && cloud.env.operatorEmail) {
    const trialEnds = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(account.trial_ends_at),
    );
    // Never at the cost of signing in: a failed notice is only logged.
    await cloud
      .mail({
        to: cloud.env.operatorEmail,
        subject: 'Nieuw Bookiz Cloud-account',
        text:
          `${account.email} heeft een Bookiz Cloud-account aangemaakt. De proefperiode loopt tot ${trialEnds}.\n\n` +
          'Een persoonlijk bericht om op weg te helpen kan nu. Geen reclame zonder toestemming; zo staat het in de privacyverklaring.',
        attachments: [],
      })
      .catch((error) => console.error('[bookiz] sign-up notice failed', error));
  }
  return account;
}

let ready: Promise<void> | undefined;

export function createCloud(env: CloudEnv = loadCloudEnv()): Cloud {
  return { env, connect: pgConnector(env), mail: createMailer(env), now: () => new Date() };
}

function redirect(res: ServerResponse, location: string, cookies?: string[]): void {
  res.writeHead(303, { location, 'cache-control': 'no-store', ...(cookies ? { 'set-cookie': cookies } : {}) });
  res.end();
}

/** Only ever send a signed-in browser back to our own pages. */
function safeNext(value: string | null | undefined): string {
  if (value && /^\/(app|oauth\/consent)(\?[\w=&%.~-]*)?$/.test(value)) return value;
  if (value && /^\/app\/betalen\?plan=(cloud|dfy)$/.test(value)) return value;
  return '/app';
}

/** State-changing requests must come from our own pages, not from a form on another site. */
function sameOrigin(cloud: Cloud, req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  return typeof origin === 'string' && origin === new URL(cloud.env.publicUrl).origin;
}

async function form(req: IncomingMessage): Promise<URLSearchParams> {
  return new URLSearchParams((await readBody(req, 64 * 1024)).toString('utf8'));
}

/**
 * The caller's address as the platform saw it. Vercel sets these headers itself
 * and discards what a client sends; anything that is not an IP address is ignored.
 */
function clientIp(req: IncomingMessage): string {
  for (const header of ['x-vercel-forwarded-for', 'x-real-ip']) {
    const value = String(req.headers[header] ?? '').split(',')[0]!.trim();
    if (isIP(value)) return value;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

type AttemptKind = 'code_sent' | 'code_wrong';

/**
 * Sign-in is the one thing open to anyone, so it is rationed: codes mailed per
 * address, per caller and in total, and wrong codes per address and per caller.
 * A six-digit code that may be guessed five times is as strong as it needs to be.
 */
async function allowAttempt(cloud: Cloud, kind: AttemptKind, email: string, ip: string, record: boolean): Promise<boolean> {
  const limits = kind === 'code_sent' ? { email: 3, ip: 10, total: 300 } : { email: 5, ip: 20, total: 2000 };
  const db = await cloud.connect();
  try {
    return await db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(hashtext('bookiz-login'))");
      await tx.query("delete from bookiz_cloud.login_attempt where at < now() - interval '1 day'");
      const rows = await tx.query<{ by_email: number; by_ip: number; total: number }>(
        `select count(*) filter (where email = $1)::int as by_email, count(*) filter (where ip = $2)::int as by_ip, count(*)::int as total
         from bookiz_cloud.login_attempt where kind = $3 and at > now() - interval '15 minutes'`,
        [email, ip, kind],
      );
      const used = rows[0] ?? { by_email: 0, by_ip: 0, total: 0 };
      if (used.by_email >= limits.email || used.by_ip >= limits.ip || used.total >= limits.total) return false;
      if (record) await tx.query('insert into bookiz_cloud.login_attempt (email, ip, kind) values ($1, $2, $3)', [email, ip, kind]);
      return true;
    });
  } finally {
    await db.close();
  }
}

/** A correct code gives its claimed attempt back, so signing in normally never counts against the owner. */
async function forgetAttempt(cloud: Cloud, email: string, ip: string): Promise<void> {
  const db = await cloud.connect();
  try {
    await db.query(
      `delete from bookiz_cloud.login_attempt where id = (
         select id from bookiz_cloud.login_attempt where kind = 'code_wrong' and email = $1 and ip = $2 order by id desc limit 1)`,
      [email, ip],
    );
  } finally {
    await db.close();
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * Where an approval sends the browser back to. Assistants register themselves,
 * so the name they give proves nothing; the return address is what tells the
 * owner who really receives access.
 */
function describeReturn(redirect: string): { host: string; known: boolean; local: boolean } {
  try {
    const url = new URL(redirect);
    const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    const known = url.protocol === 'https:' && ['claude.ai', 'claude.com', 'chatgpt.com', 'www.cursor.com', 'vscode.dev', 'console.x.ai'].includes(url.hostname);
    return { host: url.host || url.protocol, known, local };
  } catch {
    return { host: 'onbekend adres', known: false, local: false };
  }
}

/** Follow a redirect that Supabase hands back only if it is a real link, never script or data. */
function safeExternal(target: unknown): string | null {
  if (typeof target !== 'string') return null;
  try {
    const protocol = new URL(target).protocol;
    return ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'].includes(protocol) ? null : target;
  } catch {
    return null;
  }
}

async function accountByTenant(cloud: Cloud, tenant: string): Promise<Account | null> {
  if (!/^[0-9a-f]{20}$/.test(tenant)) return null;
  const db = await cloud.connect();
  try {
    const rows = await db.query<Account>(`select ${ACCOUNT_COLUMNS} from bookiz_cloud.account where tenant = $1`, [tenant]);
    return rows[0] ?? null;
  } finally {
    await db.close();
  }
}

/**
 * The Stripe checkout for a plan, tied to this account. Null while a subscription
 * exists that could still renew: a second checkout would start a second
 * subscription that nobody sees, so changes go by e-mail instead.
 */
export function checkoutUrl(cloud: Cloud, account: Account, plan: Plan): string | null {
  const link = plan === 'dfy' ? cloud.env.stripeDfyPaymentLink : cloud.env.stripePaymentLink;
  if (!link) return null;
  const expired = account.paid_until === null || new Date(account.paid_until) <= cloud.now();
  if (!(account.status === 'trial' || (account.status === 'cancelled' && expired))) return null;
  const url = new URL(link);
  url.searchParams.set('client_reference_id', account.user_id);
  url.searchParams.set('prefilled_email', account.email);
  return url.toString();
}

/** Which plan a Stripe checkout bought; other products sold from the same Stripe account buy nothing here. */
function planOf(env: Cloud['env'], object: Record<string, any>): Plan | null {
  if (object.mode !== 'subscription' || typeof object.payment_link !== 'string') return null;
  if (env.stripePaymentLinkId && object.payment_link === env.stripePaymentLinkId) return 'cloud';
  if (env.stripeDfyPaymentLinkId && object.payment_link === env.stripeDfyPaymentLinkId) return 'dfy';
  return null;
}

/** A Supabase client acting as the signed-in owner, for the OAuth consent calls. */
async function supabaseFor(cloud: Cloud, session: Session) {
  const client = createClient(cloud.env.supabaseUrl, cloud.env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return client;
}

async function mcp(cloud: Cloud, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = bearerToken(req);
  const user = token ? await verifyAccessToken(cloud.env, token, 'assistant') : null;
  if (!user || !user.email) {
    // This challenge is how an assistant discovers where to sign in.
    const metadata = `${cloud.env.publicUrl}/.well-known/oauth-protected-resource/mcp`;
    res.writeHead(401, {
      'www-authenticate': `Bearer resource_metadata="${metadata}"`,
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ error: 'unauthorized', error_description: 'Sign in to Bookiz to use this server.' }));
    return;
  }
  const account = await accountFor(cloud, user);
  await withTenant(cloud.connect, cloud.env, account, cloud.mail, (ctx) => handleMcp(ctx, req, res), cloud.now);
}

async function dashboard(cloud: Cloud, req: IncomingMessage, res: ServerResponse, session: Session): Promise<void> {
  const account = await accountFor(cloud, session.user);
  const access = accessOf(account, cloud.env, cloud.now());
  const data = await withTenant(
    cloud.connect,
    cloud.env,
    account,
    cloud.mail,
    async (ctx) => {
      const expenses = (await store.listExpenses(ctx.db)).filter(needsReceipt);
      const invoices = await store.listInvoices(ctx.db);
      const years = new Set([yearOf(new Date(cloud.now()).toISOString().slice(0, 10))]);
      for (const invoice of invoices) years.add(yearOf(invoice.issue_date));
      for (const expense of await store.listExpenses(ctx.db)) years.add(yearOf(expense.date));
      return {
        overview: (await reports.overview(ctx)) as Record<string, unknown>,
        missing: expenses.slice(0, 20).map((e) => ({ ref: e.ref, vendor: e.vendor, date: e.date, link: uploadLink(ctx.config, e.ref) })),
        years: [...years].filter((year) => availableYears().includes(year)).sort(),
        business: { details: await store.getBusiness(ctx.db), form: await businessFormState(ctx, account.email) },
      };
    },
    cloud.now,
  );
  const grants = await (await supabaseFor(cloud, session)).auth.oauth
    .listGrants()
    .then(({ data }) => (data ?? []).map((grant) => ({ clientId: grant.client.id, name: grant.client.name ?? 'Onbekende toepassing', since: grant.granted_at })))
    .catch(() => []);
  sendHtml(res, 200, (nonce) =>
    dashboardPage(nonce, {
      grants,
      account,
      access: access.allowed,
      admin: isAdmin(cloud.env, account),
      mcpUrl: `${cloud.env.publicUrl}/mcp`,
      checkout: { cloud: checkoutUrl(cloud, account, 'cloud') !== null, dfy: checkoutUrl(cloud, account, 'dfy') !== null },
      overview: data.overview,
      missingReceipts: data.missing,
      years: data.years,
      business: data.business,
    }),
  );
}

async function consent(cloud: Cloud, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const session = await currentSession(cloud.env, req, res);
  if (req.method === 'GET') {
    const id = url.searchParams.get('authorization_id') ?? '';
    if (!/^[\w-]{6,200}$/.test(id)) return sendHtml(res, 400, (n) => messagePage(n, 'Dit verzoek klopt niet', 'De koppeling met je assistent is onvolledig. Start het koppelen opnieuw vanuit je assistent.'));
    if (!session) return redirect(res, `/app/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
    const { data, error } = await (await supabaseFor(cloud, session)).auth.oauth.getAuthorizationDetails(id);
    if (error || !data) {
      return sendHtml(res, 400, (n) => messagePage(n, 'Dit verzoek is verlopen', 'Start het koppelen opnieuw vanuit je assistent.'));
    }
    // Supabase answers with a redirect when this client was approved before.
    const details = data as unknown as Record<string, any>;
    const already = !details.authorization_id ? safeExternal(details.redirect_url) : null;
    if (already) return redirect(res, already);
    const back = describeReturn(String(details.redirect_uri ?? details.redirect_url ?? ''));
    return sendHtml(res, 200, (nonce) =>
      consentPage(nonce, {
        authorizationId: id,
        clientName: String(details.client?.name ?? details.client?.client_name ?? 'Een onbekende toepassing'),
        returnTo: back,
        email: session.user.email,
      }),
    );
  }
  if (req.method !== 'POST' || !sameOrigin(cloud, req)) return send(res, 403, 'Niet toegestaan.');
  if (!session) return redirect(res, '/app/login');
  const fields = await form(req);
  const id = fields.get('authorization_id') ?? '';
  const oauth = (await supabaseFor(cloud, session)).auth.oauth;
  const { data, error } = fields.get('decision') === 'approve' ? await oauth.approveAuthorization(id) : await oauth.denyAuthorization(id);
  const answer = data as unknown as Record<string, any> | null;
  const target = safeExternal(answer?.redirect_url ?? answer?.redirect_to);
  if (error || !target) {
    return sendHtml(res, 400, (n) => messagePage(n, 'Dat lukte niet', 'De koppeling kon niet worden afgerond. Start het koppelen opnieuw vanuit je assistent.'));
  }
  // Browsers refuse a redirect to another site straight from a form post under our
  // content policy, so hand the owner a page that takes them there.
  return sendHtml(res, 200, (nonce) => forwardPage(nonce, target, describeReturn(target).host));
}

async function app(cloud: Cloud, req: IncomingMessage, res: ServerResponse, url: URL, parts: string[]): Promise<void> {
  const page = parts[1] ?? '';
  if (page === 'login' && req.method === 'GET') {
    return sendHtml(res, 200, (nonce) => loginPage(nonce, { next: safeNext(url.searchParams.get('next')) }));
  }
  if (req.method === 'POST' && !sameOrigin(cloud, req)) return send(res, 403, 'Niet toegestaan.');

  if (page === 'login' && req.method === 'POST') {
    const fields = await form(req);
    const email = (fields.get('email') ?? '').trim().toLowerCase();
    const next = safeNext(fields.get('next'));
    if (!EMAIL.test(email)) {
      return sendHtml(res, 400, (nonce) => loginPage(nonce, { next, error: 'Dat is geen geldig e-mailadres.' }));
    }
    if (!cloud.env.smtpUrl || !cloud.env.mailFrom) {
      // Checked before anything is created: without mail no code can arrive, so no account should exist either.
      return sendHtml(res, 503, (nonce) => loginPage(nonce, { next, error: 'Inloggen is nog niet open. Probeer het binnenkort opnieuw.' }));
    }
    if (!(await allowAttempt(cloud, 'code_sent', email, clientIp(req), true))) {
      return sendHtml(res, 429, (nonce) => loginPage(nonce, { next, error: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' }));
    }
    const code = await createLoginCode(cloud.env, email);
    await cloud.mail({ to: email, ...loginMail(code), attachments: [] });
    return sendHtml(res, 200, (nonce) => codePage(nonce, { email, next }));
  }

  if (page === 'verify' && req.method === 'POST') {
    const fields = await form(req);
    const email = (fields.get('email') ?? '').trim().toLowerCase();
    const next = safeNext(fields.get('next'));
    if (!EMAIL.test(email)) return sendHtml(res, 400, (nonce) => loginPage(nonce, { next, error: 'Dat is geen geldig e-mailadres.' }));
    const ip = clientIp(req);
    // Claim the attempt before checking the code, in one locked step, so parallel guesses cannot all slip under the limit.
    if (!(await allowAttempt(cloud, 'code_wrong', email, ip, true))) {
      return sendHtml(res, 429, (nonce) => loginPage(nonce, { next, error: 'Te veel onjuiste codes. Vraag over een kwartier een nieuwe code aan.' }));
    }
    try {
      const session = await verifyLoginCode(cloud.env, email, (fields.get('code') ?? '').replace(/\s/g, ''));
      await forgetAttempt(cloud, email, ip);
      return redirect(res, next, sessionCookies(session));
    } catch (error) {
      if (!(error instanceof BookizError)) throw error;
      return sendHtml(res, 400, (nonce) => codePage(nonce, { email, next, error: error.message }));
    }
  }

  if (page === 'logout' && req.method === 'POST') {
    const access = readCookies(req)['__Host-bz_at'];
    if (access) await revokeSession(cloud.env, access);
    return redirect(res, '/', sessionCookies(null));
  }

  const session = await currentSession(cloud.env, req, res);
  if (!session) {
    // Someone who chose a plan on the site signs in first and then goes straight on to paying.
    // Built from the plan alone: Vercel's rewrite adds its own query parameters to the URL.
    const chosen = url.searchParams.get('plan');
    const back = page === 'betalen' && (chosen === 'cloud' || chosen === 'dfy') ? `/app/betalen?plan=${chosen}` : '/app';
    return redirect(res, back === '/app' ? '/app/login' : `/app/login?next=${encodeURIComponent(back)}`);
  }

  if (page === 'betalen' && req.method === 'GET') {
    const plan: Plan = url.searchParams.get('plan') === 'dfy' ? 'dfy' : 'cloud';
    const account = await accountFor(cloud, session.user);
    return redirect(res, checkoutUrl(cloud, account, plan) ?? '/app');
  }

  if (page === 'export' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year'));
    if (!availableYears().includes(year)) return send(res, 400, 'Onbekend jaar.');
    // Read from fixed lists: the rewrite to this function adds query parameters of its own.
    const format = (['json', 'xlsx', 'csv'] as const).find((f) => f === url.searchParams.get('format')) ?? 'json';
    const tab = (['inkomsten', 'uitgaven'] as const).find((t) => t === url.searchParams.get('tab')) ?? 'uitgaven';
    const account = await accountFor(cloud, session.user);
    if (format === 'json') {
      const data = await withTenant(cloud.connect, cloud.env, account, cloud.mail, (ctx) => reports.exportBooks(ctx, { year }), cloud.now);
      return send(res, 200, JSON.stringify(data, null, 2), 'application/json; charset=utf-8', {
        'content-disposition': `attachment; filename="bookiz-${year}.json"`,
      });
    }
    const sheets = await withTenant(cloud.connect, cloud.env, account, cloud.mail, (ctx) => bookkeeperSheets(ctx, year), cloud.now);
    if (format === 'xlsx') {
      return send(res, 200, await toXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', {
        'content-disposition': `attachment; filename="bookiz-${year}.xlsx"`,
      });
    }
    const sheet = sheets.find((s) => s.name.toLowerCase() === tab) as (typeof sheets)[number];
    return send(res, 200, toCsv(sheet), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="bookiz-${year}-${tab}.csv"` });
  }
  if (page === 'revoke' && req.method === 'POST') {
    const clientId = (await form(req)).get('client_id') ?? '';
    if (/^[\w-]{1,200}$/.test(clientId)) await (await supabaseFor(cloud, session)).auth.oauth.revokeGrant({ clientId });
    return redirect(res, '/app');
  }
  if (page === 'bedrijf' && req.method === 'GET') {
    const account = await accountFor(cloud, session.user);
    const state = await withTenant(cloud.connect, cloud.env, account, cloud.mail, (ctx) => businessFormState(ctx, account.email), cloud.now);
    return sendHtml(res, 200, (nonce) => businessPage(nonce, { values: state.values, errors: {}, fixed: state.fixed }));
  }
  if (page === 'bedrijf' && req.method === 'POST') {
    const fields = await form(req);
    const account = await accountFor(cloud, session.user);
    const outcome = await withTenant(
      cloud.connect,
      cloud.env,
      account,
      cloud.mail,
      (ctx) => saveBusinessForm(ctx, fields),
      cloud.now,
    );
    if (outcome.ok) return redirect(res, '/app');
    return sendHtml(res, 400, (nonce) => businessPage(nonce, { values: outcome.values, errors: outcome.errors, fixed: outcome.fixed, message: outcome.message }));
  }
  if (page === '' && req.method === 'GET') return dashboard(cloud, req, res, session);
  return send(res, 404, 'Niet gevonden.');
}

/** Stripe signs the raw body; anything else claiming to be a payment is ignored. */
export function verifyStripeSignature(secret: string, body: Buffer, header: string, nowSeconds: number): boolean {
  const fields = Object.fromEntries(header.split(',').map((pair) => pair.split('=') as [string, string]));
  const timestamp = Number(fields.t);
  if (!fields.v1 || !Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex'));
  const given = Buffer.from(fields.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function stripeWebhook(cloud: Cloud, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST' || !cloud.env.stripeWebhookSecret) return send(res, 404, 'Niet gevonden.');
  const body = await readBody(req, 1024 * 1024);
  const signature = String(req.headers['stripe-signature'] ?? '');
  if (!verifyStripeSignature(cloud.env.stripeWebhookSecret, body, signature, Math.floor(cloud.now().getTime() / 1000))) {
    return send(res, 400, 'Invalid signature');
  }
  const event = JSON.parse(body.toString('utf8')) as { id: string; type: string; data: { object: Record<string, any> } };
  const object = event.data.object;
  const plan = planOf(cloud.env, object);
  let newDfyCustomer: { email: string; before: string } | null = null;
  const db = await cloud.connect();
  try {
    await db.transaction(async (tx) => {
      // Stripe delivers at least once; handle each event exactly once.
      const fresh = await tx.query('insert into bookiz_cloud.stripe_event (id, type) values ($1, $2) on conflict (id) do nothing returning id', [
        event.id,
        event.type,
      ]);
      if (fresh.length === 0) return;
      if (event.type === 'checkout.session.completed' && plan && object.payment_status === 'paid' && typeof object.client_reference_id === 'string') {
        const before = await tx.query<{ status: string; plan: string }>('select status, plan from bookiz_cloud.account where user_id::text = $1', [
          object.client_reference_id,
        ]);
        const updated = await tx.query<{ email: string }>(
          `update bookiz_cloud.account set status = 'active', plan = $3, stripe_customer_id = $2,
             paid_until = greatest(coalesce(paid_until, now()), now()) + interval '1 year 7 days'
           where user_id::text = $1 returning email`,
          [object.client_reference_id, typeof object.customer === 'string' ? object.customer : null, plan],
        );
        if (plan === 'dfy' && updated[0]) {
          newDfyCustomer = { email: updated[0].email, before: before[0] ? `${before[0].status}, ${before[0].plan}` : 'onbekend' };
        }
      } else if (event.type === 'invoice.paid' && object.billing_reason === 'subscription_cycle' && typeof object.customer === 'string') {
        await tx.query(
          `update bookiz_cloud.account set status = 'active', paid_until = greatest(coalesce(paid_until, now()), now()) + interval '1 year 7 days'
           where stripe_customer_id = $1`,
          [object.customer],
        );
      } else if (event.type === 'invoice.payment_failed' && typeof object.customer === 'string') {
        await tx.query(`update bookiz_cloud.account set status = 'past_due' where stripe_customer_id = $1 and status = 'active'`, [object.customer]);
      } else if (event.type === 'customer.subscription.deleted' && typeof object.customer === 'string') {
        // Access simply runs out at paid_until; nothing is deleted.
        await tx.query(`update bookiz_cloud.account set status = 'cancelled' where stripe_customer_id = $1`, [object.customer]);
      }
    });
  } finally {
    await db.close();
  }
  const customer = newDfyCustomer as { email: string; before: string } | null;
  if (customer && cloud.env.operatorEmail) {
    // After the commit, and never at the cost of the payment: a failed mail must not make Stripe retry the event.
    await cloud
      .mail({
        to: cloud.env.operatorEmail,
        subject: 'Nieuwe klant voor Done For You',
        text: `${customer.email} heeft Done For You betaald (founding-prijs).\nAccount hiervoor: ${customer.before}.\n\nNeem contact op voor de start. Had dit account al een betaald Cloud-abonnement, zeg dat dan op in Stripe.`,
        attachments: [],
      })
      .catch(() => undefined);
  }
  send(res, 200, 'ok');
}

/** Every request to Bookiz Cloud that is not a static page ends up here. */
export async function handle(cloud: Cloud, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', cloud.env.publicUrl);
    const parts = url.pathname.split('/').filter(Boolean);

    if (url.pathname === '/api/health') {
      // The public answer says only that the server is up. How it is configured is the operator's business.
      if (!secretMatches(cloud.env.operatorToken, bearerToken(req))) {
        return send(res, 200, JSON.stringify({ ok: true, version: VERSION }), 'application/json');
      }
      // Mail is loaded on demand, so prove here that it can be: otherwise the first sign-in would be the test.
      const mailLibrary = await import('nodemailer').then(
        (module) => typeof module.createTransport === 'function',
        () => false,
      );
      return send(
        res,
        200,
        JSON.stringify({
          ok: true,
          version: VERSION,
          rules: availableYears(),
          mail: { library: mailLibrary, configured: Boolean(cloud.env.smtpUrl && cloud.env.mailFrom) },
          payments: { configured: Boolean(cloud.env.stripeWebhookSecret && cloud.env.stripePaymentLinkId && cloud.env.stripePaymentLink) },
        }),
        'application/json',
      );
    }
    if (parts[0] === '.well-known' && parts[1] === 'oauth-protected-resource') {
      return send(
        res,
        200,
        JSON.stringify({
          resource: `${cloud.env.publicUrl}/mcp`,
          authorization_servers: [`${cloud.env.supabaseUrl}/auth/v1`],
          bearer_methods_supported: ['header'],
          resource_name: 'Bookiz',
        }),
        'application/json',
        { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
      );
    }

    ready ??= ensureControlSchema(cloud.connect).catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;

    // Daily call from Vercel Cron. A database on the free Supabase plan is paused after a quiet week; one query a day keeps it awake.
    if (url.pathname === '/api/cron/keepalive') {
      const expected = cloud.env.cronSecret ? Buffer.from(`Bearer ${cloud.env.cronSecret}`) : null;
      const given = Buffer.from(String(req.headers.authorization ?? ''));
      if (!expected) return send(res, 404, 'Niet gevonden.');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return send(res, 401, 'Niet toegestaan.');
      const db = await cloud.connect();
      try {
        await db.query('select 1');
      } finally {
        await db.close();
      }
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
    }

    if (parts[0] === 'mcp' && parts.length === 1) return await mcp(cloud, req, res);
    if (parts[0] === 'api' && parts[1] === 'stripe' && parts[2] === 'webhook') return await stripeWebhook(cloud, req, res);
    if (parts[0] === 'oauth' && parts[1] === 'consent') return await consent(cloud, req, res, url);
    if (parts[0] === 'app') return await app(cloud, req, res, url, parts);

    if (parts[0] === 'k' && parts[1]) {
      // Anyone can request these paths; the signature is checked before a database connection is spent on them.
      const kind = parts[2] === 'bon' ? 'bon' : parts[2] === 'factuur' ? 'factuur' : null;
      const signature = (parts[4] ?? '').replace(/\.pdf$/, '');
      const scope = { token: cloud.env.linkSecret, linkScope: `/k/${parts[1]}` };
      if (!/^[0-9a-f]{20}$/.test(parts[1]) || !kind || !parts[3] || !verifyLink(scope, kind, parts[3], signature)) {
        return send(res, 404, 'Niet gevonden.');
      }
      const account = await accountByTenant(cloud, parts[1]);
      if (!account) return send(res, 404, 'Niet gevonden.');
      const handled = await withTenant(cloud.connect, cloud.env, account, cloud.mail, (ctx) => handleDocumentLink(ctx, req, res, parts.slice(2)), cloud.now);
      if (handled) return;
    }
    return send(res, 404, 'Niet gevonden.');
  } catch (error) {
    fail(res, error);
  }
}

export { tenantConfig };
