import hre from 'hardhat';

async function main() {
  const coreAddress = process.env.EVVM_CORE_ADDRESS;
  const zkVVMAddress = process.env.VITE_ZKVVM_ADDRESS;

  if (!coreAddress) throw new Error('EVVM_CORE_ADDRESS not found');
  if (!zkVVMAddress) throw new Error('VITE_ZKVVM_ADDRESS not found');

  console.log('Registering zkVVM service...');
  console.log('Core:', coreAddress);
  console.log('zkVVM:', zkVVMAddress);

  const [deployer] = await hre.viem.getWalletClients();
  const core = await hre.viem.getContractAt('ICore', coreAddress, { client: { wallet: deployer } });

  // Register the service by setting its EVVM ID
  console.log('Calling setEvvmID...');
  const evvmId = 0n; // Default EVVM ID for new services
  const hash = await core.write.setEvvmID([zkVVMAddress, evvmId]);
  console.log('Transaction hash:', hash);

  // Wait for confirmation
  const publicClient = await hre.viem.getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Transaction confirmed in block:', receipt.blockNumber);

  // Get the EVVM ID
  const registeredId = await core.read.getEvvmID([zkVVMAddress]);
  console.log('✅ Service registered with EVVM ID:', registeredId.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
