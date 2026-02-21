import React, { useState, useEffect } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useZK, StoredNote } from '../lib/hooks/useZK';
import useEvvm from '../lib/hooks/useEvvm';
import { createZkVVMService } from '../lib/services/zkVVM';
import { Core, HexString } from '@evvm/evvm-js';
import { zkService } from '../lib/services/ZKService';
import zkNoteArtifact from '../../noir/target/note_generator.json';
import { zeroAddress } from 'viem';
import './DashboardPage.css';

export function DashboardPage() {
    const [amount, setAmount] = useState('100.00');
    const [notes, setNotes] = useState<StoredNote[]>([]);
    const [showToast, setShowToast] = useState(false);
    const [payActionJson, setPayActionJson] = useState<string | null>(null);
    const [depositActionJson, setDepositActionJson] = useState<string | null>(null);
    const { mintBearerToken, getStoredNotes, copyNote, isInitializing, getOnchainStatus } = useZK();
    const { publicClient, signer, address: userAddress } = useEvvm();

    const [onchainStatus, setOnchainStatus] = useState<Record<string, any>>({});

    useEffect(() => {
        setNotes(getStoredNotes());
    }, [getStoredNotes]);

    const handleMint = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const stored = await mintBearerToken(amount);
            setNotes(getStoredNotes());

            // If we have an EVVM signer, build pay + deposit SignedActions and log them.
            if (!signer) {
                console.log('No signer available — note stored locally only', stored.noteStr);
                return;
            }

            // Recompute note internals to get commitment/entry
            const { amount: amt, secret, salt } = zkService.parseNoteString(stored.noteStr);
            const note = await zkService.recomputeNote(zkNoteArtifact as any, amt, secret, salt);

            // amount in token units (mirrors zkService.generateNote logic)
            const value = BigInt(Math.floor(parseFloat(stored.amount) * 1e6));

            // random nonce: 32 bytes
            const rand = new Uint8Array(32);
            if (typeof window !== 'undefined' && window.crypto) window.crypto.getRandomValues(rand);
            else for (let i = 0; i < 32; i++) rand[i] = Math.floor(Math.random() * 256);
            let n = 0n;
            for (const b of rand) n = (n << 8n) + BigInt(b);

            const nonce = n;

            const ZKVVM_ADDRESS = (import.meta.env.VITE_ZKVVM_ADDRESS || '') as string;

            // Instantiate Core and Service (addresses best-effort — Core address may be unspecified)
            const coreAddress = (import.meta.env.VITE_CORE_ADDRESS || zeroAddress) as string;
            const core = new Core({ signer, address: coreAddress as any, chainId: 11155111, evvmId: 1n });
            const service = createZkVVMService(signer);

            // Build pay SignedAction (to pay executor priority fee and lock tokens)
            const payAction = await core.pay({
                toAddress: ZKVVM_ADDRESS as HexString,
                tokenAddress: zeroAddress,
                amount: value,
                priorityFee: 0n,
                nonce,
                isAsyncExec: true,
            });

            // Build deposit SignedAction embedding pay metadata
            const depositAction = await service.deposit({
                commitment: `0x${note.entry.toString(16)}`,
                amount: value,
                originExecutor: zeroAddress,
                nonce,
                evvmSignedAction: payAction,
            });

            console.log('Pay SignedAction:', payAction);
            console.log('Deposit SignedAction:', depositAction);

            // Set UI JSON, fall back to basic fields if circular
            try {
                setPayActionJson(JSON.stringify(payAction, null, 2));
            } catch (e) {
                setPayActionJson(JSON.stringify({ evvmId: (payAction as any).evvmId, functionName: (payAction as any).functionName, data: (payAction as any).data }, null, 2));
            }
            try {
                setDepositActionJson(JSON.stringify(depositAction, null, 2));
            } catch (e) {
                setDepositActionJson(JSON.stringify({ evvmId: (depositAction as any).evvmId, functionName: (depositAction as any).functionName, data: (depositAction as any).data }, null, 2));
            }
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

                    {payActionJson && depositActionJson && (
                        <div className="signed-actions-box">
                            <h4>Signed Actions (not executed)</h4>
                            <div className="signed-action">
                                <div className="signed-action-header">Core.pay()</div>
                                <pre className="signed-action-json">{payActionJson}</pre>
                                <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(payActionJson)}>Copy Pay Action</button>
                            </div>
                            <div className="signed-action">
                                <div className="signed-action-header">zkVVM.deposit()</div>
                                <pre className="signed-action-json">{depositActionJson}</pre>
                                <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(depositActionJson)}>Copy Deposit Action</button>
                            </div>
                        </div>
                    )}
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
                                        <button
                                            className="btn-secondary check-btn"
                                            onClick={async () => {
                                                const statusKey = note.noteStr;
                                                setOnchainStatus((s) => ({ ...s, [statusKey]: { loading: true } }));
                                                try {
                                                    const result = await getOnchainStatus(note.noteStr, publicClient);
                                                    setOnchainStatus((s) => ({ ...s, [statusKey]: { loading: false, result } }));
                                                } catch (err: any) {
                                                    setOnchainStatus((s) => ({ ...s, [statusKey]: { loading: false, error: err.message || String(err) } }));
                                                }
                                            }}
                                        >
                                            CHECK ON-CHAIN
                                        </button>
                                        {onchainStatus[note.noteStr] && (
                                            <div className="status-inline">
                                                {onchainStatus[note.noteStr].loading && <span>Checking...</span>}
                                                {onchainStatus[note.noteStr].error && <span className="text-danger">Error</span>}
                                                {onchainStatus[note.noteStr].result && (
                                                    <span className="text-success">{onchainStatus[note.noteStr].result.committed ? 'COMMITTED' : 'NOT ON CHAIN'}{onchainStatus[note.noteStr].result.nullifierUsed ? ' • SPENT' : ''}</span>
                                                )}
                                            </div>
                                        )}
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
