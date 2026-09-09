import 'dotenv/config';

function bool(v: string | undefined, fallback = false): boolean {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export type GenLayerNetwork = 'localnet' | 'studionet' | 'testnetAsimov';

export const config = {
  port: int(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /**
   * DEMO MODE.
   * When true the backend produces clearly-labelled DEMO verdicts so the
   * frontend can be developed before a contract is deployed.
   * A demo verdict always carries source:'DEMO' and a null transaction.
   */
  demoMode: bool(process.env.VARAI_DEMO_MODE, false),

  database: {
    /** Falls back to an in-memory store when unset, so `npm run dev` works with zero setup. */
    url: process.env.DATABASE_URL ?? '',
    ssl: bool(process.env.DATABASE_SSL, false),
  },

  genlayer: {
    network: (process.env.GENLAYER_NETWORK ?? 'studionet') as GenLayerNetwork,
    /** Optional custom RPC endpoint. */
    endpoint: process.env.GENLAYER_RPC_URL || undefined,
    /** Deployed FootballCourt address. Required unless demo mode is on. */
    contractAddress: process.env.GENLAYER_CONTRACT_ADDRESS || '',
    /**
     * Server-side account key used to pay for judging transactions.
     * Users never connect a wallet — VARAI submits on their behalf.
     */
    privateKey: process.env.GENLAYER_PRIVATE_KEY || '',
    /** Explorer base for building a human-checkable link to the transaction. */
    explorerBase: process.env.GENLAYER_EXPLORER_BASE || '',
    waitRetries: int(process.env.GENLAYER_WAIT_RETRIES, 100),
    waitIntervalMs: int(process.env.GENLAYER_WAIT_INTERVAL_MS, 5000),
  },

  security: {
    maxDescriptionLength: int(process.env.MAX_DESCRIPTION_LENGTH, 4000),
    maxEvidenceItems: int(process.env.MAX_EVIDENCE_ITEMS, 10),
    rateLimitWindowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: int(process.env.RATE_LIMIT_MAX, 60),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
  },
} as const;

/** A 0x-prefixed 20-byte hex address. */
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** A 32-byte hex private key, with or without the 0x prefix. */
const PRIVATE_KEY_RE = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Explain why the GenLayer config is unusable, or null when it is fine.
 *
 * A non-empty string is NOT enough. Placeholders copied out of the docs
 * (`0xTHE_PRINTED_ADDRESS`, `0xYOUR_CONTRACT_ADDRESS`) used to sail through
 * and the server would announce "GenLayer judging enabled" before failing on
 * the first real judgment. Check the shape up front instead.
 */
export function genlayerConfigError(): string | null {
  const { contractAddress, privateKey } = config.genlayer;

  if (!contractAddress) return 'GENLAYER_CONTRACT_ADDRESS is not set.';
  if (!ADDRESS_RE.test(contractAddress)) {
    return (
      `GENLAYER_CONTRACT_ADDRESS is not a valid address: "${contractAddress}". ` +
      'Expected 0x followed by 40 hex characters. If that looks like a ' +
      'placeholder, run `npm run deploy:contract` and paste the address it prints.'
    );
  }

  if (!privateKey) return 'GENLAYER_PRIVATE_KEY is not set.';
  if (!PRIVATE_KEY_RE.test(privateKey)) {
    const hint = ADDRESS_RE.test(privateKey)
      ? ' That is an ADDRESS, not a private key — you need the 64-character secret.'
      : '';
    return (
      `GENLAYER_PRIVATE_KEY is not a valid key (${privateKey.replace(/^0x/, '').length} ` +
      `hex characters, expected 64).${hint}`
    );
  }

  return null;
}

/** True when we have everything needed to talk to a real contract. */
export function genlayerConfigured(): boolean {
  return genlayerConfigError() === null;
}

/**
 * Fail fast on an impossible configuration: not in demo mode and not
 * configured for GenLayer means the product cannot produce a verdict at all.
 */
export function assertRunnable(): void {
  const problem = genlayerConfigError();
  if (!config.demoMode && problem) {
    throw new Error(
      `VARAI cannot start: ${problem}\n` +
        'Set GENLAYER_CONTRACT_ADDRESS and GENLAYER_PRIVATE_KEY, or set VARAI_DEMO_MODE=true for local UI work.',
    );
  }
}
