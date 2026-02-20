/**
 * Deploy ShieldedPool + dependencies to local hardhat node.
 * Usage: bunx hardhat run scripts/deploy-pool.ts --network localhost
 */
import hre from 'hardhat';
import { writeFileSync } from 'fs';

async function main() {
  const GENESIS_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;

  // 1. MockERC20 (USDC)
  const mockUsdc = await hre.viem.deployContract('MockERC20');
  console.log('MockERC20:', mockUsdc.address);

  // 2. MockVerifier (for deposit/transferIntent — always returns true)
  const mockVerifier = await hre.viem.deployContract('MockVerifier');
  console.log('MockVerifier:', mockVerifier.address);

  // 3. UltraVerifier (withdraw circuit verifier — real ZK verification)
  const withdrawVerifier = await hre.viem.deployContract('UltraVerifier');
  console.log('UltraVerifier:', withdrawVerifier.address);

  // 4. PoseidonT3 library (required by ShieldedPool for v2b commitment check)
  const poseidonLib = await hre.viem.deployContract('PoseidonT3');
  console.log('PoseidonT3:', poseidonLib.address);

  // 5. ShieldedPool (MockVerifier for both deposit & withdraw in demo; UltraVerifier for v2b)
  const pool = await hre.viem.deployContract('ShieldedPool', [
    mockUsdc.address,
    mockVerifier.address,
    GENESIS_ROOT,
    mockVerifier.address,       // withdraw: MockVerifier (demo — skips ZK verification)
    withdrawVerifier.address,   // withdrawV2b: UltraVerifier (real ZK verification)
  ], {
    libraries: {
      'poseidon-solidity/PoseidonT3.sol:PoseidonT3': poseidonLib.address,
    },
  });
  console.log('ShieldedPool:', pool.address);

  // Write pool address for frontend
  const poolDeployment = {
    poolAddress: pool.address,
    usdcAddress: mockUsdc.address,
    verifierAddress: mockVerifier.address,
    withdrawVerifierAddress: withdrawVerifier.address,
  };
  writeFileSync('pool-deployment.json', JSON.stringify(poolDeployment, null, 2));
  console.log('\nPool deployment saved to pool-deployment.json');
  console.log(`\nSet in packages/vite/.env:\n  VITE_POOL_ADDRESS=${pool.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
