/**
 * Persistence.
 *
 * Postgres is the real target (db/schema.sql). When DATABASE_URL is unset we
 * fall back to an in-memory store so `npm run dev` works with zero setup —
 * useful for UI work, but everything is lost on restart.
 *
 * All SQL uses parameterised queries; no string interpolation ever reaches
 * the database.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import type {
  CaseStatus,
  Evidence,
  FootballCase,
  Verdict,
  ValidatorResult,
} from '../types/index.js';
import type { CreateCaseInput } from '../utils/validation.js';

export interface NewVerdict {
  caseId: string;
  decision: string;
  confidence: number;
  consensus: { agree: number; disagree: number; total: number; ratio: number };
  reasoning: string;
  criteria: Record<string, string>;
  alternativeInterpretation: string;
  genlayerTransaction: string | null;
  genlayerContract: string | null;
  source: 'GENLAYER' | 'DEMO';
  validators: Omit<ValidatorResult, 'id' | 'verdictId'>[];
}

export interface Store {
  init(): Promise<void>;
  /** Liveness probe: 'memory', 'up', or 'down' for the backing store. */
  ping(): Promise<{ kind: 'memory' | 'postgres'; ok: boolean; error?: string }>;
  createCase(input: CreateCaseInput): Promise<FootballCase>;
  listCases(opts: { status?: string; limit: number; offset: number }): Promise<FootballCase[]>;
  getCase(id: string): Promise<FootballCase | null>;
  setStatus(id: string, status: CaseStatus, extra?: { txHash?: string; failureReason?: string | null }): Promise<void>;
  saveVerdict(v: NewVerdict): Promise<Verdict>;
  getVerdictByCase(caseId: string): Promise<Verdict | null>;
  getVerdict(id: string): Promise<Verdict | null>;
  close(): Promise<void>;
}

const nowIso = () => new Date().toISOString();

/* ========================================================================== */
/* In-memory                                                                   */
/* ========================================================================== */
class MemoryStore implements Store {
  private cases = new Map<string, FootballCase>();
  private verdicts = new Map<string, Verdict>();

  async init() {
    logger.warn({}, 'DATABASE_URL not set — using in-memory store (data is lost on restart)');
  }

  async ping() {
    return { kind: 'memory' as const, ok: true };
  }

  async createCase(input: CreateCaseInput): Promise<FootballCase> {
    const id = randomUUID();
    const ts = nowIso();
    const record: FootballCase = {
      id,
      competition: input.competition,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      minute: input.minute,
      incidentType: input.incidentType,
      description: input.description,
      refereeCall: input.refereeCall ?? null,
      status: 'DRAFT',
      evidence: (input.evidence ?? []).map((e) => ({
        id: randomUUID(),
        caseId: id,
        kind: e.kind,
        value: e.value,
        verifiedByGenlayer: false,
        createdAt: ts,
      })),
      createdAt: ts,
      updatedAt: ts,
      genlayerTxHash: null,
      failureReason: null,
    };
    this.cases.set(id, record);
    return record;
  }

