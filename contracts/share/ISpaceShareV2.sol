// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {ISpaceShare} from "./ISpaceShare.sol";

interface ISpaceShareV2 is ISpaceShare {
    function sellSharesV2(uint256 spaceId, uint256 shares, uint256 minOutAmount, uint256 timestamp, bytes memory signature) external;

    function exitSpaceV2(uint256 spaceId, uint256 minOutAmount, uint256 timestamp, bytes memory signature) external;
}
