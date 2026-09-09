/**
 * Extracting REAL consensus from a GenLayer transaction.
 *
 * Everything in this file reads what the protocol actually reported. If a field
 * is missing we report zero or unknown — we never synthesise validator votes,
 * because a fabricated consensus number would make the whole product a lie.
 */
import type { ValidatorResult } from '../../types/index.js';

export interface ConsensusReport {
  agree: number;
  disagree: number;
  total: number;
  ratio: number;
  validators: Omit<ValidatorResult, 'id' | 'verdictId'>[];
}

const AGREEING = new Set(['AGREE']);
const DISAGREEING = new Set(['DISAGREE', 'TIMEOUT', 'DETERMINISTIC_VIOLATION']);

/**
 * Pulls per-validator votes out of a transaction.
 *
 * Two shapes are supported because they vary by network/SDK version:
 *   1. `lastRound.validatorVotesName` + `roundValidators`  (current protocol)
 *   2. `consensus_data.votes` / `consensus_data.validators` (studio/simulator)
 */
export function extractConsensus(tx: any): ConsensusReport {
  const validators: Omit<ValidatorResult, 'id' | 'verdictId'>[] = [];

  const leaderAddress: string | null =
    (tx?.lastLeader as string | undefined) ?? null;

  // ---- shape 1: protocol round data -------------------------------------
  const round = tx?.lastRound;
  if (round && Array.isArray(round.validatorVotesName) && round.validatorVotesName.length > 0) {
    const addrs: string[] = Array.isArray(round.roundValidators) ? round.roundValidators : [];
    round.validatorVotesName.forEach((vote: string, i: number) => {
      const address = addrs[i] ?? null;
      validators.push({
        validatorIndex: i,
        address,
        vote: String(vote ?? 'NOT_VOTED'),
        isLeader:
          Boolean(address && leaderAddress && address.toLowerCase() === leaderAddress.toLowerCase()) ||
          (leaderAddress === null && String(round.leaderIndex ?? '') === String(i)),
      });
    });
  }

  // ---- shape 2: studio consensus_data ------------------------------------
  if (validators.length === 0) {
    const cd = tx?.consensus_data;
    const votes = cd?.votes;
    if (votes && typeof votes === 'object') {
      Object.entries(votes as Record<string, string>).forEach(([address, vote], i) => {
        validators.push({
          validatorIndex: i,
          address,
          vote: String(vote ?? 'NOT_VOTED').toUpperCase(),
          isLeader: Boolean(leaderAddress && address.toLowerCase() === leaderAddress.toLowerCase()),
        });
      });
    }
  }

  // The leader's own receipt carries a vote too; include it if it is not
  // already represented and we have nothing else.
  if (validators.length === 0) {
    const receipts = tx?.consensus_data?.leader_receipt;
    if (Array.isArray(receipts) && receipts.length > 0 && receipts[0]?.vote) {
      validators.push({
        validatorIndex: 0,
        address: leaderAddress,
        vote: String(receipts[0].vote).toUpperCase(),
        isLeader: true,
      });
    }
  }

  const agree = validators.filter((v) => AGREEING.has(v.vote.toUpperCase())).length;
  const disagree = validators.filter((v) => DISAGREEING.has(v.vote.toUpperCase())).length;
  const total = validators.length;

  return {
    agree,
    disagree,
    total,
    ratio: total > 0 ? Number((agree / total).toFixed(4)) : 0,
    validators,
  };
}

/**
 * The contract's return value. GenLayer decodes calldata for us, but the shape
 * differs slightly between networks, so we probe the known locations.
 */
export function extractContractReturn(tx: any): unknown {
  const candidates = [
    tx?.txExecutionResult?.result,
    tx?.consensus_data?.leader_receipt?.[0]?.result,
    tx?.result,
    tx?.data?.result,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return c;
  }
  return undefined;
}
