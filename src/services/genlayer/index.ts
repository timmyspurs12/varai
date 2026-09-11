/**
 * VARAI ↔ GenLayer integration.
 *
 * This module is the ONLY place that talks to the chain. It performs the two
 * writes that make up a judgment:
 *
 *    open_case(case_id, payload)   → records the case on-chain
 *    judge_case(case_id)           → validators execute the judging contract
 *
 * and then reads back the verdict that consensus produced.
 *
 * It never invents a decision, a confidence, a consensus count or a tx hash.
 * If anything fails, it throws and the case is marked FAILED.
 */
import { TransactionStatus } from 'genlayer-js/types';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { getGenLayerClient, explorerUrl } from './client.js';
import { extractConsensus, extractContractReturn, type ConsensusReport } from './consensus.js';
import type { ContractVerdictPayload, FootballCase } from '../../types/index.js';

export class GenLayerError extends Error {
  constructor(message: string, readonly stage: string, readonly txHash?: string) {
    super(message);
    this.name = 'GenLayerError';
  }
}

export interface GenLayerJudgment {
  payload: ContractVerdictPayload;
  consensus: ConsensusReport;
  txHash: string;
  contractAddress: string;
  explorer: string | null;
}

/** The exact JSON the Intelligent Contract will reason over. */
export function buildContractPayload(c: FootballCase) {
  return {
    caseId: c.id,
    competition: c.competition,
    homeTeam: c.homeTeam,
    awayTeam: c.awayTeam,
    minute: c.minute,
    incidentType: c.incidentType,
    description: c.description,
    refereeCall: c.refereeCall ?? 'not stated',
    // Evidence is passed as references. The contract is instructed not to
    // pretend it has opened them.
    evidence: c.evidence.map((e) => ({ kind: e.kind, value: e.value })),
  };
}

/** Client construction failures must surface as GenLayerError, not 500s. */
function safeClient(stage: string) {
  try {
    return getGenLayerClient();
  } catch (err) {
    throw new GenLayerError((err as Error).message, stage);
  }
}

async function waitFor(client: any, hash: string, stage: string) {
  try {
    return await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      retries: config.genlayer.waitRetries,
      interval: config.genlayer.waitIntervalMs,
    });
  } catch (err) {
    throw new GenLayerError(
      `Timed out waiting for ${stage} to finalize: ${(err as Error).message}`,
      stage,
      hash,
    );
  }
}

/** Step 1 — register the case on-chain. */
export async function openCaseOnChain(c: FootballCase): Promise<string> {
  const client = safeClient('open_case');
  const payload = JSON.stringify(buildContractPayload(c));

  logger.info({ caseId: c.id }, 'GenLayer: open_case');

  let hash: string;
  try {
    hash = await client.writeContract({
      address: config.genlayer.contractAddress as `0x${string}`,
      functionName: 'open_case',
      args: [c.id, payload],
      value: 0n,
    });
  } catch (err) {
    throw new GenLayerError(
      `Could not submit the case to GenLayer: ${(err as Error).message}`,
      'open_case',
    );
  }

  await waitFor(client, hash, 'open_case');
  return hash;
}

/**
 * Step 2 — the judgment itself.
 * This transaction is the consensus event: validators independently execute
 * the contract and vote on the result.
 */
export async function judgeCaseOnChain(caseId: string): Promise<GenLayerJudgment> {
  const client = safeClient('judge_case');

  logger.info({ caseId }, 'GenLayer: judge_case (validator execution)');

  let txHash: string;
  try {
    txHash = await client.writeContract({
      address: config.genlayer.contractAddress as `0x${string}`,
      functionName: 'judge_case',
      args: [caseId],
      value: 0n,
    });
  } catch (err) {
    throw new GenLayerError(
      `Could not start the judging transaction: ${(err as Error).message}`,
      'judge_case',
    );
  }

  const receipt: any = await waitFor(client, txHash, 'judge_case');

  // Did the contract actually succeed? Reaching FINALIZED is not enough.
  const execResult = receipt?.txExecutionResultName ?? receipt?.txExecutionResult;
  if (typeof execResult === 'string' && execResult.includes('ERROR')) {
    throw new GenLayerError(
      `Intelligent Contract execution failed on-chain (${execResult}).`,
      'judge_case',
      txHash,
    );
  }

  // Real validator votes.
  const consensus = extractConsensus(receipt);

  // Authoritative verdict: read committed contract state rather than trusting
  // a transient receipt field.
  const payload = await readVerdictFromContract(caseId, receipt);

  logger.info(
    { caseId, decision: payload.decision, agree: consensus.agree, total: consensus.total },
    'GenLayer: verdict reached',
  );

  return {
    payload,
    consensus,
    txHash,
    contractAddress: config.genlayer.contractAddress,
    explorer: explorerUrl(txHash),
  };
}

