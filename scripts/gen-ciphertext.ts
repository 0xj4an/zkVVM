#!/usr/bin/env bun
/**
 * Genera ciphertext para withdrawV2b.
 * Uso: bun run scripts/gen-ciphertext.ts <amount> <nullifier_hex> <recipient_address>
 * Ejemplo: bun run scripts/gen-ciphertext.ts 1 0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400 0x635BB386312470490Dd5864258bcb7Ab505bF42d
 */
import { computeCiphertext, POOL_SALT } from '../lib/withdraw-v2b-ciphertext.js';
import type { Hex } from 'viem';

function toRecipientField(addr: string): Hex {
  const a = addr.startsWith('0x') ? addr.slice(2).toLowerCase() : addr.toLowerCase();
  return ('0x000000000000000000000000' + a.padStart(40, '0')) as Hex;
}

const [amountStr, nullifierHex, recipientAddr] = process.argv.slice(2);
if (!amountStr || !nullifierHex || !recipientAddr) {
  console.error('Uso: bun run scripts/gen-ciphertext.ts <amount> <nullifier_hex> <recipient_address>');
  process.exit(1);
}

const amount = BigInt(amountStr);
const nullifier = (nullifierHex.startsWith('0x') ? nullifierHex : '0x' + nullifierHex) as Hex;
const recipientField = toRecipientField(recipientAddr);

const ciphertext = computeCiphertext(amount, nullifier, recipientField);
console.log('POOL_SALT (ref):', POOL_SALT);
console.log('ciphertext:', ciphertext);
