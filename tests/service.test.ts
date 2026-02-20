import { expect, test, describe, beforeAll } from "bun:test";
import { ZKService, type Note } from "../packages/vite/lib/services/ZKService.js";
import noteGeneratorArtifact from "../packages/noir/target/note_generator.json" with { type: "json" };
import withdrawArtifact from "../packages/noir/target/withdraw.json" with { type: "json" };
import rootHelperArtifact from "../packages/noir/target/root_helper.json" with { type: "json" };

describe("ZKService Tests", () => {
    let service: ZKService;

    beforeAll(async () => {
        service = new ZKService();
        await service.init();
    });

    test("generateNote should correctly execute note_generator and return Note object", async () => {
        const value = 100n;
        const secret = 0xabc123n;
        const nullifier = 0xdef456n;

        const note = await service.generateNote(noteGeneratorArtifact as any, value, secret, nullifier);

        expect(note.value).toBe(value);
        expect(note.secret).toBe(secret);
        expect(note.nullifier).toBe(nullifier);
        expect(note.nullifierHash).toBeDefined();
        expect(note.commitment).toBeDefined();
        expect(note.entry).toBeDefined();
        expect(note.root).toBeDefined();
    });

    test("generateWithdrawProof should execute withdraw circuit successfully", async () => {
        const value = 500n;
        const secret = 0xabc123n;
        const nullifier = 0xdef456n;
        const recipient = 0x789n;

        const note = await service.generateNote(noteGeneratorArtifact as any, value, secret, nullifier);

        // Simple Merkle Tree (depth 10, all zeros except leaf at index 0)
        const depth = 10;
        const merkleProof = {
            indices: new Array(depth).fill(0),
            siblings: new Array(depth).fill(0n)
        };

        // Compute depth-10 root using helper circuit
        const result = await service.executeCircuit(rootHelperArtifact as any, {
            secret: note.secret,
            nullifier: note.nullifier,
            value: note.value,
            merkle_proof_indices: merkleProof.indices,
            merkle_proof_siblings: merkleProof.siblings
        });
        const merkleRoot = BigInt(result as string);

        const { witness } = await service.generateWithdrawProof(
            withdrawArtifact as any,
            note,
            recipient,
            merkleRoot,
            merkleProof
        );

        expect(witness).toBeDefined();
    });

    test("generateWithdrawProof should fail with invalid commitment", async () => {
        const value = 500n;
        const secret = 0xabc123n;
        const nullifier = 0xdef456n;

        const note = await service.generateNote(noteGeneratorArtifact as any, value, secret, nullifier);

        // Corrupt the note (this will fail the commitment check in the circuit)
        const corruptedNote: Note = { ...note, secret: 0xdeadbeefn };

        const depth = 10;
        const merkleProof = {
            indices: new Array(depth).fill(0),
            siblings: new Array(depth).fill(0n)
        };

        // Use helper to get a valid root for the ORIGINAL note
        const res = await service.executeCircuit(rootHelperArtifact as any, {
            secret: note.secret,
            nullifier: note.nullifier,
            value: note.value,
            merkle_proof_indices: merkleProof.indices,
            merkle_proof_siblings: merkleProof.siblings
        });
        const validRoot = BigInt(res as string);

        expect(service.generateWithdrawProof(
            withdrawArtifact as any,
            corruptedNote,
            0x123n,
            validRoot,
            merkleProof
        )).rejects.toThrow();
    });
});
