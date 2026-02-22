# zkVVM Session Notes - February 2025

## Session Summary
Successfully debugged and fixed critical nonce validation error, achieving **full end-to-end withdraw flow** with EVVM integration.

---

## 🎯 Achievements

### ✅ Core Functionality Working
1. **Deposit Flow** - Complete with USDC transfers via EVVM Core
2. **ZK Proof Generation** - UltraHonk proofs (16256 bytes) in browser
3. **Withdraw Flow** - Full execution with Fisher service
4. **EVVM Integration** - SignedActions working correctly

### ✅ Successful Transactions on Sepolia
- **Deposit TX:** `0xe468e7156225120000c337cbf3598741047dbb494e389dbc5e6650e40cd964a8`
  - Amount: 100 USDC
  - Commitment: `0x0a7274766564cd7ece3c96157ad8a5508922b48a6c3a1ef19c4049589e4aa21e`
  - Root: `0x1032cbb9b4980cdac2a8aeda66e1ab4646e2cc9cd316001f4c1c8532bc792733`

- **Withdraw TX:** `0x6cc6d53807ba23c8f38b4f6eaa32082e8f201e77b67b6606c5568a1b2e1e5321`
  - Gas Used: 446,470
  - Status: Success ✅
  - Event: "Withdrawn" emitted

---

## 🐛 Critical Bug Fixed: AsyncNonceAlreadyUsed Error

### Problem Description
Withdraw transactions were reverting with error `0x71d49912` (WithdrawNonceValidationFailed) containing inner error `0x2a0c4a23` (AsyncNonceAlreadyUsed), even with freshly generated random nonces.

### Root Cause
The `BaseService.buildHashPayload()` method from `@evvm/evvm-js` was **not encoding parameters in the same format as Solidity's `abi.encode`**.

**What the contract expects:**
```solidity
keccak256(abi.encode('withdraw', recipient, proof, publicInputs, ciphertext))
```

**What was being generated:**
Unknown format from `buildHashPayload()` - likely different type encoding or parameter order.

### The Fix
Manually construct hash payload using Viem's `encodeAbiParameters` to match Solidity exactly.

**File:** `packages/vite/lib/services/zkVVM.ts`

**For Withdraw:**
```typescript
const manualHashPayload = keccak256(
  encodeAbiParameters(
    parseAbiParameters('string, address, bytes, bytes32[], bytes32'),
    [functionName, recipient, normalizedProof, publicInputs, normalizedCiphertext]
  )
);
```

**For Deposit:**
```typescript
const manualHashPayload = keccak256(
  encodeAbiParameters(
    parseAbiParameters('string, bytes, uint256, bytes32'),
    [functionName, normalizedCommitment as HexString, amount, computedNextRoot]
  )
);
```

**Key Points:**
- Type order matters: `string, address, bytes, bytes32[], bytes32`
- Array types must be specified: `bytes32[]` for publicInputs
- Exact match with Solidity ABI encoding is critical

---

## 🔧 Technical Details

### Contract Addresses (Sepolia)
```
zkVVM:          0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7
EVVM Core:      0xFA56B6992c880393e3bef99e41e15D0C07803BC1
MockVerifier:   0xcaab0b768993663145fc1467029da7e7e6a1b52d
Fisher Wallet:  0xc696DDC31486D5D8b87254d3AA2985f6D0906b3a
```

### Public Inputs Order (withdrawV2b)
```javascript
[
  nullifier,              // bytes32 - unique spend identifier
  merkle_proof_length,    // uint256 - depth of merkle proof
  expected_merkle_root,   // bytes32 - root to validate against
  recipient,              // address - where funds go (as bytes32)
  commitment              // bytes32 - original deposit commitment
]
```

### Ciphertext Generation
```javascript
// Encrypt the amount for privacy
const key = keccak256(abi.encodePacked(nullifier, recipient, POOL_SALT));
const stream = keccak256(abi.encodePacked(key, 0));
const ciphertext = amount XOR stream;

// POOL_SALT constant
const POOL_SALT = keccak256("ShieldedPool.v2b");
```

### ZK Proof System
- **Proving System:** UltraHonk (Aztec)
- **Backend:** `@aztec/bb.js` v2.1.11
- **Circuit Compiler:** Noir beta.18
- **Proof Size:** 16,256 bytes (32,514 hex chars with 0x prefix)
- **Browser Execution:** Yes, via WASM

---

## 🎨 UI Improvements

### Success Message with Etherscan Link
Updated both `DashboardPage.tsx` and `WithdrawPage.tsx` to show prominent success notifications:

