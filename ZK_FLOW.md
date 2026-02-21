# zkVVM: Bearer Note Architecture (Digital Cash)

## 1. Overview

This document outlines the **Bearer Note** flow for zkVVM. Unlike traditional account-based privacy
systems (e.g., private balances), this architecture treats assets as **Digital Cash**.

- **No "Accounts":** There is no on-chain mapping of User -> Balance.
- **The "Note":** Funds are locked in a **Commitment** (hash).
- **Ownership:** Whoever holds the **Secret Pre-image** of that hash owns the funds.
- **Transfer:** Physical or encrypted digital handoff of the Secret (off-chain).
- **Withdrawal:** The holder generates a ZK proof to spend the Note to a fresh address.

---

## 2. Naming Convention

**Frontend Naming vs. Circuit Parameters**

To improve code clarity, the frontend uses the terms `secret` and `salt` instead of the older `pk_b` 
and `random`:

| Frontend Name | Circuit ABI Name | Description                                       |
| :------------ | :--------------- | :------------------------------------------------ |
| `secret`      | `pk_b`           | Private bearer secret (not a public key).         |
| `salt`        | `random`         | Cryptographic salt for randomization.             |
| `nullifier`   | `nullifier`      | Hash-derived unique ID to prevent double-spend.   |

**Implementation Note:** When the frontend invokes Noir circuits or compiled artifacts, it maps 
`secret` → `pk_b` and `salt` → `random` to match the circuit's ABI. This allows the TypeScript 
codebase to use clearer, more intuitive names while preserving compatibility with existing compiled 
circuits.

---

## 3. The Data Structure (The "Note")

A "Note" consists of three components that exist **only** on the client side (User's browser/local
storage).

| Variable        | Type              | Description                                    | Visibility                                          |
| :-------------- | :---------------- | :--------------------------------------------- | :-------------------------------------------------- |
| **`Secret`**    | `Field` (256-bit) | The password to spend the funds; a bearer secret not tied to your wallet. | **Strictly Private**                                |
| **`Salt`**      | `Field` (256-bit) | Cryptographic salt used to derive the nullifier. | **Strictly Private**                                |
| **`Nullifier`** | `Field` (256-bit) | Derived from `salt` and `secret` via Poseidon; unique ID to prevent double-spending. | **Private** (Hash is Public)                        |
| **`Value`**     | `Field` (256-bit) | The amount (e.g., `1000000` for 1 USDC).       | **Public** (in Deposit) / **Private** (in Withdraw) |

### The Commitment (On-Chain Storage)

To deposit funds, we mathematically "wrap" the Note into a Commitment using the Poseidon hash
function.

First, the `Nullifier` is derived from `salt` and `secret`:
$$Nullifier = Poseidon([salt, secret])$$

Then the `Commitment` is computed as:
$$Commitment = Poseidon([value, nullifier])$$

- **Why Poseidon?** It is a ZK-friendly hash function, making proof generation cheap and fast
  (unlike SHA-256).

---

## 3. The Workflow

### Step 1: Deposit (Minting)

**Actor:** Depositor **Goal:** Lock funds into a secret code.

1.  **Generate Randomness:**
    - Client generates a random `secret` (bearer key) and `salt` (cryptographic nonce) using a secure RNG.
2.  **Calculate Nullifier and Commitment:**
    - `const nullifier = poseidon2([salt, secret]);`
    - `const commitment = poseidon2([value, nullifier]);`
3.  **Submit to Blockchain:**
    - Call `zkVVM.deposit(commitment, amount)` and send the `amount` (ETH/ERC20).
4.  **Store Secrets:**
    - **CRITICAL:** The browser must save the `secret` and `salt`. If these are lost, the funds
      are burned forever. The note is stored as: `zk-<amount>-<secret>-<salt>`.
5.  **Chain State:**
    - The Contract adds `commitment` to the **Merkle Tree**.
    - A new `Deposit` event is emitted with the commitment.

### Step 2: The Transfer (Off-Chain)

**Actor:** Depositor -> Receiver **Goal:** Hand over the cash.

1.  **Mechanism:** The Depositor sends the `secret` and `salt` to the Receiver (note string or raw values).
2.  **Medium:**
    - Encrypted Chat (Signal/WhatsApp/Telegram).
    - QR Code (In person).
    - Physical Paper ("Check").
3.  **Privacy:** The blockchain sees **zero activity** during this step.

### Step 3: Withdrawal (Spending)

**Actor:** Receiver **Goal:** Cash out the Note to a clean wallet.

1.  **Input:** Receiver enters `secret` + `salt` + `recipient address`.
2.  **Generate ZK Proof (Noir):**
    - **Private Inputs:** `secret`, `salt`, `value`, `merkle_proof_indices`, `merkle_proof_siblings`.
    - **Public Inputs:** `nullifier`, `merkle_proof_length`, `expected_merkle_root`, `recipient`, `commitment`.
3.  **The Circuit Proves:**
    - "I know a `secret` and `salt` that derive a `nullifier` matching the public input."
    - "The `nullifier` and `value` are part of a `commitment` inside the Merkle Tree Root."
    - "I am authorizing the withdrawal **ONLY** to this `recipient address`."
4.  **Submit to Blockchain:**
    - Relayer (Fisher) submits `zkVVM.withdraw(proof, publicInputs, ciphertext)`.
    - Contract verifies proof via UltraVerifier.
    - Contract checks `nullifier` is unused (not in nullifier set).
    - Contract transfers funds to `recipient`.
    - Contract marks `nullifier` as **Spent**.

---

## 4. Noir Circuit Logic (`main.nr`)

The circuit ensures the integrity of the withdrawal without revealing the secret.

```rust
use dep::std;

fn main(
    // PUBLIC INPUTS (Visible to Verifier/Contract)
    root: pub Field,             // The current Merkle Root of the tree
    nullifierHash: pub Field,    // The public identifier of the spent note
    recipient: pub Field,        // The address receiving the funds (prevents front-running)
    value: pub Field,            // The amount being withdrawn (must match deposit)

    // PRIVATE INPUTS (Hidden Witness)
    secret: Field,               // The secret key
    nullifier: Field,            // The unique nonce
    path_indices: [Field; 20],   // Merkle path directions (0=Left, 1=Right)
    path_siblings: [Field; 20]   // Merkle path sibling hashes
) {
    // 1. Reconstruct the Commitment
    // We hash the private inputs to see if they match the commitment in the tree.
    let commitment = std::hash::poseidon::bn254::hash_3([secret, nullifier, value]);

    // 2. Verify Merkle Membership
    // We calculate the root from our commitment up the tree path.
    let calculated_root = std::merkle::compute_merkle_root(commitment, path_indices, path_siblings);

    // CONSTRAINT: The calculated root must match the public root.
    assert(calculated_root == root);

    // 3. Verify Nullifier Validity
    // We hash the private nullifier to check against the public nullifierHash.
    let calculated_nullifier_hash = std::hash::poseidon::bn254::hash_1([nullifier]);

    // CONSTRAINT: The hash must match.
    assert(calculated_nullifier_hash == nullifierHash);

    // 4. Recipient Binding (Implicit)
    // The 'recipient' is a Public Input.
    // The Smart Contract will ensure msg.sender (or target) == recipient.
    // If someone changes the recipient, the proof is invalid because inputs changed.
}
```
