// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWETH} from "../common/IWETH.sol";

contract MockZap {
    error InsufficientOleReturn(); // Error thrown when the OLE amount received is less than expected

    IERC20 public immutable OLE; // Address of the OLE token
    IWETH public immutable WETH; // Native token of the blockchain (e.g., ETH on Ethereum)

    constructor(IERC20 _ole, IWETH _weth) {
        OLE = _ole;
        WETH = _weth;
    }
    function swapETHForOLE(uint256 minBoughtOle) external payable returns (uint256) {
        WETH.deposit{value: msg.value}();
        uint256 boughtOle = 100 ether;
        if (boughtOle < minBoughtOle) revert InsufficientOleReturn();
        OLE.transfer(msg.sender, boughtOle);
        return boughtOle;
    }

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime) external payable {}

    function increaseXoleByETH(uint256 minLpReturn) external payable {}

    function buySharesByETH(uint256 stageId, uint256 shares, uint256 timestamp, bytes memory signature, uint256 minBoughtOle) external payable {}
}
