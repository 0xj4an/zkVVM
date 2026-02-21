#!/bin/bash
# Compila el circuito withdraw v2b (5 public inputs: nullifier, merkle_proof_length, expected_merkle_root, recipient, commitment).
# Uso: desde packages/noir -> ./scripts/compile_withdraw_verifier.sh
# Hace: guarda main.nr, usa withdraw.nr como main, nargo compile, copia target/Verifier.sol a ../contracts/, restaura main.nr.
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/withdraw.nr src/main.nr
nargo compile
mkdir -p ../contracts
if [ -f target/Verifier.sol ]; then
  sed 's/contract UltraVerifier/contract WithdrawVerifierV2b/' target/Verifier.sol > ../contracts/WithdrawVerifierV2b.sol
else
  echo "Warning: target/Verifier.sol not found (noirenberg may write it). Copy UltraVerifier.sol to WithdrawVerifierV2b.sol and rename the contract manually."
fi
mv "$BACKUP" src/main.nr
echo "Done. ../contracts/WithdrawVerifierV2b.sol generado (v2b, 5 public inputs). Para Etapa 3.3 usar este verifier en ShieldedPool."
