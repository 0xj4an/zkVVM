import { useCallback, useMemo, useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWalletClient, usePublicClient } from 'wagmi';
import zkVVMArtifact from '../../../artifacts/contracts/zkVVM.sol/zkVVM.json';
import { createSignerWithViem, type ISigner } from '@evvm/evvm-js';

const ZKVVM_ADDRESS = (import.meta.env.VITE_ZKVVM_ADDRESS || '') as string;

export function useEvvm() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [signer, setSigner] = useState<ISigner | undefined>(undefined);

  // create an EVVM-compatible signer when walletClient is available
  useEffect(() => {
    if (!walletClient) {
      setSigner(undefined);
      return;
    }
    
    (async () => {
      try {
        const evvmSigner = await createSignerWithViem(walletClient as any);
        setSigner(evvmSigner);
      } catch (e) {
        console.error('Failed to create EVVM signer', e);
        setSigner(undefined);
      }
    })();
  }, [walletClient]);

  const getContractConfig = useCallback(() => {
    return {
      address: ZKVVM_ADDRESS,
      abi: zkVVMArtifact.abi as any,
    } as const;
  }, []);

  return {
    address,
    isConnected,
    connectAsync,
    disconnectAsync,
    walletClient,
    publicClient,
    signer,
    getContractConfig,
  };
}

export default useEvvm;
