/**
 * Apply versioned PostgreSQL migrations before the production app starts.
 *
 *   npm run db:migrate
 *
 * Migrations are serialized with a transaction-scoped PostgreSQL advisory
 * lock and recorded in public.schema_migrations. With no DATABASE_URL, local
 * demo/dev mode keeps using the in-memory store and this command is a no-op.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const migrations = [
  {
    version: '20261019_appeal_of',
    file: '20261019_appeal_of.sql',
    description: 'add appeal_of and appeal verdict constraints',
  },
] as const;

// A dedicated two-part advisory-lock key; all application instances share it.
const lockKey = [0x56415241, 1] as const;
const url = process.env.DATABASE_URL;
const ssl = /^(1|true|yes|on)$/i.test(process.env.DATABASE_SSL ?? '');

function stripSslMode(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const typed = err as Error & { code?: string };
    // Avoid printing a connection string if a driver error happens to include it.
    const message = typed.message.replace(/(?:postgres|postgresql):\/\/[^\s'\"]+/gi, '[DATABASE_URL]');
    return `${message || typed.constructor.name}${typed.code ? ` (code ${typed.code})` : ''}`;
  }
  return String(err);
}

async function migrate() {
  if (!url) {
    console.log('DATABASE_URL not set — skipping PostgreSQL migrations (in-memory mode).');
    return;
  }

  const pool = new pg.Pool({
    connectionString: stripSslMode(url),
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  let client: pg.PoolClient | undefined;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    // Transaction-level locks work with Neon/PgBouncer transaction pooling too.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [...lockKey]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const outcomes: string[] = [];
    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT 1 FROM public.schema_migrations WHERE version = $1',
        [migration.version],
      );
      if (rows.length > 0) {
        outcomes.push(`Already applied ${migration.version} (${migration.description}).`);
        continue;
      }

      const sql = await readFile(
        resolve(process.cwd(), 'db', 'migrations', migration.file),
        'utf8',
      );
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [
        migration.version,
      ]);
      outcomes.push(`Applied ${migration.version} (${migration.description}).`);
    }

    const { rows: check } = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'verdicts'
          AND column_name = 'appeal_of'
      ) AS present
    `);
    if (!check[0]?.present) {
      throw new Error('migration completed without creating public.verdicts.appeal_of');
    }

    await client.query('COMMIT');
    transactionOpen = false;
    for (const outcome of outcomes) console.log(outcome);
    console.log('Database migrations are up to date.');
  } catch (err) {
    if (client && transactionOpen) {
      await client.query('ROLLBACK').catch(() => undefined);
      transactionOpen = false;
    }
    throw err;
  } finally {
    client?.release();
    await pool.end();
  }
}

migrate().catch((err: unknown) => {
  console.error(`Database migration failed: ${describeError(err)}`);
  process.exitCode = 1;
});
