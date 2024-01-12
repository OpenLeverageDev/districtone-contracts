// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOPZap {
    function createXole(uint256 supplyUsdc, uint256 supplyOle, uint256 minLpReturn, uint256 unlockTime) external;

    function increaseXole(uint256 supplyUsdc, uint256 supplyOle, uint256 minLpReturn) external;

    function createXoleByUSDC(uint256 supplyUsdc, uint256 minLpReturn, uint256 unlockTime) external;

    function increaseXoleByUSDC(uint256 supplyUsdc, uint256 minLpReturn) external;

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime, bytes memory swapData) external payable;

    function increaseXoleByETH(uint256 minLpReturn, bytes memory swapData) external payable;

    function createXoleByToken(IERC20 supplyToken, uint256 supplyAmount, uint256 minLpReturn, uint256 unlockTime, bytes memory swapData) external;

    function increaseXoleByToken(IERC20 supplyToken, uint256 supplyAmount, uint256 minLpReturn, bytes memory swapData) external;

    function buySharesByETH(uint256 stageId, uint256 shares, bytes memory swapData, uint256 timestamp, bytes memory signature) external payable;

    function buySharesByToken(
        uint256 stageId,
        IERC20 supplyToken,
        uint256 supplyAmount,
        uint256 shares,
        bytes memory swapData,
        uint256 timestamp,
        bytes memory signature
    ) external;
}
