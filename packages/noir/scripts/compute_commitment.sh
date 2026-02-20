#!/bin/bash
# Computes commitment = H(value, nullifier) for use in WithdrawProver.toml (v2b).
# Usage: from repo root, bun run packages/noir/scripts/compute_commitment.sh
# Or: cd packages/noir && ./scripts/compute_commitment.sh
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/commitment_helper.nr src/main.nr
PROVER_BACKUP=Prover.toml.bak
cp Prover.toml "$PROVER_BACKUP"
cp CommitmentHelperProver.toml Prover.toml
OUT=$(nargo execute 2>&1)
mv "$PROVER_BACKUP" Prover.toml
mv "$BACKUP" src/main.nr
echo "$OUT" | grep -oE '0x[0-9a-f]+' | tail -1
