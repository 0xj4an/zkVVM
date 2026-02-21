# zkVVM

A privacy-preserving **Shielded Pool** protocol built with [Noir](https://noir-lang.org/) zero-knowledge circuits, [Solidity](https://soliditylang.org/) smart contracts, and a [React](https://react.dev/) + [Vite](https://vite.dev/) frontend. Users can deposit tokens into the pool and withdraw to any address without revealing the link between depositor and recipient.

## Architecture

```text
zkVVM/
├── packages/
│   ├── contracts/                # Solidity smart contracts
│   │   ├── ShieldedPool.sol      # Core privacy pool (deposit, transfer, withdraw)
│   │   ├── IVerifier.sol         # Proof verification interface
│   │   ├── UltraVerifier.sol     # Auto-generated UltraPlonk verifier
│   │   ├── MockERC20.sol         # Test token
│   │   └── MockVerifier.sol      # Test verifier stub
│   │
│   ├── noir/                     # Noir ZK circuits
│   │   ├── src/
│   │   │   ├── main.nr           # Transfer/intent circuit
│   │   │   ├── withdraw.nr       # Withdrawal circuit
│   │   │   ├── nullifier_helper.nr
│   │   │   └── root_helper.nr
│   │   ├── scripts/              # Deposit, compute, and compile scripts
│   │   └── libs/                 # Poseidon, Edwards, Merkle tree libraries
│   │
│   └── vite/                     # React frontend
│       ├── components/           # Deposit UI
│       └── hooks/                # Proof generation & verification hooks
│
├── tests/                        # Integration & proving system tests
├── hardhat.config.cts            # Contract deployment & network config
└── package.json                  # Monorepo workspace root
```

## Stack

| Layer | Technology |
| ----- | ---------- |
| ZK Circuits | Noir, ACVM |
| Proving Systems | UltraPlonk, UltraHonk (@aztec/bb.js) |
| Cryptography | Poseidon2, Baby Jubjub (Edwards), Keccak256, Binary Merkle Trees |
| Smart Contracts | Solidity 0.8.28, Hardhat |
| Frontend | React, TypeScript, Vite |
| Blockchain | Wagmi, Viem |
| Runtime | Bun |

## How It Works

### Note Structure

Every deposit creates a **note** — a Poseidon2 hash commitment:

```mermaid
graph LR
    subgraph Inputs
        V[value]
        H[holder_id]
        R[random]
    end

    V & H --> P1["poseidon2([value, holder_id])"]
    R & H --> N["nullifier = poseidon2([random, holder_id])"]
    R & N --> P2["poseidon2([random, nullifier])"]
    P1 & P2 --> Entry["entry (commitment)"]

    style Entry fill:#10b981,color:#fff
    style N fill:#f59e0b,color:#fff
```

### Note String Format

Bearer notes are stored and shared as strings with the following format:

`zk-<amount>-<secret>-<salt>`

- **amount**: The value of the note in decimal (e.g., `100.00`).
- **secret**: The bearer secret key in hex format (e.g., `0x123...`). This is the private secret you must keep safe.
- **salt**: A cryptographic salt used for nullifier and commitment derivation in hex format.

Note: the Noir circuits and compiled artifacts still use parameter names `pk_b` and `random`. Frontend code uses `secret`/`salt` for clarity and maps them to `pk_b`/`random` when invoking the circuits.

This string contains all the secrets required to recompute the note's nullifier and generate a ZK proof for withdrawal.

### Circuits

| Circuit | Purpose | Public Inputs |
| ------- | ------- | ------------- |
| `main.nr` | Private note-to-note transfers | newCommitment, nullifier, merkleProofLength, expectedRoot |
| `withdraw.nr` | Withdraw to a specific recipient | value, nullifier, merkleProofLength, expectedRoot, recipient |
| `nullifier_helper.nr` | Compute nullifier + root from a note value | (helper) |
| `root_helper.nr` | Compute merkle root from a commitment path | (helper) |

### Protocol Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Noir as Noir Circuit
    participant Pool as ShieldedPool
    participant Verifier as UltraVerifier

    rect rgb(59, 130, 246, 0.1)
        Note over User,Pool: Deposit
        User->>Frontend: commitment + amount
        Frontend->>Pool: deposit(commitment, amount)
        Pool-->>Frontend: Deposit event
    end

    rect rgb(16, 185, 129, 0.1)
        Note over User,Verifier: Withdraw
        User->>Noir: private inputs
        Noir-->>Frontend: proof + publicInputs
        Frontend->>Pool: withdraw(proof, publicInputs)
        Pool->>Verifier: verify(proof, publicInputs)
        Pool->>Pool: nullifier marked spent
        Pool-->>User: funds to recipient
    end

    rect rgb(245, 158, 11, 0.1)
        Note over User,Verifier: Transfer
        User->>Noir: private inputs
        Noir-->>Frontend: proof + publicInputs
        Frontend->>Pool: transferIntent(...)
        Pool->>Verifier: verify(proof, publicInputs)
        Pool->>Pool: nullifier spent, new commitment emitted
    end
```

### ShieldedPool Contract

- **`deposit(commitment, amount)`** — Store a commitment, emit Deposit event
- **`transferIntent(root, nullifier, ..., proof)`** — Private note transfer, verified on-chain
- **`withdraw(proof, publicInputs)`** — Withdraw to recipient bound in the ZK proof
- **`registerRoot(root)`** — Register a valid merkle root (computed off-chain)

Double-spend protection via nullifiers. Reentrancy-guarded. Recipient binding prevents front-running.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Nargo](https://noir-lang.org/docs/getting_started/installation/) (Noir toolchain)

### Install

```bash
bun i
```

### Run Locally

```bash
# 1. Start a local Ethereum node
bunx hardhat node

# 2. Compile circuit & deploy verifier contract
bun run deploy

# 3. Start the frontend dev server
bun dev
```

### Testing

```bash
# Run all tests (UltraPlonk + UltraHonk + ShieldedPool)
bun run test

# UltraPlonk only
bun run test:up

# UltraHonk only
bun run test:uh
```

Tests cover: deposit/withdraw flows with real ZK proofs, duplicate commitment rejection, nullifier double-spend prevention, and unknown root rejection.

## Noir Scripts

```bash
# Compute Poseidon2 hashes and merkle roots (demo)
cd packages/noir && bun scripts/compute.mjs

# On-chain deposit via CLI
MONAD_RPC=<rpc_url> PRIVATE_KEY=<key> POOL_ADDRESS=<addr> bun scripts/deposit.mjs

# Compile withdraw.nr into a Solidity verifier
./packages/noir/scripts/compile_withdraw_verifier.sh
```

See [PROVER_WORKFLOW.md](packages/noir/PROVER_WORKFLOW.md) for the full variable-amount proving workflow.

## Deploying to Testnets

Supported networks: **Holesky**, **Scroll Sepolia** (add more in `hardhat.config.cts`).

```bash
# Set your private key for a network
bunx hardhat vars set holesky <your_private_key>

# Deploy to that network
bunx hardhat deploy --network holesky
```

Networks must be [supported by Wagmi](https://wagmi.sh/react/api/chains#available-chains) and configured in `hardhat.config.cts`.

## Project Scripts

| Command | Description |
| ------- | ----------- |
| `bun i` | Install dependencies |
| `bun dev` | Start Vite dev server |
| `bun run deploy` | Compile circuit & deploy verifier contract |
| `bun run node` | Start local Hardhat node |
| `bun run test` | Run all tests |
| `bun run test:up` | Run UltraPlonk tests |
| `bun run test:uh` | Run UltraHonk tests |

## License

MIT
