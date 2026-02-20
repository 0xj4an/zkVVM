# Flujo Prover – Montos variables (v2a)

## WithdrawProver.toml

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
