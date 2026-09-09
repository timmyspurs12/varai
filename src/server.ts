import { createApp } from './app.js';
import { assertRunnable, config, genlayerConfigured } from './config/index.js';
import { logger } from './lib/logger.js';
import { store } from './models/store.js';
import { verifyContractLive } from './services/genlayer/index.js';

async function main() {
  assertRunnable();
  await store.init();

  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'VARAI API listening');
    if (config.demoMode) {
      logger.warn({}, '════════════════════════════════════════════════════');
      logger.warn({}, ' DEMO MODE ACTIVE — verdicts are NOT from GenLayer  ');
      logger.warn({}, '════════════════════════════════════════════════════');
    } else {
      // Don't claim judging is enabled until the contract actually answers.
      logger.info(
        { network: config.genlayer.network, contract: config.genlayer.contractAddress },
        'GenLayer configured — verifying contract…',
      );
      void verifyContractLive().then((result) => {
        if (result.ok) {
          logger.info(
            {
              network: config.genlayer.network,
              contract: config.genlayer.contractAddress,
              casesOnChain: result.caseCount,
            },
            'GenLayer judging enabled — contract verified live',
          );
        } else {
          logger.error({ err: result.error }, 'GenLayer contract is NOT reachable');
          console.error(`\nGenLayer contract unreachable: ${result.error}\n`);
        }
      });
    }
    if (!config.demoMode && !genlayerConfigured()) {
      logger.error({}, 'GenLayer is not configured — submissions will fail');
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Flatten anything throwable into a readable string.
 *
 * AggregateError.message is an EMPTY STRING — Node throws one when every
 * address a hostname resolves to fails (e.g. both IPv6 and IPv4), so logging
 * `err.message` alone produces the useless `"err":""`. The real causes live in
 * `.errors`. Postgres errors also carry `code` and `detail` worth surfacing.
 */
function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map(describeError).filter(Boolean);
    const unique = [...new Set(inner)];
    return `all connection attempts failed: ${unique.join(' | ')}`;
  }
  if (err instanceof Error) {
    const e = err as Error & { code?: string; detail?: string };
    const bits = [e.message || e.constructor.name];
    if (e.code) bits.push(`(code ${e.code})`);
    if (e.detail) bits.push(`- ${e.detail}`);
    return bits.join(' ');
  }
  return typeof err === 'string' ? err : JSON.stringify(err);
}

/** Turn the most common startup failures into an instruction, not a stack trace. */
function startupHint(err: unknown): string | undefined {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? '';
  const text = describeError(err);

  if (code === 'ENOTFOUND' || /ENOTFOUND/.test(text))
    return 'The database hostname does not resolve. Check DATABASE_URL for a typo or a truncated host.';
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(text))
    return 'Nothing is listening at that host/port. Check the port, and that the database is running.';
  if (code === 'ETIMEDOUT' || /ETIMEDOUT|timeout/i.test(text))
    return 'The database did not respond in time. Check the region/firewall, and that the host is reachable.';
  if (code === '28P01' || /password authentication failed/i.test(text))
    return 'Wrong credentials. Copy a fresh connection string from your database dashboard (Neon: Connection string, pooled).';
  if (code === '3D000' || /database .* does not exist/i.test(text))
    return 'That database name does not exist. Check the path at the end of DATABASE_URL.';
  if (code === '42P01' || /relation .* does not exist/i.test(text))
    return 'Tables are missing. Load db/schema.sql into the database (see NEON-SETUP.md Step 4).';
  if (/self.signed|certificate/i.test(text))
    return 'TLS rejected the certificate. Set DATABASE_SSL=true and keep ?sslmode=require in the URL.';
  return undefined;
}

main().catch((err) => {
  const detail = describeError(err);
  const hint = startupHint(err);
  logger.error({ err: detail, ...(hint ? { hint } : {}) }, 'failed to start');
  // Render/Docker surface plain stderr more reliably than structured logs.
  console.error(`\nVARAI failed to start: ${detail}`);
  if (hint) console.error(`Hint: ${hint}`);
  console.error('');
  process.exit(1);
});
