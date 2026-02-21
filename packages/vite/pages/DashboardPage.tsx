import React, { useState, useEffect } from 'react';
import { WalletGuard } from '../components/WalletGuard.js';
import { useZK, StoredNote } from '../lib/hooks/useZK';
import useEvvm from '../lib/hooks/useEvvm';
import { createZkVVMService } from '../lib/services/zkVVM';
import { Core, HexString } from '@evvm/evvm-js';
import { zkService } from '../lib/services/ZKService';
import { getRequiredViteEnv } from '../lib/env.js';
import zkNoteArtifact from '../../noir/target/note_generator.json';
import { recoverMessageAddress, zeroAddress } from 'viem';
import './DashboardPage.css';

function normalizeHexBytes(hex: string) {
  if (!hex) return hex;
  const hasPrefix = hex.startsWith('0x');
  const raw = hasPrefix ? hex.slice(2) : hex;
  if (raw.length % 2 === 0) return hasPrefix ? hex : `0x${raw}`;
  return `0x0${raw}`;
}

function toBigInt(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  throw new Error('Invalid bigint value');
}

async function recoverActionSigner(params: {
  service: any;
  evvmId: bigint;
  functionName: string;
  hashArgs: Record<string, any>;
  executor: string;
  nonce: bigint;
  isAsyncExec: boolean;
  signature: string;
}) {
  const {
    service,
    evvmId,
    functionName,
    hashArgs,
    executor,
    nonce,
    isAsyncExec,
    signature,
  } = params;
  const hashPayload = service.buildHashPayload(functionName, hashArgs);
  const message = service.buildMessageToSign(evvmId, hashPayload, executor, nonce, isAsyncExec);
  return recoverMessageAddress({
    message,
    signature: signature as `0x${string}`,
  });
}

