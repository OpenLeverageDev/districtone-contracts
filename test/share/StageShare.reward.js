const {
  newOLE,
  newStageWithOle,
  price1,
  price2,
  FEE_DENOMINATOR,
  noRewardsError, getSign, clearOleBalance
} = require("./shareUtil");
const { BN, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const { web3, ethers } = require("hardhat");
const { expect } = require("chai");
contract("StageShare", function(accounts) {
  let shareCtr;
  let oleCtr;
  let stageId = new BN(1);
  let notExistStageId = new BN(2);
  let owner = accounts[0];
  let trader = accounts[1];
  let treasury = accounts[2];
  let issuer;
  let sign;
  let signTimeStamp;

  let maxInAmount = web3.utils.toWei("10000");
  let minOutAmount = web3.utils.toWei("0");
  let protocolFee = new BN(100);
  let holderFee = new BN(500);

  beforeEach(async () => {
    oleCtr = await newOLE(owner);
    [issuer] = await ethers.getSigners();
    shareCtr = await newStageWithOle(oleCtr.address, issuer.address, owner);
    await shareCtr.createStage({ from: owner });
    await shareCtr.setFees(protocolFee, holderFee, { from: owner });
    await shareCtr.setProtocolFeeDestination(treasury, { from: owner });
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: owner });
    let signInfo = await getSign(issuer, trader);
    sign = signInfo[0];
    signTimeStamp = signInfo[1];
    await oleCtr.mint(trader, maxInAmount);
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: trader });
  });

  describe("get reward", function() {
    it("reward change after buy shares", async () => {
      await shareCtr.buyShares(stageId, new BN(1), await shareCtr.getBuyPriceWithFees(stageId, 1), signTimeStamp, sign, { from: trader });
      expect(await shareCtr.rewardPerShareStored(stageId)).to.equal(ethers.parseEther("5055000000000000000"));
      expect(await shareCtr.getRewards([stageId], owner)).to.equal(ethers.parseEther("5.055"));
    });

    it("reward is 0 after buy shares", async () => {
      await shareCtr.setFees(0, 0, { from: owner });
      await shareCtr.buyShares(stageId, new BN(1), price1, signTimeStamp, sign, { from: trader });
      expect(await shareCtr.getRewards([stageId], trader)).to.bignumber.eq(new BN(0));
    });

    it("reward is 0 if share not exists", async () => {
      expect(await shareCtr.getRewards([notExistStageId], owner)).to.bignumber.eq(new BN(0));
    });

    it("reward is 0 if account is inactive", async () => {
      expect(await shareCtr.getRewards([notExistStageId], trader)).to.bignumber.eq(new BN(0));
    });

    it("seller reward is 0 and holders reward increases after sell 1 share hold 0 share", async () => {
      await shareCtr.buyShares(stageId, new BN(1), await shareCtr.getBuyPriceWithFees(stageId, 1), signTimeStamp, sign, { from: trader });
      await shareCtr.sellShares(stageId, new BN(1), minOutAmount, { from: trader });
      let reward = price1.mul(holderFee).muln(2).div(FEE_DENOMINATOR);
      expect(await shareCtr.getRewards([stageId], trader)).to.bignumber.eq(new BN(0));
      expect(await shareCtr.getRewards([stageId], owner)).to.bignumber.eq(reward);
    });

    it("seller and holders reward increases after sell 1 share and hold 1 share", async () => {
      await shareCtr.buyShares(stageId, new BN(2), await shareCtr.getBuyPriceWithFees(stageId, 2), signTimeStamp, sign, { from: trader });
      let buyReward = price1.add(price2).mul(holderFee).div(FEE_DENOMINATOR);
      await shareCtr.sellShares(stageId, new BN(1), minOutAmount, { from: trader });
      let sellReward = price2.mul(holderFee).div(FEE_DENOMINATOR).divn(2);
      expect(await shareCtr.getRewards([stageId], trader)).to.bignumber.eq(sellReward);
      expect(await shareCtr.getRewards([stageId], owner)).to.bignumber.eq(buyReward.add(sellReward));
    });

  });

  describe("withdraw reward", function() {
    let traderReward;
    beforeEach(async () => {
      await shareCtr.buyShares(stageId, new BN(2), await shareCtr.getBuyPriceWithFees(stageId, 2), signTimeStamp, sign, { from: trader });
      await shareCtr.sellShares(stageId, new BN(1), minOutAmount, { from: trader });
      traderReward = price2.mul(holderFee).div(FEE_DENOMINATOR).divn(2);
    });

    it("withdraw 1 token reward emit event", async () => {
      let txReceipt = await shareCtr.withdrawRewards([stageId], { from: trader });
      expectEvent(txReceipt, "WithdrawReward", {
        holder: trader,
        stageId: stageId,
        reward: traderReward
      });
    });

    it("reward is 0 after withdrew reward", async () => {
      await shareCtr.withdrawRewards([stageId], { from: trader });
      expect(await shareCtr.getRewards([stageId], trader)).to.bignumber.eq(new BN(0));
    });

    it("account reward token balance increases after withdrew reward", async () => {
      await clearOleBalance(oleCtr, trader);
      await shareCtr.withdrawRewards([stageId], { from: trader });
      expect(await oleCtr.balanceOf(trader)).to.bignumber.eq(traderReward);
    });

    it("repeated withdrawals of the same stageId", async () => {
      await expectRevert(
        shareCtr.withdrawRewards([stageId, stageId], { from: trader }),
        noRewardsError
      );
    });

    it("fails if reward is 0", async () => {
      await expectRevert(
        shareCtr.withdrawRewards([stageId], { from: treasury }),
        noRewardsError
      );
    });

  });


});