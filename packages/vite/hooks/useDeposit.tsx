import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState } from 'react';
import { toast } from 'react-toastify';
import deployment from '../../../deployment.json';

const SHIELDED_POOL_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const poolAddress = (import.meta as unknown as { env: { VITE_POOL_ADDRESS?: string } }).env
  .VITE_POOL_ADDRESS as `0x${string}` | undefined;

export function useDeposit() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = (commitment: `0x${string}`, amount: bigint) => {
    if (!poolAddress) {
      toast.error('Set VITE_POOL_ADDRESS in .env');
      return;
    }
    writeContract({
      address: poolAddress,
      abi: SHIELDED_POOL_ABI,
      functionName: 'deposit',
      args: [commitment, amount],
    });
  };

  return {
    isConnected,
    connect: () => connect({ connector: connectors[0], chainId: deployment.networkConfig.id }),
    disconnect,
    deposit,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
    poolAddress,
  };
}
