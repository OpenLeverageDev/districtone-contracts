// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IErrors} from "../share/IErrors.sol";
import {Erc20Utils, IERC20} from "../common/Erc20Utils.sol";
import {Ownable} from "@openzeppelin-5/contracts/access/Ownable.sol";

contract MockSpaceShare is IErrors {
    using Erc20Utils for IERC20;
    // Immutable curve parameters for share pricing.
    uint256 public immutable K; // Slope of the pricing curve.
    uint256 public immutable B; // Y-intercept of the pricing curve.

    // Constants and variables for fee management.
    uint16 private constant FEE_DENOMINATOR = 10000; // Denominator for calculating fee percentages.
    IERC20 public immutable OLE; // The OLE token used for transactions.
    address public protocolFeeDestination; // Address where protocol fees are sent.
    uint16 public protocolFeePercent; // Protocol fee percentage (e.g., 500 for 5%).
    uint16 public holderFeePercent; // Holder fee percentage (e.g., 500 for 5%).

    // Mappings for managing shares and rewards.
    mapping(uint256 spaceId => uint256 supply) public sharesSupply; // Mapping of spaceId to shares supply.
    mapping(uint256 spaceId => mapping(address holder => uint256 balance)) public sharesBalance; // Mapping of spaceId and holder address to share balance.

    uint256 public spaceIdx; // Index to track the current space.

    constructor(IERC20 _ole, uint256 _k, uint256 _b) {
        OLE = _ole;
        K = _k;
        B = _b;
    }

    function createSpace() external {
        uint256 spaceId = ++spaceIdx;
        _buyShares(spaceId, 1, 0, msg.sender);
    }

    function buySharesTo(uint256 spaceId, uint256 shares, uint256 maxInAmount, uint256 timestamp, bytes memory signature, address to) external {
        _buyShares(spaceId, shares, maxInAmount, to);
    }

    function getBuyPrice(uint256 spaceId, uint256 amount) external view returns (uint256) {
        return _getPrice(sharesSupply[spaceId], amount, K, B);
    }

    function getSellPrice(uint256 spaceId, uint256 amount) external view returns (uint256) {
        return _getPrice(sharesSupply[spaceId] - amount, amount, K, B);
    }

    function getSellPriceWithFees(uint256 spaceId, uint256 amount) external view returns (uint256) {
        uint256 price = _getPrice(sharesSupply[spaceId] - amount, amount, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        return price - protocolFee - holderFee;
    }

    function _buyShares(uint256 spaceId, uint256 shares, uint256 maxInAmount, address to) internal {
        if (shares == 0) revert ZeroAmount();
        if (spaceId > spaceIdx) revert SpaceNotExists();
        uint256 supply = sharesSupply[spaceId];
        uint256 price = _getPrice(supply, shares, K, B);
        if (price > maxInAmount) revert InsufficientInAmount();
        if (price > 0 && price != OLE.safeTransferIn(msg.sender, price)) revert InsufficientInAmount();
        sharesBalance[spaceId][to] += shares;
        uint256 totalSupply = supply + shares;
        sharesSupply[spaceId] = totalSupply;
    }

    function _getPrice(uint256 supply, uint256 amount, uint256 k, uint256 b) internal pure returns (uint256) {
        uint256 sum1 = supply == 0 ? 0 : ((supply - 1) * ((k + b) + (supply - 1) * k + b)) / 2;
        uint256 sum2 = supply == 0 && amount == 1 ? 0 : ((supply - 1 + amount) * ((k + b) + (supply - 1 + amount) * k + b)) / 2;
        return sum2 - sum1;
    }

    function _getFees(uint256 price) internal view returns (uint256 protocolFee, uint256 holderFee) {
        protocolFee = (price * protocolFeePercent) / FEE_DENOMINATOR;
        holderFee = (price * holderFeePercent) / FEE_DENOMINATOR;
    }

    function _collectFees(uint256 protocolFee) internal {
        if (protocolFee > 0) {
            OLE.transferOut(protocolFeeDestination, protocolFee);
        }
    }
}
