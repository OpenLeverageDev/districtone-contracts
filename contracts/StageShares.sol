// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StageShares is Ownable {
    using SafeERC20 for IERC20;

    error ShareCreated();
    error InsufficientEth();
    error UnableSendDevFund();
    error ShareNotExists();
    error Address0();
    error InAmountNotEnough();
    error OutAmountNotEnough();
    error CannotSellLastShare();
    error InsufficientShares();
    error NoRewards();
    error InvalidParams();
    error InvalidDeclineRatio();

    event Create(address creator, bytes32 subject, uint24 declineRatio, uint256 ethFee);

    event Trade(
        address trader,
        bytes32 subject,
        bool isBuy,
        uint256 shares,
        uint256 price,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 holderFee,
        uint256 supply
    );

    event WithdrawReward(address holder, bytes32 subject, uint256 reward);

    struct HolderReward {
        uint256 reward;
        uint256 rewardPerSharePaid;
    }

    IERC20 public immutable OLE;
    address public protocolFeeDestination;
    address public devFundDestination;

    uint256 public protocolFeePercent;
    uint256 public creatorFeePercent;
    uint256 public holderFeePercent;


    // subject => (holder => balance)
    mapping(bytes32 => mapping(address => uint256)) public sharesBalance;

    // subject => supply
    mapping(bytes32 => uint256) public sharesSupply;

    // subject => decline ratio
    mapping(bytes32 => uint24) public sharesDeclineRatio;

    // subject => creator
    mapping(bytes32 => address) public sharesCreator;

    //subject => holder's reward per share stored
    mapping(bytes32 => uint256) public rewardPerShareStored;

    //subject => (holder=> reward) holder's reward
    mapping(bytes32 => mapping(address => HolderReward)) public holderSharesReward;

    constructor(IERC20 _ole) Ownable(msg.sender) {
        OLE = _ole;
    }

    function createStage(bytes32 subject, uint24 declineRatio) external payable {
        if (sharesCreator[subject] != address(0)) revert ShareCreated();
        sharesCreator[subject] = msg.sender;
        if (declineRatio * (1 ether / declineRatio) != 1 ether) revert InvalidDeclineRatio();
        // Make sure declineRatio is fully divided in calculation later
        sharesDeclineRatio[subject] = declineRatio;
        emit Create(msg.sender, subject, declineRatio, msg.value);
        _buyShares(msg.sender, subject, 1, 0);
        (bool success, ) = devFundDestination.call{value: msg.value}("");
        if (!success) revert UnableSendDevFund();
    }

    function buyShares(address recipient, bytes32 subject, uint256 shares, uint256 maxInAmount) external {
        _buyShares(recipient, subject, shares, maxInAmount);
    }

    // maxInAmount to control slippage and front run
    function _buyShares(address recipient, bytes32 subject, uint256 shares, uint256 maxInAmount) internal {
        uint256 supply = sharesSupply[subject];
        if (recipient == address(0)) revert Address0();
        if (supply == 0 && sharesCreator[subject] != recipient) revert ShareNotExists();
        uint256 price = getPrice(supply, shares, sharesDeclineRatio[subject]);
        (uint256 protocolFee, uint256 creatorFee, uint256 holderFee) = _getFees(price);
        uint256 totalInAmount = price + protocolFee + creatorFee + holderFee;
        if (totalInAmount > maxInAmount) revert InAmountNotEnough();
        //update shares reward
        _updateSharesReward(subject, holderFee, recipient);
        sharesBalance[subject][recipient] += shares;
        uint256 totalSupply = supply + shares;
        sharesSupply[subject] = totalSupply;
        emit Trade(recipient, subject, true, shares, price, protocolFee, creatorFee, holderFee, totalSupply);
        if (price > 0) {
            OLE.safeTransferFrom(msg.sender, address(this), totalInAmount);
            _collectFees(subject, protocolFee, creatorFee);
        }
    }

    function sellShares(address recipient, bytes32 subject, uint256 shares, uint256 minOutAmount) external {
        uint256 supply = sharesSupply[subject];
        if (shares >= supply) revert CannotSellLastShare();
        if (shares > sharesBalance[subject][msg.sender]) revert InsufficientShares();
        uint256 price = getPrice(supply - shares, shares, sharesDeclineRatio[subject]);
        (uint256 protocolFee, uint256 creatorFee, uint256 holderFee) = _getFees(price);
        uint256 totalOutAmount = price - protocolFee - creatorFee - holderFee;
        if (totalOutAmount < minOutAmount) revert OutAmountNotEnough();
        //update shares reward
        _updateSharesReward(subject, holderFee, msg.sender);
        sharesBalance[subject][msg.sender] -= shares;
        uint256 totalSupply = supply - shares;
        sharesSupply[subject] = totalSupply;
        emit Trade(msg.sender, subject, false, shares, price, protocolFee, creatorFee, holderFee, totalSupply);
        if (price > 0) {
            OLE.safeTransfer(recipient, totalOutAmount);
            _collectFees(subject, protocolFee, creatorFee);
        }
    }

    function getPrice(uint256 supply, uint256 amount, uint24 declineRatio) public pure returns (uint256) {
        uint256 sum1 = supply == 0 ? 0 : ((supply - 1) * (supply) * (2 * (supply - 1) + 1)) / 6;
        uint256 sum2 = supply == 0 && amount == 1 ? 0 : ((supply - 1 + amount) * (supply + amount) * (2 * (supply - 1 + amount) + 1)) / 6;
        uint256 summation = sum2 - sum1;
        return (summation * 1 ether) / declineRatio;
    }

    function getBuyPrice(bytes32 subject, uint256 amount) public view returns (uint256) {
        return getPrice(sharesSupply[subject], amount, sharesDeclineRatio[subject]);
    }

    function getSellPrice(bytes32 subject, uint256 amount) public view returns (uint256) {
        return getPrice(sharesSupply[subject] - amount, amount, sharesDeclineRatio[subject]);
    }

    function getBuyPriceWithFees(bytes32 subject, uint256 amount) external view returns (uint256) {
        uint256 price = getBuyPrice(subject, amount);
        (uint256 protocolFee, uint256 creatorFee, uint256 holderFee) = _getFees(price);
        return price + protocolFee + creatorFee + holderFee;
    }

    function getSellPriceWithFees(bytes32 subject, uint256 amount) external view returns (uint256) {
        uint256 price = getSellPrice(subject, amount);
        (uint256 protocolFee, uint256 creatorFee, uint256 holderFee) = _getFees(price);
        return price - protocolFee - creatorFee - holderFee;
    }

    function _getFees(uint256 price) internal view returns (uint256 protocolFee, uint256 creatorFee, uint256 holderFee) {
        protocolFee = (price * protocolFeePercent) / 1 ether;
        creatorFee = (price * creatorFeePercent) / 1 ether;
        holderFee = (price * holderFeePercent) / 1 ether;
    }

    function _collectFees(bytes32 subject, uint256 protocolFee, uint256 creatorFee) internal {
        if (protocolFee > 0) {
            OLE.safeTransfer(protocolFeeDestination, protocolFee);
        }
        if (creatorFee > 0) {
            OLE.safeTransfer(sharesCreator[subject], creatorFee);
        }
    }

    function withdrawReward(bytes32 subject) external {
        _updateHolderReward(subject, msg.sender);
        uint256 reward = holderSharesReward[subject][msg.sender].reward;
        if (reward == 0) revert NoRewards();
        holderSharesReward[subject][msg.sender].reward = 0;
        emit WithdrawReward(msg.sender, subject, reward);
        OLE.safeTransfer(msg.sender, reward);
    }

    function getReward(bytes32 subject, address holder) external view returns (uint256) {
        return _getHolderReward(subject, holder);
    }

    function _updateSharesReward(bytes32 subject, uint256 newReward, address holder) internal {
        if (newReward == 0 || sharesSupply[subject] == 0) {
            return;
        }
        rewardPerShareStored[subject] += (newReward * (1 ether)) / sharesSupply[subject];
        _updateHolderReward(subject, holder);
    }

    function _updateHolderReward(bytes32 subject, address holder) internal {
        holderSharesReward[subject][holder].reward = _getHolderReward(subject, holder);
        holderSharesReward[subject][holder].rewardPerSharePaid = rewardPerShareStored[subject];
    }

    function _getHolderReward(bytes32 subject, address holder) internal view returns (uint256) {
        uint256 holderBalance = sharesBalance[subject][holder];
        uint256 perShareStored = rewardPerShareStored[subject];
        uint256 holderPerSharePaid = holderSharesReward[subject][holder].rewardPerSharePaid;
        uint256 holderReward = holderSharesReward[subject][holder].reward;
        return (holderBalance * (perShareStored - holderPerSharePaid)) / (1 ether) + holderReward;
    }

    function setProtocolFeeDestination(address _protocolFeeDestination) external onlyOwner {
        protocolFeeDestination = _protocolFeeDestination;
    }

    function setDevFundDestination(address _devFundDestination) external onlyOwner {
        devFundDestination = _devFundDestination;
    }

    function setProtocolFeePercent(uint256 _protocolFeePercent) external onlyOwner {
        if (_protocolFeePercent >= 1 ether) revert InvalidParams();
        protocolFeePercent = _protocolFeePercent;
    }

    function setCreatorFeePercent(uint256 _creatorFeePercent) external onlyOwner {
        if (_creatorFeePercent >= 1 ether) revert InvalidParams();
        creatorFeePercent = _creatorFeePercent;
    }

    function setHolderFeePercent(uint256 _holderFeePercent) external onlyOwner {
        if (_holderFeePercent >= 1 ether) revert InvalidParams();
        holderFeePercent = _holderFeePercent;
    }
}
