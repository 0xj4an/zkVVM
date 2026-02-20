# Circuito Split – Especificación detallada

## 1. Objetivo

Probar que el prover **posee una nota** (incluida en el Merkle tree con root conocido) y que está creando **exactamente 4 notas nuevas** cuyos montos suman el monto de la nota gastada. Las 4 notas quedan identificadas por sus commitments; el contrato los registra y marca el nullifier de la nota gastada como usado.

---

## 2. Fórmulas compartidas con withdraw/note_generator

Mismo hash (Poseidon BN254) y misma estructura de nota:

- `poseidon2([a, b])` = hash de dos campos (Poseidon en BN254).
- **Nullifier:** `nullifier = poseidon2([random, pk])`
- **Commitment:** `commitment = poseidon2([value, nullifier])`
- **Entry (hoja del árbol):**  
  `entry = poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])`  
  Es decir: `compute_entry(value, holder, random, nullifier)`.

---

## 3. Entradas del circuito

### 3.1 Public inputs (orden para Solidity)

El orden debe coincidir con el array `bytes32[] publicInputs` en el contrato.

| Índice | Nombre               | Tipo   | Uso |
|--------|----------------------|--------|-----|
| 0      | `nullifier_in`       | Field  | Nullifier de la nota gastada. El contrato lo marca como usado. |
| 1      | `merkle_proof_length`| u32    | Profundidad de la Merkle proof de la nota gastada. |
| 2      | `expected_merkle_root` | Field | Root contra el que se verifica la inclusión de la nota gastada. |
| 3      | `commitment_1`       | Field  | Commitment de la 1ª nota nueva. |
| 4      | `commitment_2`       | Field  | Commitment de la 2ª nota nueva. |
| 5      | `commitment_3`       | Field  | Commitment de la 3ª nota nueva. |
| 6      | `commitment_4`       | Field  | Commitment de la 4ª nota nueva. |

**Total: 7 public inputs.**  
El contrato comprobará `publicInputs.length == 7` y usará los índices 0–2 para root/nullifier y 3–6 para registrar los 4 commitments.

### 3.2 Private inputs

| Nombre | Tipo | Uso |
|--------|------|-----|
| **Nota gastada** | | |
| `value_in` | Field | Monto de la nota que se gasta. |
| `pk_sender` | Field | Dirección del dueño de la nota (como Field). |
| `random_in` | Field | Aleatorio de la nota gastada. |
| `merkle_proof_indices` | `[u1; MAX_DEPTH]` | Índices de la Merkle proof (nota gastada). |
| `merkle_proof_siblings` | `[Field; MAX_DEPTH]` | Hermanos de la Merkle proof (nota gastada). |
| **Salida 1** | | |
| `value_1` | Field | Monto de la 1ª nota nueva. |
| `pk_1` | Field | Dueño de la 1ª nota (address como Field). |
| `random_1` | Field | Aleatorio de la 1ª nota. |
| **Salida 2** | | |
| `value_2`, `pk_2`, `random_2` | Field | Idem para la 2ª nota. |
| **Salida 3** | | |
| `value_3`, `pk_3`, `random_3` | Field | Idem para la 3ª nota. |
| **Salida 4** | | |
| `value_4`, `pk_4`, `random_4` | Field | Idem para la 4ª nota. |

`MAX_DEPTH` = 10 (igual que en withdraw).

---

## 4. Restricciones del circuito

### 4.1 Nota gastada (input)

1. **Nullifier:**  
   `nullifier_in == poseidon2([random_in, pk_sender])`
2. **Commitment de la nota gastada** (solo para consistencia interna; no se expone como público):  
   `commitment_in = poseidon2([value_in, nullifier_in])`
3. **Entry:**  
   `entry_in = compute_entry(value_in, pk_sender, random_in, nullifier_in)`
4. **Inclusión en el árbol:**  
   `binary_merkle_root(poseidon2, entry_in, merkle_proof_length, merkle_proof_indices, merkle_proof_siblings) == expected_merkle_root`

### 4.2 Cuatro notas nuevas (outputs)

Para cada `i` en {1, 2, 3, 4}:

1. **Nullifier:**  
   `nullifier_i = poseidon2([random_i, pk_i])`
2. **Commitment (debe coincidir con el public input):**  
   `commitment_i == poseidon2([value_i, nullifier_i])`
3. **Entry (para que el indexer pueda insertar la hoja):**  
   `entry_i = compute_entry(value_i, pk_i, random_i, nullifier_i)`  
   No se expone como público; el indexer puede recomputarlo off-chain si tiene (value_i, pk_i, random_i, nullifier_i) o el circuito podría exponer los 4 entries si se quisiera (opcional).

### 4.3 Balance

- **Suma de montos:**  
  `value_1 + value_2 + value_3 + value_4 == value_in`

Con eso se garantiza que no se crea ni se destruye valor.

---

## 5. Qué no hace este circuito

- **No calcula el nuevo Merkle root.** El nuevo root depende de dónde se inserten las 4 hojas en el árbol (índices). Eso lo resuelve el indexer off-chain: inserta los 4 `entry_i`, calcula el nuevo root y se registra on-chain (p. ej. con `registerRoot`).
- **No expone los nullifiers de las 4 notas.** Quedan privados; cada destinatario los usa cuando haga withdraw o transfer. Si en el futuro el contrato necesitara registrar nullifiers de salida, se podrían añadir como public outputs.

---

## 6. Orden de public inputs en Solidity

Para `transferSplit(proof, publicInputs)`:

```text
publicInputs[0] = nullifier_in
publicInputs[1] = bytes32(merkle_proof_length)
publicInputs[2] = expected_merkle_root
publicInputs[3] = commitment_1
publicInputs[4] = commitment_2
publicInputs[5] = commitment_3
publicInputs[6] = commitment_4
```

---

## 7. Archivos del circuito

| Archivo | Rol |
|---------|-----|
| `packages/noir/src/split.nr` | Circuito split (main). |
| `packages/noir/SplitProver.toml` | Ejemplo de inputs para el prover. |
| `packages/noir/scripts/compile_split_verifier.sh` | Copia `split.nr` → `main.nr`, ejecuta `nargo compile`, escribe `contracts/SplitVerifier.sol` y restaura `main.nr`. Ejecutar desde `packages/noir`: `./scripts/compile_split_verifier.sh`. |

---

## 8. Dependencias

- `binary_merkle_root` (zk-kit, mismo que withdraw).
- `poseidon` (noir-lang, BN254, mismo que withdraw/note_generator).

No se añaden nuevas dependencias.
