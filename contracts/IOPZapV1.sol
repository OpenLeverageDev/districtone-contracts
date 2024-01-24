// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOPZapV1 {
    function swapETHForOLE() external payable returns (uint256);

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime) external payable;

    function increaseXoleByETH(uint256 minLpReturn) external payable;

    function buySharesByETH(uint256 stageId, uint256 shares, uint256 timestamp, bytes memory signature) external payable;
}