/** Reads get_verdict() and parses the contract's structured JSON. */
export async function readVerdictFromContract(
  caseId: string,
  receipt?: unknown,
): Promise<ContractVerdictPayload> {
  const client = getGenLayerClient();

  let raw: unknown;
  try {
    raw = await client.readContract({
      address: config.genlayer.contractAddress as `0x${string}`,
      functionName: 'get_verdict',
      args: [caseId],
    });
  } catch (err) {
    logger.warn({ caseId, err: (err as Error).message }, 'get_verdict read failed, trying receipt');
    raw = undefined;
  }

  if (!raw && receipt) raw = extractContractReturn(receipt);

  if (!raw) {
    throw new GenLayerError('Contract returned no verdict for this case.', 'read_verdict');
  }

  const parsed = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    throw new GenLayerError('Contract verdict was not valid JSON.', 'read_verdict');
  }

  const p = parsed as Record<string, unknown>;
  if (!p.decision) {
    throw new GenLayerError('Contract verdict is missing a decision.', 'read_verdict');
  }

  return {
    decision: String(p.decision).toUpperCase(),
    confidence: clamp(Number(p.confidence ?? 0)),
    reasoning: String(p.reasoning ?? ''),
    criteria: (p.criteria as ContractVerdictPayload['criteria']) ?? {},
    alternativeInterpretation: p.alternativeInterpretation
      ? String(p.alternativeInterpretation)
      : undefined,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export { explorerUrl };

/**
 * Prove at startup that the configured address is a live FootballCourt.
 *
 * A deploy can finalize and still leave nothing on chain, and a placeholder
 * address will pass every string check. The only trustworthy test is calling
 * the contract, so we read `get_case_count()` and report what came back.
 */
export async function verifyContractLive(): Promise<
  { ok: true; caseCount: number } | { ok: false; error: string }
> {
  try {
    const client = getGenLayerClient();
    const raw = await client.readContract({
      address: config.genlayer.contractAddress as `0x${string}`,
      functionName: 'get_case_count',
      args: [],
    });
    return { ok: true, caseCount: Number(raw ?? 0) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      return {
        ok: false,
        error:
          `No contract at ${config.genlayer.contractAddress} on ${config.genlayer.network}. ` +
          'A GenLayer deploy can finalize and still fail — re-run `npm run deploy:contract` ' +
          'and use the address it prints.',
      };
    }
    return { ok: false, error: message };
  }
}

export interface AppealPayload {
  outcome: 'UPHELD' | 'OVERTURNED';
  decision: string;
  originalDecision: string;
  confidence: number;
  reasoning: string;
  newEvidenceAssessment: 'material' | 'immaterial' | 'unverifiable';
  changedFromOriginal: boolean;
}

export interface GenLayerAppeal {
  payload: AppealPayload;
  consensus: ConsensusReport;
  txHash: string;
  contractAddress: string;
  explorer: string | null;
}

/**
 * Appeal a case that already has a verdict.
 *
 * The original verdict is never overwritten — the contract stores the appeal
 * separately so both rulings stay readable on-chain, each with its own
 * transaction. An appeal is a second consensus event, not a re-run.
 */
export async function appealCaseOnChain(
  caseId: string,
  newEvidence: string,
): Promise<GenLayerAppeal> {
  const client = safeClient('appeal_case');

  logger.info({ caseId }, 'GenLayer: appeal_case (appeal panel execution)');

  let txHash: string;
  try {
    txHash = await client.writeContract({
      address: config.genlayer.contractAddress as `0x${string}`,
      functionName: 'appeal_case',
      args: [caseId, newEvidence],
      value: 0n,
    });
  } catch (err) {
    throw new GenLayerError(
      `Could not start the appeal transaction: ${(err as Error).message}`,
      'appeal_case',
    );
  }

  const receipt: any = await waitFor(client, txHash, 'appeal_case');

  const execResult = receipt?.txExecutionResultName ?? receipt?.txExecutionResult;
  if (typeof execResult === 'string' && execResult.includes('ERROR')) {
    throw new GenLayerError(
      `Appeal execution failed on-chain (${execResult}).`,
      'appeal_case',
      txHash,
    );
  }

  const consensus = extractConsensus(receipt);

  // Read committed state rather than trusting the receipt.
  const raw = await client.readContract({
    address: config.genlayer.contractAddress as `0x${string}`,
    functionName: 'get_appeal',
    args: [caseId],
  });

  let payload: AppealPayload;
  try {
    payload = JSON.parse(String(raw)) as AppealPayload;
  } catch {
    throw new GenLayerError('Appeal result could not be parsed.', 'read_appeal', txHash);
  }
  if (!payload?.outcome || !payload?.decision) {
    throw new GenLayerError('Appeal result is missing an outcome.', 'read_appeal', txHash);
  }

  logger.info(
    { caseId, outcome: payload.outcome, decision: payload.decision, agree: consensus.agree },
    'GenLayer: appeal decided',
  );

  return {
    payload,
    consensus,
    txHash,
    contractAddress: config.genlayer.contractAddress,
    explorer: explorerUrl(txHash),
  };
}
