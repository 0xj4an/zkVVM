// Withdraw circuit: prove ownership of a note and bind withdrawal to a recipient.
// Public inputs: root, nullifierHash, recipient, value.
use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_1 as poseidon1;
use poseidon::poseidon::bn254::hash_2 as poseidon2;
use poseidon::poseidon::bn254::hash_3 as poseidon3;

pub global MAX_DEPTH: u32 = 10;

fn main(
    // PUBLIC INPUTS
    root: pub Field,
    nullifierHash: pub Field,
    recipient: pub Field,
    value: pub Field,

    // PRIVATE INPUTS
    secret: Field,
    nullifier: Field,
    path_indices: [u1; MAX_DEPTH],
    path_siblings: [Field; MAX_DEPTH],
) {
    // 1. Reconstruct the Commitment
    let commitment = poseidon3([secret, nullifier, value]);

    // 2. Verify Merkle Membership
    let calculated_root = binary_merkle_root(
        poseidon2,
        commitment,
        MAX_DEPTH,
        path_indices,
        path_siblings,
    );
    assert(calculated_root == root);

    // 3. Verify Nullifier Validity
    let calculated_nullifier_hash = poseidon1([nullifier]);
    assert(calculated_nullifier_hash == nullifierHash);

    // 4. Recipient Binding
    assert(recipient != 0);
}

#[test]
fn test_withdraw() {
    let secret = 1;
    let nullifier = 2;
    let value = 100;
    let recipient = 0x123;
    
    let commitment = poseidon3([secret, nullifier, value]);
    let nullifierHash = poseidon1([nullifier]);
    
    // Simple tree: depth 10, all siblings 0, indices 0
    let path_indices = [0; MAX_DEPTH];
    let path_siblings = [0; MAX_DEPTH];
    
    // Manually compute root for this simple case
    let mut current = commitment;
    for _ in 0..MAX_DEPTH {
        current = poseidon2([current, 0]);
    }
    let root = current;
    
    main(
        root,
        nullifierHash,
        recipient,
        value,
        secret,
        nullifier,
        path_indices,
        path_siblings
    );
}

#[test(should_fail)]
fn test_withdraw_invalid_secret() {
    let secret = 1;
    let nullifier = 2;
    let value = 100;
    let recipient = 0x123;
    
    let commitment = poseidon3([secret, nullifier, value]);
    let nullifierHash = poseidon1([nullifier]);
    
    let path_indices = [0; MAX_DEPTH];
    let path_siblings = [0; MAX_DEPTH];
    
    let mut current = commitment;
    for _ in 0..MAX_DEPTH {
        current = poseidon2([current, 0]);
    }
    let root = current;
    
    main(
        root,
        nullifierHash,
        recipient,
        value,
        secret + 1, // Invalid secret
        nullifier,
        path_indices,
        path_siblings
    );
}
