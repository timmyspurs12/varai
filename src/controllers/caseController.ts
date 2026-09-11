import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { store } from '../models/store.js';
import { CASE_STATUS } from '../types/index.js';
import { createCaseSchema, idSchema, listQuerySchema } from '../utils/validation.js';
import { ApiError } from '../utils/errors.js';
import { decorateVerdict, isInFlight, runJudgment } from '../services/caseService.js';
import { GenLayerError, appealCaseOnChain } from '../services/genlayer/index.js';
import { DEMO_WARNING } from '../services/genlayer/demo.js';

/** POST /api/cases — create a case (does NOT judge it). */
export async function createCase(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid case payload', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const created = await store.createCase(parsed.data);
    logger.info({ caseId: created.id, incident: created.incidentType }, 'case created');
    res.status(201).json({ ok: true, case: created });
  } catch (err) {
    next(err);
  }
}

/** GET /api/cases */
export async function listCases(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters');

    const { status, limit, offset } = parsed.data;
    if (status && !CASE_STATUS.includes(status as never)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Unknown status "${status}"`);
    }
    const cases = await store.listCases({ status, limit, offset });
    res.json({ ok: true, count: cases.length, limit, offset, cases });
  } catch (err) {
    next(err);
  }
}

/** GET /api/cases/:id */
export async function getCase(req: Request, res: Response, next: NextFunction) {
  try {
    const id = requireId(req.params.id);
    const found = await store.getCase(id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Case not found');

    const verdict = await store.getVerdictByCase(id);
    res.json({
      ok: true,
      case: found,
      verdict: verdict ? decorateVerdict(verdict) : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/cases/:id/submit
 * Sends the case to GenLayer and waits for the verdict.
 */
export async function submitCase(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id;
  try {
    const caseId = requireId(id);
    const found = await store.getCase(caseId);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Case not found');

    if (isInFlight(caseId)) {
      throw new ApiError(409, 'ALREADY_JUDGING', 'This case is already being judged.');
    }

    const existing = await store.getVerdictByCase(caseId);
    if (existing) {
      return res.status(200).json({
        ok: true,
        alreadyJudged: true,
        case: await store.getCase(caseId),
        verdict: decorateVerdict(existing),
      });
    }

    await store.setStatus(caseId, 'SUBMITTED');

    /*
     * Judging runs live LLM inference across validators and can take longer
     * than a proxy will hold a request open (free hosts cut at ~30-60s).
     *
     *   ?async=true  → 202 immediately; poll GET /api/cases/:id/status
     *   default      → wait for the verdict (fine locally / in demo mode)
     */
    const wantsAsync =
      req.query.async === 'true' || req.query.async === '1' || req.get('x-varai-async') === 'true';

    if (wantsAsync) {
      // Kick off in the background. Failures are recorded on the case itself.
      void runJudgment(found)
        .then((v) => logger.info({ caseId, decision: v.decision }, 'async judgment complete'))
        .catch(async (err) => {
          const reason =
            err instanceof GenLayerError ? `${err.stage}: ${err.message}` : `unexpected: ${err?.message}`;
          logger.error({ caseId, err: reason }, 'async judgment failed');
          try {
            await store.setStatus(caseId, 'FAILED', { failureReason: String(reason).slice(0, 500) });
          } catch {
            /* ignore */
          }
        });

      return res.status(202).json({
        ok: true,
        accepted: true,
        caseId,
        status: 'SUBMITTED',
        poll: `/api/cases/${caseId}/status`,
        message: 'Case sent for judgment. Poll the status endpoint until VERDICT_READY or FAILED.',
        ...(config.demoMode ? { demo: true, warning: DEMO_WARNING } : {}),
      });
    }

    const verdict = await runJudgment(found);

    res.status(201).json({
      ok: true,
      case: await store.getCase(caseId),
      verdict: decorateVerdict(verdict),
      ...(config.demoMode ? { demo: true, warning: DEMO_WARNING } : {}),
    });
  } catch (err) {
    if (err instanceof ApiError) return next(err);

    // Any failure during judging marks the case FAILED. No fake verdict is
    // ever created to paper over an error.
    if (err instanceof GenLayerError) {
      logger.error({ caseId: id, stage: err.stage, err: err.message }, 'GenLayer execution failed');
      try {
        await store.setStatus(String(id), 'FAILED', {
          failureReason: `${err.stage}: ${err.message}`,
          txHash: err.txHash,
        });
      } catch {
        /* ignore secondary failure */
      }
      return next(
        new ApiError(502, 'GENLAYER_EXECUTION_FAILED', err.message, {
          stage: err.stage,
          transaction: err.txHash ?? null,
          note: 'No verdict was produced. VARAI does not generate a decision when GenLayer fails.',
        }),
      );
    }
    // Unexpected failure — still record it against the case.
    logger.error({ caseId: id, err: (err as Error).message }, 'judgment failed unexpectedly');
    try {
      await store.setStatus(String(id), 'FAILED', {
        failureReason: `unexpected: ${(err as Error).message}`.slice(0, 500),
      });
    } catch {
      /* ignore secondary failure */
    }
    next(
      new ApiError(502, 'JUDGMENT_FAILED', 'The judgment could not be completed.', {
        reason: (err as Error).message,
        note: 'No verdict was produced. VARAI does not generate a decision when judging fails.',
      }),
    );
  }
}

/** GET /api/cases/:id/status — lightweight polling endpoint. */
export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const id = requireId(req.params.id);
    const found = await store.getCase(id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Case not found');

    const verdict = await store.getVerdictByCase(id);
    res.json({
      ok: true,
      caseId: found.id,
      status: found.status,
      judging: isInFlight(id),
      hasVerdict: Boolean(verdict),
      verdictId: verdict?.id ?? null,
      genlayerTransaction: found.genlayerTxHash,
      failureReason: found.failureReason,
      mode: config.demoMode ? 'DEMO' : 'GENLAYER',
      // Included once ready so a polling client needs only this one endpoint.
      verdict: verdict ? decorateVerdict(verdict) : null,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/verdicts/:id */
export async function getVerdict(req: Request, res: Response, next: NextFunction) {
  try {
    const id = requireId(req.params.id);
    // Accept either a verdict id or a case id, whichever the client has.
    const verdict = (await store.getVerdict(id)) ?? (await store.getVerdictByCase(id));
    if (!verdict) throw new ApiError(404, 'NOT_FOUND', 'Verdict not found');
    res.json({ ok: true, verdict: decorateVerdict(verdict) });
  } catch (err) {
    next(err);
  }
}

function requireId(raw: unknown): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid id format');
  return parsed.data;
}


/**
 * POST /api/cases/:id/appeal
 *
 * A second, independent GenLayer review of a case that already has a verdict.
 * The original verdict is preserved — the contract stores the appeal in its own
 * map, so both rulings stay on-chain with separate transaction hashes.
 *
 * Appeals are unavailable in demo mode: an appeal without real validator
 * consensus would be theatre, and VARAI never dresses demo data as a judgment.
 */
export async function appealCase(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id;
  try {
    const caseId = requireId(id);

    const found = await store.getCase(caseId);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Case not found');

    if (config.demoMode) {
      throw new ApiError(
        409,
        'DEMO_MODE',
        'Appeals require a real GenLayer contract. ' + DEMO_WARNING,
      );
    }

    const original = await store.getVerdictByCase(caseId);
    if (!original) {
      throw new ApiError(409, 'NOT_JUDGED', 'This case has no verdict to appeal yet.');
    }
    // Guard against a second appeal. getVerdictByCase() returns the ORIGINAL
    // verdict, so checking its own appealOf never fires — we have to look for
    // an existing appeal row. The contract also rejects this, but failing here
    // saves a pointless transaction and a 60s wait.
    const priorAppeal = await store.getAppealByCase(caseId);
    if (priorAppeal) {
      throw new ApiError(409, 'ALREADY_APPEALED', 'This case has already been appealed once.', {
        appealVerdictId: priorAppeal.id,
      });
    }

    const grounds = typeof req.body?.newEvidence === 'string' ? req.body.newEvidence.trim() : '';
    if (grounds.length < 20) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'An appeal must supply new evidence of at least 20 characters.',
      );
    }
    if (grounds.length > 4000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Appeal grounds must be under 4000 characters.');
    }

    if (isInFlight(caseId)) {
      throw new ApiError(409, 'ALREADY_JUDGING', 'This case is already being judged.');
    }

    logger.info({ caseId }, 'appeal requested');

    let result;
    try {
      result = await appealCaseOnChain(caseId, grounds);
    } catch (err) {
      if (err instanceof GenLayerError) {
        await store.setStatus(caseId, 'FAILED', { failureReason: err.message });
        throw new ApiError(502, 'APPEAL_FAILED', err.message, {
          stage: err.stage,
          transaction: err.txHash ?? null,
          note: 'No appeal ruling was produced. VARAI does not invent one when GenLayer fails.',
        });
      }
      throw err;
    }

    const { payload, consensus, txHash, explorer } = result;

    // Stored as a verdict row linked back to the original by appealOf, so the
    // existing verdict pipeline, decoration and integrity checks all apply.
    const saved = await store.saveVerdict({
      caseId,
      decision: payload.decision,
      confidence: payload.confidence,
      consensus,
      reasoning: payload.reasoning,
      criteria: {
        outcome: payload.outcome,
        originalDecision: payload.originalDecision,
        newEvidenceAssessment: payload.newEvidenceAssessment,
      },
      alternativeInterpretation: '',
      validators: consensus.validators,
      genlayerTransaction: txHash,
      genlayerContract: config.genlayer.contractAddress,
      source: 'GENLAYER',
      appealOf: original.id,
    });

    logger.info(
      { caseId, outcome: payload.outcome, decision: payload.decision },
      'appeal decided',
    );

    res.status(201).json({
      ok: true,
      outcome: payload.outcome,
      changed: payload.changedFromOriginal,
      originalVerdict: decorateVerdict(original),
      appealVerdict: decorateVerdict(saved),
      newEvidenceAssessment: payload.newEvidenceAssessment,
    });
  } catch (err) {
    next(err);
  }
}
