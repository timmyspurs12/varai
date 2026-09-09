/**
 * Check a DATABASE_URL without starting the whole app.
 *
 *   DATABASE_URL="postgresql://..." DATABASE_SSL=true npx tsx scripts/check-db.ts
 *
 * Tells you, in order: is the URL parseable, can we connect, do the tables
 * exist. Use it to debug a deploy failure locally instead of by redeploying.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
const ssl = /^(1|true|yes)$/i.test(process.env.DATABASE_SSL ?? '');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL = '\x1b[33m';
const OFF = '\x1b[0m';
const ok = (m: string) => console.log(`${GREEN}  ok${OFF}  ${m}`);
const bad = (m: string) => console.log(`${RED}fail${OFF}  ${m}`);
const warn = (m: string) => console.log(`${YEL}warn${OFF}  ${m}`);

function describe(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = [...new Set(err.errors.map(describe))];
    return `all connection attempts failed: ${inner.join(' | ')}`;
  }
  if (err instanceof Error) {
    const e = err as Error & { code?: string };
    return e.message ? `${e.message}${e.code ? ` (code ${e.code})` : ''}` : `${e.constructor.name} (code ${e.code ?? '?'})`;
  }
  return String(err);
}

async function main() {
  console.log('\nVARAI — database check\n');

  if (!url) {
    bad('DATABASE_URL is not set.');
    console.log('\n      The app will run, but on the in-memory store: every case is');
    console.log('      lost on restart. See NEON-SETUP.md.\n');
    process.exit(1);
  }

  // 1. parse
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    bad('DATABASE_URL is not a valid URL.');
    console.log('\n      Check for stray quotes or a truncated paste.\n');
    process.exit(1);
  }
  ok(`host ${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`);
  ok(`database ${parsed.pathname.replace('/', '') || '(none!)'}`);
  ok(`user ${parsed.username || '(none!)'}`);

  if (!parsed.password) warn('no password in the URL — is it complete?');
  if (parsed.hostname.endsWith('neon.tech')) {
    if (!parsed.searchParams.get('sslmode')) warn('Neon URLs normally end in ?sslmode=require');
    if (!ssl) warn('DATABASE_SSL is not true — Neon requires TLS');
    if (!parsed.hostname.includes('-pooler')) warn('not the pooled host; the pooled one suits a web API better');
  }

  // 2. connect
  const pool = new pg.Pool({
    connectionString: url,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    connectionTimeoutMillis: 15_000,
  });

  try {
    const { rows } = await pool.query('SELECT version()');
    ok(`connected — ${String(rows[0].version).split(',')[0]}`);
  } catch (err) {
    bad(describe(err));
    console.log('\n      Could not connect. Copy a fresh connection string from your');
    console.log('      database dashboard and try again.\n');
    await pool.end().catch(() => {});
    process.exit(1);
  }

  // 3. tables
  const want = ['cases', 'evidence', 'validator_results', 'verdicts'];
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name`,
    [want],
  );
  const found = rows.map((r) => r.table_name);
  const missing = want.filter((t) => !found.includes(t));

  if (missing.length) {
    bad(`missing tables: ${missing.join(', ')}`);
    console.log('\n      Load the schema into this database:');
    console.log('        psql "$DATABASE_URL" -f db/schema.sql');
    console.log('      or paste db/schema.sql into the Neon SQL Editor.');
    console.log('      See NEON-SETUP.md Step 4.\n');
    await pool.end().catch(() => {});
    process.exit(1);
  }
  ok(`all 4 tables present (${found.join(', ')})`);

  const { rows: counts } = await pool.query(
    'SELECT (SELECT count(*) FROM cases)::int AS cases, (SELECT count(*) FROM verdicts)::int AS verdicts',
  );
  ok(`${counts[0].cases} case(s), ${counts[0].verdicts} verdict(s) stored`);

  console.log(`\n${GREEN}Database is ready.${OFF}\n`);
  await pool.end().catch(() => {});
}

main().catch((err) => {
  bad(describe(err));
  process.exit(1);
});
