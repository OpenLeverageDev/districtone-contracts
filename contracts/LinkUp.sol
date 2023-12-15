// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    function join(address inviter, SignatureCompact calldata sig) external payable {
        require(msg.value >= JOIN_FEE, "Incorrect fee");
        require(inviterOf[msg.sender] == address(0), "Already joined");
        require(inviter != address(0) && inviter != msg.sender, "Invalid inviter");
        require(recoverHashFromCompact(keccak256(abi.encodePacked(msg.sender)), sig) == inviter, "Invalid signature");

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

    function recoverHashFromCompact(bytes32 hash, SignatureCompact calldata sig) public pure returns (address) {
        bytes memory prefixedMessage = abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            hash
        );

        bytes32 digest = keccak256(prefixedMessage);

        // Decompose the EIP-2098 signature
        uint8 v = 27 + uint8(uint256(sig.yParityAndS) >> 255);
        bytes32 s = bytes32((uint256(sig.yParityAndS) << 1) >> 1);

        return ecrecover(digest, v, sig.r, s);
    }
}
