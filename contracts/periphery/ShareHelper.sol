// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {ISpaceShare} from "../share/ISpaceShare.sol";
import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/IERC20.sol";
import {IUniV2ClassPair} from "../common/IUniV2ClassPair.sol";

contract ShareHelper {
    constructor() {}

    function getRewards(ISpaceShare spaceShare, address holder, uint256[] memory spaceIds) external view returns (uint256[] memory rewards) {
        uint len = spaceIds.length;
        rewards = new uint256[](len);
        for (uint i = 0; i < len; i++) {
            uint256[] memory queryIds = new uint256[](1);
            queryIds[0] = spaceIds[i];
            rewards[i] = spaceShare.getRewards(queryIds, holder);
        }
    }

    function query(
        ISpaceShareBalance spaceShare,
        uint256 spaceId,
        IERC20 ole,
        IUniV2ClassPair oleWethPair
    )
        external
        view
        returns (
            uint256 buyPrice,
            uint256 buyPriceWithFees,
            uint256 sellPrice,
            uint256 sellPriceWithFees,
            uint256 shareSupply,
            uint256 oleBalance,
            uint256 ethBalance,
            uint112 reserve0,
            uint112 reserve1
        )
    {
        buyPrice = spaceShare.getBuyPrice(spaceId, 1);
        buyPriceWithFees = spaceShare.getBuyPriceWithFees(spaceId, 1);
        shareSupply = spaceShare.sharesSupply(spaceId);
        if (shareSupply > 1) {
            sellPrice = spaceShare.getSellPrice(spaceId, 1);
            sellPriceWithFees = spaceShare.getSellPriceWithFees(spaceId, 1);
        }
        oleBalance = ole.balanceOf(msg.sender);
        ethBalance = msg.sender.balance;
        (reserve0, reserve1, ) = oleWethPair.getReserves();
    }
}

interface ISpaceShareBalance is ISpaceShare {
    function sharesSupply(uint256 spaceId) external view returns (uint256);
}
