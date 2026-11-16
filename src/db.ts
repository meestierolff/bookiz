import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { BookizError } from './errors.ts';
import { MIGRATIONS } from './migrations.ts';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const PG_DATE = 1082;
const PG_TIMESTAMPTZ = 1184;
// Dates stay 'YYYY-MM-DD' strings: a JS Date would shift them across time zones.
const keepText = (value: string) => value;
const toIso = (value: string) => new Date(value).toISOString();

/** Embedded Postgres (PGlite). `dataDir` undefined keeps it in memory, for tests. */
export async function openEmbedded(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const options = { parsers: { [PG_DATE]: keepText, [PG_TIMESTAMPTZ]: toIso } };
  const pg = dataDir ? await PGlite.create(dataDir, options) : await PGlite.create(options);
  const wrap = (q: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<unknown>;
  }): Queryable => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows as T[],
    exec: async (sql) => {
      await q.exec(sql);
    },
  });
  const db: Db = {
    ...wrap(pg as never),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx as never))),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}

/** A real Postgres server: Neon, Supabase, Docker, anything with a connection string. */
export async function openPostgres(databaseUrl: string): Promise<Db> {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(PG_DATE, keepText);
  pg.types.setTypeParser(PG_TIMESTAMPTZ, toIso);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const wrap = (q: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows as T[],
    exec: async (sql) => {
      await q.query(sql);
    },
  });
  const db: Db = {
    ...wrap(pool),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  await migrate(db);
  return db;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The embedded database is single-process: a second server on the same folder
 * would not fail, it would silently overwrite the first one's writes. So the
 * folder is claimed with a lock file, and a second process is refused.
 */
export function claimDataDir(dataDir: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  const lockPath = join(dataDir, 'bookiz.lock');
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const owner = Number(readFileSync(lockPath, 'utf8'));
    if (owner && owner !== process.pid && isRunning(owner)) {
      throw new BookizError(
        `Bookiz draait al op de datamap ${dataDir} (proces ${owner}).`,
        'De ingebouwde database kan maar door één proces tegelijk worden gebruikt. Sluit de andere assistent af, of gebruik ' +
          'DATABASE_URL of de HTTP-modus als je met meerdere assistenten tegelijk wilt werken. ' +
          `Draait er echt niets meer? Verwijder dan ${lockPath}.`,
      );
    }
    // The previous owner is gone without cleaning up.
    writeFileSync(lockPath, String(process.pid));
  }
  const release = () => {
    try {
      if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath);
    } catch {
      // Already gone.
    }
  };
  process.once('exit', release);
  return release;
}

export async function openDb(config: Config): Promise<Db> {
  if (config.databaseUrl) return openPostgres(config.databaseUrl);
  const release = claimDataDir(config.dataDir);
  const dir = join(config.dataDir, 'pgdata');
  mkdirSync(dir, { recursive: true });
  const db = await openEmbedded(dir);
  return {
    ...db,
    close: async () => {
      await db.close();
      release();
    },
  };
}

async function migrate(db: Db): Promise<void> {
  await db.exec(
    'create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set(
    (await db.query<{ version: number }>('select version from schema_migrations')).map((row) => row.version),
  );
  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (applied.has(version)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [version]);
    });
  }
}
