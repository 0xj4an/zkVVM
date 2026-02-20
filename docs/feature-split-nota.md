# Feature: Split de nota (1 nota → hasta 4 notas)

## Resumen

Permitir que un usuario que posee una nota válida en el pool ejecute una operación **split**: gastar esa nota y crear **hasta 4 notas nuevas** cuyos montos sumen exactamente el monto de la nota gastada (pagos a terceros + cambio). N está fijado en 4 para simplificar circuito, contrato y árbol.

---

## 1. Requerimientos mínimos

### Funcional

| ID   | Requerimiento |
|------|----------------|
| R1   | Un usuario que posea una nota válida (con proof de inclusión en un Merkle root conocido) puede ejecutar una operación **split** que gaste esa nota y cree **hasta 4 notas nuevas** cuyos montos sumen exactamente el monto de la nota gastada. |
| R2   | Cada nota nueva queda identificada por su **commitment**; el contrato registra los 4 commitments y marca el nullifier de la nota gastada como usado. |
| R3   | El árbol de Merkle se actualiza con las 4 nuevas hojas (entries); existe un **nuevo root** que el contrato acepta (vía registro o como salida del circuito) para que las 4 notas sean gastables después. |
| R4   | Quien ejecuta el split puede asignar montos a 1–4 destinatarios; el resto (hasta 4 salidas) se considera “cambio” o salidas con valor 0 para completar la suma. |

### No funcional

| ID   | Requerimiento |
|------|----------------|
| R5   | El circuito tiene **N fijo = 4** salidas (sin N variable). |
| R6   | Se reutiliza la misma convención de árbol (entry = `compute_entry`, sibling vacío = 0) y la misma hash (Poseidon BN254) que withdraw/note_generator. |

---

## 2. Criterios de aceptación

### Circuito (Noir)

| ID   | Criterio |
|------|-----------|
| CA1  | Existe un circuito `split.nr` (o equivalente) que: prueba posesión de **1 nota** (nullifier, commitment, Merkle proof contra `expected_merkle_root`); genera **4 salidas** con `value_1 + value_2 + value_3 + value_4 = value_in`; public inputs incluyen `nullifier_in`, `merkle_proof_length`, `expected_merkle_root` y los 4 `commitment_out_i` (y opcionalmente lo que el contrato necesite para ciphertext/recipient). |
| CA2  | El circuito compila con la misma toolchain (Noir) y dependencias (Poseidon, binary_merkle_root) ya usadas en el proyecto. |
| CA3  | Se genera verifier (Solidity/UltraVerifier) y se integra en el repo (scripts de compilación/documentación). |

### Contrato

| ID   | Criterio |
|------|-----------|
| CA4  | Existe una función (ej. `transferSplit` o `split`) que: recibe proof del circuito split y los public inputs en el orden acordado; comprueba que `expected_merkle_root` está en `isKnownRoot` y que el nullifier de la nota gastada no está en `nullifiers`; llama al verifier del split; si es válido, marca el nullifier como gastado y registra los 4 commitments (p. ej. `usedCommitments[commitment_i] = true` o evento que permita al indexer actualizar estado). |
| CA5  | Se emite un evento que permita al indexer/backend saber: nullifier gastado, 4 commitments nuevos y, si aplica, el nuevo root (si el circuito lo expone y se registra en la misma tx o después). |
| CA6  | No se puede reutilizar el mismo nullifier ni un commitment ya usado. |

### Árbol / Indexer

| ID   | Criterio |
|------|-----------|
| CA7  | Tras una tx de split exitosa, el árbol off-chain se actualiza con **4 nuevas hojas** (los 4 `entry` correspondientes a los 4 commitments). |
| CA8  | Se calcula y se registra (on-chain o vía `registerRoot`) el **nuevo root** para que las 4 notas puedan usarse en withdraw/transfer/split posteriores con una Merkle proof válida. |
| CA9  | Cada una de las 4 notas tiene datos consumibles (entry, nullifier, value, pk, random, merkle_proof_*, expected_merkle_root) para que sus dueños puedan retirar o hacer transfer/split después. |

### Integración / E2E

| ID   | Criterio |
|------|-----------|
| CA10 | Flujo E2E: usuario con nota válida ejecuta split con 4 montos que suman el valor de la nota; la tx es aceptada; el árbol se actualiza; al menos una de las 4 notas nuevas puede usarse en un withdraw (o transfer) de prueba contra el nuevo root. |
| CA11 | Test automatizado: deposito → (opcional) transfer/withdraw que deja una nota → split 1→4 → comprobación de nullifier gastado, 4 commitments registrados y (si aplica) nuevo root registrado. |

---

## 3. Tareas a ejecutar

### Circuito Noir

