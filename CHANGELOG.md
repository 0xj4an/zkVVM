# Changelog

All notable changes to zkVVM will be documented in this file.

---

## [0.2.0] - 2025-02-21

### 🎉 Major Achievement
**Full End-to-End Withdraw Flow Working** - First successful deposit → proof → withdraw cycle on Sepolia testnet with EVVM integration.

### ✅ Added
- Manual hash payload construction for deposit and withdraw operations
- Success notification UI with Etherscan links in WithdrawPage
- Success notification UI with Etherscan links in DashboardPage
- Comprehensive session documentation in `/docs/SESSION_NOTES_FEB_2025.md`
- Technical reference guide in `/docs/TECHNICAL_REFERENCE.md`
- Debug logging for hash payload generation

### 🔧 Fixed
- **Critical:** `AsyncNonceAlreadyUsed()` error during withdraw execution
  - Root cause: Hash payload encoding mismatch between `@evvm/evvm-js` and Solidity
  - Solution: Manual construction using Viem's `encodeAbiParameters`
  - Files: `packages/vite/lib/services/zkVVM.ts`

### 🎨 Changed
- Improved transaction success UI - now hides SignedAction JSON after execution
- Transaction results now show prominently with copy button and Etherscan link
- Updated MEMORY.md with latest deployment addresses and critical fixes

### 📦 Deployed
- zkVVM Contract: `0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7`
- MockVerifier: `0xcaab0b768993663145fc1467029da7e7e6a1b52d`

### ✨ Successful Transactions
- Deposit: `0xe468e7156225120000c337cbf3598741047dbb494e389dbc5e6650e40cd964a8`
- Withdraw: `0x6cc6d53807ba23c8f38b4f6eaa32082e8f201e77b67b6606c5568a1b2e1e5321`

---

## [0.1.0] - 2025-02-20

### ✅ Added
- Noir beta.18 upgrade and circuit recompilation
- UltraHonk proof generation in browser via `@aztec/bb.js`
- Node.js polyfills for browser compatibility (Buffer, process, stream)
- Fisher executor service integration
- MockVerifier contract for testing
- EVVM integration with SignedActions pattern

### 🔧 Fixed
- Circuit deserialization errors (version mismatch)
- POINT_NOT_ON_CURVE error (was sending witness instead of proof)
- Browser compatibility issues with Node.js dependencies

### 📦 Deployed
- Initial zkVVM deployment (replaced in v0.2.0)
- MockVerifier for proof validation testing

---

## Implementation Details

### Hash Payload Fix (v0.2.0)

**Before:**
```typescript
// Using @evvm/evvm-js library method
const hashPayload = this.buildHashPayload(functionName, {
  recipient,
  proof: normalizedProof,
  publicInputs,
  ciphertext: normalizedCiphertext,
});
```

**After:**
```typescript
// Manual construction with exact Solidity match
const manualHashPayload = keccak256(
  encodeAbiParameters(
    parseAbiParameters('string, address, bytes, bytes32[], bytes32'),
    [functionName, recipient, normalizedProof, publicInputs, normalizedCiphertext]
  )
);
```

**Impact:** Resolved nonce validation failures, enabling successful withdraw transactions.

---

## Known Issues

### Current Limitations
- Merkle tree is computed off-chain (roots registered via admin function)
- MockVerifier always returns true (doesn't validate proofs)
- No merkle tree indexer service yet
- Gas costs high for withdraw (~446k gas with MockVerifier)

### Planned Fixes
- Implement on-chain merkle tree in contract
- Deploy real UltraHonk verifier contract
- Add merkle tree indexer for root management
- Optimize gas usage with verifier improvements

---

## Breaking Changes

### v0.2.0
- **Hash payload generation** - If you're extending the zkVVM service, you must use manual hash payload construction instead of `buildHashPayload()`
- **Contract addresses** - zkVVM redeployed to new address, update `.env` files

---

## Dependencies

### Updated in v0.2.0
- None (dependency versions unchanged)

### Current Versions
```json
{
  "@noir-lang/noir_js": "1.0.0-beta.18",
  "@noir-lang/acvm_js": "1.0.0-beta.18",
  "@aztec/bb.js": "2.1.11",
  "@evvm/evvm-js": "0.1.20",
  "viem": "2.46.2",
  "wagmi": "2.10.0"
}
```

---

## Migration Guide

### Upgrading from v0.1.0 to v0.2.0

1. **Update contract addresses in `.env`:**
   ```bash
   VITE_ZKVVM_ADDRESS=0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7
   WITHDRAW_VERIFIER_ADDRESS=0xcaab0b768993663145fc1467029da7e7e6a1b52d
   ```

2. **No code changes required** - If you're using the standard deposit/withdraw flows, changes are internal only

3. **Custom implementations** - If you've extended zkVVM service:
   - Replace `buildHashPayload()` calls with manual `encodeAbiParameters`
   - Ensure parameter types match Solidity contract exactly
   - Test signature validation thoroughly

4. **Restart services:**
   ```bash
   bun run start:fisher
   bun run vite:dev
   ```

---

## Performance Metrics

### v0.2.0
- **Deposit gas:** ~380,000
- **Withdraw gas:** ~446,000 (with MockVerifier)
- **Proof generation:** 2-5 seconds (browser, depends on CPU)
- **Proof size:** 16,256 bytes (UltraHonk)

### Expected in Production (with real verifier)
- **Withdraw gas:** ~600,000-800,000 (estimated)
- Other metrics unchanged

---

## Security

### Audit Status
⚠️ **NOT AUDITED** - This is experimental software. Do not use in production.

### Known Security Considerations
1. MockVerifier accepts any proof - **NOT PRODUCTION SAFE**
2. Off-chain merkle tree - relies on honest admin for root registration
3. No rate limiting on Fisher service
4. Private keys in `.env` - use secure key management for production

---

## Contributors

- Claude Sonnet 4.5 (AI Assistant)
- 0xj4an (Developer)

---

## Links

- **Repository:** [GitHub](https://github.com/0xj4an/zkVVM)
- **Docs:** `/docs` folder
- **Sepolia Deployment:** [Etherscan](https://sepolia.etherscan.io/address/0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7)

---

## Versioning

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible contract changes
- **MINOR** version for new features (backward compatible)
- **PATCH** version for bug fixes

---

**Current Version:** 0.2.0
**Status:** Development
**Last Updated:** February 21, 2025
