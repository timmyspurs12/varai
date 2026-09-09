/**
 * The VARAI workflow.
 *
 *   SUBMIT → CASE CREATED → SENT TO GENLAYER → CONTRACT EVALUATES
 *          → VALIDATORS REACH CONSENSUS → VERDICT STORED → RETURNED
 *
 * The backend orchestrates. It does not judge.
 */
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { store, type NewVerdict } from '../models/store.js';
import { DECISIONS_BY_INCIDENT, type FootballCase, type Verdict } from '../types/index.js';
import { buildDemoVerdict } from './genlayer/demo.js';
import { GenLayerError, judgeCaseOnChain, openCaseOnChain, explorerUrl } from './genlayer/index.js';

/** Cases currently being judged, so a double-submit cannot run twice. */
const inFlight = new Set<string>();

export function isInFlight(caseId: string): boolean {
  return inFlight.has(caseId);
}

/**
 * Guardrail: the contract must not return a decision outside the incident's
 * vocabulary. If it does, that is a failure — not something to paper over.
 */
function assertDecisionValid(caseRecord: FootballCase, decision: string) {
  const allowed = [...DECISIONS_BY_INCIDENT[caseRecord.incidentType], 'INSUFFICIENT_EVIDENCE'];
  if (!allowed.includes(decision as never)) {
    throw new GenLayerError(
      `Contract returned "${decision}", which is not valid for ${caseRecord.incidentType}. Expected one of: ${allowed.join(', ')}.`,
      'validate_decision',
    );
  }
}

/**
 * Runs the full judgment. Throws on failure — the caller marks the case FAILED.
 * Never produces a verdict when GenLayer errors.
 */
export async function runJudgment(caseRecord: FootballCase): Promise<Verdict> {
  const caseId = caseRecord.id;

  if (inFlight.has(caseId)) {
    throw new Error('This case is already being judged.');
  }
  inFlight.add(caseId);

  try {
    /* ---------------- DEMO MODE ---------------- */
    if (config.demoMode) {
      logger.warn({ caseId }, 'DEMO MODE — generating placeholder verdict, no GenLayer execution');
      await store.setStatus(caseId, 'JUDGING');

      const payload = buildDemoVerdict(caseRecord);
      assertDecisionValid(caseRecord, payload.decision);

      const record: NewVerdict = {
        caseId,
        decision: payload.decision,
        confidence: payload.confidence,
        // No votes were cast. Reporting anything else would be a fabrication.
        consensus: { agree: 0, disagree: 0, total: 0, ratio: 0 },
        reasoning: payload.reasoning,
        criteria: (payload.criteria ?? {}) as Record<string, string>,
        alternativeInterpretation: payload.alternativeInterpretation ?? '',
        genlayerTransaction: null,
        genlayerContract: null,
        source: 'DEMO',
        validators: [],
      };
      const verdict = await store.saveVerdict(record);
      await store.setStatus(caseId, 'VERDICT_READY');
      return verdict;
    }

    /* ---------------- REAL GENLAYER ---------------- */
    // 1. Register the case on-chain.
    await store.setStatus(caseId, 'UNDER_REVIEW');
    const openTx = await openCaseOnChain(caseRecord);
    await store.setStatus(caseId, 'UNDER_REVIEW', { txHash: openTx });

    // 2. Validators execute the contract and vote.
    await store.setStatus(caseId, 'JUDGING');
    const judgment = await judgeCaseOnChain(caseId);

    assertDecisionValid(caseRecord, judgment.payload.decision);

    // 3. Persist exactly what consensus produced.
    const record: NewVerdict = {
      caseId,
      decision: judgment.payload.decision,
      confidence: judgment.payload.confidence,
      consensus: {
        agree: judgment.consensus.agree,
        disagree: judgment.consensus.disagree,
        total: judgment.consensus.total,
        ratio: judgment.consensus.ratio,
      },
      reasoning: judgment.payload.reasoning,
      criteria: (judgment.payload.criteria ?? {}) as Record<string, string>,
      alternativeInterpretation: judgment.payload.alternativeInterpretation ?? '',
      genlayerTransaction: judgment.txHash,
      genlayerContract: judgment.contractAddress,
      source: 'GENLAYER',
      validators: judgment.consensus.validators,
    };

    const verdict = await store.saveVerdict(record);
    await store.setStatus(caseId, 'VERDICT_READY', { txHash: judgment.txHash });
    return verdict;
  } finally {
    inFlight.delete(caseId);
  }
}

/** Adds the presentation flags the frontend needs to label the verdict. */
export function decorateVerdict(v: Verdict) {
  const isReal = v.source === 'GENLAYER';
  return {
    ...v,
    demo: !isReal,
    label: isReal ? 'GenLayer Decision' : 'DEMO VERDICT — NOT JUDGED BY GENLAYER',
    explorerUrl: v.genlayerTransaction ? explorerUrl(v.genlayerTransaction) : null,
    consensusPercent: Math.round(v.consensus.ratio * 100),
  };
}
