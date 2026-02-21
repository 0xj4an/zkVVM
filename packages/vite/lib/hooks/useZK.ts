import { useState, useCallback, useEffect } from 'react';
import { zkService, type Note } from '../services/ZKService';
import noteGeneratorArtifact from '../../../noir/target/note_generator.json';
import withdrawArtifact from '../../../noir/target/withdraw.json';
import { CompiledCircuit } from '@noir-lang/types';

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
            const value = BigInt(Math.floor(parseFloat(amount) * 1e6)); // Assuming 6 decimals for USDC-like
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