| # | Tarea | Estado |
|---|--------|--------|
| 1 | Crear `split.nr`: entradas privadas (value_in, pk_sender, random_in, merkle proof; value_i, pk_i, random_i para i=1..4) y públicas (nullifier_in, merkle_proof_length, expected_merkle_root, commitment_1..4). | ✅ Hecho |
| 2 | Implementar restricciones: nullifier y commitment de la nota gastada; inclusión Merkle; para i=1..4: nullifier_i, commitment_i, entry_i; `value_1+value_2+value_3+value_4 = value_in`. | ✅ Hecho |
| 3 | Decidir si el circuito expone el **nuevo root** como public output (y documentarlo). | ✅ Hecho (no se expone; el nuevo root lo calcula el indexer; ver docs/circuito-split-detalle.md §5). |
| 4 | Añadir Prover.toml (o equivalente) para split y script de compilación del verifier (ej. `compile_split_verifier.sh`). | ✅ Hecho (`SplitProver.toml`, `scripts/compile_split_verifier.sh`) |
| 5 | Integrar en el pipeline de build (p. ej. Hardhat/Noirenberg) y comprobar que el verifier se despliega/usa correctamente. | ⏳ Parcial: existe `bun run build:split-verifier` (genera `contracts/SplitVerifier.sol`). Falta: implementar `transferSplit` en ShieldedPool que use SplitVerifier y tests que lo ejerciten. |

### Contrato

| # | Tarea | Estado |
|---|--------|--------|
| 6 | Añadir dirección del verifier del split (constructor o setter si aplica) y variable `IVerifier public immutable splitVerifier` (o nombre elegido). | ✅ Hecho |
| 7 | Implementar `transferSplit(bytes calldata proof, bytes32[] calldata publicInputs)`: verificación de root, nullifier no gastado, verifier.verify(proof, publicInputs), marcar nullifier, registrar 4 commitments. | ✅ Hecho |
| 8 | Emitir evento `Split(bytes32 indexed nullifier, bytes32[4] commitments, bytes32 newRoot?)` (o equivalente) con la información necesaria para el indexer. | ✅ Hecho (`event Split(bytes32 indexed nullifierIn, bytes32 c1, c2, c3, c4)`) |
| 9 | Tests unitarios: split válido (nullifier gastado, 4 commitments usados); rechazo con proof inválida, root desconocido, nullifier ya gastado. | ⏳ Pendiente |

### Árbol / Backend o indexer

| # | Tarea |
|---|--------|
| 10 | Definir formato de evento/llamada que el indexer usa para detectar un split (nullifier, 4 commitments, nuevo root si viene en evento). |
| 11 | Implementar actualización del árbol: insertar 4 hojas (entries) en los índices que correspondan; calcular nuevo root; persistir estado (índice siguiente, root actual). |
| 12 | Si el nuevo root no lo registra el contrato en la misma tx, implementar flujo para llamar `registerRoot(newRoot)` (indexer, bot o script) tras procesar el split. |
| 13 | (Opcional) API o util para generar Merkle proof de una de las 4 notas nuevas dado su índice (para tests y frontend). |

### Frontend / UX (mínimo)

| # | Tarea |
|---|--------|
| 14 | Servicio o función que construye los public/private inputs del circuito split (a partir de la nota de B y de los 4 montos/destinatarios). |
| 15 | Llamada a `transferSplit` (write) desde la app usando proof e inputs generados. |
| 16 | (Opcional) Pantalla o flujo “Split”: selección de nota, entrada de hasta 4 montos (con validación suma = valor de la nota), generación de proof y envío de tx. |

### Documentación y cierre

| # | Tarea |
|---|--------|
| 17 | Documentar orden de public inputs del circuito y cómo se mapean a `bytes32[]` en el contrato. |
| 18 | Actualizar README o docs del repo con: qué es el split, límite de 4 notas y flujo B → C,D,E + cambio. |
| 19 | Ejecutar criterios de aceptación (CA1–CA11) y marcar feature como listo. |

---

## 4. Entregables por área

| Área      | Entregable principal |
|----------|----------------------|
| Circuito | `split.nr` + verifier integrado |
| Contrato | `transferSplit` + evento + tests |
| Árbol    | Actualización con 4 hojas + nuevo root registrado |
| E2E      | Test: nota → split → nota nueva gastable |
| Frontend | Construcción de inputs + llamada a `transferSplit` (mínimo) |

---

## 5. Especificación del circuito

La especificación detallada del circuito (entradas públicas/privadas, orden para Solidity, restricciones y fórmulas) está en **[docs/circuito-split-detalle.md](./circuito-split-detalle.md)**. El código del circuito está en `packages/noir/src/split.nr`.

---

## 6. Caso de uso de referencia

- **B** tiene una nota de 100 USDC (recibida previamente).
- **B** quiere pagar: C = 25, D = 35, E = 15; cambio para B = 25.
- **B** ejecuta split: 1 nota gastada → 4 notas nuevas (25, 35, 15, 25).
- C, D, E y B reciben off-chain los datos de su nota; cada uno puede después hacer withdraw o un nuevo split/transfer contra el nuevo root.