**Features:**
- ✅ Green background with border (#00ffaa)
- Transaction hash in copyable code block
- Copy button for quick copying
- **"View on Etherscan"** button - opens tx in new tab
- Hides SignedAction JSON after execution

**User Flow:**
1. Generate proof & sign → Shows SignedAction JSON
2. Click "EXECUTE VIA FISHER" → Executes transaction
3. On success → Hides JSON, shows success popup with Etherscan link

---

## 📁 Key Files Modified

### `/packages/vite/lib/services/zkVVM.ts`
- Added manual hash payload construction for deposit and withdraw
- Imported `encodeAbiParameters` and `parseAbiParameters` from Viem
- Replaced `this.buildHashPayload()` calls with manual encoding

### `/packages/vite/pages/WithdrawPage.tsx`
- Added success notification UI when `withdrawTxHash` is set
- Conditionally shows SignedAction JSON only before execution

### `/packages/vite/pages/DashboardPage.tsx`
- Added success notification UI when `depositTxHash` is set
- Same conditional logic for SignedAction display

### `/.env`
```bash
# Current deployment addresses
VITE_ZKVVM_ADDRESS=0x0baf1357ed81bd200f0df7ea559af550c2e5b1a7
VITE_CORE_ADDRESS=0xFA56B6992c880393e3bef99e41e15D0C07803BC1
WITHDRAW_VERIFIER_ADDRESS=0xcaab0b768993663145fc1467029da7e7e6a1b52d

# Fisher service (executor)
FISHER_PRIVATE_KEY=0xeb95851dea8a7c765c9908c6093f65c18d55af75461160205aff4ad37757c6cb
FISHER_PORT=8787
VITE_FISHER_URL=http://localhost:8787
```

---

## 🚀 Running the Stack

### Start Services
```bash
# Terminal 1: Fisher executor service
bun run start:fisher

# Terminal 2: Frontend dev server
bun run vite:dev
```

### Access
- **Frontend:** http://localhost:5173
- **Fisher API:** http://localhost:8787

### User Requirements
- MetaMask or compatible wallet
- Connected to Sepolia testnet
- USDC balance (get from Circle Faucet)
- USDC approval to EVVM Core address

---

## 🔍 Debugging Tips

### Check Fisher Logs
```bash
tail -f /private/tmp/claude-501/-Users-0xj4an-Documents-GitHub-0xj4an-personal-zkVVM/tasks/[TASK_ID].output
```

### Browser Console Logs
Look for:
- `[DEPOSIT DEBUG]` - Deposit hash payload and parameters
- `[WITHDRAW DEBUG]` - Withdraw hash payload and parameters
- Proof generation progress
- Signature requests

### Common Issues

1. **"AsyncNonceAlreadyUsed"** - Fixed with manual hash payload
2. **"InsufficientBalance"** - User needs USDC
3. **"POINT_NOT_ON_CURVE"** - Was converting witness to hex instead of generating proof (FIXED)
4. **Circuit deserialization error** - Version mismatch, use beta.18 (FIXED)

---

## 📊 Gas Usage

### Deposit
- Typical gas: ~350,000 - 400,000
- Includes USDC transfer + commitment storage + root update

### Withdraw
- Typical gas: ~446,000
- Includes ZK proof verification + nullifier check + USDC transfer
- **Note:** MockVerifier skips actual verification, real verifier will use more gas

---

## 🎓 Lessons Learned

### 1. ABI Encoding Precision
**Library abstractions can fail silently.** Always verify that encoded data matches contract expectations exactly, especially for cryptographic operations.

### 2. Type Matters in Solidity
`bytes32[]` vs `bytes[]` vs `address` - each encodes differently in ABI. JavaScript doesn't care, but Solidity does.

### 3. Debug with Hash Payloads
When signature validation fails, log the **exact hash payload** being signed. Compare with contract's expected format.

### 4. Fisher Service Pattern
Executor services like Fisher are powerful for:
- Separating user wallet from executor wallet
- Batching transactions
- Paying gas on behalf of users
- But: adds complexity, needs monitoring

### 5. UI/UX for Blockchain
Users need **clear visual feedback**:
- Transaction submitted ≠ Transaction confirmed
- Show Etherscan links immediately
- Make success/failure obvious

---

## 🔮 Next Steps

### Short Term
1. ✅ ~~Fix AsyncNonceAlreadyUsed error~~ - DONE
2. ✅ ~~End-to-end withdraw test~~ - DONE
3. ✅ ~~Improve transaction success UI~~ - DONE

### Medium Term
1. Deploy real UltraHonk verifier contract (replace MockVerifier)
2. Implement on-chain merkle tree
3. Add merkle tree indexer service
4. Multi-user testing

### Long Term
1. Multi-institution demo
2. Viewing keys implementation
3. Compliance features
4. Production deployment

---

## 📝 Important Notes

### EVVM ID
- zkVVM service uses EVVM ID: `0` (default for new services)
- Hardcoded in `zkVVM.ts` getEvvmID() method
- Can be changed later via `core.setEvvmID()`

### Nonce Generation
- Currently using **random nonces** (32 bytes of randomness)
- Works for async operations with EVVM
- Each SignedAction gets a unique random nonce

### Merkle Tree
- Currently **off-chain** root computation
- Roots registered manually via `registerRoot()` admin function
- Frontend computes next root: `keccak256(currentRoot XOR commitment)`
- **TODO:** Move to proper on-chain merkle tree

### MockVerifier
- Always returns `true` - doesn't validate proofs
- Used for testing the full flow
- **TODO:** Replace with real UltraHonk verifier

---

## 🙏 Credits

- **Noir:** Aztec Labs ZK framework
- **EVVM:** Ethereum Virtual Virtual Machine
- **Barretenberg:** UltraHonk proving system
- **Viem:** TypeScript Ethereum library

---

## 📞 Support

For issues or questions:
- Check browser console for detailed logs
- Check Fisher service logs
- Verify all addresses in `.env` are correct
- Ensure Fisher wallet has ETH for gas
- Ensure user wallet has USDC + approval

---

**Session Date:** February 21, 2025
**Status:** ✅ Full end-to-end flow working
**Next Session:** Deploy real verifier, implement on-chain merkle tree
