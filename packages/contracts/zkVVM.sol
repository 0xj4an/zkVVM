// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {EvvmService} from '@evvm/testnet-contracts/library/EvvmService.sol';
import {AdvancedStrings} from '@evvm/testnet-contracts/library/utils/AdvancedStrings.sol';
import {IVerifier} from './IVerifier.sol';

contract zkVVM is EvvmService {
    bytes32 private constant POOL_SALT = keccak256('ShieldedPool.v2b');
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
        bytes32 ciphertext,
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

        // Public input layout (v2b, matches Noir withdraw.nr and tests):
        // 0: nullifier
        // 1: merkle_proof_length
        // 2: expected_merkle_root
        // 3: recipient (field)
        // 4: commitment
        require(publicInputs.length == 5, 'zkVVM: invalid-public-inputs');

        bytes32 nullifierIn = publicInputs[0];
        bytes32 merkleProofLength = publicInputs[1];
        bytes32 expectedRoot = publicInputs[2];
        bytes32 recipientField = publicInputs[3];
        // commitment field is publicInputs[4]; it is enforced inside the zk proof

        require(uint256(merkleProofLength) > 0, 'zkVVM: invalid-merkle-depth');
        require(merkleRoots[expectedRoot], 'zkVVM: unknown-root');
        require(!nullifiers[nullifierIn], 'zkVVM: nullifier-used');

        address recipientFromProof = address(uint160(uint256(recipientField)));
        require(recipientFromProof == recipient, 'zkVVM: recipient-mismatch');

        // Decrypt ciphertext: key = keccak256(nullifier || recipient || POOL_SALT)
        bytes32 key = keccak256(abi.encodePacked(nullifierIn, recipientField, POOL_SALT));
        bytes32 stream = keccak256(abi.encodePacked(key, uint256(0)));
        uint256 amount = uint256(ciphertext ^ stream);
        require(amount > 0, 'zkVVM: withdraw-amount-must-be-greater-than-zero');

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
