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

    if (isConnected && address) {
        return (
            <button className="wallet-btn connected" onClick={() => disconnect()}>
                <div className="wallet-avatar">B4</div>
                <div className="wallet-info">
                    <span className="wallet-label">VERIFIED ACCOUNT</span>
                    <span className="wallet-address">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
                </div>
            </button>
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
