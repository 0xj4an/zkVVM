import React, { useState, useEffect } from 'react';
import { bytesToHex, keccak256, encodePacked } from 'viem';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend } from '@aztec/bb.js';
import { WalletGuard } from '../components/WalletGuard.js';
import { useDeposit } from '../hooks/useDeposit.js';
import { loadNote } from '../lib/note.js';
import { formatUsdcAmount } from '../lib/usdc.js';
import { getCircuit } from '../../noir/compile.js';
import { toast } from 'react-toastify';
import './WithdrawPage.css';

export function WithdrawPage() {
    const {
        address: walletAddress,
        withdrawV2b,
        isPending,
        isSuccess,
        error,
    } = useDeposit();

    const [recipient, setRecipient] = useState('');
    const [isProving, setIsProving] = useState(false);
    const [proofStep, setProofStep] = useState('');

    const savedNote = loadNote();

    // Default recipient to connected wallet
    useEffect(() => {
        if (walletAddress && !recipient) setRecipient(walletAddress);
    }, [walletAddress]);

    useEffect(() => {
        if (isSuccess) toast.success('Withdrawal confirmed!');
    }, [isSuccess]);
    useEffect(() => {
        if (error) toast.error(error.message);
    }, [error]);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        const note = savedNote;
        if (!note) {
            toast.error('No saved note found. Deposit first.');
            return;
        }
        if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
            toast.error('Invalid recipient address');
            return;
        }

        setIsProving(true);
        const toastId = toast.loading('Generating ZK proof...');
        try {
            // Load withdraw circuit
            setProofStep('Loading circuit...');
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

    return (
        <div className="withdraw-container page-container">
            <WalletGuard>
                <div className="glass-panel withdraw-card fade-in-up">
                    <div className="withdraw-header">
                        <h2>Redeem zkVVM Notes</h2>
                        <p>Redeem your shielded commitment via ZK-Proof verification.</p>
                    </div>

                    {savedNote && (
                        <div className="note-status fade-in-up" style={{
                            background: 'rgba(0, 255, 170, 0.05)',
                            border: '1px solid rgba(0, 255, 170, 0.15)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '24px',
                            fontSize: '13px',
                        }}>
                            Note loaded: <strong>{formatUsdcAmount(BigInt(savedNote.value))} USDC</strong> ready to withdraw
                        </div>
                    )}

                    <form className="withdraw-form" onSubmit={handleWithdraw}>
                        <div className="input-group full-width fade-in-up delay-1">
                            <label>ZKVVM NOTE</label>
                            <input
                                type="text"
                                className="input-field"
                                value={savedNote ? `Note loaded (${formatUsdcAmount(BigInt(savedNote.value))} USDC)` : 'No note found'}
                                disabled
                            />
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
                            disabled={isPending || isProving || !savedNote}
                        >
                            {isProving ? proofStep || 'Proving...' : isPending ? 'Confirming...' : 'Generate Proof & Withdraw'}
                        </button>
                    </form>
                </div>
            </WalletGuard>
        </div>
    );
}
