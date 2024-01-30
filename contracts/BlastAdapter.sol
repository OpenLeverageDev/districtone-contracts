// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin-5/contracts/access/Ownable.sol";
import {IBlast} from "./blast/IBlast.sol";

contract BlastAdapter is Ownable {
    constructor() Ownable(_msgSender()) {}

    function enableClaimable(address gov) public onlyOwner {
        IBlast(0x4300000000000000000000000000000000000002).configure(IBlast.YieldMode.CLAIMABLE, IBlast.GasMode.CLAIMABLE, gov);
    }
}
