/**
 * GenLayer client bootstrap.
 *
 * Isolated here so the rest of the backend never imports the SDK directly.
 */
import { createClient, createAccount } from 'genlayer-js';
import * as chains from 'genlayer-js/chains';
import type { GenLayerClient } from 'genlayer-js/types';
import { config, genlayerConfigured } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

let cached: GenLayerClient<any> | null = null;

function resolveChain() {
  const map: Record<string, unknown> = {
    localnet: (chains as any).localnet,
    studionet: (chains as any).studionet,
    testnetAsimov: (chains as any).testnetAsimov,
  };
  const chain = map[config.genlayer.network];
  if (!chain) {
    throw new Error(
      `Unknown GENLAYER_NETWORK "${config.genlayer.network}". Use localnet, studionet or testnetAsimov.`,
    );
  }
  return chain;
}

/**
 * Returns a signing client. VARAI pays for the judging transaction itself —
 * users never connect a wallet.
 */
export function getGenLayerClient(): GenLayerClient<any> {
  if (cached) return cached;

  if (!genlayerConfigured()) {
    throw new Error('GenLayer is not configured (missing contract address or private key).');
  }

  const key = config.genlayer.privateKey.startsWith('0x')
    ? config.genlayer.privateKey
    : `0x${config.genlayer.privateKey}`;

  const account = createAccount(key as `0x${string}`);

  cached = createClient({
    chain: resolveChain() as any,
    account,
    ...(config.genlayer.endpoint ? { endpoint: config.genlayer.endpoint } : {}),
  }) as GenLayerClient<any>;

  logger.info(
    { network: config.genlayer.network, contract: config.genlayer.contractAddress },
    'GenLayer client ready',
  );
  return cached;
}

/** Human-checkable link to the transaction, when an explorer is configured. */
export function explorerUrl(txHash: string): string | null {
  if (!config.genlayer.explorerBase) return null;
  return `${config.genlayer.explorerBase.replace(/\/$/, '')}/tx/${txHash}`;
}
