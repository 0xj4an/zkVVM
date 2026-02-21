import react from '@vitejs/plugin-react-swc';

export default {
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'esnext',
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '5173'),
    allowedHosts: ['zkvvm.up.railway.app'],
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4173'),
    allowedHosts: ['zkvvm.up.railway.app'],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    include: ['@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
  },
  plugins: [react()],
};
