import React, { useState, useRef, useEffect } from 'react';
import { bytesToHex, keccak256, encodePacked } from 'viem';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend } from '@aztec/bb.js';
import { useDeposit } from '../hooks/useDeposit.js';
import { toast } from 'react-toastify';
import { parseUsdcAmount, formatUsdcAmount } from '../lib/usdc.js';
import { generateNote, saveNote, loadNote } from '../lib/note.js';
import { getCircuit } from '../../noir/compile.js';

export function DepositTest() {
  const {
    isConnected,
    address: walletAddress,
    deposit,
    registerRoot,
    withdrawV2b,
    isPending,
    isSuccess,
    error,
    poolAddress,
  } = useDeposit();

  const [amountReadable, setAmountReadable] = useState('1');
  const pendingRootRef = useRef<`0x${string}` | null>(null);

  // Withdraw state
  const [recipient, setRecipient] = useState('');
  const [isProvingWithdraw, setIsProvingWithdraw] = useState(false);

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
  }, [isSuccess]);
  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    if (!isSuccess || !pendingRootRef.current) return;
    const root = pendingRootRef.current;
    pendingRootRef.current = null;
    toast.info('Registering Merkle root...');
    registerRoot(root);
  }, [isSuccess, registerRoot]);

  // Default recipient to connected wallet
  useEffect(() => {
    if (walletAddress && !recipient) setRecipient(walletAddress);
  }, [walletAddress]);

  const [isGeneratingNote, setIsGeneratingNote] = useState(false);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      toast.error('Connect wallet first');
      return;
    }
    const value = parseUsdcAmount(amountReadable);
    if (value === null) {
      toast.error('Invalid amount');
      return;
    }
    if (value <= 0n) {
      toast.error('Amount must be > 0');
      return;
    }
    setIsGeneratingNote(true);
    try {
      const { note, commitmentHex, rootHex } = await generateNote(value, walletAddress);
      saveNote(note);
      pendingRootRef.current = rootHex;
      deposit(commitmentHex, value);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate note');
    } finally {
      setIsGeneratingNote(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = loadNote();
    if (!note) {
      toast.error('No saved note found');
      return;
    }
    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
      toast.error('Invalid recipient address');
      return;
    }

    setIsProvingWithdraw(true);
    const toastId = toast.loading('Generating ZK proof...');
    try {
      // Load withdraw circuit
      const circuit = await getCircuit();
      const backend = new UltraPlonkBackend(circuit.bytecode);
      const noir = new Noir(circuit);
      await noir.init();

      // Prepare inputs — field names must match withdraw.nr
      const recipientPadded = ('0x' + '0'.repeat(24) + recipient.slice(2).toLowerCase()) as `0x${string}`;
      const inputs: Record<string, string | number | number[] | string[]> = {
        nullifier: note.nullifier,
        merkle_proof_length: note.merkle_proof_length.toString(),
        expected_merkle_root: note.expected_merkle_root,
        recipient: recipientPadded,
        commitment: note.commitment,
        value: '0x' + BigInt(note.value).toString(16),
        pk_b: '0x' + BigInt(note.pk_b).toString(16),
        random: '0x' + BigInt(note.random).toString(16),
        merkle_proof_indices: note.merkle_proof_indices,
        merkle_proof_siblings: note.merkle_proof_siblings,
      };

      // Generate proof
      toast.update(toastId, { render: 'Executing circuit...' });
      const { witness } = await noir.execute(inputs);

      toast.update(toastId, { render: 'Generating proof...' });
      const proofData = await backend.generateProof(witness);

      toast.update(toastId, {
        render: 'Proof generated. Submitting withdrawal...',
        isLoading: false,
        type: 'info',
        autoClose: 3000,
      });

      // Build 5 publicInputs in withdrawV2b contract order:
      // [nullifier, merkle_proof_length, expected_merkle_root, recipient, commitment]
      const pad32 = (v: bigint) => ('0x' + v.toString(16).padStart(64, '0')) as `0x${string}`;
      const publicInputs: `0x${string}`[] = [
        note.nullifier as `0x${string}`,
        pad32(BigInt(note.merkle_proof_length)),
        note.expected_merkle_root as `0x${string}`,
        recipientPadded,
        note.commitment as `0x${string}`,
      ];

      // Generate ciphertext: encrypt amount using key derived from nullifier + recipient + POOL_SALT
      const POOL_SALT = keccak256(encodePacked(['string'], ['ShieldedPool.v2b']));
      const key = keccak256(encodePacked(
        ['bytes32', 'bytes32', 'bytes32'],
        [note.nullifier as `0x${string}`, recipientPadded, POOL_SALT],
      ));
      const stream = keccak256(encodePacked(['bytes32', 'uint256'], [key, 0n]));
      const ciphertext = pad32(BigInt(note.value) ^ BigInt(stream));

      const proofHex = bytesToHex(proofData.proof);
      withdrawV2b(proofHex, publicInputs, ciphertext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Proof generation failed';
      toast.update(toastId, {
        render: msg,
        type: 'error',
        isLoading: false,
        autoClose: 5000,
      });
    } finally {
      setIsProvingWithdraw(false);
    }
  };

  if (!poolAddress) {
    return (
      <section className="card">
        <h2>Deposit</h2>
        <p className="description">
          Set <code>VITE_POOL_ADDRESS</code> in <code>.env</code> to enable deposits.
        </p>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="card">
        <h2>Shielded Pool</h2>
        <p className="description">
          Set <code>VITE_PRIVATE_KEY</code> in <code>.env</code> to enable transactions.
        </p>
      </section>
    );
  }

  const savedNote = loadNote();
  const rawUnits = parseUsdcAmount(amountReadable);

  const depositLabel = isGeneratingNote
    ? 'Generating note...'
    : isPending
      ? 'Confirming...'
      : 'Deposit';

  return (
    <>
      {/* Deposit Card */}
      <section className="card">
        <h2>Deposit</h2>
        <p className="description">
          Shielded deposit from <code>{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code>
        </p>

        <form onSubmit={handleDeposit}>
          <div className="input-group">
            <label>Amount (USDC)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amountReadable}
              onChange={(e) => setAmountReadable(e.target.value)}
              placeholder="10.25"
            />
            {rawUnits !== null && rawUnits > 0n && (
              <div className="units-hint">{rawUnits.toLocaleString()} raw units</div>
            )}
          </div>

          <div className="btn-row">
            <button className="btn-primary" type="submit" disabled={isPending || isGeneratingNote}>
              {depositLabel}
            </button>
          </div>
        </form>

        {savedNote && (
          <div className="status-bar">
            <span className="status-dot" />
            Note saved — {formatUsdcAmount(BigInt(savedNote.value))} USDC ready to withdraw
          </div>
        )}
      </section>

      {/* Withdraw Card */}
      {savedNote && (
        <section className="card">
          <h2>Withdraw</h2>
          <p className="description">
            Generate a ZK proof and claim {formatUsdcAmount(BigInt(savedNote.value))} USDC to any address.
          </p>

          <form onSubmit={handleWithdraw}>
            <div className="input-group">
              <label>Recipient</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
              />
            </div>

            <div className="btn-row">
              <button
                className="btn-primary"
                type="submit"
                disabled={isPending || isProvingWithdraw}
              >
                {isProvingWithdraw ? 'Proving...' : isPending ? 'Confirming...' : 'Withdraw'}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
