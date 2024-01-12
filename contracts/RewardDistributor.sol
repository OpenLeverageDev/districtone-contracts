// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {IUniV2ClassPair} from "./common/IUniV2ClassPair.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IxOLE} from "./common/IxOLE.sol";
import {ReentrancyGuard} from "./common/ReentrancyGuard.sol";

contract RewardDistributor is Ownable, ReentrancyGuard {
    using Erc20Utils for IERC20;
    using Erc20Utils for IUniV2ClassPair;

    error InvalidAmount();
    error InvalidTime();
    error InvalidPenalty();
    error InsufficientTransfersIn();
    error NotStarted();
    error Expired();
    error NotExpired();
    error AlreadyRecycled();
    error AlreadyVested();
    error IncorrectMerkleProof();
    error ExceedMax(uint256 amount);
    error InvalidSender();

    struct Epoch {
        bytes32 merkleRoot;
        uint256 total;
        uint256 vested;
        uint256 startTime; // vest start time
        uint256 expireTime; // vest expire time
        uint256 vestDuration; // vest duration, in seconds
        uint16 penaltyBase; // exit penalty base percentage, 2000 => 20%
        uint16 penaltyAdd; // exit penalty add percentage, 6000 => 60%
        bool recycled;
    }

    struct Reward {
        uint256 amount; // total amount to be vested
        uint256 withdrawn; // withdrawn amount by the user
        uint256 vestStartTime; // vest start time
    }

    uint256 internal constant PERCENT_DIVISOR = 10000;
    uint256 private constant WEEK = 7 * 86400; // XOLE lock times are rounded by week
    uint256 private constant MIN_DURATION = 7 * 86400; // 7 days
    uint256 private constant MAX_DURATION = 4 * 365 * 86400; // 4 years

    IERC20 public immutable oleToken;
    IUniV2ClassPair public immutable pair;
    address public immutable token1; // token1 of lp
    address public immutable xole;
    uint256 public epochIdx;
    uint256 public minXOLELockDuration; // min XOLE lock duration in seconds when converting
    uint256 public withdrawablePenalty; // the withdrawable penalty for admin
    address public distributor;
    // mapping of epochId, user to reward info
    mapping(uint256 => mapping(address => Reward)) public rewards;
    // mapping of epochId to epoch info
    mapping(uint256 => Epoch) public epochs;

    constructor(
        address _oleToken,
        address _pair,
        address _token1,
        address _xole,
        address _distributor,
        uint256 _minXOLELockDuration
    ) Ownable(_msgSender()) verifyDuration(_minXOLELockDuration) {
        oleToken = IERC20(_oleToken);
        pair = IUniV2ClassPair(_pair);
        token1 = _token1;
        xole = _xole;
        minXOLELockDuration = _minXOLELockDuration;
        distributor = _distributor;
    }

    event VestStarted(uint256 epochId, address account, uint256 balance, uint256 vestTime);
    event Withdrawn(uint256 epochId, address account, uint256 amount, uint256 penalty);
    event ConvertedToXOLE(uint256 epochId, address account, uint256 amount);

    event EpochAdded(
        uint256 epochId,
        bytes32 merkleRoot,
        uint256 total,
        uint256 startTime,
        uint256 expireTime,
        uint256 vestDuration,
        uint16 penaltyBase,
        uint16 penaltyAdd
    );
    event Recycled(uint256 epochId, uint256 recycledAmount);
    event PenaltyWithdrawn(uint256 amount);

    function vests(uint256[] calldata _epochIds, uint256[] calldata _balances, bytes32[][] calldata _merkleProofs) external {
        for (uint256 i = 0; i < _epochIds.length; i++) {
            _vest(_epochIds[i], _balances[i], _merkleProofs[i]);
        }
    }

    function vest(uint256 _epochId, uint256 _balance, bytes32[] calldata _merkleProof) external {
        _vest(_epochId, _balance, _merkleProof);
    }

    function withdrawMul(uint256[] calldata _epochIds) external {
        uint256 total;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            total += _withdrawReward(_epochIds[i]);
        }
        oleToken.transferOut(msg.sender, total);
    }

    function withdraw(uint256 epochId) external {
        uint256 withdrawing = _withdrawReward(epochId);
        oleToken.transferOut(msg.sender, withdrawing);
    }

    function earlyExit(uint256 epochId) external {
        Reward storage reward = rewards[epochId][msg.sender];
        if (reward.amount == 0 || reward.amount == reward.withdrawn) revert InvalidAmount();
        (uint256 withdrawable, uint256 penalty) = _earlyExitWithdrawable(reward, epochId);
        reward.withdrawn = reward.amount;
        withdrawablePenalty += penalty;
        emit Withdrawn(epochId, msg.sender, withdrawable, penalty);
        oleToken.transferOut(msg.sender, withdrawable);
    }

    /// @param token1MaxAmount, The token1 max supply amount when adding liquidity
    /// @param unlockTime, The unlock time for the XOLE lock
    function convertToNewXole(uint256 epochId, uint256 token1MaxAmount, uint256 unlockTime) external nonReentrant {
        uint256 conversion = _convertOLE(epochId, msg.sender);
        _convertToNewXole(msg.sender, conversion, token1MaxAmount, unlockTime);
    }

    function convertToNewXoleForOthers(uint256 epochId, address account, uint256 token1MaxAmount, uint256 unlockTime) external nonReentrant {
        uint256 conversion = _convertOLE(epochId, msg.sender);
        _convertToNewXole(account, conversion, token1MaxAmount, unlockTime);
    }

    function convertAndIncreaseXoleAmount(uint256 epochId, uint256 token1MaxAmount) external nonReentrant {
        uint256 conversion = _convertOLE(epochId, msg.sender);
        _convertAndIncreaseXoleAmount(msg.sender, conversion, token1MaxAmount);
    }

    function convertAndIncreaseXoleAmountForOthers(uint256 epochId, address account, uint256 token1MaxAmount) external nonReentrant {
        uint256 conversion = _convertOLE(epochId, msg.sender);
        _convertAndIncreaseXoleAmount(account, conversion, token1MaxAmount);
    }

    function convertsToNewXole(uint256[] calldata _epochIds, address recipient, uint256 token1MaxAmount, uint256 unlockTime) external nonReentrant {
        uint256 conversion = 0;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            conversion += _convertOLE(_epochIds[i], msg.sender);
        }
        _convertToNewXole(recipient, conversion, token1MaxAmount, unlockTime);
    }

    function convertsAndIncreaseXoleAmount(uint256[] calldata _epochIds, address recipient, uint256 token1MaxAmount) external nonReentrant {
        uint256 conversion = 0;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            conversion += _convertOLE(_epochIds[i], msg.sender);
        }
        _convertAndIncreaseXoleAmount(recipient, conversion, token1MaxAmount);
    }

    /*** View Functions ***/
    function verifyVest(address account, uint256 _epochId, uint256 _balance, bytes32[] calldata _merkleProof) external view returns (bool valid) {
        return _verifyVest(account, epochs[_epochId].merkleRoot, _balance, _merkleProof);
    }

    function getWithdrawable(address account, uint256[] calldata _epochIds) external view returns (uint256[] memory results) {
        uint256 len = _epochIds.length;
        results = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            Reward memory reward = rewards[_epochIds[i]][account];
            if (reward.amount == reward.withdrawn) {
                results[i] = 0;
                continue;
            }
            Epoch memory epoch = epochs[_epochIds[i]];
            uint256 releaseAble = _releaseable(reward, epoch);
            results[i] = releaseAble - reward.withdrawn;
        }
    }

    function getEarlyExitWithdrawable(address account, uint256 _epochId) external view returns (uint256 amount, uint256 penalty) {
        Reward memory reward = rewards[_epochId][account];
        if (reward.amount == reward.withdrawn) {
            (amount, penalty) = (0, 0);
        } else {
            (amount, penalty) = _earlyExitWithdrawable(reward, _epochId);
        }
    }

    /*** Admin Functions ***/
    function newEpoch(
        bytes32 merkleRoot,
        uint256 total,
        uint256 startTime,
        uint256 expireTime,
        uint256 vestDuration,
        uint16 penaltyBase,
        uint16 penaltyAdd
    ) external onlyDistributor verifyDuration(vestDuration) {
        if (expireTime <= startTime || expireTime <= block.timestamp) revert InvalidTime();
        if (total == 0 || penaltyBase + penaltyAdd >= PERCENT_DIVISOR) revert InvalidAmount();
        uint256 received = oleToken.safeTransferIn(msg.sender, total);
        if (received != total) revert InsufficientTransfersIn();
        uint256 epochId = ++epochIdx;
        epochs[epochId] = Epoch(merkleRoot, total, 0, startTime, expireTime, vestDuration, penaltyBase, penaltyAdd, false);
        emit EpochAdded(epochId, merkleRoot, total, startTime, expireTime, vestDuration, penaltyBase, penaltyAdd);
    }

    function recycle(uint256[] calldata _epochIds) external onlyOwner {
        uint256 total;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            Epoch storage epoch = epochs[_epochIds[i]];
            if (epoch.recycled) revert AlreadyRecycled();
            if (block.timestamp <= epoch.expireTime) revert NotExpired();
            uint256 recycleAmount = epoch.total - epoch.vested;
            total += recycleAmount;
            epoch.recycled = true;
            emit Recycled(_epochIds[i], recycleAmount);
        }
        if (total == 0) revert InvalidAmount();
        oleToken.transferOut(owner(), total);
    }

    function withdrawPenalty() external onlyOwner {
        if (withdrawablePenalty == 0) revert InvalidAmount();
        uint256 _withdrawablePenalty = withdrawablePenalty;
        withdrawablePenalty = 0;
        oleToken.transferOut(owner(), _withdrawablePenalty);
        emit PenaltyWithdrawn(_withdrawablePenalty);
    }

    function setMinXOLELockDuration(uint256 _minXOLELockDuration) external onlyOwner verifyDuration(_minXOLELockDuration) {
        minXOLELockDuration = _minXOLELockDuration;
    }

    /*** Internal Functions ***/

    function _vest(uint256 _epochId, uint256 _balance, bytes32[] calldata _merkleProof) internal {
        Epoch storage epoch = epochs[_epochId];
        if (block.timestamp < epoch.startTime) revert NotStarted();
        if (block.timestamp > epoch.expireTime) revert Expired();
        if (_balance == 0 || _balance + epoch.vested > epoch.total) revert InvalidAmount();

        Reward memory reward = rewards[_epochId][msg.sender];
        if (reward.amount > 0) revert AlreadyVested();
        if (!_verifyVest(msg.sender, epoch.merkleRoot, _balance, _merkleProof)) revert IncorrectMerkleProof();
        epoch.vested += _balance;
        rewards[_epochId][msg.sender] = Reward(_balance, 0, block.timestamp);
        emit VestStarted(_epochId, msg.sender, _balance, block.timestamp);
    }

    function _verifyVest(address account, bytes32 root, uint256 _balance, bytes32[] memory _merkleProof) internal pure returns (bool valid) {
        bytes32 leaf = keccak256(abi.encodePacked(account, _balance));
        return MerkleProof.verify(_merkleProof, root, leaf);
    }

    function _withdrawReward(uint256 epochId) internal returns (uint256) {
        Reward storage reward = rewards[epochId][msg.sender];
        if (reward.amount == 0 || reward.amount == reward.withdrawn) revert InvalidAmount();
        Epoch memory epoch = epochs[epochId];
        uint256 withdrawing = _releaseable(reward, epoch) - reward.withdrawn;
        if (withdrawing == 0) revert InvalidAmount();
        reward.withdrawn += withdrawing;
        emit Withdrawn(epochId, msg.sender, withdrawing, 0);
        return withdrawing;
    }

    function _releaseable(Reward memory reward, Epoch memory epoch) internal view returns (uint256) {
        uint256 endTime = reward.vestStartTime + epoch.vestDuration;
        if (block.timestamp > endTime) {
            return reward.amount;
        } else {
            return ((block.timestamp - reward.vestStartTime) * reward.amount) / epoch.vestDuration;
        }
    }

    function _earlyExitWithdrawable(Reward memory reward, uint256 epochId) internal view returns (uint256 withdrawable, uint256 penalty) {
        Epoch memory epoch = epochs[epochId];
        uint256 releaseable = _releaseable(reward, epoch);
        withdrawable = releaseable - reward.withdrawn;
        // cal penalty
        uint256 endTime = reward.vestStartTime + epoch.vestDuration;
        uint256 penaltyFactor = ((endTime - block.timestamp) * epoch.penaltyAdd) / epoch.vestDuration + epoch.penaltyBase;
        uint256 locked = reward.amount - releaseable;
        penalty = (locked * penaltyFactor) / PERCENT_DIVISOR;
        if (penalty >= locked) revert InvalidPenalty();
        withdrawable += locked - penalty;
        return (withdrawable, penalty);
    }

    function _convertOLE(uint256 epochId, address account) internal returns (uint256) {
        Reward storage reward = rewards[epochId][account];
        uint256 convertible = reward.amount - reward.withdrawn;
        if (reward.amount == 0 || convertible == 0) revert InvalidAmount();
        reward.withdrawn = reward.amount;
        emit ConvertedToXOLE(epochId, account, convertible);
        return convertible;
    }

    function _convertToNewXole(address account, uint256 oleAmount, uint256 token1MaxAmount, uint256 unlockTime) internal {
        unlockTime = (unlockTime / WEEK) * WEEK;
        verifyUnlockTime(unlockTime);
        uint256 liquidity = formLp(oleAmount, token1MaxAmount);
        pair.safeApprove(xole, liquidity);
        IxOLE(xole).create_lock_for(account, liquidity, unlockTime);
    }

    function _convertAndIncreaseXoleAmount(address account, uint256 oleAmount, uint256 token1MaxAmount) internal {
        (, uint256 lockTime) = IxOLE(xole).locked(account);
        verifyUnlockTime(lockTime);
        uint256 liquidity = formLp(oleAmount, token1MaxAmount);
        pair.safeApprove(xole, liquidity);
        IxOLE(xole).increase_amount_for(account, liquidity);
    }

    function formLp(uint256 oleAmount, uint256 token1MaxAmount) internal returns (uint256 liquidity) {
        (uint256 reserveA, uint256 reserveB) = getReserves(address(oleToken), token1);
        uint256 amountBOptimal = (oleAmount * reserveB) / reserveA;
        if (amountBOptimal > token1MaxAmount) revert ExceedMax(amountBOptimal);
        IERC20(token1).safeTransferFrom(msg.sender, address(pair), amountBOptimal);
        oleToken.transferOut(address(pair), oleAmount);
        liquidity = pair.mint(address(this));
    }

    function getReserves(address tokenA, address tokenB) internal view returns (uint256 reserveA, uint256 reserveB) {
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        (address _token0, ) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        (reserveA, reserveB) = tokenA == _token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function verifyUnlockTime(uint256 _unlockTime) internal view {
        if (_unlockTime < block.timestamp + minXOLELockDuration || _unlockTime > block.timestamp + MAX_DURATION) revert InvalidTime();
    }

    modifier verifyDuration(uint256 _duration) {
        if (_duration < MIN_DURATION || _duration > MAX_DURATION) revert InvalidTime();
        _;
    }

    modifier onlyDistributor() {
        if (_msgSender() < distributor) revert InvalidSender();
        _;
    }
}
