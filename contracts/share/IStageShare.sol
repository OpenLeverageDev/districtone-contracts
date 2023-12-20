// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

interface IStageShare {

    event StageCreated(uint256 stageId, address creator);

    event Trade(uint256 stageId, address trader, bool isBuy, uint256 shares, uint256 price, uint256 protocolFee, uint256 holderFee, uint256 supply);

    event WithdrawReward(address holder, uint256 stageId, uint256 reward);

    function createStage() external;

    function buyShares(uint256 stageId, uint256 shares, uint256 maxInAmount,  uint256 timestamp, bytes memory signature) external;

    function sellShares(uint256 stageId, uint256 shares, uint256 minOutAmount) external;

    function withdrawRewards(uint256[] memory stageIds) external;

    function exitStage(uint256 stageId, uint256 minOutAmount) external;

    // owner function
    function setProtocolFeeDestination(address _protocolFeeDestination) external;

    function setFees(uint16 _protocolFeePercent, uint16 _holderFeePercent) external;

    function setSignConf(address _issuerAddress, uint256 _signValidDuration) external;

    // view function
    function getBuyPrice(uint256 stageId, uint256 amount) external view returns (uint256);

    function getSellPrice(uint256 stageId, uint256 amount) external view returns (uint256);

    function getSellPriceWithFees(uint256 stageId, uint256 amount) external view returns (uint256);

    function getRewards(uint256[] memory stageIds, address holder) external view returns (uint256 reward);
}
