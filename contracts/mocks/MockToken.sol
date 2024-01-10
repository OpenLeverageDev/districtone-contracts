// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 amount
    ) ERC20(name_, symbol_) {
        mint(msg.sender, amount);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public{
        _burn(from, amount);
    }
}
