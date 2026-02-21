import React, { useState, useEffect } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useZK, StoredNote } from '../lib/hooks/useZK';
import './DashboardPage.css';

export function DashboardPage() {
    const [amount, setAmount] = useState('100.00');
    const [notes, setNotes] = useState<StoredNote[]>([]);
    const [showToast, setShowToast] = useState(false);
    const { mintBearerToken, getStoredNotes, copyNote, isInitializing } = useZK();

    useEffect(() => {
        setNotes(getStoredNotes());
    }, [getStoredNotes]);

    const handleMint = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await mintBearerToken(amount);
            setNotes(getStoredNotes());
        } catch (err) {
            console.error('Failed to mint:', err);
        }
    };

    const handleCopy = async (noteStr: string) => {
        await copyNote(noteStr);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
    };

    return (
        <div className="dashboard-container page-container">
            <WalletGuard>
                <div className="glass-panel deposit-card fade-in-up">
                    <div className="deposit-header flex-between">
                        <div>
                            <h2>DEPOSIT</h2>
                            <p>Mint a new anonymous bearer note.</p>
                        </div>
                        <div className="plus-icon">+</div>
                    </div>

                    <form className="deposit-form" onSubmit={handleMint}>
                        <div className="form-group-row">
                            <div className="input-group">
                                <label>AMOUNT</label>
                                <input
                                    type="text"
                                    className="input-field amount-input"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary submit-btn"
                            disabled={isInitializing}
                        >
                            {isInitializing ? 'INITIALIZING ZK...' : 'MINT BEARER NOTE ⚡'}
                        </button>
                    </form>
                </div>

                <div className="vault-section fade-in-up delay-1">
                    <div className="vault-header flex-between">
                        <h3>YOUR LOCAL VAULT</h3>
                        <span className="vault-subtitle">&#10003; KEYS STORED IN BROWSER SESSION</span>
                    </div>

                    <div className="vault-table glass-panel">
                        <div className="table-row table-header">
                            <div>DATE</div>
                            <div>VALUE</div>
                            <div className="align-right">SECRET CODE</div>
                        </div>
                        {notes.length === 0 ? (
                            <div className="table-row">
                                <div className="text-secondary" style={{ textAlign: 'center', width: '100%' }}>
                                    No notes found in your local vault.
                                </div>
                            </div>
                        ) : (
                            notes.map((note, i) => (
                                <div className="table-row" key={i}>
                                    <div className="text-secondary">{note.date}</div>
                                    <div><strong>{note.amount}</strong> <span className="text-secondary">USDC</span></div>
                                    <div className="align-right">
                                        <button
                                            className="btn-icon copy-btn"
                                            onClick={() => handleCopy(note.noteStr)}
                                        >
                                            &#128190; COPY KEY
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </WalletGuard>

            {showToast && (
                <div className="toast-notification fade-in-up">
                    <span className="toast-icon">&#10003;</span>
                    Note string copied to clipboard!
                </div>
            )}
        </div>
    );
}
