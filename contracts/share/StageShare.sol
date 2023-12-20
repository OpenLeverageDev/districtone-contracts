// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IStageShare} from "./IStageShare.sol";
import {IErrors} from "./IErrors.sol";
import {Erc20Utils, IERC20} from "../common/Erc20Utils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../common/ReentrancyGuard.sol";
import {SignatureLib} from "../libraries/SignatureLib.sol";

/**
 * @title StageShare Contract
 * @dev Utilizes OpenZeppelin's Ownable for ownership management.
 * Handles the creation, buying, and selling of shares based on a simple linear pricing model (P = KS + B).
 * A portion of sale proceeds can be allocated as rewards to current share holders.
 * Implements IStageShare and IErrors interfaces.
 */
contract StageShare is Ownable, IErrors, ReentrancyGuard, IStageShare {
    using Erc20Utils for IERC20;
    using SignatureLib for SignatureLib.SignedData;

    /// @dev Struct for tracking holder rewards.
    struct HolderReward {
        uint256 reward; // The accumulated reward amount for the holder.
        uint256 rewardPerSharePaid;  // The amount of reward per share that has been paid out (scaled by 10**18).
    }

    // Immutable curve parameters for share pricing.
    uint256 public immutable K; // Slope of the pricing curve.
    uint256 public immutable B; // Y-intercept of the pricing curve.

    // Constants and variables for fee management.
    uint16 private constant FEE_DENOMINATOR = 10000; // Denominator for calculating fee percentages.
    IERC20 public immutable OLE; // The OLE token used for transactions.
    address public protocolFeeDestination; // Address where protocol fees are sent.
    uint16 public protocolFeePercent; // Protocol fee percentage (e.g., 500 for 5%).
    uint16 public holderFeePercent; // Holder fee percentage (e.g., 500 for 5%).

    // Signature-related variables for buy share operation.
    address public signIssuerAddress; // Address authorized to issue buy permissions.
    bytes32 private constant BUY_PERMISSION = 0x6275790000000000000000000000000000000000000000000000000000000000; // Permission signature for 'buy' operation.
    uint256 public signValidDuration; // Time duration in seconds for which a signature remains valid.

    // Mappings for managing shares and rewards.
    mapping(uint256 => uint256) public sharesSupply; // Mapping of stageId to shares supply.
    mapping(uint256 => mapping(address => uint256)) public sharesBalance; // Mapping of stageId and holder address to share balance.
    mapping(uint256 => uint256) public rewardPerShareStored; // Mapping of stageId to per share reward stored (scaled by 10**18).
    mapping(uint256 => mapping(address => HolderReward)) public holderSharesReward; // Mapping of stageId and holder address to holder rewards.

    uint256 public stageIdx; // Index to track the current stage.

    /**
     * @notice Constructor to create StageShare contract instance.
     * @param _ole Address of the OLE token contract.
     * @param _signIssuerAddress Address authorized to issue buy permissions.
     * @param _signValidDuration Time duration in seconds for which a signature remains valid.
     * @param _k Slope parameter (K) for the share pricing curve.
     * @param _b Y-intercept parameter (B) for the share pricing curve.
     */
    constructor(IERC20 _ole, address _signIssuerAddress, uint256 _signValidDuration, uint256 _k, uint256 _b) Ownable(_msgSender()) {
        OLE = _ole;
        signIssuerAddress = _signIssuerAddress;
        signValidDuration = _signValidDuration;
        K = _k;
        B = _b;
    }

    /**
     * @notice Creates a new stage and increments the stage index.
     */
    function createStage() external override {
        uint256 stageId = ++ stageIdx;
        emit StageCreated(stageId, _msgSender());
    }

    /**
     * @notice Allows users to buy shares for a specific stage.
     * @dev Requires valid signature for buy permission. Transfers payment token and updates balances and supplies.
     * @param stageId The ID of the stage to buy shares in.
     * @param shares The number of shares to buy.
     * @param maxInAmount The maximum payment token amount the buyer is willing to spend.
     * @param timestamp The timestamp when the signature was created.
     * @param signature The signature proving the permission to buy.
     */
    function buyShares(
        uint256 stageId,
        uint256 shares,
        uint256 maxInAmount,
        uint256 timestamp,
        bytes memory signature
    ) external override {
        if (shares == 0) revert ZeroAmount();
        if (stageId > stageIdx) revert StageNotExists();
        address trader = _msgSender();
        SignatureLib.SignedData memory signedData = SignatureLib.SignedData(trader, BUY_PERMISSION, timestamp);
        if(!signedData.verify(signature, signIssuerAddress, signValidDuration)) revert InvalidSignature();
        uint256 supply = sharesSupply[stageId];
        uint256 price = _getPrice(supply, shares, K, B);
        if (price > maxInAmount) revert InsufficientInAmount();
        if (price != OLE.safeTransferIn(trader, price)) revert InsufficientInAmount();
        sharesBalance[stageId][trader] += shares;
        uint256 totalSupply = supply + shares;
        sharesSupply[stageId] = totalSupply;
        emit Trade(stageId, trader, true, shares, price, 0, 0, totalSupply);
    }

    /**
     * @notice Allows share holders to sell their shares.
     * @dev Calculates sell price and transfers payment token to seller.
     * @param stageId The ID of the stage to sell shares from.
     * @param shares The number of shares to sell.
     * @param minOutAmount The minimum amount of tokens the seller is willing to receive.
     */
    function sellShares(
        uint256 stageId,
        uint256 shares,
        uint256 minOutAmount
    ) external override {
        uint256 outAmount = _sellShares(stageId, shares, minOutAmount);
        OLE.transferOut(_msgSender(), outAmount);
    }

    /**
     * @notice Withdraws accumulated rewards for the caller across multiple stages.
     * @dev Iterates over an array of stage IDs and accumulates the rewards for each stage. Transfers the total accumulated rewards to the caller.
     * @param stageIds An array of stage IDs for which the rewards are to be withdrawn.
     */
    function withdrawRewards(uint256[] memory stageIds) external override {
        uint256 reward;
        uint len = stageIds.length;
        for (uint i = 0; i < len; i++) {
            reward = _withdrawReward(stageIds[i]);
        }
        OLE.transferOut(_msgSender(), reward);
    }

    /**
     * @notice Exits a stage by selling all shares and withdrawing rewards.
     * @dev A convenience function for users to liquidate shares and collect rewards in a single transaction.
     * @param stageId The ID of the stage to exit.
     * @param minOutAmount The minimum amount of tokens the seller is willing to receive for their shares.
     */
    function exitStage(uint256 stageId, uint256 minOutAmount) external override {
        uint256 outAmount = _sellShares(stageId, sharesBalance[stageId][_msgSender()], minOutAmount);
        uint reward = _withdrawReward(stageId);
        OLE.transferOut(_msgSender(), outAmount + reward);
    }

    function getRewards(uint256[] memory stageIds, address holder) external override view returns (uint256 reward) {
        uint len = stageIds.length;
        for (uint i = 0; i < len; i++) {
            reward += _getHolderReward(stageIds[i], holder);
        }
    }

    function setProtocolFeeDestination(address _protocolFeeDestination) external override onlyOwner {
        if (_protocolFeeDestination == address(0)) revert ZeroAddress();
        protocolFeeDestination = _protocolFeeDestination;
    }

    function setFees(uint16 _protocolFeePercent, uint16 _holderFeePercent) external override onlyOwner {
        // the total fee percent must le 50%
        if (_protocolFeePercent + _holderFeePercent > (FEE_DENOMINATOR / 2)) revert InvalidParam();
        protocolFeePercent = _protocolFeePercent;
        holderFeePercent = _holderFeePercent;
    }

    function setSignConf(address _signIssuerAddress, uint256 _signValidDuration) external override onlyOwner {
        if (_signIssuerAddress == address(0)) revert ZeroAddress();
        if (_signValidDuration == 0) revert InvalidParam();
        signIssuerAddress = _signIssuerAddress;
        signValidDuration = _signValidDuration;
    }

    function getBuyPrice(uint256 stageId, uint256 amount) external override view returns (uint256){
        return _getPrice(sharesSupply[stageId], amount, K, B);
    }

    function getSellPrice(uint256 stageId, uint256 amount) external override view returns (uint256){
        return _getPrice(sharesSupply[stageId] - amount, amount, K, B);
    }

    function getSellPriceWithFees(uint256 stageId, uint256 amount) external override view returns (uint256){
        uint256 price = _getPrice(sharesSupply[stageId] - amount, amount, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        return price - protocolFee - holderFee;
    }

    function _sellShares(uint256 stageId, uint256 shares, uint256 minOutAmount) internal returns (uint256 outAmount) {
        if (shares == 0) revert ZeroAmount();
        if (stageId > stageIdx) revert StageNotExists();
        uint256 supply = sharesSupply[stageId];
        address trader = _msgSender();
        if (shares > sharesBalance[stageId][trader]) revert InsufficientShares();
        uint256 price = _getPrice(supply - shares, shares, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        outAmount = price - protocolFee - holderFee;
        if (outAmount < minOutAmount) revert InsufficientOutAmount();
        uint256 totalSupply;
        unchecked{
            sharesBalance[stageId][trader] -= shares;
            totalSupply = supply - shares;
        }
        sharesSupply[stageId] = totalSupply;
        // If the totalSupply is zero, convert the holder fee to protocol fee
        if (totalSupply == 0) {
            protocolFee += holderFee;
            holderFee = 0;
        }
        _updateSharesReward(stageId, holderFee, trader);
        emit Trade(stageId, trader, false, shares, price, protocolFee, holderFee, totalSupply);
        _collectFees(protocolFee);
    }

    function _withdrawReward(uint256 stageId) internal returns (uint256 reward) {
        address holder = _msgSender();
        _updateHolderReward(stageId, holder);
        reward = holderSharesReward[stageId][holder].reward;
        if (reward == 0) revert NoRewards();
        holderSharesReward[stageId][holder].reward = 0;
        emit WithdrawReward(holder, stageId, reward);
    }

    function _getPrice(uint256 supply, uint256 amount, uint256 k, uint256 b) internal pure returns (uint256){
        uint256 sum1 =  supply  * ((k + b) + supply  * k + b) / 2;
        uint256 sum2 = (supply + amount) * ((k + b) + (supply + amount) * k + b) / 2;
        return sum2 - sum1;
    }

    function _getFees(uint256 price) internal view returns (uint256 protocolFee, uint256 holderFee) {
        protocolFee = price * protocolFeePercent / FEE_DENOMINATOR;
        holderFee = price * holderFeePercent / FEE_DENOMINATOR;
    }

    function _collectFees(uint256 protocolFee) internal {
        if (protocolFee > 0) {
            OLE.transferOut(protocolFeeDestination, protocolFee);
        }
    }

    function _updateSharesReward(uint256 stageId, uint256 newReward, address holder) internal {
        if (newReward == 0) {
            return;
        }
        rewardPerShareStored[stageId] += (newReward * (1 ether)) / sharesSupply[stageId];
        _updateHolderReward(stageId, holder);
    }

    function _updateHolderReward(uint256 stageId, address holder) internal {
        holderSharesReward[stageId][holder].reward = _getHolderReward(stageId, holder);
        holderSharesReward[stageId][holder].rewardPerSharePaid = rewardPerShareStored[stageId];
    }

    function _getHolderReward(uint256 stageId, address holder) internal view returns (uint256) {
        uint256 holderBalance = sharesBalance[stageId][holder];
        uint256 perShareStored = rewardPerShareStored[stageId];
        uint256 holderPerSharePaid = holderSharesReward[stageId][holder].rewardPerSharePaid;
        uint256 holderReward = holderSharesReward[stageId][holder].reward;
        return (holderBalance * (perShareStored - holderPerSharePaid)) / (1 ether) + holderReward;
    }

}
