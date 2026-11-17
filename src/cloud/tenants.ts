import { randomBytes } from 'node:crypto';
import type { Ctx } from '../app/context.ts';
import type { Config } from '../config.ts';
import { type Db, migrate, openConnection, SCHEMA_VERSION } from '../db.ts';
import type { Mailer } from '../mail.ts';
import type { CloudEnv } from './env.ts';

/**
 * Every customer gets a Postgres schema of their own, holding the exact tables
 * the self-hosted version has. The engine never sees a customer id: the
 * connection is pointed at one schema and cannot name another.
 */
export type Account = {
  user_id: string;
  email: string;
  tenant: string;
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  plan: Plan;
  trial_ends_at: string;
  paid_until: string | null;
  stripe_customer_id: string | null;
  schema_version: number;
  created_at: string;
};

/** Cloud is the software; Done For You is the software plus a bookkeeper. */
export type Plan = 'cloud' | 'dfy';

export const ACCOUNT_COLUMNS = 'user_id, email, tenant, status, plan, trial_ends_at, paid_until, stripe_customer_id, schema_version, created_at';

export const CONTROL_SCHEMA = `
  create schema if not exists bookiz_cloud;
  create table if not exists bookiz_cloud.account (
    user_id uuid primary key,
    email text not null,
    tenant text not null unique check (tenant ~ '^[0-9a-f]{20}$'),
    status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'cancelled')),
    trial_ends_at timestamptz not null,
    paid_until timestamptz,
    stripe_customer_id text,
    schema_version integer not null default 0,
    created_at timestamptz not null default now()
  );
  create table if not exists bookiz_cloud.login_attempt (
    id integer generated always as identity primary key,
    email text not null,
    ip text not null,
    at timestamptz not null default now()
  );
  create index if not exists login_attempt_at on bookiz_cloud.login_attempt (at);
  alter table bookiz_cloud.login_attempt add column if not exists kind text not null default 'code_sent';
  alter table bookiz_cloud.account add column if not exists plan text not null default 'cloud' check (plan in ('cloud', 'dfy'));
  create table if not exists bookiz_cloud.stripe_event (
    id text primary key,
    type text not null,
    received_at timestamptz not null default now()
  );
`;

export function tenantSchema(tenant: string): string {
  // The value comes from our own table, but a schema name ends up in SQL text, so check it anyway.
  if (!/^[0-9a-f]{20}$/.test(tenant)) throw new Error('invalid tenant id');
  return `t_${tenant}`;
}

/** Opens connections; a seam so tests can run the same logic on an embedded database. */
export type Connector = (searchPath?: string) => Promise<Db>;

export function pgConnector(env: CloudEnv): Connector {
  return (searchPath) => openConnection(env.databaseUrl, searchPath);
}

export async function ensureControlSchema(connect: Connector): Promise<void> {
  const db = await connect();
  try {
    await db.exec(CONTROL_SCHEMA);
  } finally {
    await db.close();
  }
}

export async function findAccount(control: Db, userId: string): Promise<Account | null> {
  const rows = await control.query<Account>(`select ${ACCOUNT_COLUMNS} from bookiz_cloud.account where user_id = $1`, [userId]);
  return rows[0] ?? null;
}

/**
 * The account for a signed-in user, created on first use with an empty
 * administration and a trial. `user.id` must come from a verified token.
 */
export async function ensureAccount(connect: Connector, env: CloudEnv, user: { id: string; email: string }): Promise<Account> {
  const control = await connect();
  try {
    // An assistant often opens with several requests at once. One of them creates
    // the administration; the others wait here instead of creating it too.
    await control.query('select pg_advisory_lock(hashtext($1))', [`bookiz-account:${user.id}`]);
    let account = await findAccount(control, user.id);
    if (!account) {
      const tenant = randomBytes(10).toString('hex');
      await control.query(
        `insert into bookiz_cloud.account (user_id, email, tenant, trial_ends_at)
         values ($1, $2, $3, now() + make_interval(days => $4)) on conflict (user_id) do nothing`,
        [user.id, user.email, tenant, env.trialDays],
      );
      account = (await findAccount(control, user.id)) as Account;
    }
    if (account.schema_version < SCHEMA_VERSION) {
      await control.exec(`create schema if not exists ${tenantSchema(account.tenant)}`);
      const tenantDb = await connect(tenantSchema(account.tenant));
      try {
        await migrate(tenantDb);
      } finally {
        await tenantDb.close();
      }
      await control.query('update bookiz_cloud.account set schema_version = $2 where user_id = $1', [user.id, SCHEMA_VERSION]);
      account.schema_version = SCHEMA_VERSION;
    }
    return account;
  } finally {
    await control.query('select pg_advisory_unlock_all()').catch(() => undefined);
    await control.close();
  }
}

export type Access = { allowed: true } | { allowed: false; reason: string };

/** The operator's own accounts: always open, never billed. Matched on the verified sign-in address. */
export function isAdmin(env: CloudEnv, account: Account): boolean {
  return env.adminEmails.length > 0 && env.adminEmails.includes(account.email.trim().toLowerCase());
}

export function accessOf(account: Account, env: CloudEnv, now: Date): Access {
  if (isAdmin(env, account)) return { allowed: true };
  const paid = account.paid_until !== null && new Date(account.paid_until) > now;
  // A cancelled subscription still runs to the end of the year that was paid for, as the terms promise.
  if (account.status !== 'trial' && paid) return { allowed: true };
  if (account.status === 'trial' && new Date(account.trial_ends_at) > now) return { allowed: true };
  return {
    allowed: false,
    reason:
      'Je proefperiode of abonnement van Bookiz Cloud is afgelopen. Bekijken en exporteren kan nog; boeken niet. ' +
      `Verleng op ${env.publicUrl}/app.`,
  };
}

export function tenantConfig(env: CloudEnv, account: Account): Config {
  return {
    mode: 'http',
    // Vercel has no durable disk; nothing of a customer may be written here.
    dataDir: '/tmp/bookiz',
    databaseUrl: undefined,
    port: 0,
    publicUrl: env.publicUrl,
    token: env.linkSecret,
    urlToken: undefined,
    smtpUrl: env.smtpUrl,
    mailFrom: env.mailFrom,
    receiptArchive: 'email',
    linkScope: `/k/${account.tenant}`,
    // Vercel refuses request bodies above 4.5 MB.
    maxReceiptBytes: 4 * 1024 * 1024,
    fallbackArchiveEmail: account.email,
    dailyMailLimit: 25,
    // A free trial needs no card, so it must not be a way to mail strangers from our domain.
    // Once paid, also after cancelling, invoices go to customers; the access check stops everything when the paid period ends.
    mailOnlyTo: account.status === 'trial' && !isAdmin(env, account) ? account.email : undefined,
    // A receipt carries an attachment the customer supplies. It goes to the address they proved is theirs, nowhere else.
    receiptsOnlyTo: account.email,
    dailyReceiptLimit: 100,
  };
}

/** Run `fn` inside one customer's administration and always release the connection. */
export async function withTenant<T>(
  connect: Connector,
  env: CloudEnv,
  account: Account,
  mail: Mailer,
  fn: (ctx: Ctx) => Promise<T>,
  now: () => Date = () => new Date(),
): Promise<T> {
  const db = await connect(tenantSchema(account.tenant));
  try {
    const access = accessOf(account, env, now());
    return await fn({ db, config: tenantConfig(env, account), mail, now, locked: access.allowed ? undefined : access.reason });
  } finally {
    await db.close();
  }
}
