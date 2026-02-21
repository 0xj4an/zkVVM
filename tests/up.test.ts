import { expect, test, describe } from "bun:test";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { decompressSync } from "fflate";
import noteGeneratorArtifact from "../packages/noir/target/note_generator.json" with { type: "json" };
import withdrawArtifact from "../packages/noir/target/withdraw.json" with { type: "json" };
import commitmentHelperArtifact from "../packages/noir/target/commitment_helper.json" with { type: "json" };
import nullifierHelperArtifact from "../packages/noir/target/nullifier_helper.json" with { type: "json" };
import rootHelperArtifact from "../packages/noir/target/root_helper.json" with { type: "json" };

describe("zkVVM Circuit Tests (UltraPlonk)", () => {
    const toHex = (x: bigint): string => `0x${x.toString(16)}`;

    const toBigInt = (fr: any): bigint => {
        if (typeof fr === "bigint") return fr;
        if (typeof fr === "string") return BigInt(fr);
        if (fr.value) return toBigInt(fr.value);
        return BigInt(fr.toString());
    };

    // Helper wrappers
    const getNullifierHash = async (value: bigint, secret: bigint, salt: bigint): Promise<bigint> => {
        const noir = new Noir(noteGeneratorArtifact as any);
        const { returnValue } = await noir.execute({
            value: toHex(value),
            pk_b: toHex(secret),
            random: toHex(salt)
        });
        const result = returnValue as any[];
        return toBigInt(result[0]); // nullifier
    };

    const getCommitment = async (value: bigint, nullifier: bigint): Promise<bigint> => {
        const noir = new Noir(commitmentHelperArtifact as any);
        const { returnValue } = await noir.execute({
            value: toHex(value),
            nullifier: toHex(nullifier)
        });
        return toBigInt(returnValue);
    };

    const getRoot = async (
        value: bigint,
        secret: bigint,
        salt: bigint,
        nullifier: bigint,
        indices: number[],
        siblings: bigint[]
    ): Promise<bigint> => {
        const noir = new Noir(rootHelperArtifact as any);
        const { returnValue } = await noir.execute({
            value: toHex(value),
            from: toHex(secret),
            random: toHex(salt),
            nullifier_in: toHex(nullifier),
            merkle_proof_length: indices.length,
            merkle_proof_indices: indices,
            merkle_proof_siblings: siblings.map(toHex),
        });
        return toBigInt(returnValue);
    };

    test("Note Generator Circuit", async () => {
        const noir = new Noir(noteGeneratorArtifact as any);
        const inputs = {
            value: 100n,
            secret: 0xabc123n,
            salt: 0xdef456n,
        };

        const { returnValue } = await noir.execute({
            value: toHex(inputs.value),
            pk_b: toHex(inputs.secret),
            random: toHex(inputs.salt),
        });
        const result = returnValue as any[];

        const expectedNullifier = await getNullifierHash(inputs.value, inputs.secret, inputs.salt);
        const expectedCommitment = await getCommitment(inputs.value, expectedNullifier);

        expect(toBigInt(result[0])).toBe(expectedNullifier);
        expect(toBigInt(result[1])).toBe(expectedCommitment);
    });

    test("Withdraw Circuit - Valid Proof", async () => {
        const noir = new Noir(withdrawArtifact as any);

        const value = 500n;
        const secret = 0xabc123n;
        const salt = 0xdef456n;
        const recipient = 0x789n;

        const nullifier = await getNullifierHash(value, secret, salt);
        const commitment = await getCommitment(value, nullifier);

        const depth = 10;
        const siblings = new Array(depth).fill(0n);
        const indices = new Array(depth).fill(0);

        const root = await getRoot(value, secret, salt, nullifier, indices, siblings);

        const inputs = {
            nullifier: toHex(nullifier),
            merkle_proof_length: depth,
            expected_merkle_root: toHex(root),
            recipient: toHex(recipient),
            commitment: toHex(commitment),
            value: toHex(value),
            pk_b: toHex(secret),
            random: toHex(salt),
            merkle_proof_indices: indices,
            merkle_proof_siblings: siblings.map(toHex),
        };

        const { witness } = await noir.execute(inputs as any);
        expect(witness).toBeDefined();
    });

    test("Withdraw Circuit - Tampered Recipient", async () => {
        const noir = new Noir(withdrawArtifact as any);

        const value = 500n;
        const secret = 0xabc123n;
        const salt = 0xdef456n;
        const recipientA = 0x789n;
        const recipientB = 0x555n;

        const nullifier = await getNullifierHash(value, secret, salt);
        const commitment = await getCommitment(value, nullifier);

        const depth = 10;
        const siblings = new Array(depth).fill(0n);
        const indices = new Array(depth).fill(0);

        const root = await getRoot(value, secret, salt, nullifier, indices, siblings);

        const inputsA = {
            nullifier: toHex(nullifier),
            merkle_proof_length: depth,
            expected_merkle_root: toHex(root),
            recipient: toHex(recipientA),
            commitment: toHex(commitment),
            value: toHex(value),
            pk_b: toHex(secret),
            random: toHex(salt),
            merkle_proof_indices: indices,
            merkle_proof_siblings: siblings.map(toHex),
        };

        const inputsB = { ...inputsA, recipient: toHex(recipientB) };

        const { witness: wA } = await noir.execute(inputsA as any);
        const { witness: wB } = await noir.execute(inputsB as any);

        // Witness/proof material must differ if recipient public input changes
        expect(JSON.stringify(wA)).not.toBe(JSON.stringify(wB));
    });

    test("Withdraw Circuit - Invalid Commitment", async () => {
        const noir = new Noir(withdrawArtifact as any);

        const value = 500n;
        const secret = 0xabc123n;
        const salt = 0xdef456n;
        const recipient = 0x789n;

        const nullifier = await getNullifierHash(value, secret, salt);
        const commitment = await getCommitment(value, nullifier);

        const depth = 10;
        const siblings = new Array(depth).fill(0n);
        const indices = new Array(depth).fill(0);
        const root = await getRoot(value, secret, salt, nullifier, indices, siblings);

        const inputs = {
            nullifier: toHex(nullifier),
            merkle_proof_length: depth,
            expected_merkle_root: toHex(root),
            recipient: toHex(recipient),
            commitment: toHex(0xdeadbeefn), // Wrong commitment
            value: toHex(value),
            pk_b: toHex(secret),
            random: toHex(salt),
            merkle_proof_indices: indices,
            merkle_proof_siblings: siblings.map(toHex),
        };

        expect(noir.execute(inputs as any)).rejects.toThrow();
    });

    test("Withdraw Circuit - Proof generates and verifies end-to-end", async () => {
        const depth = 10;
        const value = 500n;
        const secret = 0xabc123n;
        const salt = 0xdef456n;
        const recipient = 0x789n;

        const nullifier = await getNullifierHash(value, secret, salt);
        const commitment = await getCommitment(value, nullifier);
        const siblings = new Array(depth).fill(0n);
        const indices = new Array(depth).fill(0);
        const root = await getRoot(value, secret, salt, nullifier, indices, siblings);

        const inputs = {
            nullifier: toHex(nullifier),
            merkle_proof_length: depth,
            expected_merkle_root: toHex(root),
            recipient: toHex(recipient),
            commitment: toHex(commitment),
            value: toHex(value),
            pk_b: toHex(secret),
            random: toHex(salt),
            merkle_proof_indices: indices,
            merkle_proof_siblings: siblings.map(toHex),
        };

        const noir = new Noir(withdrawArtifact as any);
        const { witness } = await noir.execute(inputs as any);

        const decompressedWitness = decompressSync(witness);
        expect(decompressedWitness.length).toBeGreaterThan(0);

        const backend = new UltraHonkBackend((withdrawArtifact as any).bytecode, { threads: 1 }, { recursive: false });
        await backend.instantiate();

        const proof = await backend.generateProof(witness);
        expect(proof.proof.length).toBeGreaterThan(0);
        expect(Array.isArray(proof.publicInputs)).toBe(true);

        const verified = await backend.verifyProof(proof);
        expect(verified).toBe(true);

        const tampered = { ...proof, publicInputs: [...proof.publicInputs] };
        tampered.publicInputs[3] = toHex(0x555n); // recipient mismatch should invalidate proof

        const tamperedVerified = await backend.verifyProof(tampered as any);
        expect(tamperedVerified).toBe(false);

        await backend.destroy();
    }, 20000);
});
