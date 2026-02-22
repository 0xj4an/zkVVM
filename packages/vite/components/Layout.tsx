import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import './Layout.css';

function WalletButton() {
    const { address, isConnected } = useAccount();
    const { connect } = useConnect();
    const { disconnect } = useDisconnect();
    const [showDropdown, setShowDropdown] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCopyAddress = async () => {
        if (address) {
            await navigator.clipboard.writeText(address);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    };

    if (isConnected && address) {
        return (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
                <button className="wallet-btn connected" onClick={() => setShowDropdown(!showDropdown)}>
                    <div className="wallet-avatar">B4</div>
                    <div className="wallet-info">
                        <span className="wallet-label">VERIFIED ACCOUNT</span>
                        <span className="wallet-address">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
                    </div>
                </button>

                {showDropdown && (
                    <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        backgroundColor: 'rgba(10, 10, 20, 0.95)',
                        border: '1px solid rgba(0, 255, 170, 0.2)',
                        borderRadius: '12px',
                        padding: '16px',
                        minWidth: '280px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        backdropFilter: 'blur(20px)',
                        zIndex: 1000,
                    }}>
                        <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            WALLET ADDRESS
                        </div>
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            marginBottom: '16px',
                            padding: '10px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.05)'
                        }}>
                            <code style={{
                                flex: 1,
                                fontSize: '12px',
                                wordBreak: 'break-all',
                                color: 'var(--accent-color)'
                            }}>
                                {address}
                            </code>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleCopyAddress}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    backgroundColor: copySuccess ? 'rgba(0, 255, 170, 0.2)' : 'rgba(0, 255, 170, 0.1)',
                                    border: '1px solid rgba(0, 255, 170, 0.3)',
                                    borderRadius: '8px',
                                    color: 'var(--accent-color)',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {copySuccess ? '✓ Copied!' : '📋 Copy Address'}
                            </button>
                            <button
                                onClick={() => {
                                    disconnect();
                                    setShowDropdown(false);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    backgroundColor: 'rgba(255, 70, 70, 0.1)',
                                    border: '1px solid rgba(255, 70, 70, 0.3)',
                                    borderRadius: '8px',
                                    color: '#ff4646',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                🔌 Disconnect
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <button className="wallet-btn" onClick={() => connect({ connector: injected() })}>
            <div className="wallet-avatar disconnected" />
            <div className="wallet-info">
                <span className="wallet-label">CONNECT WALLET</span>
                <span className="wallet-address">Not Connected</span>
            </div>
        </button>
    );
}

export function Layout() {
    const glowRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        let currentX = window.innerWidth / 2;
        let currentY = window.innerHeight / 2;
        let targetX = currentX;
        let targetY = currentY;
        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            targetX = e.clientX;
            targetY = e.clientY;
        };

        const updateGlowPosition = () => {
            // Spring smoothing effect
            currentX += (targetX - currentX) * 0.1;
            currentY += (targetY - currentY) * 0.1;

            if (glowRef.current) {
                glowRef.current.style.transform = `translate(${currentX}px, ${currentY}px) translate(-50%, -50%)`;
            }

            animationFrameId = requestAnimationFrame(updateGlowPosition);
        };

        window.addEventListener('mousemove', handleMouseMove);
        animationFrameId = requestAnimationFrame(updateGlowPosition);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const navLinks = [
        { name: "Home", href: "/" },
        { name: "Dashboard", href: "/dashboard" },
        { name: "Withdraw", href: "/withdraw" },
    ];

    return (
        <div className="app-container">
            {/* Ambient Background layer */}
            <div className="ambient-bg">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            {/* Cursor Glow */}
            <div className="cursor-glow" ref={glowRef}></div>

            <nav className="nav-wrapper">
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className={clsx(
                        "nav-pill",
                        scrolled ? "scrolled" : ""
                    )}
                >
                    <div className="nav-logo-group">
                        <NavLink to="/" className="nav-logo-link">
                            <div className="nav-logo-icon group-hover:scale-110">
                                <span className="nav-logo-text-zk">zk</span>
                            </div>
                            <div className="nav-logo-text-vvm">
                                <span>VVM</span>
                            </div>
                        </NavLink>

                        <div className="nav-links-desktop">
                            {navLinks.map((link) => (
                                <NavLink
                                    key={link.href}
                                    to={link.href}
                                    className={clsx(
                                        "nav-link-item",
                                        location.pathname === link.href ? "active" : ""
                                    )}
                                >
                                    {link.name}
                                </NavLink>
                            ))}
                        </div>
                    </div>

                    <div className="nav-actions-group">
                        <WalletButton />
                    </div>
                </motion.div>
            </nav>

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
