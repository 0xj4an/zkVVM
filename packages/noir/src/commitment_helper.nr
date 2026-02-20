use poseidon::poseidon::bn254::hash_3 as poseidon3;

fn main(secret: Field, nullifier: Field, value: Field) -> pub Field {
    poseidon3([secret, nullifier, value])
}