  async listCases({ status, limit, offset }: { status?: string; limit: number; offset: number }) {
    let all = [...this.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (status) all = all.filter((c) => c.status === status);
    return all.slice(offset, offset + limit);
  }

  async getCase(id: string) {
    return this.cases.get(id) ?? null;
  }

  async setStatus(id: string, status: CaseStatus, extra?: { txHash?: string; failureReason?: string | null }) {
    const c = this.cases.get(id);
    if (!c) return;
    c.status = status;
    c.updatedAt = nowIso();
    if (extra?.txHash) c.genlayerTxHash = extra.txHash;
    if (extra?.failureReason !== undefined) c.failureReason = extra.failureReason;
  }

  async saveVerdict(v: NewVerdict): Promise<Verdict> {
    const id = randomUUID();
    const verdict: Verdict = {
      id,
      caseId: v.caseId,
      decision: v.decision as Verdict['decision'],
      confidence: v.confidence,
      consensus: v.consensus,
      reasoning: v.reasoning,
      criteria: v.criteria as unknown as Verdict['criteria'],
      alternativeInterpretation: v.alternativeInterpretation,
      validatorResults: v.validators.map((x) => ({ ...x, id: randomUUID(), verdictId: id })),
      genlayerTransaction: v.genlayerTransaction,
      genlayerContract: v.genlayerContract,
      source: v.source,
      createdAt: nowIso(),
    };
    this.verdicts.set(id, verdict);
    return verdict;
  }

  async getVerdictByCase(caseId: string) {
    return [...this.verdicts.values()].find((v) => v.caseId === caseId) ?? null;
  }

  async getVerdict(id: string) {
    return this.verdicts.get(id) ?? null;
  }

  async close() {}
}

/* ========================================================================== */
/* PostgreSQL                                                                  */
/* ========================================================================== */
class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({
      // `sslmode` in the URL is dropped deliberately. The pg driver prints a
      // noisy SECURITY WARNING for 'require' (it treats it as 'verify-full',
      // which changes in pg v9), and it is redundant here: TLS is governed by
      // the explicit `ssl` option below. Stripping it silences the warning
      // WITHOUT weakening anything — unlike the `uselibpqcompat=true` escape
      // hatch, which opts into weaker libpq semantics.
      connectionString: stripSslMode(url),
      ...(config.database.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
      max: 10,
      // Without this an unreachable host hangs until the platform kills the
      // deploy, which reports no useful cause.
      connectionTimeoutMillis: 15_000,
      // Recycle idle connections before a serverless Postgres (Neon scales to
      // zero after ~5 min) drops them underneath us.
      idleTimeoutMillis: 30_000,
    });

    /*
     * A pg.Pool emits 'error' when an IDLE client dies — a database restart,
     * a failover, or Neon suspending the compute. Node treats an unhandled
     * 'error' event on an EventEmitter as fatal, so without this listener the
     * whole API process crashes and the platform restarts it.
     *
     * Swallowing it here is correct: the pool discards the dead client and
     * makes a fresh one on the next query.
     */
    this.pool.on('error', (err) => {
      logger.warn(
        { err: err.message || err.constructor.name },
        'idle PostgreSQL connection dropped — the pool will reconnect',
      );
    });
  }

