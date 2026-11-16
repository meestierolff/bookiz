import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import type { Ctx } from '../src/app/context.ts';
import type { Config } from '../src/config.ts';
import { type Db, openEmbedded, openPostgres } from '../src/db.ts';
import type { Mail } from '../src/mail.ts';
import * as store from '../src/store.ts';

export type TestCtx = Ctx & { sent: Mail[]; setNow: (iso: string) => void };

const opened: Db[] = [];
after(async () => {
  await Promise.all(opened.map((db) => db.close().catch(() => undefined)));
});

/**
 * In memory by default. With BOOKIZ_TEST_DATABASE_URL the same tests run on a
 * real Postgres, each context in its own schema.
 */
async function openTestDb(): Promise<Db> {
  const url = process.env.BOOKIZ_TEST_DATABASE_URL;
  if (!url) return openEmbedded();
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  await admin.end();
  const scoped = new URL(url);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  return openPostgres(scoped.toString());
}

export async function makeCtx(overrides: Partial<Config> = {}): Promise<TestCtx> {
  let now = new Date('2026-11-16T10:00:00Z');
  const sent: Mail[] = [];
  const config: Config = {
    mode: 'stdio',
    dataDir: mkdtempSync(join(tmpdir(), 'bookiz-test-')),
    databaseUrl: undefined,
    port: 0,
    publicUrl: undefined,
    token: undefined,
    urlToken: undefined,
    smtpUrl: undefined,
    mailFrom: undefined,
    receiptArchive: 'folder',
    ...overrides,
  };
  const db = await openTestDb();
  opened.push(db);
  return {
    db,
    config,
    mail: async (mail) => {
      sent.push(mail);
      return { messageId: `<test-${sent.length}@bookiz.test>` };
    },
    now: () => now,
    sent,
    setNow: (iso) => {
      now = new Date(iso);
    },
  };
}

/** A complete business and one Dutch customer; returns the customer id. */
export async function seed(ctx: Ctx, business: Parameters<typeof store.saveBusiness>[1] = {}): Promise<number> {
  await store.saveBusiness(ctx.db, {
    name: 'Studio Voorbeeld',
    owner_name: 'Sam Voorbeeld',
    address_line: 'Dorpsstraat 1',
    postal_code: '1234 AB',
    city: 'Utrecht',
    kvk_number: '12345678',
    vat_id: 'NL123456789B01',
    iban: 'NL00BANK0123456789',
    email: 'sam@voorbeeld.test',
    ...business,
  });
  const contact = await store.saveContact(ctx.db, undefined, {
    name: 'Klant BV',
    email: 'administratie@klant.test',
    address_line: 'Kade 5',
    postal_code: '3011 AA',
    city: 'Rotterdam',
  });
  return contact.id;
}

/** Smallest valid PNG, for receipt tests. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
