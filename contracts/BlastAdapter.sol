// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin-5/contracts/access/Ownable.sol";
import {IBlast} from "./blast/IBlast.sol";
import {IBlastPoints} from "./blast/IBlastPoints.sol";

contract BlastAdapter is Ownable {
    constructor() Ownable(_msgSender()) {}

    function enableClaimable(address gov) public onlyOwner {
        IBlast(0x4300000000000000000000000000000000000002).configure(IBlast.YieldMode.CLAIMABLE, IBlast.GasMode.CLAIMABLE, gov);
        IBlastPoints(0x2536FE9ab3F511540F2f9e2eC2A805005C3Dd800).configurePointsOperator(gov);
    }
}
