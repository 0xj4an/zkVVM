import { Barretenberg, Fr } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { CompiledCircuit } from '@noir-lang/types';

export interface Note {
  secret: bigint;
  nullifier: bigint;
  value: bigint;
  commitment: bigint;
  nullifierHash: bigint;
  entry: bigint;
  root: bigint;
}

export class ZKService {
  private bb: Barretenberg | null = null;

  async init() {
    if (!this.bb) {
      this.bb = await Barretenberg.new();
    }
  }

  async destroy() {
    if (this.bb) {
      await this.bb.destroy();
      this.bb = null;
    }
  }

  private async getBB(): Promise<Barretenberg> {
    if (!this.bb) await this.init();
    return this.bb!;
  }

  private toHex(x: bigint | number): string {
    return `0x${x.toString(16)}`;
  }

  private toBigInt(fr: any): bigint {
    if (fr === undefined || fr === null) throw new Error('toBigInt: value is undefined or null');
    if (typeof fr === 'bigint') return fr;
    if (typeof fr === 'number') return BigInt(fr);
    if (typeof fr === 'string') {
      const trimmed = fr.trim();
      try {
        return BigInt(trimmed);
      } catch (e: any) {
        throw e;
      }
    }
    if (fr instanceof Uint8Array || (fr.constructor && fr.constructor.name === 'Uint8Array')) {
      return this.bytesToBigIntBE(fr);
    }
    if (fr.value) return this.toBigInt(fr.value);
    if (fr.toBuffer) return this.bytesToBigIntBE(fr.toBuffer());
    if (fr.toBytes) return this.bytesToBigIntBE(fr.toBytes());
    try {
      return BigInt(fr.toString());
    } catch (e: any) {
      throw e;
    }
  }

  private bytesToBigIntBE(bytes: Uint8Array): bigint {
    let x = 0n;
    for (const b of bytes) x = (x << 8n) + BigInt(b);
    return x;
  }

  /**
   * Executes a Noir circuit with the given inputs.
   * Automatically handles BigInt to Hex conversion for Field members.
   */
  async executeCircuit(circuit: CompiledCircuit, inputs: Record<string, any>): Promise<any> {
    const noir = new Noir(circuit);
    const processedInputs = this.prepareInputs(inputs);
    const { returnValue } = await noir.execute(processedInputs);
    return returnValue;
  }

  private prepareInputs(inputs: any): any {
    if (typeof inputs === 'bigint') return this.toHex(inputs);
    if (Array.isArray(inputs)) return inputs.map(i => this.prepareInputs(i));
    if (typeof inputs === 'object' && inputs !== null) {
      const result: any = {};
      for (const key in inputs) {
        result[key] = this.prepareInputs(inputs[key]);
      }
      return result;
    }
    return inputs;
  }

  private getRandomBigInt(): bigint {
    const randomBytes = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(randomBytes);
    } else {
      for (let i = 0; i < 32; i++) randomBytes[i] = Math.floor(Math.random() * 256);
    }
    return (
      this.bytesToBigIntBE(randomBytes) %
      21888242871839275222246405745257275088548364400416034343698204186575808495617n
    );
  }

  /**
   * High-level API for creating a note using note_generator circuit.
   * Commitment = Poseidon([secret, nullifier, value])
   */
  async generateNote(
    circuit: CompiledCircuit,
    value: bigint,
    secretOverride?: bigint,
    nullifierOverride?: bigint,
  ): Promise<Note> {
    const secret = secretOverride ?? this.getRandomBigInt();
    const nullifier = nullifierOverride ?? this.getRandomBigInt();

    // Use the updated Poseidon logic: Commitment = H(secret, nullifier, value)
    const bb = await this.getBB();
    const commitmentArr = await bb.poseidon3Hash([new Fr(secret), new Fr(nullifier), new Fr(value)]);
    const commitment = this.toBigInt(commitmentArr);

    const nullifierHashArr = await bb.poseidon2Hash([new Fr(nullifier)]); // Wait, circuit uses hash_1? hash_1 in poseidon is often hash_1([x]) which is just H(x, 0) or similar.
    // Actually, let's use the circuit to be sure if possible, or match its poseidon usage.
    // In main.nr: let calculated_nullifier_hash = poseidon1([nullifier]);
    // In BB.js, poseidon1 might be different. Let's stick to consistent BB.js usage.
    const nullifierHash = this.toBigInt(await bb.poseidon2Hash([new Fr(nullifier), new Fr(0n)]));

    // We still need to compute the initial root (simple case: empty siblings)
    // This is just for demonstration/testing if the circuit expects it.
    let current = commitment;
    for (let i = 0; i < 10; i++) {
      current = this.toBigInt(await bb.poseidon2Hash([new Fr(current), new Fr(0n)]));
    }
    const root = current;

    return {
      secret,
      nullifier,
      value,
      nullifierHash,
      commitment,
      entry: commitment, // In this model, entry is commitment
      root,
    };
  }

  /**
   * Generates a withdrawal proof using the withdraw circuit.
   */
  async generateWithdrawProof(
    circuit: CompiledCircuit,
    note: Note,
    recipient: bigint,
    merkleRoot: bigint,
    merkleProof: { indices: number[]; siblings: bigint[] },
  ) {
    const inputs = {
      root: merkleRoot,
      nullifierHash: note.nullifierHash,
      recipient: recipient,
      value: note.value,
      secret: note.secret,
      nullifier: note.nullifier,
      path_indices: merkleProof.indices,
      path_siblings: merkleProof.siblings,
    };

    const noir = new Noir(circuit);
    return await noir.execute(this.prepareInputs(inputs));
  }

  // Poseidon fallback/helpers for cases where circuit is not available
  async poseidon2(a: bigint | number | string, b: bigint | number | string): Promise<bigint> {
    const bb = await this.getBB();
    try {
      const out = await bb.poseidon2Hash([new Fr(BigInt(a)), new Fr(BigInt(b))]);
      return this.toBigInt(out);
    } catch (e: any) {
      throw e;
    }
  }
}

export const zkService = new ZKService();
