// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {Math} from "@openzeppelin-5/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStageShare} from "./share/IStageShare.sol";
import {IUniV2ClassPair} from "./common/IUniV2ClassPair.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {ISOLE} from "./common/ISOLE.sol";
import {IWETH} from "./common/IWETH.sol";
import {BlastAdapter} from "./BlastAdapter.sol";

/**
 * @title OPZap
 * @dev This contract is designed caters to users looking to interact with liquidity pools, swap tokens, and buy the stage's shares by ETH.
 */
contract OPZap is BlastAdapter {
    error InsufficientLpReturn(); // Error thrown when the LP amount received is less than expected

    using Erc20Utils for IERC20;
    using Erc20Utils for IUniV2ClassPair;

    IERC20 public immutable OLE; // Address of the OLE token
    IWETH public immutable WETH; // Native token of the blockchain (e.g., ETH on Ethereum)
    IUniV2ClassPair public immutable OLE_ETH; // Address of the token pair for liquidity : OLE/ETH
    address public immutable SOLE; // Address of the OpenLeverage SOLE token
    IStageShare public immutable STAGE; // Address of the OpenLeverage Stage share contract
    uint256 public immutable DEX_FEES; // 0.3% dex fees (e.g., 20 means 0.2%)
    constructor(IERC20 _ole, IWETH _weth, IUniV2ClassPair _pair, uint256 _dexFee, address _sole, IStageShare _stageShare) {
        OLE = _ole;
        WETH = _weth;
        OLE_ETH = _pair;
        DEX_FEES = _dexFee;
        SOLE = _sole;
        STAGE = _stageShare;
    }

    function swapETHForOLE() external payable {
        WETH.deposit{value: msg.value}();
        uint256 oleBalance = OLE.balanceOfThis();
        _swapETHForOLE(msg.value, msg.sender);
    }

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime) external payable {
        WETH.deposit{value: msg.value}();
        uint256 lpReturn = _addLpByETH(msg.value);
        if (lpReturn < minLpReturn) revert InsufficientLpReturn();
        OLE_ETH.safeApprove(SOLE, lpReturn);
        ISOLE(SOLE).create_lock_for(msg.sender, lpReturn, unlockTime);
    }

    function increaseXoleByETH(uint256 minLpReturn) external payable {
        WETH.deposit{value: msg.value}();
        uint256 lpReturn = _addLpByETH(msg.value);
        if (lpReturn < minLpReturn) revert InsufficientLpReturn();
        OLE_ETH.safeApprove(SOLE, lpReturn);
        ISOLE(SOLE).increase_amount_for(msg.sender, lpReturn);
    }

    function buySharesByETH(uint256 stageId, uint256 shares, uint256 timestamp, bytes memory signature) external payable {
        WETH.deposit{value: msg.value}();
        _swapETHForOLE(msg.value, address(this));
        uint256 boughtOle = OLE.balanceOfThis();
        OLE.safeApprove(address(STAGE), boughtOle);
        STAGE.buySharesTo(stageId, shares, boughtOle, timestamp, signature, msg.sender);
        // refund ole
        uint256 oleBalance = OLE.balanceOfThis();
        if (oleBalance > 0) {
            OLE.transferOut(msg.sender, oleBalance);
        }
    }

    function _swapETHForOLE(uint256 ethAmount, address to) internal {
        OLE_ETH.sync();
        (uint256 reserve0, uint256 reserve1, ) = OLE_ETH.getReserves();
        IERC20(address(WETH)).transferOut(address(OLE_ETH), ethAmount);
        if (oleIsToken0()) {
            OLE_ETH.swap(getAmountOut(ethAmount, reserve1, reserve0), 0, to, "");
        } else {
            OLE_ETH.swap(0, getAmountOut(ethAmount, reserve0, reserve1), to, "");
        }
    }

    function _addLpByETH(uint256 ethAmount) internal returns (uint256 lpReturn) {
        (uint256 reserve0, uint256 reserve1, ) = OLE_ETH.getReserves();
        uint256 ethToSell;
        if (oleIsToken0()) {
            ethToSell = _getAccurateETHToSell(ethAmount, reserve1, reserve0);
        } else {
            ethToSell = _getAccurateETHToSell(ethAmount, reserve0, reserve1);
        }
        _swapETHForOLE(ethToSell, address(this));
        return _addLp(ethAmount - ethToSell, OLE.balanceOfThis());
    }

    function _addLp(uint256 ethAmount, uint256 oleAmount) internal returns (uint256 lpReturn) {
        (uint256 reserve0, uint256 reserve1, ) = OLE_ETH.getReserves();
        uint256 oleReserve = oleIsToken0() ? reserve0 : reserve1;
        uint256 ethReserve = oleIsToken0() ? reserve1 : reserve0;
        uint256 ethOut = ethAmount;
        uint256 oleOut = oleAmount;
        uint256 ethOptimal = _quote(oleAmount, oleReserve, ethReserve);
        if (ethOptimal <= ethAmount) {
            ethOut = ethOptimal;
        } else {
            oleOut = _quote(ethAmount, ethReserve, oleReserve);
        }
        IERC20(address(WETH)).transferOut(address(OLE_ETH), ethOut);
        OLE.transferOut(address(OLE_ETH), oleOut);
        lpReturn = OLE_ETH.mint(address(this));
    }

    function _getAccurateETHToSell(uint256 amountAIn, uint256 reserveA, uint256 reserveB) internal view returns (uint256) {
        uint256 halfTokenAIn = amountAIn / 2;
        uint256 nominator = getAmountOut(halfTokenAIn, reserveA, reserveB);
        uint256 denominator = _quote(halfTokenAIn, reserveA + halfTokenAIn, reserveB - nominator);
        return amountAIn - Math.sqrt((halfTokenAIn * halfTokenAIn * nominator) / denominator);
    }

    function _quote(uint256 _amountA, uint256 _reserveA, uint256 _reserveB) internal pure returns (uint256 _amountB) {
        _amountB = (_amountA * _reserveB) / _reserveA;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private view returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * (10000 - DEX_FEES);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 10000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function oleIsToken0() private view returns (bool) {
        return address(OLE) < address(WETH);
    }
}
