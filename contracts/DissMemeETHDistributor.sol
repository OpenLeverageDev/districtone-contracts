// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin-5/contracts/access/Ownable.sol";
import {SignatureLib} from "./libraries/SignatureLib.sol";


contract ETHDistributor is Ownable {

    mapping(address => bool) public hasClaimed;

    uint256 public totalAmount;

    uint256 public quota;

    address public signingAddr;

    // Event to log claims
    event Claimed(address indexed claimant, uint256 amount);

    error InvalidSignatureLength();

    constructor(uint256 _totalAmount, uint256 _quota) Ownable(_msgSender())  {
        totalAmount = _totalAmount;
        quota = _quota;
    }

    // Function for users to claim ETH
    function claim(bytes memory signature) external {
        require(!hasClaimed[msg.sender], "ETHDistributor: Address has already claimed");
        require(isValidSignature(msg.sender, signature), "ETHDistributor: Invalid signature");

        uint256 claimAmount = totalAmount / quota;
        require(address(this).balance >= claimAmount, "ETHDistributor: Insufficient balance");
        hasClaimed[msg.sender] = true;

        (bool sent, ) = msg.sender.call{value: claimAmount}("");
        require(sent, "ETHDistributor: Failed to send Ether");

        emit Claimed(msg.sender, claimAmount);
    }

    // Function for the owner to claim the remaining balance
    function claimRemainingBalance() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "ETHDistributor: No balance to claim");

        (bool sent, ) = owner().call{value: balance}("");
        require(sent, "ETHDistributor: Failed to send Ether");
    }

    // Function to verify the signature
    function isValidSignature(address account, bytes memory signature) internal view returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(this, account));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        return recoverSigner(ethSignedHash, signature) == signingAddr;
    }

    function recoverSigner(bytes32 ethSignedHash, bytes memory signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSignedHash, v, r, s);
    }

    // Function to set the signing address
    function setSigningAddr(address _signingAddr) external onlyOwner {
        signingAddr = _signingAddr;
    }

    // Function to get the signing address
    function getSigningAddr() external view returns (address) {
        return signingAddr;
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

    // Fallback function is called when msg.data is not empty
    fallback() external payable {}

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (sig.length != 65) revert InvalidSignatureLength();

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
