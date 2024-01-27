// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

interface ISOLE {
    function create_lock_for(address to, uint256 _value, uint256 _unlock_time) external;

    function increase_amount_for(address to, uint256 _value) external;

    function balanceOf(address addr) external view returns (uint256);

    function increase_unlock_time(uint256 _unlock_time) external;

    function withdraw() external;

    function locked(address addr) external view returns (uint256 amount, uint256 lockTime);
}
