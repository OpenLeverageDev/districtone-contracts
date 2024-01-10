// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStageShare} from "./share/IStageShare.sol";
import {IUniV2ClassPair} from "./common/IUniV2ClassPair.sol";
import {IUniV2ClassRouter} from "./common/IUniV2ClassRouter.sol";
import {Erc20Utils} from "./common/Erc20Utils.sol";
import {IxOLE} from "./common/IxOLE.sol";
import {IWETH} from "./common/IWETH.sol";

// The OPZap contract is a multi-functional tool designed for efficient asset conversion in the DeFi space,
// enabling users to easily swap between different token types (like ETH, USDC, OLE) and invest in products like XOLE and Passes.
contract OPZap {
    using Erc20Utils for IERC20;

    address public immutable ole; // Address of the OLE token
    address public immutable usdc; // Address of the USDC token
    address public immutable pair; // Address of the token pair for liquidity : OLE/USDC
    address public immutable xole; // Address of the OpenLeverage XOLE token
    address public immutable stageShare; // Address of the OpenLeverage Stage share contract
    address public immutable routerUniV2Class; // Address of the Uniswap V2 class router
    address public immutable router1inch; // Address of the 1inch router
    address public immutable weth;  // Native token of the blockchain (e.g., BNB on Binance Smart Chain, ETH on Ethereum)

    constructor(
        address _ole,
        address _usdc,
        address _pair,
        address _xole,
        address _stageShare,
        address _weth,
        address _router1inch,
        address _routerUniV2Class
    ){
        ole = _ole;
        usdc = _usdc;
        pair = _pair;
        xole = _xole;
        stageShare = _stageShare;
        weth = _weth;
        router1inch = _router1inch;
        routerUniV2Class = _routerUniV2Class;
    }

    error InvalidAmount(); // Error thrown when an invalid amount is provided
    error TooLessLP(uint lpAmount); // Error thrown when the LP amount received is less than expected

    /********************** Zap XOLE ***********************/

    /*
     * @notice Zap USDC to new XOLE, swap half of USDC to OLE, and finally to LP
     * @param supplyUsdc: is the amount of USDC to be supplied
     * @param minLpReturn: specifies the minimum LP tokens expected to prevent slippage
     * @param unlockTime: specifies the lock duration for the XOLE tokens
     */
    function zapToNewXoleInUSDC(uint256 supplyUsdc, uint256 minLpReturn, uint256 unlockTime) external checkZero(supplyUsdc) {
        IERC20(usdc).safeTransferIn(msg.sender, supplyUsdc);
        uint256 lpReturn = _zapToLpInUsdc(supplyUsdc);
        if (lpReturn < minLpReturn) revert TooLessLP(lpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    // Function to increase XOLE amount using USDC
    // Similar to `zapToNewXoleInUSDC` but for increasing XOLE amount
    function zapToIncreaseXoleAmtInUSDC(uint256 supplyUsdc, uint256 minLpReturn) external checkZero(supplyUsdc) {
        IERC20(usdc).safeTransferIn(msg.sender, supplyUsdc);
        uint256 lpReturn = _zapToLpInUsdc(supplyUsdc);
        if (lpReturn < minLpReturn) revert TooLessLP(lpReturn);
        _increaseXoleAmount(lpReturn);
    }

    /*
     * @notice Zap ETH to new XOLE by converting ETH to WETH, then swap WETH to USDC and OLE, and finally to LP
     * @param minLpReturn: specifies the minimum LP tokens expected to prevent slippage
     * @param unlockTime: specifies the lock duration for the XOLE tokens
     * @param swapData: contains the data required for swapping tokens (used in `_swap` function)
     */
    function zapToNewXoleInWETH(uint256 minLpReturn, uint256 unlockTime, bytes memory swapData) external payable checkZero(msg.value) {
        IWETH(weth).deposit{value: msg.value}();
        uint256 boughtUsdc = _swap(weth, usdc, msg.value, swapData);
        uint256 lpReturn = _zapToLpInUsdc(boughtUsdc);
        if (lpReturn < minLpReturn) revert TooLessLP(lpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    // Function to increase the amount of XOLE using ETH
    // Similar to `zapToNewXoleInWETH` but increases the amount of an existing XOLE lock
    function zapToIncreaseXoleAmtInWETH(uint256 minLpReturn, bytes memory swapData) external payable checkZero(msg.value) {
        IWETH(weth).deposit{value: msg.value}();
        uint256 boughtUsdc = _swap(weth, usdc, msg.value, swapData);
        uint256 lpReturn = _zapToLpInUsdc(boughtUsdc);
        if (lpReturn < minLpReturn) revert TooLessLP(lpReturn);
        _increaseXoleAmount(lpReturn);
    }

    /*
     * @notice Zap a specified `supplyToken` to new XOLE, swap token to USDC and OLE, and finally to LP
     * @param supplyToken: is the address of the token to be supplied
     * @param supplyAmount: is the amount of `supplyToken` to be used
     * @param minLpReturn: specifies the minimum LP tokens expected to prevent slippage
     * @param unlockTime: specifies the lock duration for the XOLE tokens
     * @param swapData: contains the data required for swapping tokens (used in `_swap` function)
     */
    function zapToNewXoleInToken(
        address supplyToken,
        uint256 supplyAmount,
        uint256 minLpReturn,
        uint256 unlockTime,
        bytes memory swapData
    ) external checkZero(supplyAmount) {
        supplyAmount = IERC20(supplyToken).safeTransferIn(msg.sender, supplyAmount);
        uint256 boughtUsdc = _swap(supplyToken, usdc, supplyAmount, swapData);
        uint256 lpReturn = _zapToLpInUsdc(boughtUsdc);
        if (lpReturn < minLpReturn) revert TooLessLP(lpReturn);
        _createNewXole(lpReturn, unlockTime);
    }

    // Function to increase XOLE amount using a specified `supplyToken`
    // Similar to `_zapToNewXoleInToken` but for increasing XOLE amount
    function zapToIncreaseXoleAmtInToken(
        address supplyToken,
        uint256 supplyAmount,
        uint256 minLpReturn,
        bytes memory swapData
    ) external checkZero(supplyAmount) {
        supplyAmount = IERC20(supplyToken).safeTransferIn(msg.sender, supplyAmount);
        uint256 boughtUsdc = _swap(supplyToken, usdc, supplyAmount, swapData);
        uint256 lpReturn = _zapToLpInUsdc(boughtUsdc);
        if (lpReturn < minLpReturn) revert TooLessLP(lpReturn);
        _increaseXoleAmount(lpReturn);
    }

    /*
     * @notice Zap USDC and OLE in a specified ratio and finally to LP
     * @param `supplyUsdc` and `supplyOle` are the amounts of USDC and OLE to be provided by the sender,
               the ratio of USDC to OLE should reflect their current market price to maintain balance.
     * @param unlockTime: specifies the lock duration for the XOLE tokens
     */
    function zapToNewXoleOnBehalf(uint256 supplyUsdc, uint256 supplyOle, uint256 unlockTime) external {
        if (supplyUsdc == 0 || supplyOle == 0) revert InvalidAmount();
        IERC20(usdc).safeTransferIn(msg.sender, supplyUsdc);
        IERC20(ole).safeTransferIn(msg.sender, supplyOle);
        uint256 lpReturn = _zapToLpOnBehalf(supplyUsdc, supplyOle);
        _createNewXole(lpReturn, unlockTime);
    }

    // Function to increase XOLE amount by zapping USDC and OLE in a specified ratio and finally to LP
    // Similar to `zapToNewXoleOnBehalf` but for increasing XOLE amount
    function zapToIncreaseXoleAmtOnBehalf(uint256 supplyUsdc, uint256 supplyOle) external {
        if (supplyUsdc == 0 || supplyOle == 0) revert InvalidAmount();
        IERC20(usdc).safeTransferIn(msg.sender, supplyUsdc);
        IERC20(ole).safeTransferIn(msg.sender, supplyOle);
        uint256 lpReturn = _zapToLpOnBehalf(supplyUsdc, supplyOle);
        _increaseXoleAmount(lpReturn);
    }

    /********************** Zap OPPass ***********************/

    /*
     * @notice Zap ETH to OP Pass by converting ETH to WETH, then swap WETH to OLE, and finally to by Pass.
               It is important to note that the remaining ole will be returned to the caller
     * @param marketId: identifies the specific market for the OP Pass
     * @param shares: is the number of shares to purchase
     * @param swapData: contains the data required for swapping WETH to OLE
     */
    function zapToPassInWETH(uint256 marketId, uint256 shares, bytes memory swapData) external payable checkZero(msg.value) {
        IWETH(weth).deposit{value: msg.value}();
        uint256 boughtOle = _swap(weth, ole, msg.value, swapData);
        _buyPass(marketId, shares, boughtOle);
    }

    /*
     * @notice Function to zap a specific `supplyToken` to OP Pass by swap token to OLE, and finally to by Pass.
               It is important to note that the remaining ole will be returned to the caller
     * @param supplyToken: is the address of the token to be supplied
     * @param supplyAmount: is the amount of `supplyToken` to be used
     * @param marketId: identifies the specific market for the OP Pass
     * @param shares: is the number of shares to purchase
     * @param swapData: contains the data required for swapping WETH to OLE
     */
    function zapToPassInToken(
        uint256 marketId,
        address supplyToken,
        uint256 supplyAmount,
        uint256 shares,
        bytes memory swapData
    ) external checkZero(supplyAmount) {
        supplyAmount = IERC20(supplyToken).safeTransferIn(msg.sender, supplyAmount);
        uint256 boughtOle = _swap(supplyToken, ole, supplyAmount, swapData);
        _buyPass(marketId, shares, boughtOle);
    }

    /********************** Internal Functions ***********************/

    function _zapToLpInUsdc(uint256 _usdcAmount) internal returns (uint256 lpReturn) {
        // Half of the USDC is sold to swap for OLE
        (uint256 reserve0, uint256 reserve1,) = IUniV2ClassPair(pair).getReserves();
        uint256 usdcSell;
        if (usdc == IUniV2ClassPair(pair).token0()) {
            usdcSell = _calAmountToSwap(_usdcAmount, reserve0, reserve1);
        } else {
            usdcSell = _calAmountToSwap(_usdcAmount, reserve1, reserve0);
        }
        _approveMaxIfNeeded(usdc, routerUniV2Class, _usdcAmount);
        address[] memory path = new address[](2);
        path[0] = usdc;
        path[1] = ole;
        uint256[] memory swapReturn = IUniV2ClassRouter(routerUniV2Class).swapExactTokensForTokens(
            usdcSell,
            0,
            path,
            address(this),
            block.timestamp
        );
        return _zapToLpOnBehalf(_usdcAmount - usdcSell, swapReturn[1]);
    }

    function _zapToLpOnBehalf(uint256 _supplyUsdc, uint256 _supplyOle) internal returns (uint256 lpReturn) {
        _approveMaxIfNeeded(usdc, routerUniV2Class, _supplyUsdc);
        _approveMaxIfNeeded(ole, routerUniV2Class, _supplyOle);
        (,, lpReturn) = IUniV2ClassRouter(routerUniV2Class).addLiquidity(
            usdc,
            ole,
            _supplyUsdc,
            _supplyOle,
            0,
            0,
            address(this),
            block.timestamp
        );
    }

    /*
     * @notice Calculate how many token0 need to be swap to token1, making sure that the ratio of token0 to token1 is 1:1 after the swap.
     * @param _token0AmountIn: is the input amount of token0
     * @param `_reserve0` and `_reserve1` are the reserves of token0 and token1 in the pair
     * @return Returns the amount of token0 that should be swapped
     */
    function _calAmountToSwap(uint256 _token0AmountIn, uint256 _reserve0, uint256 _reserve1) internal view returns (uint256) {
        uint256 halfToken0Amount = _token0AmountIn / 2;
        uint256 nominator = IUniV2ClassRouter(routerUniV2Class).getAmountOut(halfToken0Amount, _reserve0, _reserve1);
        uint256 denominator = _quote(halfToken0Amount, _reserve0 + halfToken0Amount, _reserve1 - nominator);
        return _token0AmountIn - Math.sqrt((halfToken0Amount * halfToken0Amount * nominator) / denominator);
    }

    function _quote(uint256 _amountA, uint256 _reserveA, uint256 _reserveB) internal pure returns (uint256 _amountB) {
        _amountB = _amountA * _reserveB / _reserveA;
    }

    /*
     * @notice Swap tokens using the 1inch router
     * @param _sellToken: is the token being sold
     * @param _buyToken is the token being bought
     * @param _sellAmount is the amount of `_sellToken` to sell
     * @param _data swap data for the 1inch router
     * @return Returns the amount of `_buyToken` bought
     */
    function _swap(address _sellToken, address _buyToken, uint256 _sellAmount, bytes memory _data) internal returns (uint256) {
        _approveMaxIfNeeded(_sellToken, router1inch, _sellAmount);
        (bool success, bytes memory returnData) = router1inch.call(_data);
        assembly {
            if eq(success, 0) {
                revert(add(returnData, 0x20), returndatasize())
            }
        }
        return IERC20(_buyToken).balanceOf(address(this));
    }

    function _createNewXole(uint256 _lpAmount, uint256 _unlockTime) internal {
        _approveMaxIfNeeded(pair, xole, _lpAmount);
        IxOLE(xole).create_lock_for(msg.sender, _lpAmount, _unlockTime);
    }

    function _increaseXoleAmount(uint256 _lpAmount) internal {
        _approveMaxIfNeeded(pair, xole, _lpAmount);
        IxOLE(xole).increase_amount_for(msg.sender, _lpAmount);
    }

    function _buyPass(uint256 _marketId, uint256 _buyAmount, uint256 _maxSpendOle) internal {
        _approveMaxIfNeeded(ole, stageShare, _maxSpendOle);
//        IStageShare(stageShare).buyShares(_marketId, _buyAmount, msg.sender, _maxSpendOle, bytes('0x01'));
//        // returns the remaining ole to the msg.sender
//        uint oleBalance = IERC20(ole).balanceOf(address(this));
//        if (oleBalance > 0) {
//            IERC20(ole).transferOut(msg.sender, oleBalance);
//        }
    }

    function _approveMaxIfNeeded(address _token, address _spender, uint256 _amount) internal {
        if (IERC20(_token).allowance(address(this), _spender) < _amount) {
            IERC20(_token).safeApprove(_spender, type(uint).max);
        }
    }

    modifier checkZero(uint256 amount) {
        if (amount == 0) revert InvalidAmount();
        _;
    }

}
