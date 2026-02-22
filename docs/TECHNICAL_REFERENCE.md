# zkVVM Technical Reference

Quick reference for zkVVM development and debugging.

---

## 🏗️ Architecture Overview

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Browser/Vite   │─────▶│    Fisher    │─────▶│   EVVM Core     │
│  (User Wallet)  │      │  (Executor)  │      │  (Sepolia)      │
└─────────────────┘      └──────────────┘      └─────────────────┘
        │                                              │
        │                                              │
        ▼                                              ▼
┌─────────────────┐                          ┌─────────────────┐
│  Noir Circuits  │                          │     zkVVM       │
│  (WASM in       │                          │   Contract      │
│   browser)      │                          │                 │
└─────────────────┘                          └─────────────────┘
```

---

## 📋 Contract Addresses (Sepolia)

```javascript
// Current Deployment
const addresses = {
  zkVVM:           '0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7',
  evvmCore:        '0xFA56B6992c880393e3bef99e41e15D0C07803BC1',
  mockVerifier:    '0xcaab0b768993663145fc1467029da7e7e6a1b52d',
  fisherWallet:    '0xc696DDC31486D5D8b87254d3AA2985f6D0906b3a',
  adminWallet:     '0xc696DDC31486D5D8b87254d3AA2985f6D0906b3a',
};
```

---

## 🔑 Critical Hash Payload Fix

**Problem:** Library encoding ≠ Solidity encoding

**Solution:** Manual construction with Viem

### Withdraw Hash Payload
```typescript
const manualHashPayload = keccak256(
  encodeAbiParameters(
    parseAbiParameters('string, address, bytes, bytes32[], bytes32'),
    ['withdraw', recipient, proof, publicInputs, ciphertext]
  )
);
```

### Deposit Hash Payload
```typescript
const manualHashPayload = keccak256(
  encodeAbiParameters(
    parseAbiParameters('string, bytes, uint256, bytes32'),
    ['deposit', commitment, amount, expectedNextRoot]
  )
);
```

**Why it matters:** EVVM Core validates signatures against this hash. If encoding differs, signature validation fails → `AsyncNonceAlreadyUsed()` error.

---

## 🧮 Public Inputs Structure

### Withdraw (v2b)
```javascript
publicInputs = [
  nullifier,              // bytes32 - unique per spend
  merkle_proof_length,    // uint256 - tree depth
  expected_merkle_root,   // bytes32 - root to validate
  recipient,              // bytes32 - address as bytes32
  commitment,             // bytes32 - original deposit
]
```

**Order is critical** - must match circuit output exactly.

---

## 🔐 Ciphertext Generation

```javascript
// Encrypt amount for privacy
const POOL_SALT = keccak256("ShieldedPool.v2b");
const key = keccak256(abi.encodePacked(nullifier, recipient, POOL_SALT));
const keystream = keccak256(abi.encodePacked(key, uint256(0)));
const ciphertext = amount ^ keystream;

// Decrypt (same process)
const decrypted_amount = ciphertext ^ keystream;
```

---

## 🚀 Quick Start Commands

```bash
# Start Fisher executor service
bun run start:fisher

# Start frontend dev server
bun run vite:dev

# Compile Noir circuits (if changed)
cd packages/noir
nargo compile --force

# Deploy new zkVVM (with MockVerifier)
bun run deploy:sepolia

# Register zkVVM service in EVVM Core
bun run scripts/register-zkvvm.js
```

---

## 🐛 Common Errors & Solutions

### AsyncNonceAlreadyUsed (0x2a0c4a23)
**Cause:** Hash payload encoding mismatch
**Solution:** Use manual hash payload construction (see above)

### POINT_NOT_ON_CURVE (0xa3dad654)
**Cause:** Sending witness bytes instead of real proof
**Solution:** Use `UltraHonkBackend.generateProof(witness)`

### Circuit Deserialization Error
**Cause:** Version mismatch between compiler and JS packages
**Solution:**
```bash
noirup --version 1.0.0-beta.18
cd packages/noir && nargo compile --force
```

### InsufficientBalance
**Cause:** User wallet doesn't have USDC or hasn't approved Core
**Solution:**
1. Get USDC from Circle Faucet
2. Approve EVVM Core to spend USDC

---

## 📊 Gas Estimates

| Operation | Gas Used | Notes |
|-----------|----------|-------|
| Deposit   | ~380,000 | USDC transfer + commitment storage |
| Withdraw  | ~446,000 | Proof verify + nullifier + transfer |
| Root Registration | ~50,000 | Admin only |

**Note:** MockVerifier uses minimal gas. Real UltraHonk verifier will be higher (~500k-800k).

---

## 🔍 Debug Logging

### Enable Debug Logs
Already enabled in code. Check browser console for:

```javascript
[DEPOSIT DEBUG] Manual hashPayload: 0x...
[DEPOSIT DEBUG] commitment: 0x...
[DEPOSIT DEBUG] amount: 100000000000000000000

