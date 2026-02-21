import { defineConfig } from '@wagmi/cli';
import { react, hardhat } from '@wagmi/cli/plugins';
import deployment from '../../deployment.json';

export default defineConfig({
  out: 'artifacts/generated.ts',
  plugins: [
    react(),
    hardhat({
      project: '../..', // raíz del repo (hardhat está ahí)
      artifacts: 'packages/artifacts', // desde la raíz del repo
      deployments: {
        UltraVerifier: {
          [deployment.networkConfig.id]: deployment.address as `0x${string}`,
        },
      },
    }),
  ],
});
