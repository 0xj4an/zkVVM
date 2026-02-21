// Generates (nullifier, commitment, entry, expected_merkle_root) for a single-leaf note.
// Same Poseidon and compute_entry as withdraw.nr. Used from frontend via noir_js.execute().
use poseidon::poseidon::bn254::hash_2 as poseidon2;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

// value = amount (token units), pk_b = wallet address as Field, random = timestamp (seconds).
fn main(value: Field, pk_b: Field, random: Field) -> pub (Field, Field, Field, Field) {
    let nullifier = poseidon2([random, pk_b]);
    let commitment = poseidon2([value, nullifier]);
    let entry = compute_entry(value, pk_b, random, nullifier);
    let root = poseidon2([entry, 0]);
    (nullifier, commitment, entry, root)
}