[WITHDRAW DEBUG] Function name: withdraw
[WITHDRAW DEBUG] Recipient: 0x...
[WITHDRAW DEBUG] Manual hashPayload: 0x...
```

### Fisher Service Logs
```bash
# Find running Fisher task ID
/tasks

# Tail logs
tail -f /private/tmp/claude-501/[...]/tasks/[TASK_ID].output
```

---

## 🧪 Testing Checklist

### Deposit Flow
- [ ] User has USDC on Sepolia
- [ ] User approved EVVM Core to spend USDC
- [ ] Connected correct wallet in browser
- [ ] Fisher service running
- [ ] Generate note → Creates commitment
- [ ] Sign deposit action → Wallet prompt
- [ ] Execute via Fisher → Transaction sent
- [ ] Check Etherscan → Success + event logs
- [ ] Note saved in local vault

### Withdraw Flow
- [ ] Have valid note from deposit
- [ ] Enter note + recipient address
- [ ] Generate ZK proof → ~2-5 seconds
- [ ] Proof generated successfully (16256 bytes)
- [ ] Sign withdraw action → Wallet prompt
- [ ] Execute via Fisher → Transaction sent
- [ ] Check Etherscan → Success + "Withdrawn" event
- [ ] Nullifier marked as used on-chain

---

## 🔧 Environment Variables

### Required in `.env`
```bash
# Deployment
PRIVATE_KEY=0x...                    # Deployer wallet
EVVM_SEPOLIA_RPC_URL=https://...    # Sepolia RPC
EVVM_CORE_ADDRESS=0x...             # EVVM Core address
ZKVVM_ADMIN_ADDRESS=0x...           # Admin for root registration
WITHDRAW_VERIFIER_ADDRESS=0x...     # MockVerifier address

# Fisher Service
FISHER_PRIVATE_KEY=0x...            # Fisher executor wallet
FISHER_PORT=8787                    # Fisher API port

# Frontend
VITE_ZKVVM_ADDRESS=0x...            # zkVVM contract
VITE_CORE_ADDRESS=0x...             # EVVM Core
VITE_FISHER_URL=http://localhost:8787
```

---

## 📦 Key Dependencies

### Noir/ZK
- `@noir-lang/noir_js` - v1.0.0-beta.18
- `@noir-lang/acvm_js` - v1.0.0-beta.18
- `@aztec/bb.js` - v2.1.11 (UltraHonk backend)

### EVVM
- `@evvm/evvm-js` - v0.1.20
- `@evvm/testnet-contracts` - v3.0.1

### Frontend
- `viem` - v2.46.2
- `wagmi` - v2.10.0
- `react` - v18.2.0

**Version Lock:** Noir packages MUST be beta.18. Mismatch causes circuit deserialization errors.

---

## 🎯 Implementation Notes

### Why Manual Hash Payload?
`@evvm/evvm-js`'s `buildHashPayload()` doesn't expose type information, leading to encoding differences from Solidity's `abi.encode`. Manual construction ensures **exact match**.

### Why Random Nonces?
EVVM supports async operations with random nonces (not sequential). Each SignedAction generates:
```typescript
const randBytes = crypto.getRandomValues(new Uint8Array(32));
const nonce = BigInt(randBytes.reduce((acc, val) => acc * 256n + BigInt(val), 0n));
```

### Why MockVerifier?
Real UltraHonk verifier contract is complex and expensive. MockVerifier:
- Returns `true` for any proof
- Allows testing full flow
- Much cheaper gas
- **Must replace for production**

---

## 🔗 Useful Links

### Explorers
- [Sepolia Etherscan](https://sepolia.etherscan.io/)
- [EVVM Core](https://sepolia.etherscan.io/address/0xFA56B6992c880393e3bef99e41e15D0C07803BC1)
- [zkVVM Contract](https://sepolia.etherscan.io/address/0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7)

### Faucets
- [Circle USDC Faucet](https://faucet.circle.com/)
- [Sepolia ETH Faucet](https://sepoliafaucet.com/)

### Docs
- [Noir Docs](https://noir-lang.org/)
- [Barretenberg](https://github.com/AztecProtocol/barretenberg)
- [Viem](https://viem.sh/)

---

## 🚨 Production Checklist

Before mainnet deployment:

- [ ] Replace MockVerifier with real UltraHonk verifier
- [ ] Implement on-chain merkle tree
- [ ] Add merkle tree indexer service
- [ ] Remove debug console.logs
- [ ] Audit smart contracts
- [ ] Audit ZK circuits
- [ ] Stress test with multiple users
- [ ] Set up monitoring/alerts
- [ ] Document emergency procedures
- [ ] Implement circuit upgradeability
- [ ] Consider relayer decentralization

---

**Last Updated:** February 21, 2025
**Status:** Development - Full Flow Working ✅
