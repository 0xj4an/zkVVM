import { useState, useCallback, useEffect } from 'react';
import { zkService, type Note } from '../services/ZKService';
import noteGeneratorArtifact from '../../../noir/target/note_generator.json';
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
    const [error, setError] = useState<string | null>(null);

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

    return {
        isInitialized,
        isInitializing,
        error,
        mintBearerToken,
        getStoredNotes,
        copyNote
    };
}
