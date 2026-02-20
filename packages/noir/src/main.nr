use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_1 as poseidon1;
use poseidon::poseidon::bn254::hash_2 as poseidon2;
use poseidon::poseidon::bn254::hash_3 as poseidon3;

pub global MAX_DEPTH: u32 = 10;

fn main(
    // PUBLIC INPUTS (Visible to Verifier/Contract)
    root: pub Field,             // The current Merkle Root of the tree
    nullifierHash: pub Field,    // The public identifier of the spent note
    recipient: pub Field,        // The address receiving the funds (prevents front-running)
    value: pub Field,            // The amount being withdrawn (must match deposit)
    
    // PRIVATE INPUTS (Hidden Witness)
    secret: Field,               // The secret key
    nullifier: Field,            // The unique nonce
    path_indices: [u1; MAX_DEPTH],   // Merkle path directions (0=Left, 1=Right)
    path_siblings: [Field; MAX_DEPTH]   // Merkle path sibling hashes
) {
    // 1. Reconstruct the Commitment
    // We hash the private inputs to see if they match the commitment in the tree.
    let commitment = poseidon3([secret, nullifier, value]);

    // 2. Verify Merkle Membership
    // We calculate the root from our commitment up the tree path.
    let calculated_root = binary_merkle_root(
        poseidon2,
        commitment,
        MAX_DEPTH,
        path_indices,
        path_siblings,
    );
    
    // CONSTRAINT: The calculated root must match the public root.
    assert(calculated_root == root);

    // 3. Verify Nullifier Validity
    // We hash the private nullifier to check against the public nullifierHash.
    let calculated_nullifier_hash = poseidon1([nullifier]);
    
    // CONSTRAINT: The hash must match.
    assert(calculated_nullifier_hash == nullifierHash);
    
    // 4. Recipient Binding
    assert(recipient != 0);
}
