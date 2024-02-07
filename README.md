[![Node.js CI](https://github.com/OpenLeverageDev/districtone-contracts/actions/workflows/build.yml/badge.svg)](https://github.com/OpenLeverageDev/openstage-contracts/actions/workflows/build.yml)

# About District One
Welcome to District One – your hub for Web3 social engagement where interaction sparks reward. Dive into a world where community and gamification converge, offering you a unique space to connect, share, and earn.

## Main Contracts

### `LinkUp.sol`
This contract manages the referral and rewards system for District One. It handles the registration of new users through referral links and distributes rewards for both direct and second-tier referrals.

### `SpaceShare.sol`
This contract is responsible for managing shares of spaces within the District One platform. It allows users to buy, sell, and hold shares of different spaces, providing them with a stake in the platform's various social arenas.

### `BlastOLE.sol`
BlastOLE.sol governs the distribution of the bridged OLE token on Blast.

### `OPZap.sol`
The OPZap contract provides functionality for users to easily swap assets with OLE token within the District One ecosystem. It simplifies the process of converting one asset to another, increasing the platform's usability and accessibility.

### `RewardDistributor.sol`
RewardDistributor.sol This contract is designed to distribute rewards in a linear fashion over a specified vesting duration.

## Audits
- [ThreeSigma Labs](https://github.com/OpenLeverageDev/districtone-contracts/blob/main/audits/ThreeSigma-Audit-Report-DistrictOne.pdf)
- [PeckShield](https://github.com/OpenLeverageDev/districtone-contracts/blob/main/audits/PeckShield-Audit-Report-DistrictOne.pdf)

## Build & Tests

Clone the repository and install dependencies:

```bash
git clone https://github.com/districtone/districtone-contracts.git
cd districtone-contracts
yarn
```
Compile the contracts:
```bash
npx hardhat compile
```

Run tests to ensure everything is set up correctly:
```bash
npx hardhat test
```

## Security
If you have security concern of bug report, please contact us at [security@districtone.io](mailto:security@districtone.io).

## Disclaimer
Despite thorough reviews and audits, the provided contracts are offered without guarantees. Always do your own research (DYOR)!

Thank you for being part of District One — Spaces to connect, win, and earn in Web3.