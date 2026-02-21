import { BaseService, SignMethod, SignedAction } from '@evvm/evvm-js';
import type { HexString, IPayData, ISigner } from '@evvm/evvm-js';
import { zeroAddress, type Address } from 'viem';
import { IDepositData, IWithdrawData } from '../../types/zkVVM.types.js';
import zkVVMArtifact from '../../../artifacts/contracts/zkVVM.sol/zkVVM.json';

// These helpers provide optional on-chain reads/writes using viem wallet/public clients
// The `useEvvm` hook (in `lib/hooks/useEvvm.ts`) returns the required clients.

export class zkVVM extends BaseService {
  constructor(signer: ISigner, address?: Address, abi?: any, chainId: number = 11155111) {
    super({
      signer,
      address: (address ||
        import.meta.env.VITE_ZKVVM_ADDRESS ||
        '0x0000000000000000000000000000000000000000') as Address,
      abi: abi || (zkVVMArtifact.abi as any),
      chainId,
      evvmId: 777n,
    });
  }

  @SignMethod
  async deposit({
    commitment,
    amount,
    originExecutor = zeroAddress,
    nonce,
    evvmSignedAction,
  }: {
    commitment: string;
    amount: bigint;
    originExecutor?: HexString;
    nonce: bigint;
    evvmSignedAction: SignedAction<IPayData>;
  }): Promise<SignedAction<IDepositData>> {
    const evvmId = await this.getEvvmID();
    const functionName = 'deposit';
    const hashPayload = this.buildHashPayload(functionName, {
      commitment,
      amount,
    });
    const message = this.buildMessageToSign(evvmId, hashPayload, originExecutor, nonce, true);

    const signature = await this.signer.signMessage(message);

    return new SignedAction(this, evvmId, functionName, {
      user: this.signer.address,
      commitment,
      amount,
      originExecutor,
      nonce,
      signature,
      priorityFeePay: evvmSignedAction.data.priorityFee,
      noncePay: evvmSignedAction.data.nonce,
      signaturePay: evvmSignedAction.data.signature,
    });
  }

  @SignMethod
  async withdraw({
    proof,
    publicInputs,
    recipient,
    originExecutor = zeroAddress,
    nonce,
  }: {
    proof: string;
    recipient: HexString;
    publicInputs: any[];
    originExecutor?: HexString;
    nonce: bigint;
  }): Promise<SignedAction<IWithdrawData>> {
    const evvmId = await this.getEvvmID();
    const functionName = 'withdraw';

    const hashPayload = this.buildHashPayload(functionName, {
      proof,
    });
    const message = this.buildMessageToSign(evvmId, hashPayload, zeroAddress, nonce, true);

    const signature = await this.signer.signMessage(message);

    // todo: add recipient
    return new SignedAction(this, evvmId, functionName, {
      user: this.signer.address,
      recipient,
      proof,
      publicInputs,
      originExecutor,
      nonce,
      signature,
    });
  }
}

export function createZkVVMService(signer: ISigner) {
  return new zkVVM(
    signer,
    (import.meta.env.VITE_ZKVVM_ADDRESS || undefined) as Address,
    zkVVMArtifact.abi,
    11155111,
  );
}
