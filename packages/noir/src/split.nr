// Split circuit: spend 1 note, create 4 notes. Sum of output values must equal input value.
// Public inputs (order for Solidity): nullifier_in, merkle_proof_length, expected_merkle_root,
//   commitment_1, commitment_2, commitment_3, commitment_4.
// See docs/circuito-split-detalle.md for full spec.
use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_2 as poseidon2;

pub global MAX_DEPTH: u32 = 10;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main(
    // Public inputs (must match Solidity contract order)
    nullifier_in: pub Field,
    merkle_proof_length: pub u32,
    expected_merkle_root: pub Field,
    commitment_1: pub Field,
    commitment_2: pub Field,
    commitment_3: pub Field,
    commitment_4: pub Field,

    // Private: input note
    value_in: Field,
    pk_sender: Field,
    random_in: Field,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],

    // Private: output notes (4)
    value_1: Field,
    pk_1: Field,
    random_1: Field,
    value_2: Field,
    pk_2: Field,
    random_2: Field,
    value_3: Field,
    pk_3: Field,
    random_3: Field,
    value_4: Field,
    pk_4: Field,
    random_4: Field,
) {
    // ---- 1. Prove ownership of the spent note ----
    assert(nullifier_in == poseidon2([random_in, pk_sender]));

    let entry_in = compute_entry(value_in, pk_sender, random_in, nullifier_in);
    let merkle_root = binary_merkle_root(
        poseidon2,
        entry_in,
        merkle_proof_length,
        merkle_proof_indices,
        merkle_proof_siblings,
    );
    assert(merkle_root == expected_merkle_root);

    // ---- 2. Constrain the 4 output commitments ----
    let nullifier_1 = poseidon2([random_1, pk_1]);
    let nullifier_2 = poseidon2([random_2, pk_2]);
    let nullifier_3 = poseidon2([random_3, pk_3]);
    let nullifier_4 = poseidon2([random_4, pk_4]);

    assert(commitment_1 == poseidon2([value_1, nullifier_1]));
    assert(commitment_2 == poseidon2([value_2, nullifier_2]));
    assert(commitment_3 == poseidon2([value_3, nullifier_3]));
    assert(commitment_4 == poseidon2([value_4, nullifier_4]));

    // ---- 3. Balance: sum of outputs equals input value ----
    assert(value_1 + value_2 + value_3 + value_4 == value_in);
}
