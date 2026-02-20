import React, { useState } from 'react';
import { useDeposit } from '../hooks/useDeposit.js';
import { toast } from 'react-toastify';

export function DepositTest() {
  const { isConnected, connect, disconnect, deposit, isPending, isSuccess, error, poolAddress } =
    useDeposit();
  const [commitment, setCommitment] = useState('');
  const [amount, setAmount] = useState('1000000'); // 1 USDC (6 decimals) as default

  React.useEffect(() => {
    if (isSuccess) toast.success('Deposit confirmed');
  }, [isSuccess]);
  React.useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hex = commitment.trim().startsWith('0x') ? commitment.trim() : `0x${commitment.trim()}`;
    if (hex.length !== 66) {
      toast.error('Commitment must be 32 bytes (0x + 64 hex chars)');
      return;
    }
    let amountBig: bigint;
    try {
      amountBig = BigInt(amount);
    } catch {
      toast.error('Invalid amount');
      return;
    }
    if (amountBig <= 0n) {
      toast.error('Amount must be > 0');
      return;
    }
    deposit(hex as `0x${string}`, amountBig);
  };

  if (!poolAddress) {
    return (
      <section style={{ marginTop: 24, padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Deposit (ShieldedPool)</h2>
        <p style={{ color: '#888' }}>
          Set <code>VITE_POOL_ADDRESS</code> in <code>.env</code> to test deposit from the frontend.
        </p>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section style={{ marginTop: 24, padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Deposit (ShieldedPool)</h2>
        <p>Connect your wallet to test deposit.</p>
        <button type="button" onClick={() => connect()}>
          Connect wallet
        </button>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Deposit (ShieldedPool)</h2>
      <p style={{ fontSize: 12, color: '#666' }}>
        Commitment from compute.mjs or Prover.toml; amount in token units (e.g. 1000000 = 1 USDC 6 decimals).
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Commitment (bytes32 hex):{' '}
            <input
              type="text"
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              placeholder="0x..."
              style={{ width: 400 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Amount:{' '}
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000000"
            />
          </label>
        </div>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Confirming...' : 'Deposit'}
        </button>
        <button type="button" onClick={() => disconnect()} style={{ marginLeft: 8 }}>
          Disconnect
        </button>
      </form>
    </section>
  );
}
