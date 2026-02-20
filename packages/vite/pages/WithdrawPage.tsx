import React, { useState } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import './WithdrawPage.css';

export function WithdrawPage() {
    const [note, setNote] = useState('zkvvm-note-...');
    const [address, setAddress] = useState('0x...');

    const handleWithdraw = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Withdrawing note', note, 'to', address);
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
                                <li>Verifying Merkle membership proof</li>
                                <li>Checking Nullifier non-existence</li>
                                <li>Obscuring transaction linkability</li>
                            </ul>
                        </div>

                        <button type="submit" className="btn-primary submit-btn fade-in-up delay-4">
                            Generate Proof & Withdraw ⚡
                        </button>
                    </form>
                </div>
            </WalletGuard>
        </div>
    );
}
