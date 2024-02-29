// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {Math} from "@openzeppelin-5/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISpaceShare} from "./share/ISpaceShare.sol";
import {IUniV2ClassPair} from "./common/IUniV2ClassPair.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {ISOLE} from "./common/ISOLE.sol";
import {IWETH} from "./common/IWETH.sol";
import {BlastAdapter} from "./BlastAdapter.sol";

/**
 * @title OPZap
 * @dev This contract is designed caters to users looking to interact with liquidity pools, swap tokens, and buy the space's shares by ETH.
 */
contract OPZap is BlastAdapter {
    error InsufficientLpReturn(); // Error thrown when the LP amount received is less than expected
    error InsufficientOleReturn(); // Error thrown when the OLE amount received is less than expected

    using Erc20Utils for IERC20;
    using Erc20Utils for IUniV2ClassPair;

    IERC20 public immutable OLE; // Address of the OLE token
    IWETH public immutable WETH; // Native token of the blockchain (e.g., ETH on Ethereum)
    IUniV2ClassPair public oleEthLp; // Address of the token pair for liquidity : OLE/ETH
    address public immutable SOLE; // Address of the OpenLeverage SOLE token
    ISpaceShare public immutable SPACE; // Address of the OpenLeverage Space share contract
    uint256 public immutable DEX_FEES; // 0.3% dex fees (e.g., 20 means 0.2%)
    constructor(IERC20 _ole, IWETH _weth, IUniV2ClassPair _pair, uint256 _dexFee, address _sole, ISpaceShare _spaceShare) {
        OLE = _ole;
        WETH = _weth;
        oleEthLp = _pair;
        DEX_FEES = _dexFee;
        SOLE = _sole;
        SPACE = _spaceShare;
    }

    function swapETHForOLE(uint256 minBoughtOle) external payable returns (uint256 boughtOle) {
        WETH.deposit{value: msg.value}();
        boughtOle = _swapETHForOLE(msg.value, _msgSender());
        if (boughtOle < minBoughtOle) revert InsufficientOleReturn();
        return boughtOle;
    }

    function createXoleByETH(uint256 minLpReturn, uint256 unlockTime) external payable {
        WETH.deposit{value: msg.value}();
        uint256 lpReturn = _addLpByETH(msg.value);
        if (lpReturn < minLpReturn) revert InsufficientLpReturn();
        oleEthLp.safeApprove(SOLE, lpReturn);
        ISOLE(SOLE).create_lock_for(msg.sender, lpReturn, unlockTime);
    }

    function increaseXoleByETH(uint256 minLpReturn) external payable {
        WETH.deposit{value: msg.value}();
        uint256 lpReturn = _addLpByETH(msg.value);
        if (lpReturn < minLpReturn) revert InsufficientLpReturn();
        oleEthLp.safeApprove(SOLE, lpReturn);
        ISOLE(SOLE).increase_amount_for(msg.sender, lpReturn);
    }

    function buySharesByETH(uint256 spaceId, uint256 shares, uint256 timestamp, bytes memory signature, uint256 minBoughtOle) external payable {
        WETH.deposit{value: msg.value}();
        _swapETHForOLE(msg.value, address(this));
        uint256 boughtOle = OLE.balanceOfThis();
        if (boughtOle < minBoughtOle) revert InsufficientOleReturn();
        OLE.safeApprove(address(SPACE), boughtOle);
        SPACE.buySharesTo(spaceId, shares, boughtOle, timestamp, signature, msg.sender);
        // refund ole
        uint256 oleBalance = OLE.balanceOfThis();
        if (oleBalance > 0) {
            OLE.transferOut(msg.sender, oleBalance);
        }
    }

    function _swapETHForOLE(uint256 ethAmount, address to) internal returns (uint256 boughtOleAmount) {
        (uint256 reserve0, uint256 reserve1, ) = oleEthLp.getReserves();
        IERC20(address(WETH)).transferOut(address(oleEthLp), ethAmount);
        if (oleIsToken0()) {
            boughtOleAmount = getAmountOut(ethAmount, reserve1, reserve0);
            oleEthLp.swap(boughtOleAmount, 0, to, "");
        } else {
            boughtOleAmount = getAmountOut(ethAmount, reserve0, reserve1);
            oleEthLp.swap(0, boughtOleAmount, to, "");
        }
    }

    function _addLpByETH(uint256 ethAmount) internal returns (uint256 lpReturn) {
        (uint256 reserve0, uint256 reserve1, ) = oleEthLp.getReserves();
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
        (uint256 reserve0, uint256 reserve1, ) = oleEthLp.getReserves();
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
        IERC20(address(WETH)).transferOut(address(oleEthLp), ethOut);
        OLE.transferOut(address(oleEthLp), oleOut);
        lpReturn = oleEthLp.mint(address(this));
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

    function setOleEthLp(IUniV2ClassPair newOleEthLp) external onlyOwner {
        oleEthLp = newOleEthLp;
    }
}
