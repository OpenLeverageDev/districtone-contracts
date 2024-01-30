// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {SafeERC20, IERC20} from "@openzeppelin-5/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWETH} from "../common/IWETH.sol";

library Erc20Utils {
    error ETHTransferFailed();
    using SafeERC20 for IERC20;

    function balanceOfThis(IERC20 token) internal view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        token.forceApprove(spender, value);
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal returns (uint256) {
        uint256 balance = balanceOfThis(token);
        token.safeTransferFrom(from, to, amount);
        return balanceOfThis(token) - balance;
    }

    function safeTransferIn(IERC20 token, address from, uint256 amount) internal returns (uint256) {
        uint256 balance = balanceOfThis(token);
        token.safeTransferFrom(from, address(this), amount);
        return balanceOfThis(token) - balance;
    }

    function transferOut(IERC20 token, address to, uint256 amount) internal {
        token.safeTransfer(to, amount);
    }

    function uniTransferOut(IERC20 token, address to, uint256 amount, address weth) internal {
        if (address(token) == weth) {
            IWETH(weth).withdraw(amount);
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert ETHTransferFailed();
        } else {
            transferOut(token, to, amount);
        }
    }
}
