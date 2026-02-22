import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default {
  envDir: '../../',
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      stream: 'stream-browserify',
      events: 'events',
      pino: './lib/pino-stub.js',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    exclude: [
      '@noir-lang/acvm_js',
      '@noir-lang/noirc_abi',
      '@noir-lang/noir_js',
      '@aztec/bb.js',
      '@evvm/evvm-js',
    ],
    include: ['@noir-lang/types', 'stream-browserify', 'events', 'process'],
  },
  plugins: [
    react({
      tsDecorators: true,
    }),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  define: {
    'global': 'globalThis',
  },
};
