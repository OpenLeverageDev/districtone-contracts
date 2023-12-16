// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/utils/Strings.sol";

contract LinkUp {
    address public rootAddress;
    uint256 public constant JOIN_FEE = 0.0015 ether;
    mapping(address => address) public inviterOf;
    mapping(address => uint256) public balance;

    event Joined(address indexed user, address indexed inviter);
    event Withdrawn(address indexed user, uint256 amount);

    constructor() {
        rootAddress = msg.sender;
    }

    // This is the EIP-2098 compact representation, which reduces gas costs
    struct SignatureCompact {
        bytes32 r;
        bytes32 yParityAndS;
    }

    function join(address inviter, bytes memory signature) external payable {
        require(msg.value >= JOIN_FEE, "Incorrect fee");
        require(inviterOf[msg.sender] == address(0), "Already joined");
        require(inviter != address(0) && inviter != msg.sender, "Invalid inviter");
        require(verifySig(rootAddress, inviter, signature), "Invalid signature");

        inviterOf[msg.sender] = inviter;

        // Distribute the fees
        uint256 directInviterFee = (JOIN_FEE * 75) / 100;
        uint256 secondTierInviterFee = (JOIN_FEE * 20) / 100;
        uint256 devFundFee = JOIN_FEE - directInviterFee - secondTierInviterFee;

        balance[inviter] += directInviterFee;
        if (inviterOf[inviter] != address(0)) {
            balance[inviterOf[inviter]] += secondTierInviterFee;
        } else {
            balance[rootAddress] += secondTierInviterFee;
        }

        balance[rootAddress] += devFundFee;

        emit Joined(msg.sender, inviter);
    }

    function withdraw() external {
        uint256 amount = balance[msg.sender];
        require(amount > 0, "No balance to withdraw");

        balance[msg.sender] = 0;
        payable(msg.sender).transfer(amount);

        emit Withdrawn(msg.sender, amount);
    }

    function verifySig(address signingAddr, address signedAddr, bytes memory signature) public pure returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(signedAddr));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        return recoverSigner(ethSignedHash, signature) == signingAddr ;
    }

    function recoverSigner(bytes32 ethSignedHash, bytes memory signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSignedHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

}