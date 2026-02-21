/**
 * Generates note data for a single-leaf deposit using the same Noir circuit (Poseidon) as withdraw.
 * pk_b = wallet address, random = timestamp (seconds). Uses noir_js so no separate poseidon lib needed.
 */
import { Noir } from '@noir-lang/noir_js';
import { getNoteGeneratorCircuit } from '../../../circuits/compile.js';

export const NOTE_STORAGE_KEY = 'shielded_pool_note';

export interface NoteData {
  pk_b: string;
  random: string;
  nullifier: string;
  commitment: string;
  value: string;
  entry: string;
  expected_merkle_root: string;
  merkle_proof_length: number;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
  claimed?: boolean;
  claimedTxHash?: string;
}

let noteGeneratorNoir: Noir | null = null;

async function getNoteGeneratorNoir(): Promise<Noir> {
  if (noteGeneratorNoir) return noteGeneratorNoir;
  const circuit = await getNoteGeneratorCircuit();
  noteGeneratorNoir = new Noir(circuit);
  await noteGeneratorNoir.init();
  return noteGeneratorNoir;
}

function fieldToHex(v: unknown): `0x${string}` {
  if (typeof v === 'string' && v.startsWith('0x'))
    return `0x${v.slice(2).padStart(64, '0')}`;
  if (typeof v === 'bigint') return `0x${v.toString(16).padStart(64, '0')}`;
  if (typeof v === 'number') return `0x${BigInt(v).toString(16).padStart(64, '0')}`;
  return `0x${BigInt(String(v)).toString(16).padStart(64, '0')}`;
}

/**
 * Generate note via Noir circuit (same Poseidon as withdraw). value = amount in token units (e.g. 6 decimals).
 */
export async function generateNote(
  value: bigint,
  walletAddress: string,
  randomTimestampSeconds?: number,
): Promise<{ note: NoteData; commitmentHex: `0x${string}`; rootHex: `0x${string}` }> {
  const pk_b = BigInt(walletAddress);
  const random =
    randomTimestampSeconds !== undefined
      ? BigInt(randomTimestampSeconds)
      : BigInt(Math.floor(Date.now() / 1000));

  const noir = await getNoteGeneratorNoir();
  const inputs: Record<string, string> = {
    value: '0x' + value.toString(16),
    pk_b: '0x' + pk_b.toString(16),
    random: '0x' + random.toString(16),
  };
  const { returnValue } = await noir.execute(inputs);

  const arr = Array.isArray(returnValue) ? returnValue : [returnValue];
  const [nullifierHex, commitmentHex, entryHex, rootHex] = arr.map(fieldToHex) as [
    string,
    string,
    string,
    string,
  ];

  const note: NoteData = {
    pk_b: pk_b.toString(),
    random: random.toString(),
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

export function markNoteClaimed(txHash: string): void {
  try {
    const note = loadNote();
    if (!note) return;
    note.claimed = true;
    note.claimedTxHash = txHash;
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(note));
  } catch {
    // ignore
  }
}
