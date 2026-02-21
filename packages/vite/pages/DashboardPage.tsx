import React, { useState, useRef, useEffect } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useDeposit } from '../hooks/useDeposit.js';
import { generateNote, saveNote, loadNote, NoteData } from '../lib/note.js';
import { parseUsdcAmount, formatUsdcAmount } from '../lib/usdc.js';
import { toast } from 'react-toastify';
import './DashboardPage.css';

export function DashboardPage() {
    const {
        isConnected,
        address: walletAddress,
        deposit,
        registerRoot,
        isPending,
        isSuccess,
        error,
        poolAddress,
    } = useDeposit();

    const [amount, setAmount] = useState('1');
    const [isGeneratingNote, setIsGeneratingNote] = useState(false);
    const pendingRootRef = useRef<`0x${string}` | null>(null);
    const [savedNote, setSavedNote] = useState<NoteData | null>(null);

    // Load saved note on mount
    useEffect(() => {
        setSavedNote(loadNote());
    }, []);

    // Toast feedback
    useEffect(() => {
        if (isSuccess) toast.success('Transaction confirmed');
    }, [isSuccess]);
    useEffect(() => {
        if (error) toast.error(error.message);
    }, [error]);

    // Auto register root after successful deposit
    useEffect(() => {
        if (!isSuccess || !pendingRootRef.current) return;
        const root = pendingRootRef.current;
        pendingRootRef.current = null;
        toast.info('Registering Merkle root...');
        registerRoot(root);
    }, [isSuccess, registerRoot]);

    const handleMint = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!walletAddress) {
            toast.error('Wallet not configured');
            return;
        }
        const value = parseUsdcAmount(amount);
        if (value === null) {
            toast.error('Invalid amount');
            return;
        }
        if (value <= 0n) {
            toast.error('Amount must be > 0');
            return;
        }

        setIsGeneratingNote(true);
        try {
            const { note, commitmentHex, rootHex } = await generateNote(value, walletAddress);
            saveNote(note);
            setSavedNote(note);
            pendingRootRef.current = rootHex;
            deposit(commitmentHex, value);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate note');
        } finally {
            setIsGeneratingNote(false);
        }
    };

    const handleCopyNote = () => {
        const note = loadNote();
        if (note) {
            navigator.clipboard.writeText(JSON.stringify(note));
            toast.success('Note copied to clipboard');
        }
    };

    const depositLabel = isGeneratingNote
        ? 'Generating note...'
        : isPending
            ? 'Confirming...'
            : 'MINT BEARER NOTE';

    const rawUnits = parseUsdcAmount(amount);

    return (
        <div className="dashboard-container page-container">
            <WalletGuard>
                {!poolAddress && (
                    <div className="glass-panel fade-in-up" style={{ textAlign: 'center', padding: '48px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Set <code>VITE_POOL_ADDRESS</code> in <code>.env</code> to enable deposits.
                        </p>
                    </div>
                )}

                {poolAddress && (
                    <>
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
                                        <label>ASSET</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            value="USDC"
                                            disabled
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>AMOUNT</label>
                                        <input
                                            type="text"
                                            className="input-field amount-input"
                                            inputMode="decimal"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="10.25"
                                        />
                                        {rawUnits !== null && rawUnits > 0n && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                {rawUnits.toLocaleString()} raw units
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="btn-primary submit-btn"
                                    disabled={isPending || isGeneratingNote}
                                >
                                    {depositLabel}
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
                                {savedNote ? (
                                    <div className="table-row">
                                        <div className="text-secondary">
                                            {new Date(Number(savedNote.random)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div>
                                            <strong>{formatUsdcAmount(BigInt(savedNote.value))}</strong>{' '}
                                            <span className="text-secondary">USDC</span>
                                        </div>
                                        <div className="align-right">
                                            <button className="btn-icon copy-btn" onClick={handleCopyNote}>
                                                &#128190; COPY KEY
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="table-row">
                                        <div className="text-secondary" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
                                            No notes yet. Deposit to create one.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </WalletGuard>
        </div>
    );
}
