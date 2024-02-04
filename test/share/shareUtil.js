const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { web3 } = require("hardhat");
const { toBN, hexStringToArray } = require("../util/EtheUtil");
const SpaceShare = artifacts.require("SpaceShare.sol");
const MockToken = artifacts.require("MockToken");
const { AbiCoder, ethers } = require("ethers");

let notOwnerError = "OwnableUnauthorizedAccount";
let invalidParamError = "InvalidParam";
let zeroAddressError = "ZeroAddress";
let zeroAmountError = "ZeroAmount";
let spaceNotExistsError = "SpaceNotExists";
let insufficientInAmountError = "InsufficientInAmount";
let insufficientOutAmountError = "InsufficientOutAmount";
let insufficientSharesError = "InsufficientShares";
let arithmeticError = "Arithmetic";
let noRewardsError = "NoRewards";
let notSellLastShareError = "CannotSellLastShare";
let invalidSignatureError = "InvalidSignature";
let expiredSignatureError = "Signature is expired";
let K = toBN(web3.utils.toWei("1.1", "ether"));
let B = toBN(web3.utils.toWei("100", "ether"));
let price1 = K.add(B);
let price2 = toBN(2).mul(K).add(B);
let price3 = toBN(3).mul(K).add(B);
let FEE_DENOMINATOR = toBN(10000);

const newSpaceShare = async (owner) => {
  return await SpaceShare.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, 0, { from: owner });
};

const newOLE = async (owner) => {
  return await MockToken.new("ole", "ole", toBN(web3.utils.toWei("1000000000", "ether")), { from: owner });
};
const newSpaceShareWithOle = async (ole, issuer, owner) => {
  return await SpaceShare.new(ole, issuer, 3000, K, B, { from: owner });
};

const getSign = async (signer, trader) => {
  let timestamp = (await web3.eth.getBlock("latest")).timestamp;
  let sign;
  await signer.signMessage(hexStringToArray(ethers.solidityPackedKeccak256(["address", "uint256"], [trader, timestamp]))).then(result => {
    sign = result;
  });
  return [sign, timestamp];
};

const clearOleBalance = async (ole, account) => {
  await ole.burn(account, await ole.balanceOf(account));
};

module.exports = {
  newSpace: newSpaceShare,
  newOLE,
  getSign,
  newSpaceWithOle: newSpaceShareWithOle,
  clearOleBalance,
  K,
  B,
  notOwnerError,
  invalidParamError,
  zeroAddressError,
  price1,
  price2,
  price3,
  zeroAmountError,
  spaceNotExistsError,
  insufficientInAmountError,
  FEE_DENOMINATOR,
  notSellLastShareError,
  insufficientOutAmountError,
  insufficientSharesError,
  arithmeticError,
  noRewardsError,
  invalidSignatureError,
  expiredSignatureError
};



