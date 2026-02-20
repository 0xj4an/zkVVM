import { BaseService, HexString, IPayData, ISigner, SignedAction, SignMethod } from '@evvm/evvm-js';
import { zeroAddress } from 'viem';
import { IDepositData, IWithdrawData } from '../../types/zkVVM.types.js';

export class zkVVM extends BaseService {
  constructor(signer: ISigner) {
    super({
      signer,
      address: `0x00`,
      abi: [], // todo: define this
      chainId: 11155111, // sepolia
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

    return new SignedAction(this, evvmId, functionName, {
      user: this.signer.address,
      proof,
      publicInputs,
      originExecutor,
      nonce,
      signature,
    });
  }
}
