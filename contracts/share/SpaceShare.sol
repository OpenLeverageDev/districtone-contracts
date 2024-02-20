// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {ISpaceShare} from "./ISpaceShare.sol";
import {IErrors} from "./IErrors.sol";
import {Erc20Utils, IERC20} from "../common/Erc20Utils.sol";
import {ReentrancyGuard} from "../common/ReentrancyGuard.sol";
import {SignatureLib} from "../libraries/SignatureLib.sol";
import {BlastAdapter} from "../BlastAdapter.sol";

/**
 * @title SpaceShare.sol Contract
 * @dev Utilizes OpenZeppelin's Ownable for ownership management.
 * Handles the creation, buying, and selling of shares based on a simple linear pricing model (P = KS + B).
 * A portion of sale proceeds can be allocated as rewards to current share holders.
 * Implements ISpaceShare.sol and IErrors interfaces.
 */
contract SpaceShare is BlastAdapter, IErrors, ReentrancyGuard, ISpaceShare {
    using Erc20Utils for IERC20;
    using SignatureLib for SignatureLib.SignedData;

    /// @dev Struct for tracking holder rewards.
    struct HolderReward {
        uint256 reward; // The accumulated reward amount for the holder.
        uint256 rewardPerSharePaid; // The amount of reward per share that has been paid out (scaled by 10**18).
    }

    // Immutable curve parameters for share pricing.
    uint256 public immutable K; // Slope of the pricing curve.
    uint256 public immutable B; // Y-intercept of the pricing curve.

    IERC20 public immutable OLE; // The OLE token used for transactions.
    address public protocolFeeDestination; // Address where protocol fees are sent.
    uint16 public protocolFeePercent; // Protocol fee percentage (e.g., 500 for 5%).
    uint16 public holderFeePercent; // Holder fee percentage (e.g., 500 for 5%).

    // Signature-related variables for buy share operation.
    address public signIssuerAddress; // Address authorized to issue buy permissions.
    uint256 public signValidDuration; // Time duration in seconds for which a signature remains valid.

    // Mappings for managing shares and rewards.
    mapping(uint256 spaceId => uint256 supply) public sharesSupply; // Mapping of spaceId to shares supply.
    mapping(uint256 spaceId => mapping(address holder => uint256 balance)) public sharesBalance; // Mapping of spaceId and holder address to share balance.
    mapping(uint256 spaceId => uint256 reward) public rewardPerShareStored; // Mapping of spaceId to per share reward stored (scaled by 10**18).
    mapping(uint256 spaceId => mapping(address holder => HolderReward)) public holderSharesReward; // Mapping of spaceId and holder address to holder rewards.

    uint256 public spaceIdx; // Index to track the current space.

    /**
     * @notice Constructor to create SpaceShare.sol contract instance.
     * @param _ole Address of the OLE token contract.
     * @param _signIssuerAddress Address authorized to issue buy permissions.
     * @param _signValidDuration Time duration in seconds for which a signature remains valid.
     * @param _k Slope parameter (K) for the share pricing curve.
     * @param _b Y-intercept parameter (B) for the share pricing curve.
     */
    constructor(IERC20 _ole, address _signIssuerAddress, uint256 _signValidDuration, uint256 _k, uint256 _b) {
        OLE = _ole;
        if (_signIssuerAddress == address(0)) revert ZeroAddress();
        signIssuerAddress = _signIssuerAddress;
        signValidDuration = _signValidDuration;
        K = _k;
        B = _b;
    }

    /**
     * @notice Creates a new space and increments the space index.
     */
    function createSpace() external override {
        uint256 spaceId = ++spaceIdx;
        emit SpaceCreated(spaceId, _msgSender());
        _buyShares(spaceId, 1, 0, _msgSender());
    }

    /**
     * @notice Allows users to buy shares for a specific space.
     * @dev Requires valid signature for buy permission. Transfers payment token and updates balances and supplies.
     * @param spaceId The ID of the space to buy shares in.
     * @param shares The number of shares to buy.
     * @param maxInAmount The maximum payment token amount the buyer is willing to spend.
     * @param timestamp The timestamp when the signature was created.
     * @param signature The signature proving the permission to buy.
     */
    function buyShares(uint256 spaceId, uint256 shares, uint256 maxInAmount, uint256 timestamp, bytes memory signature) external override {
        SignatureLib.SignedData memory signedData = SignatureLib.SignedData(_msgSender(), timestamp, spaceId);
        if (!signedData.verify(signature, signIssuerAddress, signValidDuration)) revert InvalidSignature();
        _buyShares(spaceId, shares, maxInAmount, _msgSender());
    }

    function buySharesTo(uint256 spaceId, uint256 shares, uint256 maxInAmount, uint256 timestamp, bytes memory signature, address to) external override {
        SignatureLib.SignedData memory signedData = SignatureLib.SignedData(to, timestamp, spaceId);
        if (!signedData.verify(signature, signIssuerAddress, signValidDuration)) revert InvalidSignature();
        _buyShares(spaceId, shares, maxInAmount, to);
    }

    /**
     * @notice Allows share holders to sell their shares.
     * @dev Calculates sell price and transfers payment token to seller.
     * @param spaceId The ID of the space to sell shares from.
     * @param shares The number of shares to sell.
     * @param minOutAmount The minimum amount of tokens the seller is willing to receive.
     */
    function sellShares(uint256 spaceId, uint256 shares, uint256 minOutAmount) external override {
        uint256 outAmount = _sellShares(spaceId, shares, minOutAmount);
        OLE.transferOut(_msgSender(), outAmount);
    }

    /**
     * @notice Withdraws accumulated rewards for the caller across multiple spaces.
     * @dev Iterates over an array of space IDs and accumulates the rewards for each space. Transfers the total accumulated rewards to the caller.
     * @param spaceIds An array of space IDs for which the rewards are to be withdrawn.
     */
    function withdrawRewards(uint256[] memory spaceIds) external override {
        uint256 reward;
        uint len = spaceIds.length;
        for (uint i = 0; i < len; i++) {
            reward += _withdrawReward(spaceIds[i]);
        }
        OLE.transferOut(_msgSender(), reward);
    }

    /**
     * @notice Exits a space by selling all shares and withdrawing rewards.
     * @dev A convenience function for users to liquidate shares and collect rewards in a single transaction.
     * @param spaceId The ID of the space to exit.
     * @param minOutAmount The minimum amount of tokens the seller is willing to receive for their shares.
     */
    function exitSpace(uint256 spaceId, uint256 minOutAmount) external override {
        uint256 outAmount = _sellShares(spaceId, sharesBalance[spaceId][_msgSender()], minOutAmount);
        uint reward = _withdrawReward(spaceId);
        OLE.transferOut(_msgSender(), outAmount + reward);
    }

    function getRewards(uint256[] memory spaceIds, address holder) external view override returns (uint256 reward) {
        uint len = spaceIds.length;
        for (uint i = 0; i < len; i++) {
            reward += _getHolderReward(spaceIds[i], holder);
        }
    }

    function setProtocolFeeDestination(address _protocolFeeDestination) external override onlyOwner {
        if (_protocolFeeDestination == address(0)) revert ZeroAddress();
        protocolFeeDestination = _protocolFeeDestination;
        emit ProtocolFeeDestinationChanged(_protocolFeeDestination);
    }

    function setFees(uint16 _protocolFeePercent, uint16 _holderFeePercent) external override onlyOwner {
        // the total fee percent must le 50%
        if (_protocolFeePercent + _holderFeePercent > 50) revert InvalidParam();
        protocolFeePercent = _protocolFeePercent;
        holderFeePercent = _holderFeePercent;
        emit FeesChanged(_protocolFeePercent, _holderFeePercent);
    }

    function setSignConf(address _signIssuerAddress, uint256 _signValidDuration) external override onlyOwner {
        if (_signIssuerAddress == address(0)) revert ZeroAddress();
        if (_signValidDuration == 0) revert InvalidParam();
        signIssuerAddress = _signIssuerAddress;
        signValidDuration = _signValidDuration;
        emit SignConfChanged(_signIssuerAddress, _signValidDuration);
    }

    function getBuyPrice(uint256 spaceId, uint256 amount) external view override returns (uint256) {
        return _getPrice(sharesSupply[spaceId], amount, K, B);
    }

    function getSellPrice(uint256 spaceId, uint256 amount) external view override returns (uint256) {
        return _getPrice(sharesSupply[spaceId] - amount, amount, K, B);
    }

    function getBuyPriceWithFees(uint256 spaceId, uint256 amount) external view override returns (uint256) {
        uint256 price = _getPrice(sharesSupply[spaceId], amount, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        return price + protocolFee + holderFee;
    }

    function getSellPriceWithFees(uint256 spaceId, uint256 amount) external view override returns (uint256) {
        uint256 price = _getPrice(sharesSupply[spaceId] - amount, amount, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        return price - protocolFee - holderFee;
    }

    function _buyShares(uint256 spaceId, uint256 shares, uint256 maxInAmount, address to) internal {
        if (shares == 0) revert ZeroAmount();
        if (spaceId > spaceIdx) revert SpaceNotExists();
        uint256 supply = sharesSupply[spaceId];
        uint256 price = _getPrice(supply, shares, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        uint256 priceWithFees = price + protocolFee + holderFee;
        if (priceWithFees > maxInAmount) revert InsufficientInAmount();
        if (priceWithFees > 0 && priceWithFees != OLE.safeTransferIn(_msgSender(), priceWithFees)) revert InsufficientInAmount();
        _updateSharesReward(spaceId, holderFee, to);
        sharesBalance[spaceId][to] += shares;
        uint256 totalSupply = supply + shares;
        sharesSupply[spaceId] = totalSupply;
        emit Trade(spaceId, to, true, shares, price, protocolFee, holderFee, totalSupply);
        _collectFees(protocolFee);
    }

    function _sellShares(uint256 spaceId, uint256 shares, uint256 minOutAmount) internal returns (uint256 outAmount) {
        if (shares == 0) revert ZeroAmount();
        if (spaceId > spaceIdx) revert SpaceNotExists();
        uint256 supply = sharesSupply[spaceId];
        address trader = _msgSender();
        if (shares >= supply) revert CannotSellLastShare();
        if (shares > sharesBalance[spaceId][trader]) revert InsufficientShares();
        uint256 price = _getPrice(supply - shares, shares, K, B);
        (uint256 protocolFee, uint256 holderFee) = _getFees(price);
        outAmount = price - protocolFee - holderFee;
        if (outAmount < minOutAmount) revert InsufficientOutAmount();
        _updateHolderReward(spaceId, trader);
        uint256 totalSupply;
        unchecked {
            sharesBalance[spaceId][trader] -= shares;
            totalSupply = supply - shares;
        }
        sharesSupply[spaceId] = totalSupply;
        _updateSharesReward(spaceId, holderFee, trader);
        emit Trade(spaceId, trader, false, shares, price, protocolFee, holderFee, totalSupply);
        _collectFees(protocolFee);
    }

    function _withdrawReward(uint256 spaceId) internal returns (uint256 reward) {
        address holder = _msgSender();
        _updateHolderReward(spaceId, holder);
        reward = holderSharesReward[spaceId][holder].reward;
        if (reward == 0) revert NoRewards();
        holderSharesReward[spaceId][holder].reward = 0;
        emit WithdrawReward(holder, spaceId, reward);
    }

    function _getPrice(uint256 supply, uint256 amount, uint256 k, uint256 b) internal pure returns (uint256) {
        uint256 sum1 = supply == 0 ? 0 : (((k + b) + (supply - 1) * k + b) * (supply - 1)) / 2;
        uint256 sum2 = supply == 0 && amount == 1 ? 0 : (((k + b) + (supply + amount - 1) * k + b) * (supply + amount - 1)) / 2;
        return sum2 - sum1;
    }

    function _getFees(uint256 price) internal view returns (uint256 protocolFee, uint256 holderFee) {
        protocolFee = (price * protocolFeePercent) / 100;
        holderFee = (price * holderFeePercent) / 100;
    }

    function _collectFees(uint256 protocolFee) internal {
        if (protocolFee > 0) {
            OLE.transferOut(protocolFeeDestination, protocolFee);
        }
    }

    function _updateSharesReward(uint256 spaceId, uint256 newReward, address holder) internal {
        if (newReward > 0 && sharesSupply[spaceId] > 0) {
            rewardPerShareStored[spaceId] += (newReward * (1 ether)) / sharesSupply[spaceId];
        }
        _updateHolderReward(spaceId, holder);
    }

    function _updateHolderReward(uint256 spaceId, address holder) internal {
        holderSharesReward[spaceId][holder].reward = _getHolderReward(spaceId, holder);
        holderSharesReward[spaceId][holder].rewardPerSharePaid = rewardPerShareStored[spaceId];
    }

    function _getHolderReward(uint256 spaceId, address holder) internal view returns (uint256) {
        uint256 holderBalance = sharesBalance[spaceId][holder];
        uint256 perShareStored = rewardPerShareStored[spaceId];
        uint256 holderPerSharePaid = holderSharesReward[spaceId][holder].rewardPerSharePaid;
        uint256 holderReward = holderSharesReward[spaceId][holder].reward;
        return (holderBalance * (perShareStored - holderPerSharePaid)) / (1 ether) + holderReward;
    }
}
