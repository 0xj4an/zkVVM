import { useState, useCallback, useEffect } from 'react';
import { zkService, type Note } from '../services/ZKService';
import noteGeneratorArtifact from '../../../noir/target/note_generator.json';
import withdrawArtifact from '../../../noir/target/withdraw.json';
import { CompiledCircuit } from '@noir-lang/types';
import { computeCiphertext } from '../../../../lib/withdraw-v2b-ciphertext';

export interface StoredNote {
    amount: string;
    secret: string;
    salt: string;
    date: string;
    noteStr: string;
}

export function useZK() {
    const [isInitializing, setIsInitializing] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isProving, setIsProving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [provingError, setProvingError] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            if (isInitialized || isInitializing) return;
            setIsInitializing(true);
            try {
                await zkService.init();
                setIsInitialized(true);
            } catch (err: any) {
                setError(err.message || 'Failed to initialize ZKService');
            } finally {
                setIsInitializing(false);
            }
        };
        init();
    }, [isInitialized, isInitializing]);

    const mintBearerToken = useCallback(async (amount: string): Promise<StoredNote> => {
        try {
            const value = BigInt(Math.floor(parseFloat(amount) * 1e18)); // Assuming 6 decimals for USDC-like
            const secret = zkService.generateSecret();
            const salt = zkService.generateSecret();

            const note = await zkService.generateNote(
                noteGeneratorArtifact as CompiledCircuit,
                value,
                secret,
                salt
            );

            // note.entry is to be stored in the smart contract (commitment)
            console.log(`Entry: ${note.entry.toString()}`)

            const secret_hex = `0x${secret.toString(16)}`;
            const salt_hex = `0x${salt.toString(16)}`;
            const noteStr = `zk-${amount}-${secret_hex}-${salt_hex}`;

            const storedNote: StoredNote = {
                amount,
                secret: secret_hex,
                salt: salt_hex,
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                noteStr
            };

            // Save to localStorage
            const existing = JSON.parse(localStorage.getItem('zk-notes') || '[]');
            localStorage.setItem('zk-notes', JSON.stringify([storedNote, ...existing]));

            return storedNote;
        } catch (err: any) {
            setError(err.message || 'Failed to mint bearer token');
            throw err;
        }
    }, []);

    const getStoredNotes = useCallback((): StoredNote[] => {
        try {
            return JSON.parse(localStorage.getItem('zk-notes') || '[]');
        } catch {
            return [];
        }
    }, []);

    const copyNote = useCallback(async (noteStr: string) => {
        try {
            await navigator.clipboard.writeText(noteStr);
        } catch (err: any) {
            setError('Failed to copy to clipboard');
        }
    }, []);

    const generateWithdrawalProof = useCallback(async (noteStr: string, recipient: string) => {
        if (!isInitialized) throw new Error('ZKService not initialized');

        setIsProving(true);
        setProvingError(null);

        try {
            // 1. Parse note string
            const { amount, secret, salt } = zkService.parseNoteString(noteStr);

            // 2. Recompute note
            const note = await zkService.recomputeNote(
                noteGeneratorArtifact as CompiledCircuit,
                amount,
                secret,
                salt
            );

            // 3. Mock Merkle Proof (Circuit expects depth 10, but we provide length 1)
            // note.root from note_generator is H(entry, 0), which is a valid depth-1 proof.
            const mockMerkleProof = {
                indices: new Array(10).fill(0),
                siblings: new Array(10).fill(0n)
            };

            // Store public inputs (from the circuit's pub inputs in order)
            // From withdraw.nr: nullifier, merkle_proof_length, expected_merkle_root, recipient, commitment
            const merkleProofLength = 1n; // depth processed in this mock proof
            const recipientField = BigInt(recipient);

            const publicInputs = [
                note.nullifier,
                merkleProofLength, // merkle_proof_length
                note.root, // expected_merkle_root
                recipientField,
                note.commitment
            ];

            console.log('Circuit public inputs:', {
                nullifier: note.nullifier.toString(),
                merkle_proof_length: 1,
                expected_merkle_root: note.root.toString(),
                recipient: recipient,
                commitment: note.commitment.toString()
            });

            // 4. Generate Witness using Noir (merkle_proof_length = 1)
            const witnessResult = await zkService.generateWithdrawProof(
                withdrawArtifact as CompiledCircuit,
                note,
                recipientField,
                note.root,
                mockMerkleProof,
                Number(merkleProofLength) // Only process the first level
            );

            console.log('Witness generated successfully:', witnessResult);

            // 5. Generate proof representation from witness
            const { witness } = witnessResult;
            if (!witness) {
                throw new Error('No witness generated from circuit');
            }

            console.log('Converting witness to proof...');
            const proofData = await zkService.generateProofFromWitness(
                withdrawArtifact as CompiledCircuit,
                witness
            );

            console.log('Proof generated:', { proofLength: proofData.proof.length });
            
            // Convert proof to hex (it's already hex from generateProofFromWitness)
            const proofHex = proofData.proof;

            // Convert public inputs to hex strings
            const publicInputsHex = publicInputs.map((pi: bigint) => {
              return '0x' + pi.toString(16).padStart(64, '0');
            });

            // Compute ciphertext for contract consumption (amount is private in the proof)
            const nullifierHex = publicInputsHex[0] as `0x${string}`;
            const recipientFieldHex = publicInputsHex[3] as `0x${string}`;
            const ciphertext = computeCiphertext(note.value, nullifierHex, recipientFieldHex);

            console.log('Public inputs (hex):', publicInputsHex);

            console.log('Converted proof to hex, length:', proofHex.length);
            console.log('Converted public inputs:', publicInputsHex);
            
            return {
                proof: proofHex,
                publicInputs: publicInputsHex,
                ciphertext
            };
        } catch (err: any) {
            const msg = err.message || 'Failed to generate withdrawal proof';
            setProvingError(msg);
            throw err;
        } finally {
            setIsProving(false);
        }
    }, [isInitialized]);

    const getOnchainStatus = useCallback(async (noteStr: string, publicClient: any) => {
        if (!isInitialized) throw new Error('ZKService not initialized');
        const { amount, secret, salt } = zkService.parseNoteString(noteStr);
        const note = await zkService.recomputeNote(
            noteGeneratorArtifact as CompiledCircuit,
            amount,
            secret,
            salt
        );

        // use publicClient to query on-chain commitment/nullifier status
        try {
            const commitmentHex = `0x${note.entry.toString(16)}`;
            const nullifierHex = `0x${note.nullifier.toString(16)}`;
            const zkVVMAddress = (import.meta.env.VITE_ZKVVM_ADDRESS || '0x0000000000000000000000000000000000000000') as string;
            const zkVVMAbi = (await import('../../../artifacts/contracts/zkVVM.sol/zkVVM.json')).abi as any;
            const committed = await publicClient.readContract({ address: zkVVMAddress, abi: zkVVMAbi, functionName: 'commitments', args: [commitmentHex] });
            const nullifierUsed = await publicClient.readContract({ address: zkVVMAddress, abi: zkVVMAbi, functionName: 'nullifiers', args: [nullifierHex] });
            return { committed, nullifierUsed, commitment: commitmentHex, nullifier: nullifierHex, root: note.root };
        } catch (err: any) {
            throw err;
        }
    }, [isInitialized]);

    return {
        isInitialized,
        isInitializing,
        isProving,
        error,
        provingError,
        mintBearerToken,
        getStoredNotes,
        copyNote,
        generateWithdrawalProof
        , getOnchainStatus
    };
}
