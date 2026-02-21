#!/usr/bin/env bash
set -euo pipefail

echo "[EVVM] Deploy flow (MockVerifier -> zkVVM)"
echo "Network: sepoliaEvvm"

echo "Step 1: Deploy MockVerifier"
bunx hardhat run scripts/deploy-mock-verifier.js --config hardhat.config.cts --network sepoliaEvvm

echo "Step 2: Deploy zkVVM wired to MockVerifier"
echo "Required env: ZKVVM_ADMIN_ADDRESS, EVVM_CORE_ADDRESS, EVVM_STAKING_ADDRESS"
bunx hardhat run scripts/deploy-zkvvm.js --config hardhat.config.cts --network sepoliaEvvm

echo "Step 3: When ready, deploy UltraVerifier and redeploy zkVVM with it"
echo "  bunx hardhat run scripts/deploy-ultra-verifier.js --config hardhat.config.cts --network sepoliaEvvm"
echo "  WITHDRAW_VERIFIER_ADDRESS=0x... bunx hardhat run scripts/deploy-zkvvm.js --config hardhat.config.cts --network sepoliaEvvm"
