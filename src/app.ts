import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { router } from './routes/index.js';
import { ApiError } from './utils/errors.js';
import { cspDirectives } from './lib/csp.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  // Resolve the static directory first: the CSP hashes the inline <script>
  // blocks in those files, so it has to be known before helmet is mounted.
  // Works from src/ (dev, via tsx) and dist/src/ (built) alike.
  const here = dirname(fileURLToPath(import.meta.url));
  let publicDir: string | null = null;
  for (const candidate of ['../public', '../../public']) {
    const dir = join(here, candidate);
    if (existsSync(dir)) {
      publicDir = dir;
      break;
    }
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives(publicDir ?? '', config.security.corsOrigin),
      },
      // The API is meant to be callable from a separately hosted frontend.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cors({ origin: config.security.corsOrigin }));

  // Reject oversized payloads outright.
  app.use(express.json({ limit: '256kb' }));

  app.use(
    rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    }),
  );

  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'request');
    next();
  });

  app.use('/api', router);

  // Minimal live console for exercising the workflow end-to-end.
  if (publicDir) app.use(express.static(publicDir));

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Central error handler — malformed JSON, validation, GenLayer failures.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        ok: false,
        error: { code: err.code, message: err.message, details: err.details ?? null },
      });
    }
    if (err instanceof SyntaxError && 'body' in (err as never)) {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' } });
    }
    logger.error({ err: (err as Error)?.message, stack: (err as Error)?.stack }, 'unhandled error');
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
    });
  });

  return app;
}
