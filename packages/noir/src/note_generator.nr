use poseidon::poseidon::bn254::hash_1 as poseidon1;
use poseidon::poseidon::bn254::hash_3 as poseidon3;
use poseidon::poseidon::bn254::hash_2 as poseidon2;

// secret = private key, nullifier = unique nonce, value = amount.
fn main(secret: Field, nullifier: Field, value: Field) -> pub (Field, Field, Field, Field) {
    let commitment = poseidon3([secret, nullifier, value]);
    let nullifierHash = poseidon1([nullifier]);
    let entry = commitment;
    let root = poseidon2([entry, 0]);
    (nullifierHash, commitment, entry, root)
}

#[test]
fn test_note_generation() {
    let secret = 1;
    let nullifier = 2;
    let value = 100;
    
    let (nullifierHash, commitment, entry, root) = main(secret, nullifier, value);
    
    assert(nullifierHash == poseidon1([nullifier]));
    assert(commitment == poseidon3([secret, nullifier, value]));
    assert(entry == commitment);
    assert(root == poseidon2([entry, 0]));
}
