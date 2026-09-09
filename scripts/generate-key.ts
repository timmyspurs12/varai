/**
 * Generates a GenLayer account key for the backend to sign judging
 * transactions with. Users never connect a wallet — VARAI submits for them.
 *
 *   npm run genkey
 */
import { generatePrivateKey, createAccount } from 'genlayer-js';

const key = generatePrivateKey();
const account = createAccount(key);

console.log('\nGenLayer account generated\n');
console.log(`  GENLAYER_PRIVATE_KEY=${key}`);
console.log(`  address: ${account.address}\n`);
console.log('Fund this address on your target network before judging cases.');
console.log('Keep the private key secret — never commit it.\n');
