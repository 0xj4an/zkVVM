import initNoirC from '@noir-lang/noirc_abi';
import initACVM from '@noir-lang/acvm_js';

try {
  // @ts-ignore
  const acvmUrl = new URL('@noir-lang/acvm_js/web/acvm_js_bg.wasm?url', import.meta.url).href;
  // @ts-ignore
  const noircUrl = new URL('@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url', import.meta.url).href;

  await Promise.all([
    initACVM(fetch(acvmUrl)),
    initNoirC(fetch(noircUrl))
  ]);
  console.log('Noir WASM initialized successfully');
} catch (e) {
  console.error('Failed to initialize Noir WASM:', e);
}

import React, { ReactNode, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './App.css';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { LandingPage } from './pages/LandingPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { WithdrawPage } from './pages/WithdrawPage.js';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { defineChain, createClient } from 'viem';
import { injected } from 'wagmi/connectors';
import deployment from '../../deployment.json' with { type: 'json' };
const { networkConfig } = deployment;

const queryClient = new QueryClient();

const { id, name, nativeCurrency, rpcUrls } = networkConfig;
const chain = defineChain({
  id,
  name,
  nativeCurrency,
  rpcUrls,
});

const config = createConfig({
  connectors: [injected()],
  chains: [chain],
  client({ chain }) {
    return createClient({ chain, transport: http() });
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{mounted && children}</QueryClientProvider>
    </WagmiProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Providers>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="withdraw" element={<WithdrawPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    <ToastContainer />
  </Providers>,
);
