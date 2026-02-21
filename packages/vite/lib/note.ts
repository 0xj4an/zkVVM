/**
 * Generates note data for a single-leaf deposit using the same Noir circuit (Poseidon) as withdraw.
 * `secret` = wallet address (or bearer secret), `salt` = cryptographic salt.
 * Uses noir_js so no separate poseidon lib needed.
 */
import { Noir } from '@noir-lang/noir_js';
import { getNoteGeneratorCircuit } from '../../noir/compile.js';

export const NOTE_STORAGE_KEY = 'shielded_pool_note';

export interface NoteData {
  secret: string;
  salt: string;
  nullifier: string;
  commitment: string;
  value: string;
  entry: string;
  expected_merkle_root: string;
  merkle_proof_length: number;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
}

let noteGeneratorNoir: Noir | null = null;

async function getNoteGeneratorNoir(): Promise<Noir> {
  if (noteGeneratorNoir) return noteGeneratorNoir;
  const circuit = await getNoteGeneratorCircuit();
  noteGeneratorNoir = new Noir(circuit);
  await noteGeneratorNoir.init();
  return noteGeneratorNoir;
}

function fieldToHex(v: unknown): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v;
  if (typeof v === 'bigint') return '0x' + v.toString(16).padStart(64, '0');
  if (typeof v === 'number') return '0x' + BigInt(v).toString(16).padStart(64, '0');
  return String(v);
}

/**
 * Generate note via Noir circuit (same Poseidon as withdraw). value = amount in token units (e.g. 6 decimals).
 */
export async function generateNote(
  value: bigint,
  walletAddressOrSecret: string,
  saltOverride?: number,
): Promise<{ note: NoteData; commitmentHex: `0x${string}`; rootHex: `0x${string}` }> {
  const secret = BigInt(walletAddressOrSecret);
  let salt: bigint;
  if (saltOverride !== undefined) {
    salt = BigInt(saltOverride);
  } else {
    // secure RNG for salt
    const bytes = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
    salt = 0n;
    for (const b of bytes) salt = (salt << 8n) + BigInt(b);
  }

  const noir = await getNoteGeneratorNoir();
  const inputs: Record<string, string> = {};
  inputs['value'] = '0x' + value.toString(16);
  // compiled circuit expects `pk_b` and `random` keys; map from our `secret`/`salt`
  inputs['pk_b'] = '0x' + secret.toString(16);
  inputs['random'] = '0x' + salt.toString(16);
  const { returnValue } = await noir.execute(inputs);

  const arr = Array.isArray(returnValue) ? returnValue : [returnValue];
  const [nullifierHex, commitmentHex, entryHex, rootHex] = arr.map(fieldToHex) as [
    string,
    string,
    string,
    string,
  ];

  const note: NoteData = {
    secret: secret.toString(),
    salt: salt.toString(),
    nullifier: nullifierHex,
    commitment: commitmentHex,
    value: value.toString(),
    entry: entryHex,
    expected_merkle_root: rootHex,
    merkle_proof_length: 1,
    merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    merkle_proof_siblings: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
  };

  return {
    note,
    commitmentHex: commitmentHex as `0x${string}`,
    rootHex: rootHex as `0x${string}`,
  };
}

export function saveNote(note: NoteData): void {
  try {
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(note));
  } catch {
    // ignore
  }
}

export function loadNote(): NoteData | null {
  try {
    const raw = localStorage.getItem(NOTE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NoteData;
  } catch {
    return null;
  }
}
