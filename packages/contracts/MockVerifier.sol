// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IVerifier} from "./IVerifier.sol";

contract MockVerifier is IVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure override returns (bool) {
        return true;
    }
}
