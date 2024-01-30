// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import {ISOLE} from "../common/ISOLE.sol";
import {IERC20} from "@openzeppelin-5/contracts/token/ERC20/IERC20.sol";
import {Erc20Utils} from "../common/Erc20Utils.sol";

contract MockSOLE is ISOLE {
    using Erc20Utils for IERC20;

    uint256 constant WEEK = 7 * 86400; // all future times are rounded by week
    uint256 constant MAXTIME = 4 * 365 * 86400; // 4 years

    int128 constant DEPOSIT_FOR_TYPE = 0;
    int128 constant CREATE_LOCK_TYPE = 1;
    int128 constant INCREASE_LOCK_AMOUNT = 2;
    int128 constant INCREASE_UNLOCK_TIME = 3;

    IERC20 public oleLpStakeToken;
    mapping(address => uint256) private _balances;
    mapping(address => LockedBalance) public locked;

    uint256 public totalLocked;
    uint256 public totalSupply;

    event Deposit(address indexed provider, uint256 value, uint256 unlocktime, int128 type_, uint256 prevBalance, uint256 balance);

    event Withdraw(address indexed provider, uint256 value, uint256 prevBalance, uint256 balance);

    struct LockedBalance {
        uint256 amount;
        uint256 end;
    }

    constructor(address _oleLpStakeToken) {
        oleLpStakeToken = IERC20(_oleLpStakeToken);
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function create_lock_for(address to, uint256 _value, uint256 _unlock_time) external override {
        uint256 unlock_time = create_lock_check(to, _value, _unlock_time);
        _deposit_for(to, _value, unlock_time, locked[to], CREATE_LOCK_TYPE);
    }

    function increase_amount_for(address to, uint256 _value) external override {
        LockedBalance memory _locked = increase_amount_check(to, _value);
        _deposit_for(to, _value, 0, _locked, INCREASE_LOCK_AMOUNT);
    }

    function increase_unlock_time(uint256 _unlock_time) external override {
        LockedBalance memory _locked = locked[msg.sender];
        // Locktime is rounded down to weeks
        uint256 unlock_time = (_unlock_time / WEEK) * WEEK;
        require(_locked.amount > 0, "Nothing is locked");
        require(unlock_time > _locked.end, "Can only increase lock duration");
        require(unlock_time >= block.timestamp + (2 * WEEK), "Can only lock until time in the future");
        require(unlock_time <= block.timestamp + MAXTIME, "Voting lock can be 4 years max");
        _deposit_for(msg.sender, 0, unlock_time, _locked, INCREASE_UNLOCK_TIME);
    }

    function withdraw() external override {
        _withdraw_for(msg.sender, msg.sender);
    }

    function increase_amount_check(address to, uint256 _value) internal view returns (LockedBalance memory _locked) {
        _locked = locked[to];
        require(_value > 0, "need non - zero value");
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");
    }

    function create_lock_check(address to, uint256 _value, uint256 _unlock_time) internal view returns (uint unlock_time) {
        // Locktime is rounded down to weeks
        unlock_time = (_unlock_time / WEEK) * WEEK;
        LockedBalance memory _locked = locked[to];
        require(_value > 0, "Non zero value");
        require(_locked.amount == 0, "Withdraw old tokens first");
        require(unlock_time >= block.timestamp + (2 * WEEK), "Can only lock until time in the future");
        require(unlock_time <= block.timestamp + MAXTIME, "Voting lock can be 4 years max");
    }

    function _deposit_for(address _addr, uint256 _value, uint256 unlock_time, LockedBalance memory _locked, int128 _type) internal {
        _locked.amount = _locked.amount + _value;
        if (totalLocked > _value) {
            totalLocked = totalLocked - _value;
        }
        if (totalSupply > _value) {
            totalSupply = totalSupply - _value;
        }
        uint256 prevBalance = _balances[_addr];
        if (unlock_time != 0) {
            _locked.end = unlock_time;
        }
        locked[_addr] = _locked;
        if (_value != 0) {
            oleLpStakeToken.safeTransferFrom(msg.sender, address(this), _value);
            _balances[_addr] = _balances[_addr] + _value;
        }
        emit Deposit(_addr, _value, _locked.end, _type, prevBalance, _balances[_addr]);
    }

    function _withdraw_for(address owner, address to) internal {
        LockedBalance memory _locked = locked[owner];
        require(_locked.amount > 0, "Nothing to withdraw");
        uint256 prevBalance = _balances[owner];
        uint256 value = _locked.amount;
        totalLocked = totalLocked - value;
        _locked.end = 0;
        _locked.amount = 0;
        locked[to] = _locked;
        oleLpStakeToken.safeTransferIn(to, value);
        _balances[owner] = _balances[owner] - value;
        totalSupply = totalSupply - value;
        emit Withdraw(owner, value, prevBalance, _balances[owner]);
    }

    function mint(address addr, uint amount) external {
        _balances[addr] = amount;
    }
}
