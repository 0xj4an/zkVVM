import React from 'react';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';

export function WalletGuard({ children }: { children: React.ReactNode }) {
    const { isConnected } = useAccount();
    const { connect } = useConnect();

    if (!isConnected) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', minHeight: '60vh' }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="glass-panel"
                    style={{
                        padding: '48px 32px',
                        maxWidth: '480px',
                        width: '100%',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center'
                    }}
                >
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'rgba(0, 255, 170, 0.1)',
                        border: '1px solid rgba(0, 255, 170, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '24px'
                    }}>
                        <Wallet size={32} color="var(--accent-color)" />
                    </div>

                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 12px 0' }}>Wallet Required</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 32px 0', lineHeight: 1.6 }}>
                        Please connect your web3 wallet to access the zkVVM protocol Dashboard and begin shielding your assets.
                    </p>

                    <button
                        onClick={() => connect({ connector: injected() })}
                        className="btn-primary"
                        style={{ width: '100%', fontSize: '16px', padding: '16px', justifyContent: 'center' }}
                    >
                        Connect Wallet
                    </button>

                    <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        Supports MetaMask, Rabby, and injected web3 providers.
                    </div>
                </motion.div>
            </div>
        );
    }

    return <>{children}</>;
}
