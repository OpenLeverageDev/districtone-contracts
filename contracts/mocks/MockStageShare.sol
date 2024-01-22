// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IErrors} from "../share/IErrors.sol";
import {Erc20Utils, IERC20} from "../common/Erc20Utils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";


contract MockStageShare is IErrors {
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
    mapping(uint256 stageId => uint256 supply) public sharesSupply; // Mapping of stageId to shares supply.
    mapping(uint256 stageId => mapping(address holder => uint256 balance)) public sharesBalance; // Mapping of stageId and holder address to share balance.


    uint256 public stageIdx; // Index to track the current stage.

    constructor(IERC20 _ole, uint256 _k, uint256 _b){
        OLE = _ole;
        K = _k;
        B = _b;
    }

    function createStage() external {
        uint256 stageId = ++stageIdx;
        _buyShares(stageId, 1, 0, msg.sender);
    }

    function buySharesTo(uint256 stageId, uint256 shares, uint256 maxInAmount, uint256 timestamp, bytes memory signature, address to) external {
        _buyShares(stageId, shares, maxInAmount, to);
    }

    function getBuyPrice(uint256 stageId, uint256 amount) external view returns (uint256) {
        return _getPrice(sharesSupply[stageId], amount, K, B);
    }

    function getSellPrice(uint256 stageId, uint256 amount) external view returns (uint256) {
        return _getPrice(sharesSupply[stageId] - amount, amount, K, B);
    }

    function getSellPriceWithFees(uint256 stageId, uint256 amount) external view returns (uint256) {
        uint256 price = _getPrice(sharesSupply[stageId] - amount, amount, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        return price - protocolFee - holderFee;
    }

    function _buyShares(uint256 stageId, uint256 shares, uint256 maxInAmount, address to) internal {
        if (shares == 0) revert ZeroAmount();
        if (stageId > stageIdx) revert StageNotExists();
        uint256 supply = sharesSupply[stageId];
        uint256 price = _getPrice(supply, shares, K, B);
        if (price > maxInAmount) revert InsufficientInAmount();
        if (price > 0 && price != OLE.safeTransferIn(msg.sender, price)) revert InsufficientInAmount();
        sharesBalance[stageId][to] += shares;
        uint256 totalSupply = supply + shares;
        sharesSupply[stageId] = totalSupply;
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
