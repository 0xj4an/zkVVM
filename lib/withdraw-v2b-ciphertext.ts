/**
 * Ciphertext for ShieldedPool withdraw v2b.
 * Must match contract: key = keccak256(nullifier || recipient || POOL_SALT),
 * stream = keccak256(key || 0), ciphertext = amount XOR stream.
 */
import { encodePacked, keccak256, toBytes, type Hex } from 'viem';

/** Salt used on-chain for key derivation (keccak256("ShieldedPool.v2b")). */
export const POOL_SALT: Hex = keccak256(toBytes('ShieldedPool.v2b'));

/**
 * Computes the ciphertext for withdrawV2b so the contract can recover amount.
 * @param amount - Amount to withdraw (will be XOR'd with stream).
 * @param nullifier - bytes32 nullifier (public input 0).
 * @param recipientField - bytes32 recipient (public input 3; address left-padded to 32 bytes).
 * @returns ciphertext as bytes32 (hex).
 */
export function computeCiphertext(
  amount: bigint,
  nullifier: Hex,
  recipientField: Hex,
  poolSalt: Hex = POOL_SALT,
): Hex {
  const key = keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32'],
      [nullifier, recipientField, poolSalt],
    ),
  );
  const stream = keccak256(
    encodePacked(['bytes32', 'uint256'], [key, 0n]),
  );
  const xor = amount ^ BigInt(stream);
  return ('0x' + xor.toString(16).padStart(64, '0')) as Hex;
}

/**
 * Recovers amount from ciphertext (same derivation as the contract).
 * Useful for tests and to verify round-trip: amount === decrypt(computeCiphertext(amount, n, r), n, r).
 */
export function decryptCiphertext(
  ciphertext: Hex,
  nullifier: Hex,
  recipientField: Hex,
  poolSalt: Hex = POOL_SALT,
): bigint {
  const key = keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32'],
      [nullifier, recipientField, poolSalt],
    ),
  );
  const stream = keccak256(
    encodePacked(['bytes32', 'uint256'], [key, 0n]),
  );
  return BigInt(ciphertext) ^ BigInt(stream);
}
