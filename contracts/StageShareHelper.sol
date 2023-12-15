// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import "./StageShares.sol";

contract StageShareHelper {
    StageShares public stageShares;

    constructor(address _stageShares) {
        stageShares = StageShares(_stageShares);
    }

    struct StageInfo {
        uint256 shares;
        uint256 earnings;
    }

    struct SharePrice {
        bytes32 stage;
        uint256 price;
    }

    function getSharesAndEarnings(address wallet, bytes32[] memory subjects) external view returns (StageInfo[] memory) {
        StageInfo[] memory subjectInfos = new StageInfo[](subjects.length);

        for (uint i = 0; i < subjects.length; i++) {
            bytes32 subject = subjects[i];
            uint256 shares = stageShares.sharesBalance(subject, wallet);
            uint256 earnings = stageShares.getReward(subject, wallet);
            subjectInfos[i] = StageInfo(shares, earnings);
        }

        return subjectInfos;
    }

    function getLatestPrices(bytes32[] memory stages) external view returns (SharePrice[] memory) {
        SharePrice[] memory subjectPrices = new SharePrice[](stages.length);

        for (uint i = 0; i < stages.length; i++) {
            bytes32 subject = stages[i];

            uint24 declineRatio = stageShares.sharesDeclineRatio(subject);
            uint256 supply = stageShares.sharesSupply(subject);

            // Assuming amount is 1 to get the current price
            uint256 price = stageShares.getPrice(supply, 1, declineRatio);
            subjectPrices[i] = SharePrice(subject, price);
        }

        return subjectPrices;
    }
}
