// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {MockToken} from "./MockToken.sol";
import {IUniV2ClassPair} from "../common/IUniV2ClassPair.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockPancakePair is MockToken, IUniV2ClassPair {
    address public token0;
    address public token1;
    uint112 internal reserve0;
    uint112 internal reserve1;
    uint32 public blockTimestampLast;
    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;
    uint256 internal constant PRICE_DECIMALS = 10 ** 24;

    constructor(address tokenA, address tokenB, uint256 _reserveA, uint256 _reserveB) MockToken("LP", "LP", 0) {
        require(tokenA != tokenB);
        require(_reserveA != 0 && _reserveB != 0, "Empty Reserve");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        MockToken(tokenA).mint(address(this), _reserveA);
        MockToken(tokenB).mint(address(this), _reserveB);
        _mintTo(address(1));
    }

    // this low-level function should be called from a contract which performs important safety checks
    function mint(address to) external override returns (uint liquidity) {
        return _mintTo(to);
    }

    function _mintTo(address to) internal returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = _getReserves(); // gas savings
        uint balance0 = IERC20(token0).balanceOf(address(this));
        uint balance1 = IERC20(token1).balanceOf(address(this));
        uint amount0 = balance0 - (_reserve0);
        uint amount1 = balance1 - (_reserve1);

        uint _totalSupply = totalSupply(); // gas savings, must be defined here since totalSupply can update in _mintFee
        if (_totalSupply == 0) {
            liquidity = sqrt(amount0 * (amount1)) - (MINIMUM_LIQUIDITY);
            _mint(address(1), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = min((amount0 * (_totalSupply)) / _reserve0, (amount1 * (_totalSupply)) / _reserve1);
        }
        require(liquidity > 0, "Pancake: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
    }
    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external override {
        require(amount0Out > 0 || amount1Out > 0, "Pancake: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1, ) = _getReserves(); // gas savings
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "Pancake: INSUFFICIENT_LIQUIDITY");

        uint balance0;
        uint balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "Pancake: INVALID_TO");
            if (amount0Out > 0) IERC20(_token0).transfer(to, amount0Out); // optimistically transfer tokens
            if (amount1Out > 0) IERC20(_token1).transfer(to, amount1Out); // optimistically transfer tokens
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "Pancake: INSUFFICIENT_INPUT_AMOUNT");
        {
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            uint balance0Adjusted = (balance0 * (10000) - (amount0In * (25)));
            uint balance1Adjusted = (balance1 * (10000) - (amount1In * (25)));
            require(balance0Adjusted * (balance1Adjusted) >= uint(_reserve0) * (_reserve1) * (10000 ** 2), "Pancake: K");
        }

        _update(balance0, balance1, _reserve0, _reserve1);
    }

    function getReserves() external view override returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        return _getReserves();
    }

    function _getReserves() internal view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _update(uint balance0, uint balance1, uint112 _reserve0, uint112 _reserve1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "Pancake: OVERFLOW");
        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
    }

    function sync() external override {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
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
