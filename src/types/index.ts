/**
 * VARAI — shared domain types.
 */

export const CASE_STATUS = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'JUDGING',
  'VERDICT_READY',
  'FAILED',
] as const;
export type CaseStatus = (typeof CASE_STATUS)[number];

export const INCIDENT_TYPES = [
  'PENALTY_CLAIM',
  'FOUL_CLAIM',
  'CARD_DECISION',
  'HANDBALL_CLAIM',
  'GOAL_CLAIM',
  'OFFSIDE_CLAIM',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const DECISIONS = [
  'PENALTY',
  'NO_PENALTY',
  'FOUL',
  'NO_FOUL',
  'RED_CARD',
  'YELLOW_CARD',
  'NO_CARD',
  'HANDBALL',
  'NO_HANDBALL',
  'GOAL',
  'NO_GOAL',
  'OFFSIDE',
  'ONSIDE',
  'INSUFFICIENT_EVIDENCE',
] as const;
export type Decision = (typeof DECISIONS)[number];

/** Which decisions the contract may return for a given incident type. */
export const DECISIONS_BY_INCIDENT: Record<IncidentType, Decision[]> = {
  PENALTY_CLAIM: ['PENALTY', 'NO_PENALTY'],
  FOUL_CLAIM: ['FOUL', 'NO_FOUL'],
  CARD_DECISION: ['RED_CARD', 'YELLOW_CARD', 'NO_CARD'],
  HANDBALL_CLAIM: ['HANDBALL', 'NO_HANDBALL'],
  GOAL_CLAIM: ['GOAL', 'NO_GOAL'],
  OFFSIDE_CLAIM: ['OFFSIDE', 'ONSIDE'],
};

export const EVIDENCE_KINDS = ['IMAGE_URL', 'VIDEO_URL', 'TEXT', 'OFFICIAL_MATCH_INFO'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface Evidence {
  id: string;
  caseId: string;
  kind: EvidenceKind;
  value: string;
  /**
   * Always false unless a GenLayer execution actually fetched and verified the
   * reference. The backend never sets this to true on its own.
   */
  verifiedByGenlayer: boolean;
  createdAt: string;
}

export interface FootballCase {
  id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  minute: number;
  incidentType: IncidentType;
  description: string;
  refereeCall: string | null;
  status: CaseStatus;
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
  /** Populated once the case has been sent to the contract. */
  genlayerTxHash: string | null;
  failureReason: string | null;
}

export interface ValidatorResult {
  id: string;
  verdictId: string;
  /** Index within the round as reported by GenLayer. */
  validatorIndex: number;
  address: string | null;
  /** Real vote from the protocol: AGREE | DISAGREE | TIMEOUT | ... */
  vote: string;
  isLeader: boolean;
}

export interface VerdictCriteria {
  location: string;
  playerContact: string;
  ballContact: string;
  challengeIntensity: string;
  natureOfChallenge: string;
  evidenceSufficiency: string;
}

/**
 * Where a verdict came from. This is surfaced to the frontend so a demo
 * verdict can never be mistaken for a real GenLayer judgment.
 */
export type VerdictSource = 'GENLAYER' | 'DEMO';

export interface Verdict {
  id: string;
  caseId: string;
  decision: Decision;
  confidence: number;
  /** Real validator agreement counts. */
  consensus: { agree: number; disagree: number; total: number; ratio: number };
  reasoning: string;
  criteria: VerdictCriteria;
  alternativeInterpretation: string;
  validatorResults: ValidatorResult[];
  /** Null for demo verdicts — never fabricated. */
  genlayerTransaction: string | null;
  genlayerContract: string | null;
  source: VerdictSource;
  /**
   * When set, this verdict is an APPEAL ruling and the value is the id of the
   * original verdict it reviewed. The original is never overwritten.
   */
  appealOf?: string | null;
  createdAt: string;
}

/** Raw structured output returned by the Intelligent Contract. */
export interface ContractVerdictPayload {
  decision: string;
  confidence: number;
  reasoning: string;
  criteria: Partial<VerdictCriteria>;
  alternativeInterpretation?: string;
}
