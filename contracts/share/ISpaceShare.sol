// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

interface ISpaceShare {
    event SpaceCreated(uint256 spaceId, address creator);

    event Trade(uint256 spaceId, address trader, bool isBuy, uint256 shares, uint256 price, uint256 protocolFee, uint256 holderFee, uint256 supply);

    event WithdrawReward(address holder, uint256 spaceId, uint256 reward);

    event ProtocolFeeDestinationChanged(address newProtocolFeeDestination);

    event FeesChanged(uint256 newProtocolFeePercent, uint256 newHolderFeePercent);

    event SignConfChanged(address newIssuerAddress, uint256 newSignValidDuration);

    function createSpace() external;

    function buyShares(uint256 spaceId, uint256 shares, uint256 maxInAmount, uint256 timestamp, bytes memory signature) external;

    function buySharesTo(uint256 spaceId, uint256 shares, uint256 maxInAmount, uint256 timestamp, bytes memory signature, address to) external;

    function sellShares(uint256 spaceId, uint256 shares, uint256 minOutAmount) external;

    function withdrawRewards(uint256[] memory spaceIds) external;

    function exitSpace(uint256 spaceId, uint256 minOutAmount) external;

    // owner function
    function setProtocolFeeDestination(address _protocolFeeDestination) external;

    function setFees(uint16 _protocolFeePercent, uint16 _holderFeePercent) external;

    function setSignConf(address _issuerAddress, uint256 _signValidDuration) external;

    // view function
    function getBuyPrice(uint256 spaceId, uint256 amount) external view returns (uint256);

    function getSellPrice(uint256 spaceId, uint256 amount) external view returns (uint256);

    function getBuyPriceWithFees(uint256 spaceId, uint256 amount) external view returns (uint256);

    function getSellPriceWithFees(uint256 spaceId, uint256 amount) external view returns (uint256);

    function getRewards(uint256[] memory spaceIds, address holder) external view returns (uint256 reward);
}
