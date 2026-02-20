# zkVVM

A privacy-preserving **Shielded Pool** protocol built with [Noir](https://noir-lang.org/) zero-knowledge circuits, [Solidity](https://soliditylang.org/) smart contracts, and a [React](https://react.dev/) + [Vite](https://vite.dev/) frontend. Users can deposit tokens into the pool and withdraw to any address without revealing the link between depositor and recipient.

## Architecture

```mermaid
graph TB
    subgraph Frontend ["Frontend (packages/vite)"]
        UI[React UI]
        Hooks[Wagmi Hooks]
        ProofGen[Proof Generation]
    end

    subgraph Circuits ["ZK Circuits (packages/noir)"]
        Main[main.nr<br/>Transfer Circuit]
        Withdraw[withdraw.nr<br/>Withdraw Circuit]
        Helpers[nullifier_helper.nr<br/>root_helper.nr]
    end

    subgraph Contracts ["Smart Contracts (packages/contracts)"]
        Pool[ShieldedPool.sol]
        UV[UltraVerifier.sol]
        IVer[IVerifier.sol]
    end

    subgraph Libs ["Crypto Libraries"]
        Poseidon[Poseidon2]
        Merkle[Binary Merkle Tree]
        Edwards[Baby Jubjub]
    end

    UI --> Hooks
    Hooks --> ProofGen
    ProofGen --> Main
    ProofGen --> Withdraw
    Main --> Libs
    Withdraw --> Libs
    Helpers --> Libs
    Hooks -->|"tx"| Pool
    Pool -->|"verify"| UV
    UV -.-> IVer
```

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

```mermaid
block-beta
    columns 3
    A["ZK Circuits<br/>Noir | ACVM"]:3
    B["Proving Systems<br/>UltraPlonk | UltraHonk<br/>(@aztec/bb.js)"]:3
    C["Cryptography<br/>Poseidon2 | Baby Jubjub | Keccak256 | Merkle Trees"]:3
    D["Smart Contracts<br/>Solidity 0.8.28 | Hardhat"]:2
    E["Frontend<br/>React | Vite"]:1
    F["Blockchain<br/>Wagmi | Viem"]:2
    G["Runtime<br/>Bun"]:1
```

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

```text
entry = poseidon2(poseidon2([value, holder_id]), poseidon2([random, nullifier]))
where nullifier = poseidon2([random, holder_id])
```

### Circuits

```mermaid
graph TB
    subgraph Transfer ["main.nr — Transfer Circuit"]
        direction LR
        T_Priv["Private Inputs<br/>pk_a, pk_b, random_in,<br/>random_out, nullifier_in,<br/>merkle_proof"]
        T_Pub["Public Inputs<br/>newCommitment<br/>nullifier<br/>merkleProofLength<br/>expectedRoot"]
        T_Priv --> T_Verify{{"Verify ownership<br/>+ merkle inclusion"}}
        T_Verify --> T_Pub
    end

    subgraph WithdrawC ["withdraw.nr — Withdraw Circuit"]
        direction LR
        W_Priv["Private Inputs<br/>pk_b, random,<br/>merkle_proof"]
        W_Pub["Public Inputs<br/>value, nullifier<br/>merkleProofLength<br/>expectedRoot<br/>recipient"]
        W_Priv --> W_Verify{{"Verify ownership<br/>+ bind recipient"}}
        W_Verify --> W_Pub
    end

    subgraph HelperC ["Helpers"]
        NH["nullifier_helper.nr<br/>Compute nullifier + root"]
        RH["root_helper.nr<br/>Compute merkle root"]
    end

    HelperC -.->|"feeds inputs"| WithdrawC
```

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
        Note over User,Pool: Deposit Flow
        User->>Frontend: Input commitment + amount
        Frontend->>Pool: deposit(commitment, amount)
        Pool->>Pool: Store commitment<br/>Mark as used
        Pool-->>Frontend: Deposit event
    end

    rect rgb(16, 185, 129, 0.1)
        Note over User,Verifier: Withdraw Flow
        User->>Frontend: Input value, recipient, secret
        Frontend->>Noir: Generate ZK proof<br/>(withdraw.nr)
        Noir-->>Frontend: proof + publicInputs
        Frontend->>Pool: withdraw(proof, publicInputs)
        Pool->>Verifier: verify(proof, publicInputs)
        Verifier-->>Pool: valid
        Pool->>Pool: Mark nullifier spent
        Pool-->>User: Funds to recipient
    end

    rect rgb(245, 158, 11, 0.1)
        Note over User,Verifier: Transfer Flow
        User->>Frontend: Input transfer details
        Frontend->>Noir: Generate ZK proof<br/>(main.nr)
        Noir-->>Frontend: proof + publicInputs
        Frontend->>Pool: transferIntent(root, nullifier, newCommitment, proof)
        Pool->>Verifier: verify(proof, publicInputs)
        Verifier-->>Pool: valid
        Pool->>Pool: Mark nullifier spent<br/>Emit new commitment
    end
```

### ShieldedPool Contract

```mermaid
graph LR
    subgraph Entrypoints
        D["deposit()"]
        T["transferIntent()"]
        W["withdraw()"]
        R["registerRoot()"]
    end

    subgraph State
        Commits["usedCommitments<br/>(mapping)"]
        Nulls["nullifiers<br/>(mapping)"]
        Roots["isKnownRoot<br/>(mapping)"]
    end

    subgraph Security
        Reentrancy["ReentrancyGuard"]
        NullCheck["Nullifier<br/>double-spend check"]
        RootCheck["Known root<br/>validation"]
        RecipientBind["Recipient<br/>binding in proof"]
    end

    D --> Commits
    T --> Nulls
    T --> Roots
    W --> Nulls
    W --> Roots
    R --> Roots

    Nulls --> NullCheck
    Roots --> RootCheck
    W --> RecipientBind
    D & T & W --> Reentrancy
```

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
