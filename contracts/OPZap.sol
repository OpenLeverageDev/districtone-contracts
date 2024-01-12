// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IOPZap, IERC20} from "./IOPZap.sol";
import {IStageShare} from "./share/IStageShare.sol";
import {IUniV2ClassPair} from "./common/IUniV2ClassPair.sol";
import {IUniV2ClassRouter} from "./common/IUniV2ClassRouter.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {IxOLE} from "./common/IxOLE.sol";
import {IWETH} from "./common/IWETH.sol";

contract OPZap is IOPZap {
    error InvalidAmount(); // Error thrown when an invalid amount is provided
    error InsufficientLpReturn(uint lpAmount); // Error thrown when the LP amount received is less than expected

    using Erc20Utils for IERC20;
    using Erc20Utils for IUniV2ClassPair;

    IERC20 public immutable OLE; // Address of the OLE token
    IERC20 public immutable USDC; // Address of the USDC token
    IUniV2ClassPair public immutable OLE_USDC; // Address of the token pair for liquidity : OLE/USDC
    address public immutable XOLE; // Address of the OpenLeverage XOLE token
    IStageShare public immutable STAGE; // Address of the OpenLeverage Stage share contract
    address public immutable DEX_ROUTER; // Address of the Uniswap V2 class router
    address public immutable INCH_ROUTER; // Address of the 1inch router
    IWETH public immutable WETH; // Native token of the blockchain (e.g., ETH on Ethereum)

    constructor(
        IERC20 _ole,
        IERC20 _usdc,
        IUniV2ClassPair _pair,
        address _xole,
        IStageShare _stageShare,
        IWETH _weth,
        address _router1inch,
        address _routerUniV2Class
    ) {
        OLE = _ole;
        USDC = _usdc;
        OLE_USDC = _pair;
        XOLE = _xole;
        STAGE = _stageShare;
        WETH = _weth;
        INCH_ROUTER = _router1inch;
        DEX_ROUTER = _routerUniV2Class;
    }

    function createXole(uint256 supplyUsdc, uint256 supplyOle, uint256 minLpReturn, uint256 unlockTime) external override {
        supplyUsdc = USDC.safeTransferIn(msg.sender, supplyUsdc);
        supplyOle = OLE.safeTransferIn(msg.sender, supplyOle);
        uint256 lpReturn = _addLp(supplyUsdc, supplyOle);
        _checkLpReturn(lpReturn, minLpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    function increaseXole(uint256 supplyUsdc, uint256 supplyOle, uint256 minLpReturn) external override {
        supplyUsdc = USDC.safeTransferIn(msg.sender, supplyUsdc);
        supplyOle = OLE.safeTransferIn(msg.sender, supplyOle);
        uint256 lpReturn = _addLp(supplyUsdc, supplyOle);
        _checkLpReturn(lpReturn, minLpReturn);
        _increaseXoleAmount(lpReturn);
    }

    function createXoleByUSDC(uint256 supplyUsdc, uint256 minLpReturn, uint256 unlockTime) external override {
        supplyUsdc = USDC.safeTransferIn(msg.sender, supplyUsdc);
        uint256 lpReturn = _addLpByUsdc(supplyUsdc);
        _checkLpReturn(lpReturn, minLpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    function increaseXoleByUSDC(uint256 supplyUsdc, uint256 minLpReturn) external override {
        supplyUsdc = USDC.safeTransferIn(msg.sender, supplyUsdc);
        uint256 lpReturn = _addLpByUsdc(supplyUsdc);
        _checkLpReturn(lpReturn, minLpReturn);
        _increaseXoleAmount(lpReturn);
    }

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime, bytes memory swapData) external payable override {
        WETH.deposit{value: msg.value}();
        uint256 boughtUsdc = _swapBy1inch(IERC20((address)(WETH)), USDC, msg.value, swapData);
        uint256 lpReturn = _addLpByUsdc(boughtUsdc);
        _checkLpReturn(lpReturn, minLpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    function increaseXoleByETH(uint256 minLpReturn, bytes memory swapData) external payable override {
        WETH.deposit{value: msg.value}();
        uint256 boughtUsdc = _swapBy1inch(IERC20((address)(WETH)), USDC, msg.value, swapData);
        uint256 lpReturn = _addLpByUsdc(boughtUsdc);
        _checkLpReturn(lpReturn, minLpReturn);
        _increaseXoleAmount(lpReturn);
    }

    function createXoleByToken(IERC20 supplyToken, uint256 supplyAmount, uint256 minLpReturn, uint256 unlockTime, bytes memory swapData) external {
        supplyAmount = supplyToken.safeTransferIn(msg.sender, supplyAmount);
        uint256 boughtUsdc = _swapBy1inch(supplyToken, USDC, supplyAmount, swapData);
        uint256 lpReturn = _addLpByUsdc(boughtUsdc);
        _checkLpReturn(lpReturn, minLpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    function increaseXoleByToken(IERC20 supplyToken, uint256 supplyAmount, uint256 minLpReturn, bytes memory swapData) external override {
        supplyAmount = supplyToken.safeTransferIn(msg.sender, supplyAmount);
        uint256 boughtUsdc = _swapBy1inch(supplyToken, USDC, supplyAmount, swapData);
        uint256 lpReturn = _addLpByUsdc(boughtUsdc);
        _checkLpReturn(lpReturn, minLpReturn);
        _increaseXoleAmount(lpReturn);
    }

    function buySharesByETH(uint256 stageId, uint256 shares, bytes memory swapData, uint256 timestamp, bytes memory signature) external payable override {
        WETH.deposit{value: msg.value}();
        uint256 boughtOle = _swapBy1inch(IERC20((address)(WETH)), OLE, msg.value, swapData);
        _buyShares(stageId, shares, boughtOle, timestamp, signature);
    }

    function buySharesByToken(
        uint256 stageId,
        IERC20 supplyToken,
        uint256 supplyAmount,
        uint256 shares,
        bytes memory swapData,
        uint256 timestamp,
        bytes memory signature
    ) external override {
        supplyAmount = supplyToken.safeTransferIn(msg.sender, supplyAmount);
        uint256 boughtOle = _swapBy1inch(supplyToken, OLE, supplyAmount, swapData);
        _buyShares(stageId, shares, boughtOle, timestamp, signature);
    }

    function _addLpByUsdc(uint256 _usdcAmount) internal returns (uint256 lpReturn) {
        // Half of the USDC is sold to swap for OLE
        (uint256 reserve0, uint256 reserve1, ) = OLE_USDC.getReserves();
        uint256 usdcSell;
        if (address(USDC) == OLE_USDC.token0()) {
            usdcSell = _calAmountToSwap(_usdcAmount, reserve0, reserve1);
        } else {
            usdcSell = _calAmountToSwap(_usdcAmount, reserve1, reserve0);
        }
        USDC.safeApprove(DEX_ROUTER, _usdcAmount);
        address[] memory path = new address[](2);
        path[0] = address(USDC);
        path[1] = address(OLE);
        uint256[] memory swapReturn = IUniV2ClassRouter(DEX_ROUTER).swapExactTokensForTokens(usdcSell, 0, path, address(this), block.timestamp);
        return _addLp(_usdcAmount - usdcSell, swapReturn[1]);
    }

    function _addLp(uint256 _supplyUsdc, uint256 _supplyOle) internal returns (uint256 lpReturn) {
        USDC.safeApprove(DEX_ROUTER, _supplyUsdc);
        OLE.safeApprove(DEX_ROUTER, _supplyOle);
        uint256 spendUSDC;
        uint256 spendOLE;
        (spendUSDC, spendOLE, lpReturn) = IUniV2ClassRouter(DEX_ROUTER).addLiquidity(
            address(USDC),
            address(OLE),
            _supplyUsdc,
            _supplyOle,
            0,
            0,
            address(this),
            block.timestamp
        );
        if (_supplyUsdc - spendUSDC > 0) {
            USDC.transferOut(msg.sender, _supplyUsdc - spendUSDC);
        }
        if (_supplyOle - spendOLE > 0) {
            USDC.transferOut(msg.sender, _supplyOle - spendOLE);
        }
    }

    function _calAmountToSwap(uint256 _token0AmountIn, uint256 _reserve0, uint256 _reserve1) internal view returns (uint256) {
        uint256 halfToken0Amount = _token0AmountIn / 2;
        uint256 nominator = IUniV2ClassRouter(DEX_ROUTER).getAmountOut(halfToken0Amount, _reserve0, _reserve1);
        uint256 denominator = _quote(halfToken0Amount, _reserve0 + halfToken0Amount, _reserve1 - nominator);
        return _token0AmountIn - Math.sqrt((halfToken0Amount * halfToken0Amount * nominator) / denominator);
    }

    function _quote(uint256 _amountA, uint256 _reserveA, uint256 _reserveB) internal pure returns (uint256 _amountB) {
        _amountB = (_amountA * _reserveB) / _reserveA;
    }

    function _swapBy1inch(IERC20 _sellToken, IERC20 _buyToken, uint256 _sellAmount, bytes memory _data) internal returns (uint256) {
        _sellToken.safeApprove(INCH_ROUTER, _sellAmount);
        (bool success, bytes memory returnData) = INCH_ROUTER.call(_data);
        assembly {
            if eq(success, 0) {
                revert(add(returnData, 0x20), returndatasize())
            }
        }
        return _buyToken.balanceOfThis();
    }

    function _createNewXole(uint256 _lpAmount, uint256 _unlockTime) internal {
        OLE_USDC.safeApprove(XOLE, _lpAmount);
        IxOLE(XOLE).create_lock_for(msg.sender, _lpAmount, _unlockTime);
    }

    function _increaseXoleAmount(uint256 _lpAmount) internal {
        OLE_USDC.safeApprove(XOLE, _lpAmount);
        IxOLE(XOLE).increase_amount_for(msg.sender, _lpAmount);
    }

    function _buyShares(uint256 _stageId, uint256 shares, uint256 _maxSpendOle, uint256 timestamp, bytes memory signature) internal {
        OLE.safeApprove(address(STAGE), _maxSpendOle);
        STAGE.buySharesTo(_stageId, shares, _maxSpendOle, timestamp, signature, msg.sender);
        // returns the remaining ole to the msg.sender
        uint oleBalance = OLE.balanceOfThis();
        if (oleBalance > 0) {
            OLE.transferOut(msg.sender, oleBalance);
        }
    }

    function _checkLpReturn(uint256 lpReturn, uint256 minLpReturn) internal {
        if (lpReturn < minLpReturn) revert InsufficientLpReturn(lpReturn);
    }
}
