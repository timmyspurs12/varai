/**
 * Reference frontend client for the VARAI API.
 *
 * Copy into the frontend. The important part is `isGenLayerVerdict()` —
 * the UI must render the "GenLayer Decision" badge ONLY when that is true.
 */

const API = process.env.NEXT_PUBLIC_VARAI_API ?? 'http://localhost:4000';

export interface VerdictView {
  id: string;
  caseId: string;
  decision: string;
  confidence: number;
  consensus: { agree: number; disagree: number; total: number; ratio: number };
  consensusPercent: number;
  reasoning: string;
  criteria: Record<string, string>;
  alternativeInterpretation: string;
  validatorResults: { validatorIndex: number; address: string | null; vote: string; isLeader: boolean }[];
  genlayerTransaction: string | null;
  genlayerContract: string | null;
  explorerUrl: string | null;
  source: 'GENLAYER' | 'DEMO';
  demo: boolean;
  label: string;
  createdAt: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as { ok?: boolean; error?: { message?: string } };
  if (!res.ok || body.ok === false) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const varai = {
  health: () => req<{ mode: 'DEMO' | 'GENLAYER'; warning: string | null }>('/api/health'),

  createCase: (input: {
    competition: string;
    homeTeam: string;
    awayTeam: string;
    minute: number;
    incidentType: string;
    description: string;
    refereeCall?: string;
    evidence?: { kind: string; value: string }[];
  }) => req<{ case: { id: string } }>('/api/cases', { method: 'POST', body: JSON.stringify(input) }),

  /** Sends the case to GenLayer. Resolves when consensus has produced a verdict. */
  submit: (id: string) =>
    req<{ verdict: VerdictView; demo?: boolean; warning?: string }>(`/api/cases/${id}/submit`, {
      method: 'POST',
    }),

  status: (id: string) =>
    req<{ status: string; hasVerdict: boolean; mode: string; failureReason: string | null }>(
      `/api/cases/${id}/status`,
    ),

  getCase: (id: string) => req<{ case: unknown; verdict: VerdictView | null }>(`/api/cases/${id}`),
  listCases: () => req<{ cases: unknown[] }>('/api/cases'),
  getVerdict: (id: string) => req<{ verdict: VerdictView }>(`/api/verdicts/${id}`),
};

/**
 * THE GUARD.
 * Show "GenLayer Decision" + the transaction only when this returns true.
 * A demo verdict must always render as a demo verdict.
 */
export function isGenLayerVerdict(v: VerdictView): boolean {
  return v.source === 'GENLAYER' && !v.demo && Boolean(v.genlayerTransaction);
}

/** Short display hash, e.g. 0x8f2a…c41d */
export function shortTx(tx: string | null): string {
  if (!tx) return '—';
  return tx.length <= 14 ? tx : `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}
