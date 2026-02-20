#!/bin/bash
# Compila el circuito split (7 public inputs: nullifier_in, merkle_proof_length, expected_merkle_root, commitment_1..4).
# Uso: desde packages/noir -> ./scripts/compile_split_verifier.sh
# Hace: guarda main.nr, usa split.nr como main, nargo compile, copia target/Verifier.sol a ../contracts/, restaura main.nr.
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/split.nr src/main.nr
nargo compile
mkdir -p ../contracts
if [ -f target/Verifier.sol ]; then
  sed 's/contract UltraVerifier/contract SplitVerifier/' target/Verifier.sol > ../contracts/SplitVerifier.sol
else
  echo "Warning: target/Verifier.sol not found (noirenberg may write it). Copy UltraVerifier.sol to SplitVerifier.sol and rename the contract manually."
fi
mv "$BACKUP" src/main.nr
echo "Done. ../contracts/SplitVerifier.sol generado (split, 7 public inputs). Usar este verifier en ShieldedPool para transferSplit."
