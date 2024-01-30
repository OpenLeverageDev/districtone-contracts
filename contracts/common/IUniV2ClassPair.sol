// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/IERC20.sol";

interface IUniV2ClassPair is IERC20 {
    function mint(address to) external returns (uint liquidity);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function sync() external;

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}
