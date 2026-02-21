import React, { useState } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useZK } from '../lib/hooks/useZK';
import './WithdrawPage.css';

export function WithdrawPage() {
    const { generateWithdrawalProof, isProving, provingError } = useZK();
    const [note, setNote] = useState('');
    const [address, setAddress] = useState('');
    const [success, setSuccess] = useState(false);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccess(false);
        try {
            console.log('Generating proof for note', note, 'to', address);
            const proof = await generateWithdrawalProof(note, address);
            console.log('Withdrawal proof generated:', proof);
            setSuccess(true);
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
                                ZK Proof generated successfully! (On-chain withdrawal skipped for now)
                            </div>
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