export function DashboardPage() {
  const [amount, setAmount] = useState('100.00');
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [payActionJson, setPayActionJson] = useState<string | null>(null);
  const [depositActionJson, setDepositActionJson] = useState<string | null>(null);
  const [depositAction, setDepositAction] = useState<any | null>(null);
  const [payTxHash, setPayTxHash] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [isExecutingDeposit, setIsExecutingDeposit] = useState(false);
  const [pendingNoteStr, setPendingNoteStr] = useState<string | null>(null);
  const { mintBearerToken, getStoredNotes, copyNote, isInitializing } = useZK();
  const { signer, address: userAddress } = useEvvm();
  const [noteStatuses, setNoteStatuses] = useState<Record<string, 'draft' | 'onchain'>>({});

  useEffect(() => {
    setNotes(getStoredNotes());
  }, [getStoredNotes]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('zk-note-status') || '{}');
      setNoteStatuses(stored);
    } catch {
      setNoteStatuses({});
    }
  }, []);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const stored = await mintBearerToken(amount);
      setNotes(getStoredNotes());
      setPayTxHash(null);
      setDepositTxHash(null);
      setDepositAction(null);
      setPendingNoteStr(stored.noteStr);

      // If we have an EVVM signer, build pay + deposit SignedActions and log them.
      if (!signer) {
        console.log('No signer available — note stored locally only', stored.noteStr);
        return;
      }

      // Recompute note internals to get commitment/entry
      const { amount: amt, secret, salt } = zkService.parseNoteString(stored.noteStr);
      const note = await zkService.recomputeNote(zkNoteArtifact as any, amt, secret, salt);

      const commitmentHex = normalizeHexBytes(`0x${note.entry.toString(16)}`);

      // amount in token units (mirrors zkService.generateNote logic)
      const value = BigInt(Math.floor(parseFloat(stored.amount) * 1e18));

      // Generate unique nonce for pay action
      const randPay = new Uint8Array(32);
      if (typeof window !== 'undefined' && window.crypto) window.crypto.getRandomValues(randPay);
      else for (let i = 0; i < 32; i++) randPay[i] = Math.floor(Math.random() * 256);
      let nPay = 0n;
      for (const b of randPay) nPay = (nPay << 8n) + BigInt(b);
      const noncePay = nPay;

      // Generate unique nonce for deposit action
      const randDeposit = new Uint8Array(32);
      if (typeof window !== 'undefined' && window.crypto)
        window.crypto.getRandomValues(randDeposit);
      else for (let i = 0; i < 32; i++) randDeposit[i] = Math.floor(Math.random() * 256);
      let nDeposit = 0n;
      for (const b of randDeposit) nDeposit = (nDeposit << 8n) + BigInt(b);
      const nonceDeposit = nDeposit;

      const ZKVVM_ADDRESS = getRequiredViteEnv('VITE_ZKVVM_ADDRESS');

      // Instantiate Core and Service (addresses best-effort — Core address may be unspecified)
      const coreAddress = getRequiredViteEnv('VITE_CORE_ADDRESS');
      const core = new Core({ signer, address: coreAddress as any, chainId: 11155111 });
      const service = createZkVVMService(signer);

      // Build pay SignedAction (to pay executor priority fee and lock tokens)
      const payAction = await core.pay({
        toAddress: ZKVVM_ADDRESS as HexString,
        tokenAddress: '0x0000000000000000000000000000000000000001',
        amount: value,
        priorityFee: 0n,
        nonce: noncePay,
        isAsyncExec: true,
      });

      if (payAction?.data?.signature) {
        payAction.data.signature = normalizeHexBytes(payAction.data.signature);
      }

      // Build deposit SignedAction embedding pay metadata
      const noteRootHex = normalizeHexBytes(`0x${note.root.toString(16)}`) as `0x${string}`;
      const depositAction = await service.deposit({
        commitment: commitmentHex,
        amount: value,
        originExecutor: zeroAddress,
        nonce: nonceDeposit,
        evvmSignedAction: payAction,
        expectedNextRoot: noteRootHex,
      });

      if (depositAction?.data?.signature) {
        depositAction.data.signature = normalizeHexBytes(depositAction.data.signature);
      }
      if (depositAction?.data?.signaturePay) {
        depositAction.data.signaturePay = normalizeHexBytes(depositAction.data.signaturePay);
      }

      const expectedNextRoot = (depositAction as any).data?.expectedNextRoot;

      const payEvvmId = toBigInt((payAction as any).evvmId ?? (await core.getEvvmID()));
      const depositEvvmId = toBigInt((depositAction as any).evvmId ?? (await service.getEvvmID()));

      const recoveredPaySigner = await recoverActionSigner({
        service: core,
        evvmId: payEvvmId,
        functionName: 'pay',
        hashArgs: {
          to_address: ZKVVM_ADDRESS as HexString,
          to_identity: '',
          token: '0x0000000000000000000000000000000000000001',
          amount: value,
          priorityFee: 0n,
        },
        executor: zeroAddress,
        nonce: noncePay,
        isAsyncExec: true,
        signature: payAction.data.signature,
      });

      const recoveredDepositSigner = await recoverActionSigner({
        service,
        evvmId: depositEvvmId,
        functionName: 'deposit',
        hashArgs: {
          commitment: commitmentHex,
          amount: value,
          expectedNextRoot: expectedNextRoot,
        },
        executor: zeroAddress,
        nonce: nonceDeposit,
        isAsyncExec: true,
        signature: depositAction.data.signature,
      });

      if (recoveredPaySigner.toLowerCase() !== payAction.data.from.toLowerCase()) {
        throw new Error(
          `Invalid pay signature: expected ${payAction.data.from}, got ${recoveredPaySigner}`,
        );
      }
      if (recoveredDepositSigner.toLowerCase() !== depositAction.data.user.toLowerCase()) {
        throw new Error(
          `Invalid deposit signature: expected ${depositAction.data.user}, got ${recoveredDepositSigner}`,
        );
      }

      console.log('Pay SignedAction:', payAction);
      console.log('Deposit SignedAction:', depositAction);
      setDepositAction(depositAction);

      // Set UI JSON, fall back to basic fields if circular
      try {
        setPayActionJson(JSON.stringify(payAction, null, 2));
      } catch (e) {
        setPayActionJson(
          JSON.stringify(
            {
              evvmId: (payAction as any).evvmId,
              functionName: (payAction as any).functionName,
              data: (payAction as any).data,
            },
            null,
            2,
          ),
        );
      }
      try {
        setDepositActionJson(JSON.stringify(depositAction, null, 2));
      } catch (e) {
        setDepositActionJson(
          JSON.stringify(
            {
              evvmId: (depositAction as any).evvmId,
              functionName: (depositAction as any).functionName,
              data: (depositAction as any).data,
            },
            null,
            2,
          ),
        );
      }
    } catch (err) {
      console.error('Failed to mint:', err);
    }
  };

  const executeWithFisher = async (signedAction: unknown) => {
    const fisherUrl = getRequiredViteEnv('VITE_FISHER_URL');
    const res = await fetch(`${fisherUrl.replace(/\/$/, '')}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signedAction }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fisher error (${res.status}): ${text}`);
    }
    const data = await res.json();
    return data?.txHash as string | undefined;
  };

  const handleExecuteDeposit = async () => {
    if (!depositAction) return;
    try {
      setIsExecutingDeposit(true);
      const hash = await executeWithFisher(depositAction);
      if (hash) {
        setDepositTxHash(hash);
        if (pendingNoteStr) {
          const next = { ...noteStatuses, [pendingNoteStr]: 'onchain' as const };
          setNoteStatuses(next);
          localStorage.setItem('zk-note-status', JSON.stringify(next));
        }
      }
    } catch (err) {
      console.error('Failed to execute deposit via fisher:', err);
    } finally {
      setIsExecutingDeposit(false);
    }
  };

  const handleCopy = async (noteStr: string) => {
    await copyNote(noteStr);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className="dashboard-container page-container">
      <WalletGuard>
        <div className="glass-panel deposit-card fade-in-up">
          <div className="deposit-header flex-between">
            <div>
              <h2>DEPOSIT</h2>
              <p>Mint a new anonymous bearer note.</p>
            </div>
            <div className="plus-icon">+</div>
          </div>

          <form className="deposit-form" onSubmit={handleMint}>
            <div className="form-group-row">
              <div className="input-group">
                <label>AMOUNT</label>
                <input
                  type="text"
                  className="input-field amount-input"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary submit-btn" disabled={isInitializing}>
              {isInitializing ? 'INITIALIZING ZK...' : 'MINT BEARER NOTE ⚡'}
            </button>
          </form>

          {payActionJson && depositActionJson && (
            <div className="signed-actions-box">
              <h4>Generated Signed Actions</h4>
              <div className="signed-action">
                <div className="signed-action-header">core.pay()</div>
                <pre className="signed-action-json">{payActionJson}</pre>
                {payTxHash && <div className="text-secondary">tx: {payTxHash}</div>}
                <button
                  className="btn-secondary"
                  onClick={() => navigator.clipboard.writeText(payActionJson)}
                >
                  📋 Copy JSON
                </button>
              </div>
              <div className="signed-action">
                <div className="signed-action-header">zkVVM.deposit()</div>
                <pre className="signed-action-json">{depositActionJson}</pre>
                {depositTxHash && <div className="text-secondary">tx: {depositTxHash}</div>}
                <button
                  className="btn-secondary"
                  onClick={() => navigator.clipboard.writeText(depositActionJson)}
                >
                  📋 Copy JSON
                </button>
              </div>
              <button
                className="fisher-execute-btn"
                onClick={handleExecuteDeposit}
                disabled={!depositAction || isExecutingDeposit}
              >
                {isExecutingDeposit ? 'EXECUTING...' : 'EXECUTE VIA FISHER'}
              </button>
            </div>
          )}
        </div>

        <div className="vault-section fade-in-up delay-1">
          <div className="vault-header flex-between">
            <h3>YOUR LOCAL VAULT</h3>
            <span className="vault-subtitle">&#10003; KEYS STORED IN BROWSER SESSION</span>
          </div>

          <div className="vault-table glass-panel">
            <div className="table-row table-header">
              <div>DATE</div>
              <div>VALUE</div>
              <div className="align-right">SECRET CODE</div>
            </div>
            {notes.length === 0 ? (
              <div className="table-row">
                <div className="text-secondary" style={{ textAlign: 'center', width: '100%' }}>
                  No notes found in your local vault.
                </div>
              </div>
            ) : (
              notes.map((note, i) => (
                <div className="table-row" key={i}>
                  <div className="text-secondary">{note.date}</div>
                  <div>
                    <strong>{note.amount}</strong> <span className="text-secondary">USDC</span>
                    {noteStatuses[note.noteStr] === 'onchain' ? (
                      <span className="status-badge status-onchain">ONCHAIN</span>
                    ) : (
                      <span className="status-badge status-draft">DRAFT</span>
                    )}
                  </div>
                  <div className="align-right">
                    <button className="btn-icon copy-btn" onClick={() => handleCopy(note.noteStr)}>
                      <span className="copy-icon">⧉</span> COPY KEY
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </WalletGuard>

      {showToast && (
        <div className="toast-notification fade-in-up">
          <span className="toast-icon">&#10003;</span>
          Note string copied to clipboard!
        </div>
      )}
    </div>
  );
}
