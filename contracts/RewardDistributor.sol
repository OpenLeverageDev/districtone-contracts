// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/IERC20.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {SignatureLib} from "./libraries/SignatureLib.sol";
import {BlastAdapter} from "./BlastAdapter.sol";

/**
 * @title RewardDistributor
 * @dev This contract is designed to distribute rewards in a linear fashion over a specified vesting duration.
 */
contract RewardDistributor is BlastAdapter {
    using Erc20Utils for IERC20;

    error InvalidParams();
    error AlreadyVested();
    error InvalidSignature();
    error NoReward();
    error InvalidWithdrawn();
    error InvalidAddress();
    error InvalidDuration();

    struct Reward {
        uint256 total; // total amount to be vested
        uint256 withdrawn; // withdrawn amount by the user
        uint256 startTime; // vest start time
        uint256 endTime; // vest start time
    }

    event VestStarted(bytes32 vestId, address account, uint256 total, uint256 startTime, uint256 endTime);
    event Withdrawn(bytes32 vestId, address account, uint256 amount);
    event SignerChanged(address newSigner);
    event VestDurationChanged(uint256 newVestDuration);

    IERC20 public immutable OLE;
    uint256 public vestDuration;
    address public signerAddress;
    mapping(address user => mapping(uint256 epochId => bool vested)) public vestedRecord;
    mapping(address user => mapping(bytes32 vestId => Reward reward)) public rewards;

    constructor(IERC20 _oleToken, address _signerAddress, uint256 _vestDuration) {
        OLE = IERC20(_oleToken);
        signerAddress = _signerAddress;
        vestDuration = _vestDuration;
    }

    function vests(uint256[] calldata _epochIds, uint256 amount, bytes memory signature) external {
        uint256 epochLength = _epochIds.length;
        if (epochLength == 0) revert InvalidParams();
        // check the epoch was vested
        for (uint256 i = 0; i < epochLength; i++) {
            if (vestedRecord[_msgSender()][_epochIds[i]]) revert AlreadyVested();
            vestedRecord[_msgSender()][_epochIds[i]] = true;
        }
        // check the signature
        bytes memory data = abi.encodePacked(_msgSender(), amount);
        for (uint256 i = 0; i < epochLength; i++) {
            data = abi.encodePacked(data, _epochIds[i]);
        }
        bytes32 vestId = keccak256(data);
        if (signerAddress != SignatureLib.recoverSigner(SignatureLib.prefixed(vestId), signature)) revert InvalidSignature();
        // start vest
        rewards[_msgSender()][vestId] = Reward(amount, 0, block.timestamp, block.timestamp + vestDuration);
        emit VestStarted(vestId, _msgSender(), amount, block.timestamp, block.timestamp + vestDuration);
    }

    function withdraws(bytes32[] calldata vestIds) external {
        uint256 total;
        for (uint256 i = 0; i < vestIds.length; i++) {
            total += _withdraw(vestIds[i]);
        }
        OLE.transferOut(msg.sender, total);
    }

    function setSignerAddress(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidAddress();
        signerAddress = newSigner;
        emit SignerChanged(newSigner);
    }

    function setVestDuration(uint256 newVestDuration) external onlyOwner {
        if (newVestDuration == 0) revert InvalidDuration();
        vestDuration = newVestDuration;
        emit VestDurationChanged(newVestDuration);
    }

    function getWithdrawable(bytes32[] calldata vestIds, address user) external view returns (uint256 total) {
        for (uint256 i = 0; i < vestIds.length; i++) {
            Reward memory reward = rewards[user][vestIds[i]];
            if (reward.total == reward.withdrawn) {
                continue;
            }
            total += _getReleaseable(reward.startTime, reward.endTime, reward.total) - reward.withdrawn;
        }
    }

    function _withdraw(bytes32 vestId) internal returns (uint256) {
        Reward storage reward = rewards[_msgSender()][vestId];
        if (reward.total == 0) revert NoReward();
        if (reward.total == reward.withdrawn) revert InvalidWithdrawn();
        uint256 withdrawing = _getReleaseable(reward.startTime, reward.endTime, reward.total) - reward.withdrawn;
        reward.withdrawn += withdrawing;
        emit Withdrawn(vestId, _msgSender(), withdrawing);
        return withdrawing;
    }

    function _getReleaseable(uint256 startTime, uint256 endTime, uint256 amount) internal view returns (uint256) {
        return block.timestamp > endTime ? amount : ((block.timestamp - startTime) * amount) / (endTime - startTime);
    }
}
