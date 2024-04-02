const {
  newOLE,
  newSpaceWithOleV2,
  price1,
  price2,
  noRewardsError, getSign, clearOleBalance
} = require("./shareUtil");
const { BN, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const { web3, ethers } = require("hardhat");
const { expect } = require("chai");
const { hexStringToArray } = require("../util/EtheUtil");
contract("SpaceShareV2.sol", function(accounts) {
  let shareCtr;
  let oleCtr;
  let spaceId = new BN(3001);
  let notExistSpaceId = new BN(2);
  let owner = accounts[0];
  let trader = accounts[1];
  let trader2 = accounts[5];
  let treasury = accounts[2];
  let issuer;
  let maxInAmount = web3.utils.toWei("10000");
  let minOutAmount = web3.utils.toWei("0");
  let protocolFee = new BN(1);
  let holderFee = new BN(5);

  beforeEach(async () => {
    oleCtr = await newOLE(owner);
    [issuer] = await ethers.getSigners();
    shareCtr = await newSpaceWithOleV2(oleCtr.address, issuer.address, owner);
    await shareCtr.createSpace({ from: owner });
    await shareCtr.setFees(protocolFee, holderFee, { from: owner });
    await shareCtr.setProtocolFeeDestination(treasury, { from: owner });
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: owner });
    await oleCtr.mint(trader, maxInAmount);
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: trader });
  });

  describe("get reward", function() {
    it("reward change after buy shares", async () => {
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), await shareCtr.getBuyPriceWithFees(spaceId, 1), buySign[1], buySign[0], { from: trader });
      expect(await shareCtr.rewardPerShareStored(spaceId)).to.equal(ethers.parseEther("5055000000000000000"));
      expect(await shareCtr.getRewards([spaceId], owner)).to.equal(ethers.parseEther("5.055"));
    });

    it("reward is 0 after buy shares", async () => {
      await shareCtr.setFees(0, 0, { from: owner });
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), price1, buySign[1], buySign[0], { from: trader });
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(new BN(0));
    });

    it("reward is 0 if share not exists", async () => {
      expect(await shareCtr.getRewards([notExistSpaceId], owner)).to.bignumber.eq(new BN(0));
    });

    it("reward is 0 if account is inactive", async () => {
      expect(await shareCtr.getRewards([notExistSpaceId], trader)).to.bignumber.eq(new BN(0));
    });

    it("seller reward is 0 and holders reward increases after sell 1 share hold 0 share", async () => {
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), await shareCtr.getBuyPriceWithFees(spaceId, 1), buySign[1], buySign[0], { from: trader });
      let sellSign = await signSell(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, sellSign[1], sellSign[0], { from: trader });
      let reward = price1.mul(holderFee).muln(2).div(new BN(100));
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(new BN(0));
      expect(await shareCtr.getRewards([spaceId], owner)).to.bignumber.eq(reward);
    });

    it("seller reward is not 0 after sell 1 share 2 times", async () => {
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.buyShares(spaceId, new BN(2), await shareCtr.getBuyPriceWithFees(spaceId, 2), buySign[1], buySign[0], { from: trader });
      let sellSign = await signSell(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, sellSign[1], sellSign[0], { from: trader });
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, sellSign[1], sellSign[0], { from: trader });
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(price2.mul(holderFee).div(new BN(100)).divn(2));
    });

    it("seller and holders reward increases after sell 1 share and hold 1 share", async () => {
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.buyShares(spaceId, new BN(2), await shareCtr.getBuyPriceWithFees(spaceId, 2), buySign[1], buySign[0], { from: trader });
      let buyReward = price1.add(price2).mul(holderFee).div(new BN(100));
      let sellSign = await signSell(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, sellSign[1], sellSign[0], { from: trader });
      let sellReward = price2.mul(holderFee).div(new BN(100)).divn(2);
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(sellReward);
      expect(await shareCtr.getRewards([spaceId], owner)).to.bignumber.eq(buyReward.add(sellReward));
    });

    it("reward is 0 after the holder fee changed 0%", async () => {
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), await shareCtr.getBuyPriceWithFees(spaceId, 1), buySign[1], buySign[0], { from: trader });
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(new BN(0));
      await shareCtr.buyShares(spaceId, new BN(1), await shareCtr.getBuyPriceWithFees(spaceId, 1), buySign[1], buySign[0], { from: trader });
      let trader1Reward = price2.mul(holderFee).divn(2).div(new BN(100));
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(trader1Reward);
      await oleCtr.mint(trader2, maxInAmount);
      await oleCtr.approve(shareCtr.address, maxInAmount, { from: trader2 });
      await shareCtr.setFees(protocolFee, 0, { from: owner });

      let buySign2 = await signBuy(issuer, trader2, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), await shareCtr.getBuyPriceWithFees(spaceId, 1), buySign2[1], buySign2[0], { from: trader2 });
      expect(await shareCtr.getRewards([spaceId], trader2)).to.bignumber.eq(new BN(0));
    });
  });

  describe("withdraw reward", function() {
    let traderReward;
    beforeEach(async () => {
      let buySign = await signBuy(issuer, trader, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.buyShares(spaceId, new BN(2), await shareCtr.getBuyPriceWithFees(spaceId, 2), buySign[1], buySign[0], { from: trader });
      let sellSign = await signSell(issuer, trader, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, sellSign[1], sellSign[0], { from: trader });
      traderReward = price2.mul(holderFee).div(new BN(100)).divn(2);
    });

    it("withdraw 1 token reward emit event", async () => {
      let txReceipt = await shareCtr.withdrawRewards([spaceId], { from: trader });
      expectEvent(txReceipt, "WithdrawReward", {
        holder: trader,
        spaceId: spaceId,
        reward: traderReward
      });
    });

    it("withdraw rewards for 2 spaceIds", async () => {
      await shareCtr.createSpace({ from: owner });
      let space2Id = 3002;
      let buySign = await signBuy(issuer, trader, space2Id, new BN(2).toNumber());
      await shareCtr.buyShares(space2Id, new BN(2), await shareCtr.getBuyPriceWithFees(spaceId, 2), buySign[1], buySign[0], { from: trader });
      let reward = await shareCtr.getRewards([spaceId, space2Id], owner);
      let preOleBalance = new BN(await oleCtr.balanceOf(owner));
      await shareCtr.withdrawRewards([spaceId, space2Id], { from: owner });
      let returnsReward = new BN(await oleCtr.balanceOf(owner)).sub(preOleBalance);
      expect(returnsReward).to.eq(new BN(reward));
      expect(await shareCtr.getRewards([spaceId, space2Id], owner)).to.bignumber.eq(new BN(0));
    });

    it("reward is 0 after withdrew reward", async () => {
      await shareCtr.withdrawRewards([spaceId], { from: trader });
      expect(await shareCtr.getRewards([spaceId], trader)).to.bignumber.eq(new BN(0));
    });

    it("account reward token balance increases after withdrew reward", async () => {
      await clearOleBalance(oleCtr, trader);
      await shareCtr.withdrawRewards([spaceId], { from: trader });
      expect(await oleCtr.balanceOf(trader)).to.bignumber.eq(traderReward);
    });

    it("repeated withdrawals of the same spaceId", async () => {
      await expectRevert(
        shareCtr.withdrawRewards([spaceId, spaceId], { from: trader }),
        noRewardsError
      );
    });

    it("fails if reward is 0", async () => {
      await expectRevert(
        shareCtr.withdrawRewards([spaceId], { from: treasury }),
        noRewardsError
      );
    });

  });

  async function signBuy(issuer, user, spaceId, shares) {
    let sign;
    let timestamp = (await web3.eth.getBlock("latest")).timestamp;
    await issuer.signMessage(hexStringToArray(ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "uint256", "bool"],
      [user, timestamp, spaceId, shares, true]))).then(result => {
      sign = result;
    });
    return [sign, timestamp];
  }

  async function signSell(issuer, user, spaceId, shares) {
    let sign;
    let timestamp = (await web3.eth.getBlock("latest")).timestamp;
    await issuer.signMessage(hexStringToArray(ethers.solidityPackedKeccak256(["address", "uint256", "uint256", "uint256", "bool"],
      [user, timestamp, spaceId, shares, false]))).then(result => {
      sign = result;
    });
    return [sign, timestamp];
  }

});