  async init() {
    // Fail fast and loudly: without a timeout an unreachable host can hang
    // until the platform's own deploy timeout, which reports nothing useful.
    try {
      await this.pool.query('SELECT 1');
    } catch (err) {
      const e = err as Error & { code?: string };
      logger.error(
        { code: e.code, host: safeHost(config.database.url) },
        'could not connect to PostgreSQL',
      );
      throw err;
    }

    // Connecting is not enough — the tables must exist too.
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('cases','evidence','verdicts','validator_results')`,
    );
    if (rows[0]?.n !== 4) {
      throw new Error(
        `database is missing tables (found ${rows[0]?.n ?? 0} of 4) — ` +
          'load db/schema.sql into it, see NEON-SETUP.md Step 4',
      );
    }

    logger.info({ host: safeHost(config.database.url) }, 'PostgreSQL connected');
  }

  async ping() {
    try {
      await this.pool.query('SELECT 1');
      return { kind: 'postgres' as const, ok: true };
    } catch (err) {
      return {
        kind: 'postgres' as const,
        ok: false,
        error: (err as Error).message || (err as Error).constructor.name,
      };
    }
  }

  async createCase(input: CreateCaseInput): Promise<FootballCase> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      const { rows } = await client.query(
        `INSERT INTO cases (id, competition, home_team, away_team, minute,
                            incident_type, description, referee_call, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT') RETURNING *`,
        [
          id,
          input.competition,
          input.homeTeam,
          input.awayTeam,
          input.minute,
          input.incidentType,
          input.description,
          input.refereeCall ?? null,
        ],
      );

      const evidence: Evidence[] = [];
      for (const e of input.evidence ?? []) {
        const { rows: er } = await client.query(
          `INSERT INTO evidence (id, case_id, kind, value, verified_by_genlayer)
           VALUES ($1,$2,$3,$4,FALSE) RETURNING *`,
          [randomUUID(), id, e.kind, e.value],
        );
        evidence.push(mapEvidence(er[0]));
      }

      await client.query('COMMIT');
      return mapCase(rows[0], evidence);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listCases({ status, limit, offset }: { status?: string; limit: number; offset: number }) {
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }
    params.push(limit, offset);
    const { rows } = await this.pool.query(
      `SELECT * FROM cases ${where} ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { rows: ev } = await this.pool.query(`SELECT * FROM evidence WHERE case_id = ANY($1)`, [ids]);
    const byCase = new Map<string, Evidence[]>();
    ev.forEach((e) => {
      const list = byCase.get(e.case_id) ?? [];
      list.push(mapEvidence(e));
      byCase.set(e.case_id, list);
    });
    return rows.map((r) => mapCase(r, byCase.get(r.id) ?? []));
  }

  async getCase(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM cases WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const { rows: ev } = await this.pool.query(
      'SELECT * FROM evidence WHERE case_id = $1 ORDER BY created_at',
      [id],
    );
    return mapCase(rows[0], ev.map(mapEvidence));
  }

  async setStatus(id: string, status: CaseStatus, extra?: { txHash?: string; failureReason?: string | null }) {
    await this.pool.query(
      `UPDATE cases SET status = $2,
              genlayer_tx_hash = COALESCE($3, genlayer_tx_hash),
              failure_reason = $4
       WHERE id = $1`,
      [id, status, extra?.txHash ?? null, extra?.failureReason ?? null],
    );
  }

  async saveVerdict(v: NewVerdict): Promise<Verdict> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      const { rows } = await client.query(
        `INSERT INTO verdicts (id, case_id, decision, confidence,
             consensus_agree, consensus_disagree, consensus_total,
             reasoning, criteria, alternative_interpretation,
             genlayer_transaction, genlayer_contract, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          id,
          v.caseId,
          v.decision,
          v.confidence,
          v.consensus.agree,
          v.consensus.disagree,
          v.consensus.total,
          v.reasoning,
          JSON.stringify(v.criteria),
          v.alternativeInterpretation,
          v.genlayerTransaction,
          v.genlayerContract,
          v.source,
        ],
      );

      const results: ValidatorResult[] = [];
      for (const val of v.validators) {
        const { rows: vr } = await client.query(
          `INSERT INTO validator_results (id, verdict_id, validator_index, address, vote, is_leader)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [randomUUID(), id, val.validatorIndex, val.address, val.vote, val.isLeader],
        );
        results.push(mapValidator(vr[0]));
      }

      await client.query('COMMIT');
      return mapVerdict(rows[0], results);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getVerdictByCase(caseId: string) {
    const { rows } = await this.pool.query('SELECT * FROM verdicts WHERE case_id = $1', [caseId]);
    if (rows.length === 0) return null;
    return this.hydrate(rows[0]);
  }

  async getVerdict(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM verdicts WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    return this.hydrate(rows[0]);
  }

  private async hydrate(row: any): Promise<Verdict> {
    const { rows: vr } = await this.pool.query(
      'SELECT * FROM validator_results WHERE verdict_id = $1 ORDER BY validator_index',
      [row.id],
    );
    return mapVerdict(row, vr.map(mapValidator));
  }

  async close() {
    await this.pool.end();
  }
}

/* ---------- row mappers ---------- */
function mapCase(r: any, evidence: Evidence[]): FootballCase {
  return {
    id: r.id,
    competition: r.competition,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    minute: r.minute,
    incidentType: r.incident_type,
    description: r.description,
    refereeCall: r.referee_call,
    status: r.status,
    evidence,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    genlayerTxHash: r.genlayer_tx_hash,
    failureReason: r.failure_reason,
  };
}

function mapEvidence(r: any): Evidence {
  return {
    id: r.id,
    caseId: r.case_id,
    kind: r.kind,
    value: r.value,
    verifiedByGenlayer: r.verified_by_genlayer,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function mapValidator(r: any): ValidatorResult {
  return {
    id: r.id,
    verdictId: r.verdict_id,
    validatorIndex: r.validator_index,
    address: r.address,
    vote: r.vote,
    isLeader: r.is_leader,
  };
}

function mapVerdict(r: any, validators: ValidatorResult[]): Verdict {
  const total = r.consensus_total ?? 0;
  const agree = r.consensus_agree ?? 0;
  return {
    id: r.id,
    caseId: r.case_id,
    decision: r.decision,
    confidence: Number(r.confidence),
    consensus: {
      agree,
      disagree: r.consensus_disagree ?? 0,
      total,
      ratio: total > 0 ? Number((agree / total).toFixed(4)) : 0,
    },
    reasoning: r.reasoning,
    criteria: typeof r.criteria === 'string' ? JSON.parse(r.criteria) : r.criteria,
    alternativeInterpretation: r.alternative_interpretation ?? '',
    validatorResults: validators,
    genlayerTransaction: r.genlayer_transaction,
    genlayerContract: r.genlayer_contract,
    source: r.source,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Remove the `sslmode` query param; TLS is configured via the `ssl` option. */
function stripSslMode(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

/** Host of a connection string, with credentials stripped — safe to log. */
function safeHost(url?: string): string {
  if (!url) return 'unknown';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}

/* ---------- singleton ---------- */
export const store: Store = config.database.url
  ? new PostgresStore(config.database.url)
  : new MemoryStore();
