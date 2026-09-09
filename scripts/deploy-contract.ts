/**
 * Deploys contracts/football_court.py to GenLayer.
 *
 *   npm run deploy:contract
 *
 * Prints the contract address. Put it in GENLAYER_CONTRACT_ADDRESS.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, createAccount } from 'genlayer-js';
import * as chains from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const network = process.env.GENLAYER_NETWORK ?? 'studionet';
  const key = process.env.GENLAYER_PRIVATE_KEY;

  if (!key) {
    console.error('GENLAYER_PRIVATE_KEY is required to deploy.');
    console.error('Generate one with:  npm run genkey');
    process.exit(1);
  }

  const chain = (chains as Record<string, unknown>)[network];
  if (!chain) {
    console.error(`Unknown GENLAYER_NETWORK "${network}" (localnet | studionet | testnetAsimov)`);
    process.exit(1);
  }

  const account = createAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`);
  const client = createClient({
    chain: chain as never,
    account,
    ...(process.env.GENLAYER_RPC_URL ? { endpoint: process.env.GENLAYER_RPC_URL } : {}),
  });

  const code = readFileSync(resolve(here, '../contracts/football_court.py'), 'utf-8');

  console.log(`Deploying FootballCourt to ${network}…`);
  console.log(`Deployer: ${account.address}`);

  if (typeof (client as any).initializeConsensusSmartContract === 'function') {
    await (client as any).initializeConsensusSmartContract();
  }

  const hash = await client.deployContract({ code, args: [], leaderOnly: false });
  console.log(`Deploy tx: ${hash}`);

  const receipt: any = await client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.ACCEPTED,
    retries: 80,
    interval: 5000,
  });

  /*
   * A deploy can be FINALIZED and still have FAILED. The consensus layer
   * accepts the transaction, but the GenVM may reject the contract itself
   * (e.g. an unknown `Depends` runner version -> `invalid_contract`). In that
   * case an address is still returned and nothing is actually deployed, so
   * judging later dies with "Contract ... not found".
   *
   * Check the leader receipt before reporting success.
   */
  const lr = receipt?.consensus_data?.leader_receipt;
  const leader = Array.isArray(lr) ? lr[0] : lr;
  const execResult = leader?.execution_result;

  if (execResult && execResult !== 'SUCCESS') {
    const payload = leader?.result?.payload ?? leader?.result?.status ?? 'unknown error';
    console.error(`\nDeployment FAILED — the contract was rejected: ${JSON.stringify(payload)}`);
    if (String(payload).includes('invalid_contract')) {
      console.error('\n  The GenVM rejected the contract code itself.');
      console.error('  Most often the `Depends` runner version at the top of');
      console.error('  contracts/football_court.py is unknown to this network.');
      console.error('  Compare it with a current example at:');
      console.error('    https://docs.genlayer.com/developers/intelligent-contracts/introduction');
    }
    console.error('\nNothing was deployed. Do not set GENLAYER_CONTRACT_ADDRESS.\n');
    process.exit(1);
  }

  const address =
    receipt?.data?.contract_address ??
    receipt?.recipient ??
    receipt?.txDataDecoded?.contractAddress;

  if (!address) {
    console.error('Deployment finished but no contract address was returned. Full receipt:');
    console.error(JSON.stringify(receipt, null, 2));
    process.exit(1);
  }

  // Prove it is really there: a deployed contract answers a read.
  try {
    await client.readContract({
      address: address as never,
      functionName: 'get_case_count',
      args: [],
    });
  } catch (err) {
    console.error(`\nDeployment reported an address (${address}) but the contract does not respond:`);
    console.error(`  ${(err as Error).message?.split('\n')[0]}`);
    console.error('\nDo not set GENLAYER_CONTRACT_ADDRESS — judging would fail.\n');
    process.exit(1);
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(' FootballCourt deployed and verified');
  console.log(` GENLAYER_CONTRACT_ADDRESS=${address}`);
  console.log('─────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
