# Flujo Prover – Montos variables (v2a) y withdraw v2b

## WithdrawProver.toml (v2b)

- **value** no va como public input: es **private input**. Los public inputs son 5: `nullifier`, `merkle_proof_length`, `expected_merkle_root`, `recipient`, `commitment`.
- **commitment** = H(value, nullifier); usar `./scripts/compute_commitment.sh` o el commitment_helper para obtenerlo.
-- Para la proof: rellenar los 5 públicos y los privados (value, secret, salt, merkle_proof_*). El contrato usa `withdrawV2b(proof, publicInputs, ciphertext)`; el ciphertext se genera off-chain con la misma clave que el contrato (ver `lib/withdraw-v2b-ciphertext.ts` y `bun run gen-ciphertext`).

	Nota: el código fuente y los artefactos compilados de Noir todavía nombran los privados `pk_b` y `random`. En el flujo frontend usamos `secret`/`salt` por claridad y los mapeamos a `pk_b`/`random` cuando invocamos el circuito o el probador.

## WithdrawProver.toml (v2a – value público)

- **value** es configurable: es el monto a retirar (mismo orden que el circuito).
- Cambia `value` al monto deseado (ej. `"0x1"` para 1 unidad, `"0xde0b6b3a7640000"` para 1e18).
- Para que la proof sea válida, **nullifier** y **expected_merkle_root** deben corresponder a ese mismo `value` (generados con `nullifier_helper` o `root_helper`/`calc_root` con el mismo valor).

## NullifierHelperProver.toml

- Usado por `nullifier_helper` (entrada `value`).
- Pon el mismo **value** que en WithdrawProver.toml; ejecuta el helper y copia (nullifier, expected_merkle_root) a WithdrawProver.toml.
- Cómo ejecutar el helper: el entry point del paquete es `main.nr` (withdraw). Para ejecutar `nullifier_helper` hace falta usarlo como main (p. ej. script que invoque nargo con otro entry point si tu versión lo permite) o un segundo paquete que tenga `nullifier_helper.nr` como main.

## Scripts que generan commitment / note

- Deben usar el **value** deseado en `compute_entry(value, holder, random, nullifier)` al construir la note/commitment.
- Al generar la proof de withdraw, usar el mismo **value** en los public inputs (y en WithdrawProver.toml).

## Scripts de deposit

- Deben llamar **deposit(commitment, amount)** con el **amount** que corresponda al commitment (mismo monto que el `value` de la note).
