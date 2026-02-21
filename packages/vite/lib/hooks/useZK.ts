import { useState, useCallback, useEffect } from 'react';
import { zkService, type Note } from '../services/ZKService';
import noteGeneratorArtifact from '../../../noir/target/note_generator.json';
import withdrawArtifact from '../../../noir/target/withdraw.json';
import { CompiledCircuit } from '@noir-lang/types';

export interface StoredNote {
    amount: string;
    pk_b: string;
    random: string;
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
            const value = BigInt(Math.floor(parseFloat(amount) * 1e6)); // Assuming 6 decimals for USDC-like
            const pk_b = zkService.generateSecret();
            const random = zkService.generateSecret();

            const note = await zkService.generateNote(
                noteGeneratorArtifact as CompiledCircuit,
                value,
                pk_b,
                random
            );

            // note.entry is to be stored in the smart contract (commitment)
            console.log(`Entry: ${note.entry.toString()}`)

            const pk_b_hex = `0x${pk_b.toString(16)}`;
            const random_hex = `0x${random.toString(16)}`;
            const noteStr = `zk-${amount}-${pk_b_hex}-${random_hex}`;

            const storedNote: StoredNote = {
                amount,
                pk_b: pk_b_hex,
                random: random_hex,
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
            const { amount, pk_b, random } = zkService.parseNoteString(noteStr);

            // 2. Recompute note
            const note = await zkService.recomputeNote(
                noteGeneratorArtifact as CompiledCircuit,
                amount,
                pk_b,
                random
            );

            // 3. Mock Merkle Proof (Circuit expects depth 10, but we provide length 1)
            // note.root from note_generator is H(entry, 0), which is a valid depth-1 proof.
            const mockMerkleProof = {
                indices: new Array(10).fill(0),
                siblings: new Array(10).fill(0n)
            };

            // 4. Generate Proof (merkle_proof_length = 1)
            const result = await zkService.generateWithdrawProof(
                withdrawArtifact as CompiledCircuit,
                note,
                BigInt(recipient),
                note.root,
                mockMerkleProof,
                1 // Only process the first level
            );

            console.log('Proof generated successfully:', result);
            return result;
        } catch (err: any) {
            const msg = err.message || 'Failed to generate withdrawal proof';
            setProvingError(msg);
            throw err;
        } finally {
            setIsProving(false);
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
    };
}
