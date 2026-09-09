/** Tiny structured logger — no dependency, JSON in production. */
type Level = 'debug' | 'info' | 'warn' | 'error';

const isProd = process.env.NODE_ENV === 'production';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * LOG_LEVEL controls verbosity. Production defaults to `info` so per-request
 * debug lines do not bury real errors (and do not burn a free tier's log
 * quota). Set LOG_LEVEL=debug to see every request again.
 */
function resolveLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return isProd ? 'info' : 'debug';
}

const MIN = ORDER[resolveLevel()];

function emit(level: Level, ctx: unknown, msg?: string) {
  if (ORDER[level] < MIN) return;
  const [context, message] = typeof ctx === 'string' ? [{}, ctx] : [ctx, msg ?? ''];
  if (isProd) {
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...(context as object) }),
    );
    return;
  }
  const tag = { debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' }[level];
  const extra = context && Object.keys(context as object).length ? ` ${JSON.stringify(context)}` : '';
  console[level === 'debug' ? 'log' : level](`[${tag}] ${message}${extra}`);
}

export const logger = {
  debug: (ctx: unknown, msg?: string) => emit('debug', ctx, msg),
  info: (ctx: unknown, msg?: string) => emit('info', ctx, msg),
  warn: (ctx: unknown, msg?: string) => emit('warn', ctx, msg),
  error: (ctx: unknown, msg?: string) => emit('error', ctx, msg),
};
