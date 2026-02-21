import React, { useState } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useZK } from '../lib/hooks/useZK';
import useEvvm from '../lib/hooks/useEvvm';
import { createZkVVMService } from '../lib/services/zkVVM';
import { execute } from '@evvm/evvm-js';
import './WithdrawPage.css';

export function WithdrawPage() {
    const { generateWithdrawalProof, isProving, provingError } = useZK();
    const { signer, publicClient, address: userAddress } = useEvvm();
    const [note, setNote] = useState('');
    const [address, setAddress] = useState('');
    const [success, setSuccess] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccess(false);
        setTxHash(null);
        try {
            console.log('Generating proof for note', note, 'to', address);
            const result: any = await generateWithdrawalProof(note, address);
            console.log('Withdrawal proof generated:', result);

            // try to extract proof and publicInputs from different possible shapes
            const proof: string | undefined = result?.proof || result?.returnValue?.proof || result?.witness?.proof;
            const publicInputs: any[] | undefined = result?.publicInputs || result?.returnValue?.publicInputs || result?.returnValue;

            if (!proof || !publicInputs) {
                // No proof/publicInputs available — only witness produced. Stop here.
                setSuccess(true);
                return;
            }

            if (!signer) throw new Error('No EVVM signer available');
            if (!publicClient) throw new Error('No public client available');

            // create service and generate random nonce
            const service = createZkVVMService(signer);
            const randomNonce = BigInt(crypto.getRandomValues(new Uint8Array(32)).reduce((acc, val) => acc * 256n + BigInt(val), 0n));

            // build signed action
            const signedAction = await service.withdraw({ proof, publicInputs, nonce: randomNonce });

            // execute the signed action on-chain
            setIsExecuting(true);
            const tx = await execute(signer, signedAction as any);
            setTxHash(tx as string);
            setSuccess(true);
            setIsExecuting(false);
        } catch (err) {
            console.error('Withdrawal failed:', err);
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

                    <form className="withdraw-form" onSubmit={handleWithdraw}>
                        <div className="input-group full-width fade-in-up delay-1">
                            <label>ZKVVM NOTE</label>
                            <input
                                type="text"
                                className="input-field"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>

                        <div className="input-group full-width fade-in-up delay-2">
                            <label>DESTINATION ADDRESS</label>
                            <input
                                type="text"
                                className="input-field"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                            />
                        </div>

                        <div className="proof-logic-box fade-in-up delay-3">
                            <div className="proof-logic-header">
                                <span className="proof-icon">&#9871;</span> ZK PROOF LOGIC
                            </div>
                            <ul className="proof-logic-list">
                                <li className={isProving ? 'processing' : ''}>Verifying Merkle membership proof</li>
                                <li className={isProving ? 'processing' : ''}>Checking Nullifier non-existence</li>
                                <li className={isProving ? 'processing' : ''}>Obscuring transaction linkability</li>
                            </ul>
                        </div>

                        {provingError && (
                            <div className="error-message fade-in">
                                {provingError}
                            </div>
                        )}

                        {success && (
                            <div className="success-message fade-in">
                                ZK Proof generated successfully!{txHash ? ` Tx: ${txHash}` : ' (On-chain withdrawal skipped for now)'}
                            </div>
                        )}

                        {isExecuting && (
                            <div className="info-message fade-in">Executing on-chain transaction...</div>
                        )}

                        <button
                            type="submit"
                            className="btn-primary submit-btn fade-in-up delay-4"
                            disabled={isProving || !note || !address}
                        >
                            {isProving ? 'Generating ZK Proof...' : 'Generate Proof & Withdraw ⚡'}
                        </button>
                    </form>
                </div>
            </WalletGuard>
        </div>
    );
}
