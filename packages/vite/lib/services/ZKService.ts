import { Barretenberg, Fr } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { CompiledCircuit } from '@noir-lang/types';
import initACVM from '@noir-lang/acvm_js/web/acvm_js.js';
import initNoirAbi from '@noir-lang/noirc_abi/web/noirc_abi_wasm.js';
// Use direct web paths to avoid Node.js/Web mismatch
import acvmWasm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import abiWasm from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';

export interface Note {
  value: bigint;
  pk_b: bigint; // Arbitrary bearer secret (not necessarily a recipient address)
  random: bigint; // Randomness/salt
  nullifier: bigint;
  commitment: bigint;
  entry: bigint;
  root: bigint;
}

export class ZKService {
  private bb: Barretenberg | null = null;
  private static wasmInitialized = false;

  async init() {
    if (typeof window !== 'undefined' && !ZKService.wasmInitialized) {
      try {
        await initACVM(acvmWasm);
        await initNoirAbi(abiWasm);
        ZKService.wasmInitialized = true;
      } catch (e: any) {
        console.error('Failed to initialize ZK WASM:', e);
        throw e;
      }
    }
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
   * Generates a random Field-sized secret for pk_b.
   */
  generateSecret(): bigint {
    return this.getRandomBigInt();
  }

  /**
   * High-level API for creating a note using note_generator circuit.
   * @param pk_b An arbitrary secret (bearer key). Does not need to be a wallet address.
   */
  async generateNote(
    circuit: CompiledCircuit,
    value: bigint,
    pk_b: bigint,
    randomOverride?: bigint,
  ): Promise<Note> {
    const random = randomOverride ?? BigInt(Math.floor(Date.now() / 1000));

    const result = await this.executeCircuit(circuit, {
      value,
      pk_b,
      random,
    });

    const [nullifier, commitment, entry, root] = result.map((r: any) => this.toBigInt(r));

    return {
      value,
      pk_b,
      random,
      nullifier,
      commitment,
      entry,
      root,
    };
  }

  /**
   * Parses a note string in the format: zk-<amount>-<pk_b>-<random>
   */
  parseNoteString(noteStr: string) {
    const parts = noteStr.split('-');
    if (parts.length !== 4 || parts[0] !== 'zk') {
      throw new Error('Invalid note string format. Expected: zk-<amount>-<pk_b>-<random>');
    }

    return {
      amount: parts[1],
      pk_b: parts[2],
      random: parts[3],
    };
  }

  /**
   * Recomputes a Note object from its secret components using the note_generator circuit.
   */
  async recomputeNote(
    circuit: CompiledCircuit,
    amount: string,
    pk_b_hex: string,
    random_hex: string,
  ): Promise<Note> {
    const value = BigInt(Math.floor(parseFloat(amount) * 1e6)); // Assuming 6 decimals
    const pk_b = BigInt(pk_b_hex);
    const random = BigInt(random_hex);

    return this.generateNote(circuit, value, pk_b, random);
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
    merkleProofLength?: number,
  ) {
    const inputs = {
      nullifier: note.nullifier,
      merkle_proof_length: merkleProofLength ?? merkleProof.indices.length,
      expected_merkle_root: merkleRoot,
      recipient: recipient,
      commitment: note.commitment,
      value: note.value,
      pk_b: note.pk_b,
      random: note.random,
      merkle_proof_indices: merkleProof.indices,
      merkle_proof_siblings: merkleProof.siblings,
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

