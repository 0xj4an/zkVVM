import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

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
  {
    type: 'function',
    name: 'registerRoot',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'root', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proof', type: 'bytes' },
      { name: 'publicInputs', type: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawV2b',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proof', type: 'bytes' },
      { name: 'publicInputs', type: 'bytes32[]' },
      { name: 'ciphertext', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'nullifiers',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const poolAddress = env.VITE_POOL_ADDRESS as `0x${string}` | undefined;
const privateKey = env.VITE_PRIVATE_KEY as `0x${string}` | undefined;
const rpcUrl = env.VITE_RPC_URL || undefined;

const account = privateKey ? privateKeyToAccount(privateKey) : undefined;

const walletClient = account
  ? createWalletClient({
      account,
      chain: sepolia,
      transport: http(rpcUrl),
    })
  : undefined;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

export function useDeposit() {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const sendTx = useCallback(
    async (fn: () => Promise<`0x${string}`>) => {
      if (!walletClient) {
        toast.error('Set VITE_PRIVATE_KEY in .env');
        return;
      }
      setIsPending(true);
      setIsSuccess(false);
      setError(null);
      setTxHash(null);
      try {
        const hash = await fn();
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 120_000,
        });
        if (receipt.status === 'reverted') {
          throw new Error(`Transaction reverted (${hash})`);
        }
        setTxHash(hash);
        setIsSuccess(true);
        return hash;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        toast.error(e.message.slice(0, 200));
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  const deposit = useCallback(
    (commitment: `0x${string}`, amount: bigint) => {
      if (!poolAddress || !walletClient) return;
      return sendTx(() =>
        walletClient.writeContract({
          address: poolAddress,
          abi: SHIELDED_POOL_ABI,
          functionName: 'deposit',
          args: [commitment, amount],
        }),
      );
    },
    [sendTx],
  );

  const registerRoot = useCallback(
    (root: `0x${string}`) => {
      if (!poolAddress || !walletClient) return;
      return sendTx(() =>
        walletClient.writeContract({
          address: poolAddress,
          abi: SHIELDED_POOL_ABI,
          functionName: 'registerRoot',
          args: [root],
        }),
      );
    },
    [sendTx],
  );

  const withdraw = useCallback(
    (proof: `0x${string}`, publicInputs: `0x${string}`[]) => {
      if (!poolAddress || !walletClient) return;
      return sendTx(() =>
        walletClient.writeContract({
          address: poolAddress,
          abi: SHIELDED_POOL_ABI,
          functionName: 'withdraw',
          args: [proof, publicInputs],
        }),
      );
    },
    [sendTx],
  );

  const withdrawV2b = useCallback(
    (proof: `0x${string}`, publicInputs: `0x${string}`[], ciphertext: `0x${string}`) => {
      if (!poolAddress || !walletClient) return;
      return sendTx(() =>
        walletClient.writeContract({
          address: poolAddress,
          abi: SHIELDED_POOL_ABI,
          functionName: 'withdrawV2b',
          args: [proof, publicInputs, ciphertext],
        }),
      );
    },
    [sendTx],
  );

  const isNullifierSpent = useCallback(
    async (nullifier: `0x${string}`): Promise<boolean> => {
      if (!poolAddress) return false;
      try {
        return (await publicClient.readContract({
          address: poolAddress,
          abi: SHIELDED_POOL_ABI,
          functionName: 'nullifiers',
          args: [nullifier],
        })) as boolean;
      } catch {
        return false;
      }
    },
    [],
  );

  return {
    isConnected: !!account,
    address: account?.address,
    deposit,
    registerRoot,
    withdraw,
    withdrawV2b,
    isNullifierSpent,
    isPending,
    isSuccess,
    error,
    txHash,
    poolAddress,
  };
}
