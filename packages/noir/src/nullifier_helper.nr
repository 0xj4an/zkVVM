// Helper: returns nullifier and expected_merkle_root for a given value (pk_b=2, random=100).
// Run with Prover.toml containing: value = <amount>, or pass value when executing.
// Paste output (nullifier, root) into WithdrawProver.toml.
use poseidon::poseidon::bn254::hash_2 as poseidon2;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main(value: Field) -> pub (Field, Field) {
    let pk_b = 2;
    let random = 100;
    let nullifier = poseidon2([random, pk_b]);
    let entry = compute_entry(value, pk_b, random, nullifier);
    let sibling = 0;
    let root = poseidon2([entry, sibling]);
    (nullifier, root)
}
