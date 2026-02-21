import React, { useState, useRef, useEffect } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useDeposit } from '../hooks/useDeposit.js';
import { generateNote, saveNote, loadNote, markNoteClaimed, NoteData } from '../lib/note.js';
import { parseUsdcAmount } from '../lib/usdc.js';
import { toast } from 'react-toastify';
import './DashboardPage.css';

export function DashboardPage() {
    const {
        isConnected,
        address: walletAddress,
        deposit,
        registerRoot,
        isNullifierSpent,
        isPending,
        isSuccess,
        error,
        txHash,
        poolAddress,
    } = useDeposit();

    const [amount, setAmount] = useState('1');
    const [isGeneratingNote, setIsGeneratingNote] = useState(false);
    const pendingRootRef = useRef<`0x${string}` | null>(null);
    const [savedNote, setSavedNote] = useState<NoteData | null>(null);
    // Track which phase we're in: 'deposit' | 'root' | null
    const txPhaseRef = useRef<'deposit' | 'root' | null>(null);

    // Load saved note on mount and when tab regains focus
    useEffect(() => {
        setSavedNote(loadNote());
        const onFocus = () => setSavedNote(loadNote());
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    // Auto-detect on-chain claimed status for notes missing the flag
    useEffect(() => {
        if (!savedNote || savedNote.claimed) return;
        isNullifierSpent(savedNote.nullifier as `0x${string}`).then((spent) => {
            if (spent) {
                markNoteClaimed('unknown');
                setSavedNote({ ...savedNote, claimed: true });
            }
        });
    }, [savedNote?.nullifier, isNullifierSpent]);

    useEffect(() => {
        if (error) toast.error(error.message);
    }, [error]);

    // Handle tx success: show contextual toast with Etherscan link, then auto-register root
    useEffect(() => {
        if (!isSuccess || !txHash) return;
        const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        const link = (
            <a href={explorerUrl} target="_blank" rel="noopener" style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>
                View transaction
            </a>
        );

        if (txPhaseRef.current === 'deposit' && pendingRootRef.current) {
            // Deposit confirmed, now register root
            toast.success(
                <span>Deposit confirmed! {link}</span>,
                { autoClose: false },
            );
            const root = pendingRootRef.current;
            pendingRootRef.current = null;
            txPhaseRef.current = 'root';
            toast.info('Registering Merkle root...');
            registerRoot(root);
        } else if (txPhaseRef.current === 'root') {
            // Root registration confirmed — full flow done
            toast.success(
                <span>Merkle root registered! Note is ready. {link}</span>,
                { autoClose: false },
            );
            txPhaseRef.current = null;
        }
    }, [isSuccess, txHash, registerRoot]);

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
            txPhaseRef.current = 'deposit';
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
                                    <div>STATUS</div>
                                    <div className="align-right">SECRET CODE</div>
                                </div>
                                {savedNote ? (
                                    <div className="table-row">
                                        <div className="text-secondary">
                                            {new Date(Number(savedNote.random)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div>
                                            {savedNote.claimed ? (
                                                <>
                                                    <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>&#9679;</span>{' '}
                                                    <span className="text-secondary">Redeemed</span>
                                                    {savedNote.claimedTxHash && (
                                                        <a
                                                            href={`https://sepolia.etherscan.io/tx/${savedNote.claimedTxHash}`}
                                                            target="_blank"
                                                            rel="noopener"
                                                            style={{ color: 'var(--accent-color)', fontSize: '11px', marginLeft: '8px', textDecoration: 'underline' }}
                                                        >
                                                            View tx
                                                        </a>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <span style={{ color: 'var(--accent-color)' }}>&#9679;</span>{' '}
                                                    <span className="text-secondary">Shielded note active</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="align-right">
                                            {!savedNote.claimed && (
                                                <button className="btn-icon copy-btn" onClick={handleCopyNote}>
                                                    &#128190; COPY KEY
                                                </button>
                                            )}
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
