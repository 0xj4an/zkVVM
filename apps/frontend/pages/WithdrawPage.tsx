import React, { useState, useEffect } from 'react';
import { bytesToHex, keccak256, encodePacked } from 'viem';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend } from '@aztec/bb.js';
import { WalletGuard } from '../components/WalletGuard.js';
import { useDeposit } from '../hooks/useDeposit.js';
import { loadNote, markNoteClaimed, NoteData } from '../lib/note.js';
import { formatUsdcAmount } from '../lib/usdc.js';
import { getCircuit } from '../../../circuits/compile.js';
import { toast } from 'react-toastify';
import './WithdrawPage.css';

function parseNoteJson(raw: string): NoteData | null {
    try {
        const obj = JSON.parse(raw);
        if (!obj.nullifier || !obj.commitment || !obj.expected_merkle_root) return null;
        return obj as NoteData;
    } catch {
        return null;
    }
}

export function WithdrawPage() {
    const {
        address: walletAddress,
        withdrawV2b,
        isNullifierSpent,
        isPending,
        isSuccess,
        error,
        txHash,
    } = useDeposit();

    const [recipient, setRecipient] = useState('');
    const [isProving, setIsProving] = useState(false);
    const [proofStep, setProofStep] = useState('');
    const [claimedValue, setClaimedValue] = useState<bigint | null>(null);

    // Note source: localStorage or pasted JSON
    const [noteInput, setNoteInput] = useState('');
    const [noteSource, setNoteSource] = useState<'local' | 'paste'>('paste');
    const localNote = loadNote();

    // Resolve the active note based on source
    const activeNote: NoteData | null =
        noteSource === 'local' ? localNote : parseNoteJson(noteInput);

    // Default recipient to connected wallet
    useEffect(() => {
        if (walletAddress && !recipient) setRecipient(walletAddress);
    }, [walletAddress]);

    useEffect(() => {
        if (isSuccess && txHash) {
            markNoteClaimed(txHash);
            const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
            const valueStr = claimedValue ? formatUsdcAmount(claimedValue) + ' USDC' : 'funds';
            toast.success(
                <span>
                    Claimed {valueStr} successfully!{' '}
                    <a href={explorerUrl} target="_blank" rel="noopener" style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>
                        View transaction
                    </a>
                </span>,
                { autoClose: false },
            );
        }
    }, [isSuccess, txHash]);
    useEffect(() => {
        if (error) toast.error(error.message);
    }, [error]);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        const note = activeNote;
        if (!note) {
            toast.error(noteSource === 'paste' ? 'Invalid note JSON. Paste a valid zkVVM note.' : 'No saved note found. Deposit first.');
            return;
        }
        if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
            toast.error('Invalid recipient address');
            return;
        }

        setIsProving(true);
        const toastId = toast.loading('Checking nullifier...');
        try {
            // Pre-check: is nullifier already spent on-chain?
            const spent = await isNullifierSpent(note.nullifier as `0x${string}`);
            if (spent) {
                markNoteClaimed('unknown');
                toast.update(toastId, {
                    render: 'This note has already been redeemed on-chain.',
                    type: 'error',
                    isLoading: false,
                    autoClose: false,
                });
                setIsProving(false);
                setProofStep('');
                return;
            }

            // Load withdraw circuit
            setProofStep('Loading circuit...');
            toast.update(toastId, { render: 'Generating ZK proof...' });
            const circuit = await getCircuit();
            const backend = new UltraPlonkBackend(circuit.bytecode);
            const noir = new Noir(circuit);
            await noir.init();

            // Prepare inputs
            const recipientPadded = ('0x' + '0'.repeat(24) + recipient.slice(2).toLowerCase()) as `0x${string}`;
            const inputs: Record<string, string | number | number[] | string[]> = {
                nullifier: note.nullifier,
                merkle_proof_length: note.merkle_proof_length.toString(),
                expected_merkle_root: note.expected_merkle_root,
                recipient: recipientPadded,
                commitment: note.commitment,
                value: '0x' + BigInt(note.value).toString(16),
                pk_b: '0x' + BigInt(note.pk_b).toString(16),
                random: '0x' + BigInt(note.random).toString(16),
                merkle_proof_indices: note.merkle_proof_indices,
                merkle_proof_siblings: note.merkle_proof_siblings,
            };

            // Execute circuit
            setProofStep('Executing circuit...');
            toast.update(toastId, { render: 'Executing circuit...' });
            const { witness } = await noir.execute(inputs);

            // Generate proof
            setProofStep('Generating proof...');
            toast.update(toastId, { render: 'Generating proof...' });
            const proofData = await backend.generateProof(witness);

            toast.update(toastId, {
                render: 'Proof generated. Submitting withdrawal...',
                isLoading: false,
                type: 'info',
                autoClose: 3000,
            });

            // Handle public inputs (bb.js may omit u32 fields)
            const proofPublicInputs = proofData.publicInputs as `0x${string}`[];
            let publicInputs: `0x${string}`[];
            if (proofPublicInputs.length === 4) {
                const merkleProofLengthHex = `0x${BigInt(note.merkle_proof_length).toString(16).padStart(64, '0')}` as `0x${string}`;
                publicInputs = [
                    proofPublicInputs[0],
                    merkleProofLengthHex,
                    proofPublicInputs[1],
                    proofPublicInputs[2],
                    proofPublicInputs[3],
                ];
            } else {
                publicInputs = [...proofPublicInputs];
            }

            // Generate ciphertext
            setProofStep('Submitting...');
            const nullifierHex = publicInputs[0];
            const recipientHex = publicInputs[3];
            const POOL_SALT = keccak256(encodePacked(['string'], ['ShieldedPool.v2b']));
            const key = keccak256(encodePacked(
                ['bytes32', 'bytes32', 'bytes32'],
                [nullifierHex, recipientHex, POOL_SALT],
            ));
            const stream = keccak256(encodePacked(['bytes32', 'uint256'], [key, 0n]));
            const pad32 = (v: bigint) => ('0x' + v.toString(16).padStart(64, '0')) as `0x${string}`;
            const ciphertext = pad32(BigInt(note.value) ^ BigInt(stream));

            const proofHex = bytesToHex(proofData.proof);
            setClaimedValue(BigInt(note.value));
            withdrawV2b(proofHex, publicInputs, ciphertext);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Proof generation failed';
            toast.update(toastId, {
                render: msg,
                type: 'error',
                isLoading: false,
                autoClose: 5000,
            });
        } finally {
            setIsProving(false);
            setProofStep('');
        }
    };

    const pasteIsValid = noteSource === 'paste' && noteInput.length > 0 && !!parseNoteJson(noteInput);
    const pasteIsInvalid = noteSource === 'paste' && noteInput.length > 0 && !parseNoteJson(noteInput);

    return (
        <div className="withdraw-container page-container">
            <WalletGuard>
                <div className="glass-panel withdraw-card fade-in-up">
                    <div className="withdraw-header">
                        <h2>Redeem zkVVM Notes</h2>
                        <p>Redeem your shielded commitment via ZK-Proof verification.</p>
                    </div>

                    <form className="withdraw-form" onSubmit={handleWithdraw}>
                        <div className="input-group full-width fade-in-up delay-1">
                            <label>ZKVVM NOTE</label>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setNoteSource('local')}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: `1px solid ${noteSource === 'local' ? 'var(--accent-color)' : 'var(--panel-border)'}`,
                                        background: noteSource === 'local' ? 'rgba(0, 255, 170, 0.1)' : 'transparent',
                                        color: noteSource === 'local' ? 'var(--accent-color)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        fontFamily: 'inherit',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {localNote ? '● Browser Note' : '○ No Local Note'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNoteSource('paste')}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: `1px solid ${noteSource === 'paste' ? 'var(--accent-color)' : 'var(--panel-border)'}`,
                                        background: noteSource === 'paste' ? 'rgba(0, 255, 170, 0.1)' : 'transparent',
                                        color: noteSource === 'paste' ? 'var(--accent-color)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        fontFamily: 'inherit',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    Paste Note JSON
                                </button>
                            </div>

                            {noteSource === 'local' && (
                                <div style={{
                                    background: localNote ? 'rgba(0, 255, 170, 0.05)' : 'rgba(255, 85, 85, 0.05)',
                                    border: `1px solid ${localNote ? 'rgba(0, 255, 170, 0.15)' : 'rgba(255, 85, 85, 0.15)'}`,
                                    borderRadius: '8px',
                                    padding: '12px 16px',
                                    fontSize: '13px',
                                }}>
                                    {localNote
                                        ? <><span style={{ color: 'var(--accent-color)' }}>●</span> Shielded note loaded &mdash; ready to redeem</>
                                        : <><span style={{ color: 'var(--error-color)' }}>●</span> No note in browser. Deposit first or paste a note.</>
                                    }
                                </div>
                            )}

                            {noteSource === 'paste' && (
                                <>
                                    <textarea
                                        className="input-field"
                                        rows={4}
                                        value={noteInput}
                                        onChange={(e) => setNoteInput(e.target.value)}
                                        placeholder='Paste zkVVM note JSON here...'
                                        style={{
                                            resize: 'vertical',
                                            fontFamily: 'monospace',
                                            fontSize: '12px',
                                            borderColor: pasteIsInvalid ? 'var(--error-color)' : pasteIsValid ? 'var(--accent-color)' : undefined,
                                        }}
                                    />
                                    {pasteIsValid && (
                                        <div style={{ fontSize: '11px', color: 'var(--accent-color)', marginTop: '4px' }}>
                                            ● Valid note detected
                                        </div>
                                    )}
                                    {pasteIsInvalid && (
                                        <div style={{ fontSize: '11px', color: 'var(--error-color)', marginTop: '4px' }}>
                                            ● Invalid JSON format
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="input-group full-width fade-in-up delay-2">
                            <label>DESTINATION ADDRESS</label>
                            <input
                                type="text"
                                className="input-field"
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                                placeholder="0x..."
                            />
                        </div>

                        <div className="proof-logic-box fade-in-up delay-3">
                            <div className="proof-logic-header">
                                <span className="proof-icon">&#9871;</span> ZK PROOF LOGIC
                            </div>
                            <ul className="proof-logic-list">
                                <li className={proofStep === 'Loading circuit...' ? 'active' : proofStep && proofStep !== 'Loading circuit...' ? 'done' : ''}>
                                    Verifying Merkle membership proof
                                </li>
                                <li className={proofStep === 'Executing circuit...' ? 'active' : proofStep === 'Generating proof...' || proofStep === 'Submitting...' ? 'done' : ''}>
                                    Checking Nullifier non-existence
                                </li>
                                <li className={proofStep === 'Generating proof...' ? 'active' : proofStep === 'Submitting...' ? 'done' : ''}>
                                    Obscuring transaction linkability
                                </li>
                            </ul>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary submit-btn fade-in-up delay-4"
                            disabled={isPending || isProving || !activeNote}
                        >
                            {isProving ? proofStep || 'Proving...' : isPending ? 'Confirming...' : 'Generate Proof & Withdraw'}
                        </button>
                    </form>
                </div>
            </WalletGuard>
        </div>
    );
}
