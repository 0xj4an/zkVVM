// Helper: returns commitment = H(value, nullifier) for the withdraw v2b circuit.
// Run with: value and nullifier in Prover.toml; use output in WithdrawProver.toml as commitment.
use poseidon::poseidon::bn254::hash_2 as poseidon2;

fn main(value: Field, nullifier: Field) -> pub Field {
    poseidon2([value, nullifier])
}
