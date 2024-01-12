// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {MockToken} from "./MockToken.sol";

contract MockUniV2ClassPair is MockToken {
    address internal _token0;
    address internal _token1;
    uint256 public _reserve0;
    uint256 public _reserve1;
    uint32 public _blockTimestampLast;
    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;
    uint256 internal constant PRICE_DECIMALS = 10 ** 24;

    constructor(address tokenA, address tokenB, uint256 reserve0, uint256 reserve1) MockToken("LP", "LP", 0) {
        require(tokenA != tokenB);
        require(reserve0 != 0 && reserve1 != 0, "Empty Reserve");
        (_token0, _token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        _blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        MockToken(_token0).mint(address(this), reserve0);
        MockToken(_token1).mint(address(this), reserve1);
        mint(address(0));
    }

    function mint(address to) public returns (uint liquidity) {
        uint balance0 = MockToken(_token0).balanceOf(address(this));
        uint balance1 = MockToken(_token1).balanceOf(address(this));
        uint amount0 = balance0 - _reserve0;
        uint amount1 = balance1 - _reserve1;
        uint tempTotalSupply = totalSupply();
        if (tempTotalSupply == 0) {
            liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = min((amount0 * tempTotalSupply) / _reserve0, (amount1 * tempTotalSupply) / _reserve1);
        }
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        _reserve0 = balance0;
        _reserve1 = balance1;
    }

    function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint32 blockTimestampLast) {
        return (_reserve0, _reserve1, _blockTimestampLast);
    }

    function addReserves(address token, uint256 reserve) external {
        require(token == _token0 || token == _token1, "TOKEN ERR");
        if (token == _token0) {
            MockToken(_token0).mint(address(this), reserve);
            _reserve0 += reserve;
        } else {
            MockToken(_token1).mint(address(this), reserve);
            _reserve1 += reserve;
        }
    }

    function getPrice(address token) external view returns (uint256 price) {
        if (token == _token0) {
            price = (_reserve1 * PRICE_DECIMALS) / _reserve0;
        } else {
            price = (_reserve0 * PRICE_DECIMALS) / _reserve1;
        }
    }

    function token0() external view returns (address) {
        return _token0;
    }

    function token1() external view returns (address) {
        return _token1;
    }

    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x < y ? x : y;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
        return z;
    }
}
