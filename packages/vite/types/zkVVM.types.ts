import { HexString } from '@evvm/evvm-js';

export interface IDepositData {
  user: HexString;
  commitment: string;
  amount: bigint;
  originExecutor: HexString;
  nonce: bigint;
  signature: string;
  priorityFeePay?: bigint;
  noncePay: bigint;
  signaturePay: string;
}

export interface IWithdrawData {
  user: HexString;
  recipient: HexString;
  proof: string;
  publicInputs: any[];
  ciphertext: HexString;
  originExecutor: HexString;
  nonce: bigint;
  signature: string;
}
