// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IStageShare} from "./IStageShare.sol";

contract ShareHelper {
    constructor() {}

    function getRewards(IStageShare stageShare, address holder, uint256[] memory stageIds) external view returns (uint256[] memory rewards) {
        uint len = stageIds.length;
        rewards = new uint256[](len);
        for (uint i = 0; i < len; i++) {
            uint256[] memory queryIds = new uint256[](1);
            queryIds[0] = stageIds[i];
            rewards[i] = stageShare.getRewards(queryIds, holder);
        }
    }
}
