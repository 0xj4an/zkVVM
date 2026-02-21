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

        require(!commitments[commitment], 'commitment already used');
        require(amount > 0, 'amount must be greater than 0');

        // 2. store commitment?
        // (is this correct?)
        commitments[commitment] = true;

        // 3. Process payment through EVVM
        requestPay(
            user,
            getPrincipalTokenAddress(),
            amount,
            priorityFeePay,
            noncePay,
            true,
            signaturePay
        );
    }

    // 2. withdraw(proof, publicInputs)
    function withdraw(
        address user,
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

        // assertions
        bytes32 valueField = publicInputs[0];
        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[2];

        uint256 amount = uint256(valueField);
        require(amount > 0, 'withdraw amount must be > 0');
        require(merkleRoots[expectedRoot], 'unknown root');
        require(!nullifiers[nullifierIn], 'nullifier used');

        // delegate proof verification to Verifier contract
        require(withdrawVerifier.verify(proof, publicInputs), 'invalid proof');

        nullifiers[nullifierIn] = true;

        // if successfull, redeem deposit to user address
        makeCaPay(user, getPrincipalTokenAddress(), amount);
    }

    function registerRoot(bytes32 root) external {
        require(!merkleRoots[root], 'Root already known');
        require(msg.sender == admin, 'Only admin can call this method');

        merkleRoots[root] = true;
    }
}
