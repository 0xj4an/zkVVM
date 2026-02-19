import react from '@vitejs/plugin-react-swc';

export default {
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    include: ['@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
  },
  plugins: [react()],
};
