// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ISOLE} from "./common/ISOLE.sol";
import {OPZap} from "./OPZap.sol";
import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/IERC20.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {BlastAdapter} from "./BlastAdapter.sol";

/**
 * @title LinkUp
 * @dev This contract implemented a multi-tier referral system where the first tier (direct) inviter receives a portion of the joining fee, and the second tier (inviter of the inviter) receives a smaller portion.
 */
contract LinkUp is BlastAdapter {
    using Erc20Utils for IERC20;

    ISOLE public immutable sOLEToken; // sOLE Token, immutable
    IERC20 public immutable OLE; // Address of the OLE token
    OPZap public immutable ZAP;
    uint256 public constant MIN_SOLE_BALANCE = 100 * 10 ** 18; // Example: 100 sOLE (adjust as needed)
    address public signerAddress;
    uint256 public joinFee = 0.0015 ether;
    mapping(address => address) public inviterOf;
    mapping(address => uint256) public balance;

    uint256 public protocolFee;

    event Joined(address indexed user, address indexed inviter, uint256 directInviterFee, uint256 secondTierInviterFee, uint256 protocolFee);
    event Withdrawn(address indexed user, uint256 amount);
    event WithdrawnProtocolFee(address to, uint256 amount);
    event FeeChanged(uint256 newFee);
    event SignerChanged(address indexed newSigner);

    error IncorrectFee();
    error AlreadyJoined();
    error InvalidInviter();
    error InvalidSignature();
    error NoBalanceToWithdraw();
    error InvalidNewSignerAddress();
    error InvalidSignatureLength();

    constructor(address signer, address _sOLETokenAddress, IERC20 _ole, OPZap _zap) {
        signerAddress = signer;
        sOLEToken = ISOLE(_sOLETokenAddress); // Set the sOLE Token address here
        OLE = _ole;
        ZAP = _zap;
    }

    function join(address inviter, bytes memory signature) external payable {
        if (msg.value != joinFee) revert IncorrectFee();
        if (inviterOf[msg.sender] != address(0)) revert AlreadyJoined();
        if (inviter == address(0) || inviter == msg.sender) revert InvalidInviter();
        if (!verifySig(signerAddress, inviter, signature)) revert InvalidSignature();
        // Link the inviter to the new user
        inviterOf[msg.sender] = inviter;

        // Initialize fee amounts
        uint256 directInviterFeePercent = 0;
        uint256 secondTierInviterFeePercent = 0;
        uint256 protocolFeePercent = 100;

        // Check sOLE balances of inviters
        bool directInviterOwnsSOLE = sOLEToken.balanceOf(inviter) >= MIN_SOLE_BALANCE;
        bool secondTierInviterOwnsSOLE = false;
        address secondTierInviter = inviterOf[inviter];
        if (secondTierInviter != address(0)) {
            secondTierInviterOwnsSOLE = sOLEToken.balanceOf(secondTierInviter) >= MIN_SOLE_BALANCE;
        }

        // Calculate fee distribution percent
        if (directInviterOwnsSOLE && secondTierInviterOwnsSOLE) {
            directInviterFeePercent = 75;
            secondTierInviterFeePercent = 25;
            protocolFeePercent = 0;
        } else if (directInviterOwnsSOLE) {
            directInviterFeePercent = 80;
            secondTierInviterFeePercent = 15;
            protocolFeePercent = 5;
        } else if (secondTierInviterOwnsSOLE) {
            directInviterFeePercent = 65;
            secondTierInviterFeePercent = 30;
            protocolFeePercent = 5;
        } else {
            directInviterFeePercent = 70;
            secondTierInviterFeePercent = 20;
            protocolFeePercent = 10;
        }
        if (secondTierInviter == address(0)) {
            protocolFeePercent += secondTierInviterFeePercent; // Add to protocol fee if no second-tier inviter
            secondTierInviterFeePercent = 0;
        }
        // Increase protocol fee
        uint256 _protocolFee = (joinFee * protocolFeePercent) / 100;
        protocolFee += _protocolFee;
        // Buy ole
        uint256 preOleBalance = OLE.balanceOfThis();
        ZAP.swapETHForOLE{value: joinFee - _protocolFee}();
        uint256 boughtOle = OLE.balanceOfThis() - preOleBalance;
        // Distribute fees
        uint256 directInviterFee = (boughtOle * directInviterFeePercent) / (directInviterFeePercent + secondTierInviterFeePercent);
        uint256 secondTierInviterFee = boughtOle - directInviterFee;
        balance[inviter] += directInviterFee;
        if (secondTierInviter != address(0)) {
            balance[secondTierInviter] += secondTierInviterFee;
        }
        // Emit event for successful join
        emit Joined(msg.sender, inviter, directInviterFee, secondTierInviterFee, _protocolFee);
    }

    function withdraw() external {
        uint256 amount = balance[msg.sender];
        if (amount == 0) revert NoBalanceToWithdraw();
        balance[msg.sender] = 0;
        OLE.transferOut(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function withdrawProtocolFee(address to) external onlyOwner {
        uint256 amount = protocolFee;
        protocolFee = 0;
        payable(to).transfer(amount);
        emit WithdrawnProtocolFee(to, amount);
    }

    function getInvitersOf(address user) external view returns (address, address) {
        address directInviter = inviterOf[user];
        address secondTierInviter = address(0);

        if (directInviter != address(0)) {
            secondTierInviter = inviterOf[directInviter];
        }
        return (directInviter, secondTierInviter);
    }

    function verifySig(address signingAddr, address signedAddr, bytes memory signature) internal pure returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(signedAddr));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        return recoverSigner(ethSignedHash, signature) == signingAddr;
    }

    function recoverSigner(bytes32 ethSignedHash, bytes memory signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSignedHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (sig.length != 65) revert InvalidSignatureLength();

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    function setJoinFee(uint256 newFee) external onlyOwner {
        joinFee = newFee;
        emit FeeChanged(newFee);
    }

    function changeSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidNewSignerAddress();
        signerAddress = newSigner;
        emit SignerChanged(newSigner);
    }
}
