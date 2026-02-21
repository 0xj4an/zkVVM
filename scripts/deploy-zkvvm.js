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

function requireEnvOrStored(name, value, storedKey) {
  if (!value) {
    throw new Error(`${name} is missing. Set ${storedKey} or provide ${name} via environment.`);
  }
  return value;
}

async function registerDefaultRoot(zkVVMAddress) {
  const adminPrivateKey = process.env.ZKVVM_ADMIN_KEY || process.env.EVVM_SEPOLIA_KEY;
  const rootToRegister = process.env.DEFAULT_MERKLE_ROOT || '0x0000000000000000000000000000000000000000000000000000000000000000';
  const autoRegisterRoot = process.env.REGISTER_DEFAULT_ROOT === 'true';

  if (!autoRegisterRoot) {
    console.log('Skipping default merkle root registration (set REGISTER_DEFAULT_ROOT=true to enable)');
    return;
  }

  if (!adminPrivateKey) {
    console.log('Skipping root registration: ZKVVM_ADMIN_KEY or EVVM_SEPOLIA_KEY not set');
    return;
  }

  const wallet = new hre.ethers.Wallet(adminPrivateKey, hre.ethers.provider);
  const zkVVM = await hre.ethers.getContractAt('zkVVM', zkVVMAddress, wallet);

  console.log(`Registering default merkle root: ${rootToRegister}`);
  const tx = await zkVVM.registerRoot(rootToRegister);
  console.log('Transaction sent:', tx.hash);
  const receipt = await tx.wait();
  console.log('Root registered in block:', receipt.blockNumber);
}

async function main() {
  await hre.run('compile');

  const { file, data } = loadAddresses();
  const admin = process.env.ZKVVM_ADMIN_ADDRESS || data.admin;
  const coreAddress = process.env.EVVM_CORE_ADDRESS || data?.evvm?.core;
  const stakingAddress = process.env.EVVM_STAKING_ADDRESS || data?.evvm?.staking;

  const verifierAddress =
    process.env.WITHDRAW_VERIFIER_ADDRESS ||
    data?.verifier?.real ||
    data?.verifier?.mock;

  const resolvedAdmin = requireEnvOrStored('ZKVVM_ADMIN_ADDRESS', admin, 'admin');
  const resolvedCore = requireEnvOrStored('EVVM_CORE_ADDRESS', coreAddress, 'evvm.core');
  const resolvedStaking = requireEnvOrStored('EVVM_STAKING_ADDRESS', stakingAddress, 'evvm.staking');
  const resolvedVerifier = requireEnvOrStored(
    'WITHDRAW_VERIFIER_ADDRESS',
    verifierAddress,
    'verifier.mock/verifier.real'
  );

  const zkVVM = await hre.viem.deployContract('zkVVM', [
    resolvedAdmin,
    resolvedCore,
    resolvedStaking,
    resolvedVerifier,
  ]);

  data.network = data.network || 'sepolia_evvm';
  data.chainId = hre.network.config.chainId ?? data.chainId ?? 11155111;
  data.admin = resolvedAdmin;
  data.evvm = data.evvm || {};
  data.evvm.core = resolvedCore;
  data.evvm.staking = resolvedStaking;
  data.zkVVM = data.zkVVM || {};
  data.zkVVM.address = zkVVM.address;
  data.zkVVM.withdrawVerifier = resolvedVerifier;

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`zkVVM deployed at ${zkVVM.address}`);
  console.log(`Saved to ${file}`);

  await registerDefaultRoot(zkVVM.address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
