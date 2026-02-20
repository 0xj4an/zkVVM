import { expect, test, describe } from "bun:test";
import { Noir } from "@noir-lang/noir_js";
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
    const getNullifierHash = async (nullifier: bigint): Promise<bigint> => {
        const noir = new Noir(nullifierHelperArtifact as any);
        const { returnValue } = await noir.execute({ nullifier: toHex(nullifier) });
        return toBigInt(returnValue);
    };

    const getCommitment = async (secret: bigint, nullifier: bigint, value: bigint): Promise<bigint> => {
        const noir = new Noir(commitmentHelperArtifact as any);
        const { returnValue } = await noir.execute({
            secret: toHex(secret),
            nullifier: toHex(nullifier),
            value: toHex(value)
        });
        return toBigInt(returnValue);
    };

    const getRoot = async (
        secret: bigint,
        nullifier: bigint,
        value: bigint,
        indices: number[],
        siblings: bigint[]
    ): Promise<bigint> => {
        const noir = new Noir(rootHelperArtifact as any);
        const { returnValue } = await noir.execute({
            secret: toHex(secret),
            nullifier: toHex(nullifier),
            value: toHex(value),
            merkle_proof_indices: indices,
            merkle_proof_siblings: siblings.map(toHex),
        });
        return toBigInt(returnValue);
    };

    test("Note Generator Circuit", async () => {
        const noir = new Noir(noteGeneratorArtifact as any);
        const inputs = {
            secret: 0xabc123n,
            nullifier: 0xdef456n,
            value: 100n,
        };

        const { returnValue } = await noir.execute({
            secret: toHex(inputs.secret),
            nullifier: toHex(inputs.nullifier),
            value: toHex(inputs.value),
        });
        const result = returnValue as any[];

        const expectedNullifierHash = await getNullifierHash(inputs.nullifier);
        const expectedCommitment = await getCommitment(inputs.secret, inputs.nullifier, inputs.value);

        expect(toBigInt(result[0])).toBe(expectedNullifierHash);
        expect(toBigInt(result[1])).toBe(expectedCommitment);
    });

    test("Withdraw Circuit - Valid Proof", async () => {
        const noir = new Noir(withdrawArtifact as any);

        const secret = 0xabc123n;
        const nullifier = 0xdef456n;
        const value = 500n;
        const recipient = 0x789n;

        const nullifierHash = await getNullifierHash(nullifier);
        const commitment = await getCommitment(secret, nullifier, value);

        const depth = 10;
        const siblings = new Array(depth).fill(0n);
        const indices = new Array(depth).fill(0);

        const root = await getRoot(secret, nullifier, value, indices, siblings);

        const inputs = {
            root: toHex(root),
            nullifierHash: toHex(nullifierHash),
            recipient: toHex(recipient),
            value: toHex(value),
            secret: toHex(secret),
            nullifier: toHex(nullifier),
            path_indices: indices,
            path_siblings: siblings.map(toHex),
        };

        const { witness } = await noir.execute(inputs as any);
        expect(witness).toBeDefined();
    });

    test("Withdraw Circuit - Invalid Commitment", async () => {
        const noir = new Noir(withdrawArtifact as any);

        const secret = 0xabc123n;
        const nullifier = 0xdef456n;
        const value = 500n;
        const recipient = 0x789n;

        const nullifierHash = await getNullifierHash(nullifier);
        const commitment = 0xdeadbeefn; // Wrong

        const depth = 10;
        const siblings = new Array(depth).fill(0n);
        const indices = new Array(depth).fill(0);
        const root = await getRoot(secret, nullifier, value, indices, siblings); // Valid root for secret/nullifier/value

        const inputs = {
            root: toHex(root),
            nullifierHash: toHex(nullifierHash),
            recipient: toHex(recipient),
            value: toHex(value),
            secret: toHex(0xdeadn), // Wrong secret
            nullifier: toHex(nullifier),
            path_indices: indices,
            path_siblings: siblings.map(toHex),
        };

        expect(noir.execute(inputs as any)).rejects.toThrow();
    });
});
