// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import "../common/IWETH.sol";
import {ERC20} from "@openzeppelin-5/contracts/token/ERC20/ERC20.sol";

contract MockWETH is IWETH, ERC20("WETH", "WETH") {
    function deposit() external payable override {
        _mint(msg.sender, msg.value);
    }

    function mint(address to, uint256 amount) public payable {
        _mint(to, amount);
    }

    function withdraw(uint256 amount) external override {
        _burn(msg.sender, amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
    }
}
