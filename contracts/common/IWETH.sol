// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

interface IWETH {
    function deposit() external payable;

    function withdraw(uint256) external;
}
