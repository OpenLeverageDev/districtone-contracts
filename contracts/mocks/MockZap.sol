// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IOPZapV1, IERC20} from "../IOPZapV1.sol";
import {IWETH} from "../common/IWETH.sol";

contract MockZap is IOPZapV1 {
    IERC20 public immutable OLE; // Address of the OLE token
    IWETH public immutable WETH; // Native token of the blockchain (e.g., ETH on Ethereum)

    constructor(IERC20 _ole, IWETH _weth) {
        OLE = _ole;
        WETH = _weth;
    }
    function swapETHForOLE() external payable override returns (uint256) {
        WETH.deposit{value: msg.value}();
        OLE.transfer(msg.sender, 100 ether);
        return 100 ether;
    }

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime) external payable override {}

    function increaseXoleByETH(uint256 minLpReturn) external payable override {}

    function buySharesByETH(uint256 stageId, uint256 shares, uint256 timestamp, bytes memory signature) external payable override {}
}
