/**
 * Deposit script: approve USDC to ShieldedPool and call deposit(commitment, amount).
 * Run from repo root so packages/noir/WithdrawProver.toml (or Prover.toml) is found for commitment.
 *
 * Env: RPC_URL (or MONAD_RPC), PRIVATE_KEY, POOL_ADDRESS (or SHIELDED_POOL_ADDRESS).
 * Optional: COMMITMENT (0x+64 hex), AMOUNT (default 1_000_000), USDC_ADDRESS.
 * If COMMITMENT is unset, reads commitment from packages/noir/WithdrawProver.toml or Prover.toml.
 * To compute commitment from value+nullifier: set them in CommitmentHelperProver.toml, then
 *   COMMITMENT=$(cd packages/noir && ./scripts/compute_commitment.sh)
 *
 * Example: AMOUNT=1000000000000000000 POOL_ADDRESS=0x... RPC_URL=... PRIVATE_KEY=... node packages/noir/scripts/deposit.mjs
 */
import fs from "fs";
import path from "path";
import { ethers } from "ethers";

const ERC20_ABI = [
  {"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"owner","type":"address"}],"outputs":[{"name":"","type":"uint256"}]}
];

const POOL_ABI = [
  {"type":"function","name":"deposit","stateMutability":"nonpayable","inputs":[{"name":"commitment","type":"bytes32"},{"name":"amount","type":"uint256"}],"outputs":[]}
];

function getCommitmentFromProverToml() {
  const candidates = [
    path.join(process.cwd(), "packages", "noir", "WithdrawProver.toml"),
    path.join(process.cwd(), "packages", "noir", "Prover.toml"),
    path.join(process.cwd(), "circuits", "Prover.toml"),
    path.join(process.cwd(), "Prover.toml"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    const m = content.match(/(?:commitment|new_commitment)\s*=\s*"([^"]+)"/);
    if (m) return m[1].trim();
  }
  return null;
}

async function main() {
  const RPC = process.env.RPC_URL || process.env.MONAD_RPC;
  const PK = process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS || process.env.SHIELDED_POOL_ADDRESS;
  const USDC = process.env.USDC_ADDRESS ?? "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

  if (!RPC || !PK || !POOL) throw new Error("Set RPC_URL (or MONAD_RPC), PRIVATE_KEY, POOL_ADDRESS (or SHIELDED_POOL_ADDRESS)");

  let commitment = process.env.COMMITMENT;
  if (!commitment || !commitment.startsWith("0x") || commitment.length !== 66) {
    commitment = getCommitmentFromProverToml();
    if (commitment) console.log("Using commitment from Prover/WithdrawProver.toml:", commitment);
  }
  if (!commitment || !commitment.startsWith("0x") || commitment.length !== 66) {
    throw new Error(
      "Set COMMITMENT (bytes32, 0x+64 hex). To compute: set value and nullifier in packages/noir/CommitmentHelperProver.toml, then COMMITMENT=$(cd packages/noir && ./scripts/compute_commitment.sh)"
    );
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  const bal = await usdc.balanceOf(wallet.address);
  console.log("USDC balance:", bal.toString());

  // AMOUNT in token units (same decimals as USDC, e.g. 1e6 = 1 USDC, 1e18 if 18 decimals)
  const amount = process.env.AMOUNT ? BigInt(process.env.AMOUNT) : 1_000_000n;
  const tx1 = await usdc.approve(POOL, amount);
  console.log("approve tx:", tx1.hash);
  await tx1.wait();

  const tx2 = await pool.deposit(commitment, amount);
  console.log("deposit tx:", tx2.hash);
  await tx2.wait();

  console.log("deposit done ✅");
}

main().catch((e) => { console.error(e); process.exit(1); });
