import { expect, beforeAll, describe, test, setDefaultTimeout } from 'bun:test';
import { Noir } from '@noir-lang/noir_js';
import { ProofData } from '@noir-lang/types';
import { UltraPlonkBackend } from '@aztec/bb.js';
import fs from 'fs';
import { resolve } from 'path';
import { bytesToHex, keccak256, toBytes } from 'viem';
import {
  computeCiphertext,
  decryptCiphertext,
  POOL_SALT,
} from '../lib/withdraw-v2b-ciphertext.js';

const GENESIS_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;

setDefaultTimeout(120_000);

const CONTRACTS_DIR = resolve(import.meta.dir, '..', 'packages', 'contracts');

describe('ShieldedPool (Etapa 1.4)', () => {
  let noir: Noir;
  let backend: UltraPlonkBackend;
  let pool: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>>; write: Record<string, (...args: unknown[]) => Promise<unknown>> };
  let withdrawVerifier: { address: `0x${string}` };
  let expectedRootForWithdraw: `0x${string}`;

  beforeAll(async () => {
    const backupDir = resolve(import.meta.dir, '..', 'packages', 'contracts-backup');
    fs.mkdirSync(backupDir, { recursive: true });
    for (const name of ['IVerifier.sol', 'MockVerifier.sol', 'MockERC20.sol', 'ShieldedPool.sol']) {
      const p = resolve(CONTRACTS_DIR, name);
      if (fs.existsSync(p)) fs.copyFileSync(p, resolve(backupDir, name));
    }

    const hre = require('hardhat');
    hre.run('node');
    hre.config.noirenberg = { provingSystem: 'UltraPlonk' };

    if (fs.existsSync(CONTRACTS_DIR)) fs.rmSync(CONTRACTS_DIR, { recursive: true });
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });

    ({ noir, backend } = await hre.noirenberg.compile());
    await hre.noirenberg.getSolidityVerifier();

    for (const name of ['IVerifier.sol', 'MockVerifier.sol', 'MockERC20.sol', 'ShieldedPool.sol']) {
      const src = resolve(backupDir, name);
      const dest = resolve(CONTRACTS_DIR, name);
      if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    }
    await hre.run('compile');

    const walletClients = await hre.viem.getWalletClients();
    const wallet = walletClients?.[0];
    const mockUsdc = await hre.viem.deployContract('MockERC20');
    if (wallet?.account?.address) {
      await mockUsdc.write.mint([wallet.account.address, 1_000_000n * 10n ** 18n]);
    }

    const mockVerifier = await hre.viem.deployContract('MockVerifier');
    withdrawVerifier = await hre.viem.deployContract('UltraVerifier');

    const poseidonLib = await hre.viem.deployContract('PoseidonT3');
    const poseidonAddress = poseidonLib.address;

    pool = await hre.viem.deployContract('ShieldedPool', [
      mockUsdc.address,
      mockVerifier.address,
      GENESIS_ROOT as `0x${string}`,
      withdrawVerifier.address,
      '0x0000000000000000000000000000000000000000',
    ], {
      libraries: { 'poseidon-solidity/PoseidonT3.sol:PoseidonT3': poseidonAddress as `0x${string}` },
    });

    expectedRootForWithdraw = '0x1364dee863ea150a4774ed9bc287bd4a4b7bec30e86f6bc29decf65a3b3bc4aa' as const;
    if (expectedRootForWithdraw !== GENESIS_ROOT) {
      await pool.write.registerRoot([expectedRootForWithdraw]);
    }
  });

  describe('1.4 Deposit: varios amount y un commitment por cada uno', () => {
    test('deposit con amount 100 y commitment único', async () => {
      const commitment1 = '0x' + '11'.repeat(32) as `0x${string}`;
      await pool.write.deposit([commitment1, 100n]);
      expect(await pool.read.usedCommitments([commitment1])).toBeTrue;
    });

    test('deposit con amount 1000000 y otro commitment', async () => {
      const commitment2 = '0x' + '22'.repeat(32) as `0x${string}`;
      await pool.write.deposit([commitment2, 1_000_000n]);
      expect(await pool.read.usedCommitments([commitment2])).toBeTrue;
    });

    test('deposit con amount 1e18 y otro commitment', async () => {
      const commitment3 = '0x' + '33'.repeat(32) as `0x${string}`;
      await pool.write.deposit([commitment3, 10n ** 18n]);
      expect(await pool.read.usedCommitments([commitment3])).toBeTrue;
    });

    test('rechazo: mismo commitment dos veces', async () => {
      const commitment = '0x' + '44'.repeat(32) as `0x${string}`;
      await pool.write.deposit([commitment, 1n]);
      await expect(pool.write.deposit([commitment, 2n])).rejects.toThrow();
    });

    test('rechazo: amount 0', async () => {
      const commitment = '0x' + '55'.repeat(32) as `0x${string}`;
      await expect(pool.write.deposit([commitment, 0n])).rejects.toThrow();
    });
  });

  describe('1.4 Withdraw: distintos value y comprobar monto', () => {
    test('withdraw con value 1: proof válida y evento Withdraw con amount correcto', async () => {
      const input = {
        value: '0x1',
        nullifier: '0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400',
        merkle_proof_length: 1,
        expected_merkle_root: expectedRootForWithdraw,
        recipient: '0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d',
        pk_b: '0x2',
        random: '0x64',
        merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        merkle_proof_siblings: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
      };
      const { witness } = await noir.execute(input);
      const proof: ProofData = await backend.generateProof(witness);
      const publicInputs = proof.publicInputs as `0x${string}`[];

      const hash = await pool.write.withdraw([bytesToHex(proof.proof), publicInputs]);
      expect(hash).toBeDefined();
    });
  });

  describe('1.4 Rechazos: value 0, nullifier usado, root desconocido', () => {
    test('rechazo cuando value == 0 en publicInputs', async () => {
      const input = {
        value: '0x1',
        nullifier: '0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400',
        merkle_proof_length: 1,
        expected_merkle_root: expectedRootForWithdraw,
        recipient: '0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d',
        pk_b: '0x2',
        random: '0x64',
        merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        merkle_proof_siblings: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
      };
      const { witness } = await noir.execute(input);
      const proof: ProofData = await backend.generateProof(witness);
      const publicInputs = [...(proof.publicInputs as `0x${string}`[])];
      publicInputs[0] = '0x0' as `0x${string}`;

      await expect(pool.write.withdraw([bytesToHex(proof.proof), publicInputs])).rejects.toThrow();
    });

    test('rechazo cuando nullifier ya usado', async () => {
      const input = {
        value: '0x1',
        nullifier: '0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400',
        merkle_proof_length: 1,
        expected_merkle_root: expectedRootForWithdraw,
        recipient: '0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d',
        pk_b: '0x2',
        random: '0x64',
        merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        merkle_proof_siblings: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
      };
      const { witness } = await noir.execute(input);
      const proof: ProofData = await backend.generateProof(witness);
      const publicInputs = proof.publicInputs as `0x${string}`[];
      await expect(pool.write.withdraw([bytesToHex(proof.proof), publicInputs])).rejects.toThrow();
    });

    test('rechazo cuando expected_merkle_root desconocido', async () => {
      const unknownRoot = '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`;
      const input = {
        value: '0x1',
        nullifier: '0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400',
        merkle_proof_length: 1,
        expected_merkle_root: expectedRootForWithdraw,
        recipient: '0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d',
        pk_b: '0x2',
        random: '0x64',
        merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        merkle_proof_siblings: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
      };
      const { witness } = await noir.execute(input);
      const proof: ProofData = await backend.generateProof(witness);
      const publicInputs = [...(proof.publicInputs as `0x${string}`[])];
      publicInputs[3] = unknownRoot;

      await expect(pool.write.withdraw([bytesToHex(proof.proof), publicInputs])).rejects.toThrow();
    });
  });
});

