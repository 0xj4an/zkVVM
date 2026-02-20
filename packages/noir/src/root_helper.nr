// root_helper: compute expected_merkle_root for a note.
use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_2 as poseidon2;
use poseidon::poseidon::bn254::hash_3 as poseidon3;

pub global MAX_DEPTH: u32 = 10;

#[export]
fn calc_root(
    secret: Field,
    nullifier: Field,
    value: Field,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],
) -> Field {
    let entry = poseidon3([secret, nullifier, value]);

    binary_merkle_root(
        poseidon2,
        entry,
        MAX_DEPTH,
        merkle_proof_indices,
        merkle_proof_siblings,
    )
}

fn main(
    secret: Field,
    nullifier: Field,
    value: Field,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],
) -> pub Field {
    calc_root(
        secret,
        nullifier,
        value,
        merkle_proof_indices,
        merkle_proof_siblings,
    )
}
