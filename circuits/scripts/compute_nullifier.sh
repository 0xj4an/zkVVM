#!/bin/bash
# Runs nullifier_helper: given value (in NullifierHelperProver.toml), outputs nullifier and expected_merkle_root.
# nullifier = H(random, pk_b) with pk_b=2, random=100. Use these in CommitmentHelperProver.toml and WithdrawProver.toml.
#
# Usage: cd packages/noir && ./scripts/compute_nullifier.sh
# Output: two lines, nullifier then expected_merkle_root (0x... each).
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/nullifier_helper.nr src/main.nr
PROVER_BACKUP=Prover.toml.bak
cp Prover.toml "$PROVER_BACKUP"
cp NullifierHelperProver.toml Prover.toml
OUT=$(nargo execute 2>&1)
mv "$PROVER_BACKUP" Prover.toml
mv "$BACKUP" src/main.nr

# nullifier_helper returns (nullifier, root); nargo prints hex values
HEXVALS=($(echo "$OUT" | grep -oE '0x[0-9a-f]+'))
NULLIFIER="${HEXVALS[0]:?Could not parse nullifier}"
ROOT="${HEXVALS[1]:?Could not parse expected_merkle_root}"
echo "nullifier=$NULLIFIER"
echo "expected_merkle_root=$ROOT"
echo ""
echo "Paste nullifier into CommitmentHelperProver.toml, then run ./scripts/compute_commitment.sh"
echo "Paste both into WithdrawProver.toml as nullifier and expected_merkle_root"
