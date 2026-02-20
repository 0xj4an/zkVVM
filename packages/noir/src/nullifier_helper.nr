use poseidon::poseidon::bn254::hash_1 as poseidon1;

fn main(nullifier: Field) -> pub Field {
    poseidon1([nullifier])
}
