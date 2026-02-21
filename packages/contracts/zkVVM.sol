// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {EvvmService} from '@evvm/testnet-contracts/library/EvvmService.sol';
import {AdvancedStrings} from '@evvm/testnet-contracts/library/utils/AdvancedStrings.sol';
import {IVerifier} from './IVerifier.sol';

contract zkVVM is EvvmService {
    mapping(bytes => bool) public commitments;
    mapping(bytes32 => bool) public merkleRoots;
    mapping(bytes32 => bool) public nullifiers;

    address public admin;

    IVerifier public immutable withdrawVerifier;

    event Deposited(address indexed user, bytes commitment, uint256 amount);
    event Withdrawn(address indexed recipient, bytes32 indexed nullifier, uint256 amount);
    event RootRegistered(bytes32 indexed root);

    constructor(
        address _admin,
        address _coreAddress,
        address _stakingAddress,
        address _withdrawVerifierAddress
    ) EvvmService(_coreAddress, _stakingAddress) {
        withdrawVerifier = IVerifier(_withdrawVerifierAddress);
        admin = _admin;
    }

    // we will need two main functions:
    // 1. deposit(commitment, amount)
    function deposit(
        address user,
        bytes memory commitment,
        uint256 amount,
        address originExecutor,
        uint256 nonce,
        bytes memory signature,
        uint256 priorityFeePay,
        uint256 noncePay,
        bytes memory signaturePay
    ) external {
        core.validateAndConsumeNonce(
            user,
            keccak256(abi.encode('deposit', commitment, amount)),
            originExecutor,
            nonce,
            true,
            signature
        );

        require(!commitments[commitment], 'zkVVM: commitment-already-used');
        require(amount > 0, 'zkVVM: amount-must-be-greater-than-zero');

        // mark commitment as present (the Merkle tree is built off-chain and roots
        // are registered via `registerRoot`). Storing the commitment can be
        // useful for client-side indexing and duplicate protection.
        commitments[commitment] = true;

        // Process payment through EVVM (pull payment from `user` into the pool)
        requestPay(
            user,
            getPrincipalTokenAddress(),
            amount,
            priorityFeePay,
            noncePay,
            true,
            signaturePay
        );

        emit Deposited(user, commitment, amount);
    }

    // 2. withdraw(proof, publicInputs)
    function withdraw(
        address user,
        address recipient,
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        address originExecutor,
        uint256 nonce,
        bytes memory signature
    ) external {
        // spend nonce and verify signature
        core.validateAndConsumeNonce(
            user,
            keccak256(abi.encode('withdraw', proof)),
            originExecutor,
            nonce,
            true,
            signature
        );

        // Interpret public inputs. The frontend/prover can provide multiple
        // public input layouts. The most common (v2a) places `value` at index 0,
        // `nullifier` at index 1 and `expectedRoot` at index 2. Other variants
        // (v2b) may omit `value` and instead include `commitment`.
        require(publicInputs.length >= 3, 'zkVVM: invalid-public-inputs');

        bytes32 valueField = publicInputs[0];
        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[2];

        uint256 amount = uint256(valueField);
        require(amount > 0, 'zkVVM: withdraw-amount-must-be-greater-than-zero');
        require(merkleRoots[expectedRoot], 'zkVVM: unknown-root');
        require(!nullifiers[nullifierIn], 'zkVVM: nullifier-used');

        // If the circuit exposes a recipient as a public input, enforce it
        // to prevent front-running. Many prover configs put recipient at
        // index 3 (as a uint256). If present, require it equals `user`.
        if (publicInputs.length > 3) {
            address recipientFromProof = address(uint160(uint256(publicInputs[3])));
            require(recipientFromProof == recipient, 'zkVVM: recipient-mismatch');
        }

        // delegate proof verification to Verifier contract
        require(withdrawVerifier.verify(proof, publicInputs), 'invalid proof');

        nullifiers[nullifierIn] = true;

        // Transfer funds to the beneficiary bound by the proof
        makeCaPay(recipient, getPrincipalTokenAddress(), amount);

        emit Withdrawn(user, nullifierIn, amount);
    }

    function registerRoot(bytes32 root) external {
        require(!merkleRoots[root], 'Root already known');
        require(msg.sender == admin, 'Only admin can call this method');

        merkleRoots[root] = true;
        emit RootRegistered(root);
    }
}