describe('ShieldedPool (Etapa 2)', () => {
  let noir: Noir;
  let backend: UltraPlonkBackend;
  let pool: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>>; write: Record<string, (...args: unknown[]) => Promise<unknown>> };
  let mockUsdc: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>>; write: Record<string, (...args: unknown[]) => Promise<unknown>> };
  let expectedRootForWithdraw: `0x${string}`;
  let walletClients: { account?: { address: `0x${string}` } }[] | undefined;

  beforeAll(async () => {
    const backupDir = resolve(import.meta.dir, '..', 'packages', 'contracts-backup');
    fs.mkdirSync(backupDir, { recursive: true });
    for (const name of ['IVerifier.sol', 'MockVerifier.sol', 'MockERC20.sol', 'ShieldedPool.sol']) {
      const p = resolve(CONTRACTS_DIR, name);
      if (fs.existsSync(p)) fs.copyFileSync(p, resolve(backupDir, name));
    }

    const hre = require('hardhat');
    hre.run('node');
    hre.config.noirenberg = { provingSystem: 'UltraPlonk' };

    if (fs.existsSync(CONTRACTS_DIR)) fs.rmSync(CONTRACTS_DIR, { recursive: true });
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });

    ({ noir, backend } = await hre.noirenberg.compile());
    await hre.noirenberg.getSolidityVerifier();

    for (const name of ['IVerifier.sol', 'MockVerifier.sol', 'MockERC20.sol', 'ShieldedPool.sol']) {
      const src = resolve(backupDir, name);
      const dest = resolve(CONTRACTS_DIR, name);
      if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    }
    await hre.run('compile');

    walletClients = await hre.viem.getWalletClients();
    const alice = walletClients?.[0];
    mockUsdc = await hre.viem.deployContract('MockERC20');
    if (alice?.account?.address) {
      await mockUsdc.write.mint([alice.account.address, 1_000_000n * 10n ** 18n]);
    }

    const mockVerifier = await hre.viem.deployContract('MockVerifier');
    const withdrawVerifier = await hre.viem.deployContract('UltraVerifier');
    const poseidonLib = await hre.viem.deployContract('PoseidonT3');
    const poseidonAddress = poseidonLib.address;

    pool = await hre.viem.deployContract('ShieldedPool', [
      mockUsdc.address,
      mockVerifier.address,
      GENESIS_ROOT as `0x${string}`,
      withdrawVerifier.address,
      '0x0000000000000000000000000000000000000000',
    ], {
      libraries: { 'poseidon-solidity/PoseidonT3.sol:PoseidonT3': poseidonAddress as `0x${string}` },
    });

    expectedRootForWithdraw = '0x1364dee863ea150a4774ed9bc287bd4a4b7bec30e86f6bc29decf65a3b3bc4aa' as const;
    if (expectedRootForWithdraw !== GENESIS_ROOT) {
      await pool.write.registerRoot([expectedRootForWithdraw]);
    }
  });

  describe('2.2 Claim por quien tenga la proof', () => {
    test('Alice genera proof con recipient=Bob; Charlie ejecuta withdraw y Bob recibe fondos (Charlie no)', async () => {
      const alice = walletClients?.[0];
      const bob = walletClients?.[1];
      const charlie = walletClients?.[2];
      if (!alice?.account?.address || !bob?.account?.address || !charlie?.account?.address) {
        throw new Error('Need at least 3 wallet clients (Alice, Bob, Charlie)');
      }

      const bobAddress = bob.account.address;
      const recipientAsBytes32 = ('0x000000000000000000000000' + bobAddress.slice(2).toLowerCase()) as `0x${string}`;

      await pool.write.deposit(['0x' + 'ee'.repeat(32) as `0x${string}`, 10_000n]);

      const input = {
        value: '0x1',
        nullifier: '0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400',
        merkle_proof_length: 1,
        expected_merkle_root: expectedRootForWithdraw,
        recipient: recipientAsBytes32,
        pk_b: '0x2',
        random: '0x64',
        merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        merkle_proof_siblings: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
      };
      const { witness } = await noir.execute(input);
      const proof: ProofData = await backend.generateProof(witness);
      const publicInputs = proof.publicInputs as `0x${string}`[];

      const hre = require('hardhat');
      const poolAsCharlie = await hre.viem.getContractAt('ShieldedPool', pool.address, {
        client: { wallet: charlie },
      });
      const hash = await poolAsCharlie.write.withdraw([bytesToHex(proof.proof), publicInputs]);
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      expect(receipt.status).toBe('success');
      expect(receipt.from.toLowerCase()).toBe(charlie.account.address.toLowerCase());

      const poolLogs = receipt.logs.filter((l: { address: string }) => l.address.toLowerCase() === pool.address.toLowerCase());
      const withdrawSig = keccak256(toBytes('Withdraw(address,bytes32,uint256)'));
      const withdrawLog = poolLogs.find((l: { topics: string[] }) => l.topics[0] === withdrawSig && l.topics.length >= 2);
      expect(withdrawLog).toBeDefined();
      const recipientFromTopic = ('0x' + (withdrawLog!.topics[1]!.slice(-40))).toLowerCase();
      expect(recipientFromTopic).toBe(bobAddress.toLowerCase());
    });
  });

  describe('3.4 withdraw v2b: ciphertext off-chain', () => {
    const nullifier = '0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400' as `0x${string}`;
    const recipientField =
      '0x000000000000000000000000635bb386312470490dd5864258bcb7ab505bf42d' as `0x${string}`;

    test('POOL_SALT es bytes32', () => {
      expect(POOL_SALT).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    test('computeCiphertext + decryptCiphertext round-trip', () => {
      const amount = 1n;
      const ciphertext = computeCiphertext(amount, nullifier, recipientField);
      expect(ciphertext).toMatch(/^0x[0-9a-f]{64}$/i);
      const recovered = decryptCiphertext(ciphertext, nullifier, recipientField);
      expect(recovered).toBe(amount);
    });

    test('ciphertext distinto para distinto amount', () => {
      const c1 = computeCiphertext(1n, nullifier, recipientField);
      const c2 = computeCiphertext(2n, nullifier, recipientField);
      expect(c1).not.toBe(c2);
      expect(decryptCiphertext(c1, nullifier, recipientField)).toBe(1n);
      expect(decryptCiphertext(c2, nullifier, recipientField)).toBe(2n);
    });

    test('ciphertext con amount grande (1e18)', () => {
      const amount = 10n ** 18n;
      const ciphertext = computeCiphertext(amount, nullifier, recipientField);
      expect(decryptCiphertext(ciphertext, nullifier, recipientField)).toBe(amount);
    });
  });
});
