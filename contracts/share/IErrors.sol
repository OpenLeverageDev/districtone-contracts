// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

interface IErrors {
    error InvalidSignature();
    error ZeroAddress();
    error StageNotExists();
    error InsufficientShares();
    error InsufficientInAmount();
    error InsufficientOutAmount();
    error NoRewards();
    error ZeroAmount();
    error InvalidParam();

}
