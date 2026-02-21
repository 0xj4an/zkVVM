// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVerifier} from "./IVerifier.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

contract ShieldedPool is ReentrancyGuard {
    // 1 unit of token (18 decimals, e.g. 1 Mento USD on Celo)
    // uint256 public constant DENOMINATION = 1e18;

    /// @notice Salt for v2b ciphertext key derivation: key = keccak256(nullifier || recipient || POOL_SALT).
    bytes32 public constant POOL_SALT = keccak256("ShieldedPool.v2b");

    IERC20 public immutable usdc;
    IVerifier public immutable verifier;
    /// @notice Withdraw circuit verifier (5 public inputs). If address(0), withdraw is disabled.
    IVerifier public immutable withdrawVerifier;
    /// @notice Withdraw v2b verifier (5 public inputs: nullifier, length, root, recipient, commitment). If address(0), withdrawV2b is disabled.
    IVerifier public immutable withdrawVerifierV2b;

    // root registry (MVP): allow roots computed offchain
    mapping(bytes32 => bool) public isKnownRoot;

    // spent nullifiers
    mapping(bytes32 => bool) public nullifiers;

    // each commitment can only be deposited once (one note = one commitment)
    mapping(bytes32 => bool) public usedCommitments;

    event RootRegistered(bytes32 indexed root);
    event Deposit(address indexed sender, bytes32 indexed commitment, uint256 amount);
    event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment);
    event Withdraw(address indexed recipient, bytes32 indexed nullifier, uint256 amount);

    constructor(
        address _usdc,
        address _verifier,
        bytes32 _genesisRoot,
        address _withdrawVerifier,
        address _withdrawVerifierV2b
    ) {
        usdc = IERC20(_usdc);
        verifier = IVerifier(_verifier);
        withdrawVerifier = IVerifier(_withdrawVerifier);
        withdrawVerifierV2b = IVerifier(_withdrawVerifierV2b);

        // genesis root (for empty tree / initial state you use offchain)
        isKnownRoot[_genesisRoot] = true;
        emit RootRegistered(_genesisRoot);
    }

    /// @notice MVP: adminless root registration.
    /// Anyone can register a root; it doesn't move funds by itself.
    /// For production you'd restrict this or derive roots onchain.
    function registerRoot(bytes32 root) external {
        require(!isKnownRoot[root], "root already known");
        isKnownRoot[root] = true;
        emit RootRegistered(root);
    }

    /// @notice Deposit `amount` of token to mint a note commitment (commitment computed offchain).
    /// Each commitment can only be used once (ensures one note per commitment).
    function deposit(bytes32 commitment, uint256 amount) external nonReentrant {
        require(!usedCommitments[commitment], "commitment already used");
        require(amount > 0, "amount must be greater than 0");
        // require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed"); // disabled: simulate only, no USDC in
        usedCommitments[commitment] = true;
        emit Deposit(msg.sender, commitment, amount);
    }

    /// @notice Private note -> note transfer (no token moves; state is enforced by nullifiers + commitments offchain)
    /// publicInputs order MUST match Noir circuit:
    /// [0]=new_commitment, [1]=nullifier_in, [2]=merkle_proof_length, [3]=expected_merkle_root
    function transferIntent(
        bytes32 expectedRoot,
        bytes32 nullifierIn,
        uint32 merkleProofLength,
        bytes32 newCommitment,
        bytes calldata proof
    ) external nonReentrant {
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = newCommitment;
        publicInputs[1] = nullifierIn;
        publicInputs[2] = bytes32(uint256(merkleProofLength));
        publicInputs[3] = expectedRoot;

        require(verifier.verify(proof, publicInputs), "invalid proof");

        // effects
        nullifiers[nullifierIn] = true;

        emit TransferIntent(expectedRoot, nullifierIn, newCommitment);
    }

    /// @notice Withdraw the amount proved in the circuit to the recipient.
    /// Public inputs (withdraw circuit order): [value, nullifier, merkle_proof_length, expected_merkle_root, recipient].
    /// publicInputs[0] is the amount to transfer (token units). recipient is address as Field (32 bytes, lower 20). Requires withdrawVerifier != address(0).
    function withdraw(bytes calldata proof, bytes32[] calldata publicInputs) external nonReentrant {
        require(address(withdrawVerifier) != address(0), "withdraw not enabled");
        require(publicInputs.length == 5, "wrong number of public inputs");

        bytes32 valueField = publicInputs[0];
        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[3];
        bytes32 recipientField = publicInputs[4];

        uint256 amount = uint256(valueField);
        require(amount > 0, "withdraw amount must be > 0");
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");

        require(withdrawVerifier.verify(proof, publicInputs), "invalid proof");

        nullifiers[nullifierIn] = true;
        address recipient = address(uint160(uint256(recipientField) & type(uint160).max));
        // require(usdc.transfer(recipient, amount), "transfer failed");

        emit Withdraw(recipient, nullifierIn, amount);
    }

    /// @notice Withdraw v2b: amount from ciphertext, 5 public inputs (nullifier, merkle_proof_length, expected_merkle_root, recipient, commitment).
    /// Key = keccak256(nullifier || recipient || POOL_SALT); amount = ciphertext XOR keccak256(key || 0); commitment must equal Poseidon(amount, nullifier).
    function withdrawV2b(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 ciphertext
    ) external nonReentrant {
        require(address(withdrawVerifierV2b) != address(0), "withdrawV2b not enabled");
        require(publicInputs.length == 5, "wrong number of public inputs");

        bytes32 nullifierIn = publicInputs[0];
        bytes32 expectedRoot = publicInputs[2];
        bytes32 recipientField = publicInputs[3];
        bytes32 commitment = publicInputs[4];

        address recipient = address(uint160(uint256(recipientField) & type(uint160).max));
        bytes32 key = keccak256(abi.encodePacked(nullifierIn, recipientField, POOL_SALT));
        bytes32 stream = bytes32(keccak256(abi.encodePacked(key, uint256(0))));
        uint256 amount = uint256(ciphertext) ^ uint256(stream);

        require(amount > 0, "withdraw amount must be > 0");
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");

        uint256 computedCommitment = PoseidonT3.hash([amount, uint256(nullifierIn)]);
        require(computedCommitment == uint256(commitment), "commitment mismatch");

        require(withdrawVerifierV2b.verify(proof, publicInputs), "invalid proof");

        nullifiers[nullifierIn] = true;
        // require(usdc.transfer(recipient, amount), "transfer failed");

        emit Withdraw(recipient, nullifierIn, amount);
    }
}
