import { BaseService, SignMethod, SignedAction } from '@evvm/evvm-js';
import type { HexString, IPayData, ISigner } from '@evvm/evvm-js';
import { zeroAddress, type Address, keccak256, toHex, encodeAbiParameters, parseAbiParameters } from 'viem';
import { IDepositData, IWithdrawData } from '../../types/zkVVM.types.js';
import zkVVMArtifact from '../../../artifacts/contracts/zkVVM.sol/zkVVM.json';
import coreArtifact from '../../../artifacts/@evvm/testnet-contracts/interfaces/ICore.sol/ICore.json';
import { getRequiredViteEnv } from '../env.js';

// These helpers provide optional on-chain reads/writes using viem wallet/public clients
// The `useEvvm` hook (in `lib/hooks/useEvvm.ts`) returns the required clients.

export class zkVVM extends BaseService {
  constructor(signer: ISigner, abi?: any, chainId: number = 11155111) {
    super({
      signer,
      address: getRequiredViteEnv('VITE_ZKVVM_ADDRESS') as Address,
      abi: abi || (zkVVMArtifact.abi as any),
      chainId,
    });
  }

  async getEvvmID() {
    if (this.evvmId) return this.evvmId;
    // For new services, EVVM ID is typically 0
    // The service can call setEvvmID() on Core to change it later
    this.evvmId = 0n;
    return this.evvmId;
  }

  async getCurrentRoot(): Promise<HexString> {
    const root = await this.signer.readContract({
      contractAddress: this.address,
      contractAbi: zkVVMArtifact.abi as any,
      functionName: 'getCurrentRoot',
      args: [],
    });
    return root as HexString;
  }

  async computeNextRoot(currentRoot: HexString, commitment: HexString): Promise<HexString> {
    // For a single leaf tree, next root = keccak256(currentRoot || commitment)
    // Using left = currentRoot (or 0 if empty), right = commitment
    const currentRootBigInt = currentRoot === '0x0000000000000000000000000000000000000000000000000000000000000000' 
      ? 0n 
      : BigInt(currentRoot);
    const commitmentBigInt = BigInt(commitment);
    
    // For now, simple: next root = keccak256(currentRoot, commitment)
    // This is a simplified version - in production you'd use proper merkle tree
    const combined = toHex((currentRootBigInt ^ commitmentBigInt) % (1n << 253n));
    const nextRoot = keccak256(combined);
    return nextRoot as HexString;
  }

  @SignMethod
  async deposit({
    commitment,
    amount,
    originExecutor = zeroAddress,
    nonce,
    evvmSignedAction,
    expectedNextRoot,
  }: {
    commitment: string;
    amount: bigint;
    originExecutor?: HexString;
    nonce: bigint;
    evvmSignedAction: SignedAction<IPayData>;
    expectedNextRoot?: HexString;
  }): Promise<SignedAction<IDepositData>> {
    const evvmId = await this.getEvvmID();
    const functionName = 'deposit';
    const normalizedCommitment = ensureEvenHex(commitment);

    // If no expectedNextRoot provided, fetch current root and compute
    let computedNextRoot: HexString = (expectedNextRoot as HexString) || '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (!expectedNextRoot) {
      try {
        const currentRoot = await this.getCurrentRoot();
        computedNextRoot = await this.computeNextRoot(currentRoot, normalizedCommitment as HexString);
      } catch (e) {
        // If read fails, use zero root
        computedNextRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
      }
    }

    // Manually build hash payload to match contract exactly:
    // keccak256(abi.encode('deposit', commitment, amount, expectedNextRoot))
    const manualHashPayload = keccak256(
      encodeAbiParameters(
        parseAbiParameters('string, bytes, uint256, bytes32'),
        [functionName, normalizedCommitment as HexString, amount, computedNextRoot]
      )
    );

    console.log('[DEPOSIT DEBUG] Manual hashPayload:', manualHashPayload);
    console.log('[DEPOSIT DEBUG] commitment:', normalizedCommitment);
    console.log('[DEPOSIT DEBUG] amount:', amount.toString());
    console.log('[DEPOSIT DEBUG] expectedNextRoot:', computedNextRoot);

    const message = this.buildMessageToSign(evvmId, manualHashPayload, originExecutor, nonce, true);

    const signature = ensureEvenHex(await this.signer.signMessage(message));
    const signaturePay = ensureEvenHex(evvmSignedAction.data.signature);

    return new SignedAction(this, evvmId, functionName, {
      user: this.signer.address,
      commitment: normalizedCommitment,
      amount,
      originExecutor,
      nonce,
      signature,
      priorityFeePay: evvmSignedAction.data.priorityFee,
      noncePay: evvmSignedAction.data.nonce,
      signaturePay,
      expectedNextRoot: computedNextRoot,
    });
  }

  @SignMethod
  async withdraw({
    proof,
    publicInputs,
    ciphertext,
    recipient,
    expectedRoot,
    originExecutor = zeroAddress,
    nonce,
  }: {
    proof: string;
    recipient: HexString;
    publicInputs: any[];
    ciphertext: HexString;
    expectedRoot: HexString;
    originExecutor?: HexString;
    nonce: bigint;
  }): Promise<SignedAction<IWithdrawData>> {
    const evvmId = await this.getEvvmID();
    const functionName = 'withdraw';

    const normalizedProof = ensureEvenHex(proof) as HexString;
    const normalizedCiphertext = ensureEvenHex(ciphertext) as HexString;

    // Manually build hash payload to match contract exactly:
    // keccak256(abi.encode('withdraw', recipient, proof, publicInputs, ciphertext))
    const manualHashPayload = keccak256(
      encodeAbiParameters(
        parseAbiParameters('string, address, bytes, bytes32[], bytes32'),
        [functionName, recipient, normalizedProof, publicInputs, normalizedCiphertext]
      )
    );

    console.log('[WITHDRAW DEBUG] Function name:', functionName);
    console.log('[WITHDRAW DEBUG] Recipient:', recipient);
    console.log('[WITHDRAW DEBUG] Proof length:', normalizedProof.length);
    console.log('[WITHDRAW DEBUG] Public inputs:', publicInputs);
    console.log('[WITHDRAW DEBUG] Ciphertext:', normalizedCiphertext);
    console.log('[WITHDRAW DEBUG] Manual hashPayload:', manualHashPayload);
    console.log('[WITHDRAW DEBUG] expectedRoot:', expectedRoot);

    const message = this.buildMessageToSign(evvmId, manualHashPayload, originExecutor, nonce, true);
    console.log('[WITHDRAW DEBUG] message:', message);
    console.log('[WITHDRAW DEBUG] originExecutor:', originExecutor);
    console.log('[WITHDRAW DEBUG] nonce:', nonce.toString());

    const signature = ensureEvenHex(await this.signer.signMessage(message));
    console.log('[WITHDRAW DEBUG] signature:', signature);

    // todo: add recipient
    return new SignedAction(this, evvmId, functionName, {
      user: this.signer.address,
      recipient,
      proof: normalizedProof,
      expectedRoot,
      publicInputs,
      ciphertext: normalizedCiphertext,
      originExecutor,
      nonce,
      signature,
    });
  }
}

function ensureEvenHex(value: string): string {
  if (!value.startsWith('0x')) return value;
  const hex = value.slice(2);
  if (hex.length % 2 === 0) return value;
  return `0x0${hex}`;
}

export function createZkVVMService(signer: ISigner) {
  return new zkVVM(signer, zkVVMArtifact.abi, 11155111);
}
