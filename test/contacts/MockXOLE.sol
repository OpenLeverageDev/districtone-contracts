// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IxOLE} from "../../contracts/common/IxOLE.sol";

contract MockXOLE is IxOLE {

    // Official record of token balances for each account
    mapping(address => uint) internal balances;

    function balanceOf(address addr) external view override returns (uint256){
        return balances[addr];
    }

    function mint(address addr, uint amount) external {
        balances[addr] = amount;
    }
}