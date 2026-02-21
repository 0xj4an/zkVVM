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
  await hre.run('compile');

  const verifier = await hre.viem.deployContract('MockVerifier');

  const { file, data } = loadAddresses();
  data.network = data.network || 'sepolia_evvm';
  data.chainId = hre.network.config.chainId ?? data.chainId ?? 11155111;
  data.verifier = data.verifier || {};
  data.verifier.mock = verifier.address;

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`MockVerifier deployed at ${verifier.address}`);
  console.log(`Saved to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
