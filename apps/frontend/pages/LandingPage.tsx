import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Zap, Lock, ArrowRight } from 'lucide-react';
import './LandingPage.css';

export function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="landing-container">
            {/* Background Blob */}
            <div className="hero-bg-blob" />

            {/* Hero Section */}
            <div className="max-w-4xl text-center section-py-lg">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="hero-pill">
                        Announcing our ZK-Compliant Payment Protocol.{' '}
                        <a href="#">Read more &rarr;</a>
                    </div>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                    className="hero-title"
                >
                    <span className="text-gradient">Zero-Knowledge</span>
                    <br />
                    Virtual Machine
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="hero-subtitle"
                >
                    A stateless, privacy-focused virtual machine running within a smart
                    contract "executor." Lock ETH into commitments and transfer them
                    securely via off-chain <span className="text-white">zkVVM Notes</span>.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="hero-actions"
                >
                    <button className="btn-primary btn-large" onClick={() => navigate('/dashboard')}>
                        Launch App <ArrowRight size={18} />
                    </button>
                    <Link to="/docs" className="hero-link">
                        Read Mission &rarr;
                    </Link>
                </motion.div>
            </div>

            {/* Feature Grid */}
            <div className="max-w-7xl section-py">
                <div className="features-grid-3">
                    {[
                        {
                            name: "The Mint (Deposit)",
                            description: "Lock ETH into the virtual machine by generating a cryptographic commitment. Your identity remains shielded from the start.",
                            icon: Shield,
                        },
                        {
                            name: "The Note (Handoff)",
                            description: "Transfer value securely off-chain. The zkVVM Note represents your assets and can be handed off with zero trace on the blockchain.",
                            icon: Zap,
                        },
                        {
                            name: "The Spend (Withdraw)",
                            description: "Redeem your Note from the zkVVM Executor by generating a ZK-SNARK proof. No link is ever created between deposit and withdrawal.",
                            icon: Lock,
                        },
                    ].map((feature, idx) => (
                        <motion.div
                            key={feature.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * idx, duration: 0.5 }}
                            viewport={{ once: true }}
                            className="feature-card-new"
                        >
                            <div className="icon-box">
                                <feature.icon size={20} color="#000" />
                            </div>
                            <h3 className="feature-title">{feature.name}</h3>
                            <p className="feature-desc">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* How it Works / The Flow */}
            <div className="max-w-7xl section-py-lg">
                <div className="text-center max-w-2xl">
                    <h2 className="flow-title text-gradient">The zkVVM Flow</h2>
                    <p className="flow-subtitle">
                        Decoupling privacy from consensus through a stateless Note-based architecture.
                    </p>
                </div>

                <div className="split-grid">
                    <div>
                        {[
                            {
                                step: "01",
                                title: "Deposit (Minting)",
                                desc: "Generate a local Secret and Nullifier. Submit their hashed commitment with 1 ETH to lock funds into the Merkle Vault.",
                            },
                            {
                                step: "02",
                                title: "Handoff (Off-Chain)",
                                desc: "The zkVVM Note is shared securely off-chain. The blockchain records zero data about this transfer, ensuring absolute privacy.",
                            },
                            {
                                step: "03",
                                title: "Withdraw (Spending)",
                                desc: "The receiver generates a ZK proof of secret knowledge to unlock funds to a new address. The Nullifier is recorded to prevent double-spending.",
                            },
                        ].map((item, idx) => (
                            <div key={idx} className="step-item">
                                <span className="step-number">{item.step}</span>
                                <div>
                                    <h4 className="step-title">{item.title}</h4>
                                    <p className="step-desc">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="visual-box">
                        <div className="visual-box-inner">
                            <div className="visual-icon-wrap">
                                <Shield size={48} color="#00ffaa" />
                            </div>
                            <p className="visual-code">
                                INPUT: [SECRET + NULLIFIER] <br />
                                STATE: [Merkle_Commitment] <br />
                                OUTPUT: [ZK_Spending_Proof]
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Compliance & Viewing Keys Section */}
            <div className="compliance-section section-py-lg">
                <div className="compliance-divider" />
                <div className="max-w-7xl">
                    <div className="split-grid">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6 }}
                            viewport={{ once: true }}
                        >
                            <div className="compliance-badge">
                                <Lock size={12} />
                                The Compliance Twist
                            </div>
                            <h2 className="compliance-title">
                                Privacy that meets <br />
                                <span className="text-gradient">Regulatory Standards</span>
                            </h2>
                            <p className="compliance-desc">
                                Unlike traditional mixers, zkVVM is built for the real world. Our unique{" "}
                                <span className="text-white">Viewing Key</span> architecture bridges the gap between complete financial anonymity and the need for granular, selective disclosure.
                            </p>

                            <div>
                                {[
                                    {
                                        title: "Selective Disclosure",
                                        desc: "Generate read-only keys for specific blocks or date ranges to share with auditors without compromising your entire history.",
                                    },
                                    {
                                        title: "Zk-Proof of Compliance",
                                        desc: "Prove you haven't transacted with sanctioned addresses without revealing who you actually sent money to.",
                                    },
                                ].map((item, idx) => (
                                    <div key={idx} className="compliance-item">
                                        <div className="compliance-item-number">0{idx + 1}</div>
                                        <div>
                                            <h4 className="compliance-item-title">{item.title}</h4>
                                            <p className="compliance-item-desc">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.8 }}
                            viewport={{ once: true }}
                        >
                            <div className="mockup-container">
                                <div className="mockup-header">
                                    <div className="mockup-header-left">
                                        <div className="mockup-icon"><Shield size={20} /></div>
                                        <div>
                                            <p className="mockup-title">Viewing Key Export</p>
                                            <p className="mockup-subtitle">Selective Audit Access</p>
                                        </div>
                                    </div>
                                    <div className="mockup-status">STATUS: READY</div>
                                </div>

                                <div className="mockup-body">
                                    <div className="mockup-body-row">
                                        <span>Target Auditor</span>
                                        <span>Permissions</span>
                                    </div>
                                    <div className="mockup-body-content">
                                        <span className="mockup-target">IRS_REVENUE_SERVICE_0x...</span>
                                        <span className="mockup-perm">READ_ONLY</span>
                                    </div>
                                    <div className="mockup-divider" />
                                    <div>
                                        <p className="mockup-hash-label">Shareable Proof Hash</p>
                                        <div className="mockup-hash-box">
                                            vk_vvm_77a2f910e82b7c4d5e6f1a2b3c4d5e6f...
                                        </div>
                                    </div>
                                </div>

                                <div className="mockup-btn">
                                    <button className="btn-primary">
                                        Generate Compliance Key <ArrowRight size={16} />
                                    </button>
                                </div>
                                <p className="mockup-footer">
                                    Disclosure is strictly user-initiated. zkVVM holds no master keys.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Final CTA */}
            <div className="max-w-7xl section-py-lg text-center">
                <div className="final-cta">
                    <h2 className="flow-title">Redefining Private Infrastructure</h2>
                    <p className="flow-subtitle" style={{ marginBottom: '40px' }}>
                        Build the future of zkVVM at ETHDenver 2026. Complete privacy without dedicated L2 sequencer networks.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                        <button className="btn-primary btn-large" onClick={() => navigate('/dashboard')}>
                            Get Started
                        </button>
                        <button className="btn-outline btn-large" onClick={() => navigate('/docs')}>
                            Explore Circuitry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
