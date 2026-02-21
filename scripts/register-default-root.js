import hre from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadAddresses() {
  const dir = path.resolve(__dirname, '..', 'deployments', 'sepolia_evvm');
  const file = path.join(dir, 'addresses.json');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ network: 'sepolia_evvm' }, null, 2));
  }
  const raw = fs.readFileSync(file, 'utf8');
  return { file, data: JSON.parse(raw || '{}') };
}

async function main() {
  const { file, data } = loadAddresses();
  const zkVMMAddress = process.env.ZKVM_ADDRESS || data?.zkVVM?.address;
  const adminPrivateKey = process.env.ZKVVM_ADMIN_KEY || process.env.EVVM_SEPOLIA_KEY;
  const rootToRegister = process.env.DEFAULT_MERKLE_ROOT || '0x0000000000000000000000000000000000000000000000000000000000000000';

  if (!zkVMMAddress) {
    throw new Error('zkVMM address not found. Set ZKVM_ADDRESS or run deploy-zkvvm.js first.');
  }

  if (!adminPrivateKey) {
    throw new Error('ZKVVM_ADMIN_KEY or EVVM_SEPOLIA_KEY is required to register root');
  }

  const wallet = new hre.ethers.Wallet(adminPrivateKey, hre.ethers.provider);

  const zkVMM = await hre.ethers.getContractAt('zkVVM', zkVMMAddress, wallet);

  console.log(`Registering merkle root on zkVVM at ${zkVMMAddress}`);
  console.log(`Root: ${rootToRegister}`);
  console.log(`Admin: ${wallet.address}`);

  const tx = await zkVMM.registerRoot(rootToRegister);
  console.log('Transaction sent:', tx.hash);

  const receipt = await tx.wait();
  console.log('Transaction confirmed in block:', receipt.blockNumber);

  console.log(`\n✓ Merkle root registered successfully!`);
  console.log(`  Root: ${rootToRegister}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
