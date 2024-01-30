// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.21;

import {IOptimismMintableERC20, IERC165} from "./blast/IOptimismMintableERC20.sol";
import {BlastAdapter} from "./BlastAdapter.sol";
import {OFT} from "@layerzerolabs/solidity-examples/contracts/token/oft/OFT.sol";
import {PausableOFT} from "@layerzerolabs/solidity-examples/contracts/token/oft/extension/PausableOFT.sol";
import {IBlast} from "./blast/IBlast.sol";

/**
 * @title BlastOLE
 * @dev This contract is designed for the Ethereum Layer 2 solution, Optimism, and integrates LayerZero's Omnichain Fungible Token (OFT) functionality.
 */
contract BlastOLE is IOptimismMintableERC20, PausableOFT {
    address public immutable REMOTE_TOKEN;
    address public immutable BRIDGE;

    event Mint(address indexed account, uint256 amount);

    modifier onlyBridge() {
        require(msg.sender == BRIDGE, "only bridge can mint and burn");
        _;
    }

    /// @param _bridge      Address of the L2 standard bridge.
    /// @param _remoteToken Address of the corresponding L1 token.
    /// @param _name        ERC20 name.
    /// @param _symbol      ERC20 symbol.
    /// @param _lzEndpoint  LayerZero endpoint
    constructor(
        address _bridge,
        address _remoteToken,
        string memory _name,
        string memory _symbol,
        address _lzEndpoint
    ) PausableOFT(_name, _symbol, _lzEndpoint) {
        REMOTE_TOKEN = _remoteToken;
        BRIDGE = _bridge;
    }

    /// @custom:legacy
    /// @notice Legacy getter for REMOTE_TOKEN.
    function remoteToken() external view override returns (address) {
        return REMOTE_TOKEN;
    }

    /// @custom:legacy
    /// @notice Legacy getter for BRIDGE.
    function bridge() external view override returns (address) {
        return BRIDGE;
    }

    /// @notice ERC165 interface check function.
    /// @param _interfaceId Interface ID to check.
    /// @return Whether or not the interface is supported by this contract.
    function supportsInterface(bytes4 _interfaceId) public view override(IERC165, OFT) returns (bool) {
        // Interface corresponding to the updated OptimismMintableERC20 (this contract).
        return _interfaceId == type(IOptimismMintableERC20).interfaceId || OFT.supportsInterface(_interfaceId);
    }

    /// @notice Allows the StandardBridge on this network to mint tokens.
    /// @param _to     Address to mint tokens to.
    /// @param _amount Amount of tokens to mint.
    function mint(address _to, uint256 _amount) external override(IOptimismMintableERC20) onlyBridge {
        _mint(_to, _amount);
        emit Mint(_to, _amount);
    }

    function burn(address account, uint256 _amount) external override(IOptimismMintableERC20) onlyBridge {
        account;
        _amount;
        revert("cannot be withdrawn");
    }

    function burn(uint256 _amount) external {
        _burn(_msgSender(), _amount);
    }

    function enableClaimable(address gov) public onlyOwner {
        IBlast(0x4300000000000000000000000000000000000002).configure(IBlast.YieldMode.CLAIMABLE, IBlast.GasMode.CLAIMABLE, gov);
    }
}
