import React, { useState } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useZK } from '../lib/hooks/useZK';
import useEvvm from '../lib/hooks/useEvvm';
import { createZkVVMService } from '../lib/services/zkVVM';
import { getRequiredViteEnv } from '../lib/env.js';
import './WithdrawPage.css';

export function WithdrawPage() {
    const { generateWithdrawalProof, isProving, provingError } = useZK();
    const { signer, publicClient, address: userAddress } = useEvvm();
    const [note, setNote] = useState('');
    const [address, setAddress] = useState('');
    const [success, setSuccess] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    const [isSigningWithdraw, setIsSigningWithdraw] = useState(false);
    const [withdrawActionJson, setWithdrawActionJson] = useState<string | null>(null);
    const [withdrawAction, setWithdrawAction] = useState<any | null>(null);
    const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);
    const [isExecutingWithdraw, setIsExecutingWithdraw] = useState(false);
    const [executionError, setExecutionError] = useState<string | null>(null);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccess(false);
        setWithdrawError(null);
        setWithdrawActionJson(null);
        setWithdrawTxHash(null);
        setWithdrawAction(null);
        setExecutionError(null);
        try {
            console.log('=== WITHDRAW FLOW START ===');
            console.log('Input note:', note);
            console.log('Input address:', address);
            
            console.log('Generating proof for note', note, 'to', address);
            const result: any = await generateWithdrawalProof(note, address);
            console.log('✓ Withdrawal proof generated, result:', result);

            // The generateWithdrawalProof now returns { proof, publicInputs, ciphertext }
            const proof: string | undefined = result?.proof;
            const publicInputs: string[] | undefined = result?.publicInputs;
            const ciphertext: string | undefined = result?.ciphertext;

            console.log('Extracted proof:', proof?.slice(0, 100) + '...');
            console.log('Extracted publicInputs:', publicInputs);

            if (!proof || !publicInputs || !ciphertext) {
                // No proof/publicInputs available — only witness produced. Stop here.
                console.log('⚠️ No proof or publicInputs available, marking success (witness-only)');
                setSuccess(true);
                return;
            }

            if (!signer) {
                console.error('❌ No signer available');
                setWithdrawError('No EVVM signer available. Please connect your wallet.');
                return;
            }

            console.log('✓ Signer available:', signer.address);
            console.log('Building signed action with signer:', signer.address);

            // create service and generate random nonce
            const service = createZkVVMService(signer);
            const randBytes = crypto.getRandomValues(new Uint8Array(32));
            const randomNonce = BigInt(randBytes.reduce((acc, val) => acc * 256n + BigInt(val), 0n));
            
            console.log('✓ Service created');
            console.log('Generated nonce:', randomNonce.toString());
            console.log('About to request signature for withdrawal with params:');
            console.log('  - proof:', proof.slice(0, 50) + '...');
            console.log('  - publicInputs length:', publicInputs.length);
            console.log('  - recipient:', address);
            console.log('  - nonce:', randomNonce.toString());
            console.log('  - expectedRoot:', publicInputs[2]);
            
            setIsSigningWithdraw(true);

            // build signed action (don't execute it) - this will request signature
            console.log('Calling service.withdraw()...');
            const signedAction = await service.withdraw({ 
              proof, 
              publicInputs, 
              ciphertext: ciphertext as any, 
              recipient: address as any, 
              expectedRoot: publicInputs[2] as any,
              nonce: randomNonce 
            });

            console.log('✓ Withdraw SignedAction received:', signedAction);
            setWithdrawAction(signedAction);

            // Set UI JSON, fall back to basic fields if circular
            try {
                console.log('Stringifying signed action to JSON...');
                const jsonStr = JSON.stringify(signedAction, null, 2);
                console.log('✓ Successfully stringified');
                setWithdrawActionJson(jsonStr);
            } catch (e) {
                console.log('⚠️ Could not stringify full object, using fallback');
                const fallback = JSON.stringify({ evvmId: (signedAction as any).evvmId, functionName: (signedAction as any).functionName, data: (signedAction as any).data }, null, 2);
                setWithdrawActionJson(fallback);
            }

            console.log('✓ Setting success state');
            setSuccess(true);
            console.log('=== WITHDRAW FLOW COMPLETE ===');
        } catch (err: any) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error('❌ WITHDRAW FLOW ERROR:', err);
            console.error('Error message:', errorMsg);
            console.error('Error stack:', err?.stack);
            setWithdrawError(errorMsg);
        } finally {
            setIsSigningWithdraw(false);
        }
    };

    const executeWithFisher = async (signedAction: unknown) => {
        const fisherUrl = getRequiredViteEnv('VITE_FISHER_URL');
        const res = await fetch(`${fisherUrl.replace(/\/$/, '')}/execute`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signedAction }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Fisher error (${res.status}): ${text}`);
        }
        const data = await res.json();
        return data?.txHash as string | undefined;
    };

    const handleExecuteWithdraw = async () => {
        if (!withdrawAction) return;
        try {
            setIsExecutingWithdraw(true);
            setExecutionError(null);
            const hash = await executeWithFisher(withdrawAction);
            if (hash) setWithdrawTxHash(hash);
        } catch (err) {
            console.error('Failed to execute withdraw via fisher:', err);

            // Parse error message to provide user-friendly feedback
            const errorMsg = err instanceof Error ? err.message : String(err);

            if (errorMsg.includes('nullifier-used')) {
                setExecutionError('⚠️ This note has already been redeemed. Each note can only be withdrawn once to prevent double-spending.');
            } else if (errorMsg.includes('merkle-root-not-found')) {
                setExecutionError('❌ Invalid merkle root. This note may not be registered on-chain yet.');
            } else if (errorMsg.includes('invalid-proof')) {
                setExecutionError('❌ Proof verification failed. Please regenerate the proof.');
            } else {
                // Generic error
                setExecutionError(`❌ Transaction failed: ${errorMsg.substring(0, 200)}`);
            }
        } finally {
            setIsExecutingWithdraw(false);
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

                        {withdrawError && (
                            <div className="error-message fade-in">
                                {withdrawError}
                            </div>
                        )}

                        {isSigningWithdraw && (
                            <div className="info-message fade-in">
                                Requesting signature from your wallet...
                            </div>
                        )}

                        {success && (
                            <div className="success-message fade-in">
                                ZK Proof generated successfully!
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn-primary submit-btn fade-in-up delay-4"
                            disabled={isProving || isSigningWithdraw || !note || !address}
                        >
                            {isProving ? 'Generating ZK Proof...' : isSigningWithdraw ? 'Signing Action...' : 'Generate Proof & Withdraw ⚡'}
                        </button>
                    </form>

                    {withdrawTxHash && (
                        <div className="success-message fade-in" style={{ marginTop: '20px', padding: '20px', backgroundColor: '#00ffaa20', border: '2px solid #00ffaa', borderRadius: '12px' }}>
                            <h3 style={{ color: '#00ffaa', marginBottom: '15px' }}>✅ Withdraw Transaction Executed!</h3>

                            <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                                <strong>Recipient Address:</strong>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
                                <code style={{ flex: 1, padding: '8px', backgroundColor: '#00000040', borderRadius: '6px', fontSize: '12px', wordBreak: 'break-all' }}>
                                    {address}
                                </code>
                                <button
                                    className="btn-secondary"
                                    onClick={() => navigator.clipboard.writeText(address)}
                                    style={{ minWidth: '80px' }}
                                >
                                    📋 Copy
                                </button>
                            </div>

                            <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                                <strong>Transaction Hash:</strong>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
                                <code style={{ flex: 1, padding: '8px', backgroundColor: '#00000040', borderRadius: '6px', fontSize: '12px', wordBreak: 'break-all' }}>
                                    {withdrawTxHash}
                                </code>
                                <button
                                    className="btn-secondary"
                                    onClick={() => navigator.clipboard.writeText(withdrawTxHash)}
                                    style={{ minWidth: '80px' }}
                                >
                                    📋 Copy
                                </button>
                            </div>
                            <a
                                href={`https://sepolia.etherscan.io/tx/${withdrawTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary"
                                style={{ display: 'inline-block', textDecoration: 'none' }}
                            >
                                🔗 View on Etherscan
                            </a>
                        </div>
                    )}

                    {withdrawActionJson && !withdrawTxHash && (
                        <div className="signed-actions-box">
                            <h4>Generated Signed Action</h4>
                            <div className="signed-action">
                                <div className="signed-action-header">zkVVM.withdraw()</div>
                                <pre className="signed-action-json">{withdrawActionJson}</pre>
                                <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(withdrawActionJson)}>📋 Copy JSON</button>
                            </div>

                            {executionError && (
                                <div className="error-message fade-in" style={{ marginTop: '15px', marginBottom: '15px' }}>
                                    {executionError}
                                </div>
                            )}

                            <button className="fisher-execute-btn" onClick={handleExecuteWithdraw} disabled={!withdrawAction || isExecutingWithdraw}>
                                {isExecutingWithdraw ? 'EXECUTING...' : 'EXECUTE VIA FISHER'}
                            </button>
                        </div>
                    )}
                </div>
            </WalletGuard>
        </div>
    );
}
