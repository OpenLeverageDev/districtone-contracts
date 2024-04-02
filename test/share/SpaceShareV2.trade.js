const {
  newOLE,
  newSpaceWithOleV2, price1, price2, zeroAmountError, spaceNotExistsError,
  insufficientInAmountError, notSellLastShareError,
  insufficientOutAmountError, insufficientSharesError, price3, arithmeticError, getSign, clearOleBalance
} = require("./shareUtil");
const { expectEvent, BN, expectRevert } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { web3, ethers } = require("hardhat");
const { hexStringToArray } = require("../util/EtheUtil");
contract("SpaceShareV2.sol", function(accounts) {

  let shareCtr;
  let oleCtr;
  let owner = accounts[0];
  let acc1 = accounts[3];
  let acc2 = accounts[4];
  let treasury = accounts[9];

  let creatorInitShare = new BN(1);
  let spaceId = new BN(3001);
  let notExistSpaceId = spaceId.addn(2);
  let maxInAmount = web3.utils.toWei("10000");
  let minOutAmount = web3.utils.toWei("0");
  let protocolFee = new BN(1);
  let holderFee = new BN(5);

  let issuer;
  beforeEach(async () => {
    oleCtr = await newOLE(owner);
    [issuer] = await ethers.getSigners();
    shareCtr = await newSpaceWithOleV2(oleCtr.address, issuer.address, owner);
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: owner });
    await oleCtr.mint(acc1, maxInAmount);
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: acc1 });
    await oleCtr.mint(acc2, maxInAmount);
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: acc2 });
  });

  describe("create space", function() {
    let txReceipt;
    beforeEach(async () => {
      txReceipt = await shareCtr.createSpace({ from: owner });
    });

    it("create space emit event", async () => {
      expectEvent(txReceipt, "SpaceCreated", {
        spaceId: spaceId, creator: owner
      });
      expectEvent(txReceipt, "Trade", {
        spaceId: spaceId, trader: owner, isBuy: true, shares: creatorInitShare, price: new BN(0),
        protocolFee: new BN(0), holderFee: new BN(0), supply: creatorInitShare
      });
    });

    it("creator balance and total supply will change after create space", async () => {
      expect(await shareCtr.sharesSupply(spaceId)).to.bignumber.eq(creatorInitShare);
      expect(await shareCtr.sharesBalance(spaceId, owner)).to.bignumber.eq(creatorInitShare);
    });
  });

  describe("buy shares", function() {
    beforeEach(async () => {
      await shareCtr.createSpace({ from: owner });
    });

    it("buy shares emit event", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      let txReceipt = await shareCtr.buyShares(spaceId, new BN(1), price1, signInfo[1], signInfo[0], { from: acc1 });
      expectEvent(txReceipt, "Trade", {
        spaceId: spaceId, trader: acc1, isBuy: true, shares: creatorInitShare, price: price1,
        protocolFee: new BN(0), holderFee: new BN(0), supply: new BN(2)
      });
    });

    it("account balance change after buy 1 share", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), price1, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.sharesSupply(spaceId)).to.bignumber.eq(new BN(2));
      expect(await shareCtr.sharesBalance(spaceId, acc1)).to.bignumber.eq(new BN(1));
    });

    it("account balance change after buy 2 shares", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.buyShares(spaceId, new BN(2), price1.add(price2), signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.sharesSupply(spaceId)).to.bignumber.eq(new BN(3));
      expect(await shareCtr.sharesBalance(spaceId, acc1)).to.bignumber.eq(new BN(2));
    });

    it("account can buy shares more times", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), price1, signInfo[1], signInfo[0], { from: acc1 });
      await shareCtr.buyShares(spaceId, new BN(1), price2, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.sharesSupply(spaceId)).to.bignumber.eq(new BN(3));
      expect(await shareCtr.sharesBalance(spaceId, acc1)).to.bignumber.eq(new BN(2));
    });

    it("share can buy by several accounts", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      let signInfo2 = await signBuy(issuer, acc2, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), price1, signInfo[1], signInfo[0], { from: acc1 });
      await shareCtr.buyShares(spaceId, new BN(1), price2, signInfo2[1], signInfo2[0], { from: acc2 });
      expect(await shareCtr.sharesSupply(spaceId)).to.bignumber.eq(new BN(3));
    });

    it("buy shares will collect fee", async () => {
      await shareCtr.setFees(protocolFee, holderFee, { from: owner });
      await shareCtr.setProtocolFeeDestination(treasury, { from: owner });
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), await shareCtr.getBuyPriceWithFees(spaceId, 1), signInfo[1], signInfo[0], { from: acc1 });
      expect(await oleCtr.balanceOf(treasury)).to.bignumber.eq(protocolFee.mul(price1).divn(100));
    });

    it("buy shares to other", async () => {
      let signInfo = await signBuy(issuer, acc2, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buySharesTo(spaceId, new BN(1), price1, signInfo[1], signInfo[0], acc2, { from: acc1 });
      expect(await shareCtr.sharesBalance(spaceId, acc2)).to.bignumber.eq(new BN(1));
    });

    it("fails if input share amount is 0 ", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(0).toNumber());
      await expectRevert(
        shareCtr.buyShares(spaceId, new BN(0), price1, signInfo[1], signInfo[0], { from: acc1 }),
        zeroAmountError
      );
    });

    it("fails if share not exists", async () => {
      let signInfo = await signBuy(issuer, acc1, notExistSpaceId.toNumber(), new BN(1).toNumber());

      await expectRevert(
        shareCtr.buyShares(notExistSpaceId, new BN(1), price1, signInfo[1], signInfo[0], { from: acc1 }),
        spaceNotExistsError
      );
    });

    it("fails if max in amount not enough", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await expectRevert(
        shareCtr.buyShares(spaceId, new BN(1), price1.subn(1), signInfo[1], signInfo[0], { from: acc1 }),
        insufficientInAmountError
      );
    });
  });

  describe("sell shares", function() {
    let acc1InitShares = new BN(2);
    beforeEach(async () => {
      await shareCtr.createSpace({ from: owner });
      await shareCtr.setFees(protocolFee, holderFee, { from: owner });
      await shareCtr.setProtocolFeeDestination(treasury, { from: owner });
      await oleCtr.approve(shareCtr.address, maxInAmount);
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), acc1InitShares.toNumber());
      await shareCtr.buyShares(spaceId, acc1InitShares, maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
    });

    it("sell shares emit event", async () => {
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      let txReceipt = await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      expectEvent(txReceipt, "Trade", {
        spaceId: spaceId, trader: acc1, isBuy: false, shares: new BN(1), price: price2,
        protocolFee: protocolFee.mul(price2).divn(new BN(100)),
        holderFee: holderFee.mul(price2).divn(new BN(100)),
        supply: new BN(2)
      });
    });

    it("account balance change after sell 1 share", async () => {
      await clearOleBalance(oleCtr, acc1);
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.sharesSupply(spaceId)).to.bignumber.eq(new BN(2));
      expect(await shareCtr.sharesBalance(spaceId, acc1)).to.bignumber.eq(new BN(1));
      expect(await oleCtr.balanceOf(acc1)).to.bignumber.eq(price2.mul(new BN(100).sub(protocolFee).sub(holderFee))
        .div(new BN(100)));
    });

    it("account balance change after sell 2 share", async () => {
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(2), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.sharesBalance(spaceId, acc1)).to.bignumber.eq(new BN(0));
    });

    it("account can sell shares more times", async () => {
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.sharesBalance(spaceId, acc1)).to.bignumber.eq(new BN(0));
    });

    it("sell shares will collect fee", async () => {
      let preBalance = new BN(await oleCtr.balanceOf(treasury));
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(new BN(await oleCtr.balanceOf(treasury)).sub(preBalance)).to.bignumber.eq(protocolFee.mul(price2).divn(new BN(100)));
    });

    it("sell shares with holder fee is 0", async () => {
      await shareCtr.setFees(protocolFee, new BN(0), { from: owner });
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
    });

    it("fails if input share amount is 0 ", async () => {
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(0).toNumber());
      await expectRevert(
        shareCtr.sellSharesV2(spaceId, new BN(0), minOutAmount, signInfo[1], signInfo[0], { from: acc1 }),
        zeroAmountError
      );
    });

    it("fails if share not exists", async () => {
      let signInfo = await signSell(issuer, acc1, notExistSpaceId.toNumber(), new BN(1).toNumber());
      await expectRevert(
        shareCtr.sellSharesV2(notExistSpaceId, new BN(1), minOutAmount, signInfo[1], signInfo[0], { from: acc1 }),
        spaceNotExistsError
      );
    });

    it("fails if returns lt min out amount", async () => {
      let min = price2.mul(new BN(100).sub(protocolFee).sub(holderFee))
        .div(new BN(100)).addn(1);
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await expectRevert(
        shareCtr.sellSharesV2(spaceId, new BN(1), min, signInfo[1], signInfo[0], { from: acc1 }),
        insufficientOutAmountError
      );
    });

    it("fails if sell amount exceeds balance", async () => {
      let signInfo = await signSell(issuer, owner, spaceId.toNumber(), new BN(2).toNumber());
      await expectRevert(
        shareCtr.sellSharesV2(spaceId, new BN(2), minOutAmount, signInfo[1], signInfo[0], { from: owner }),
        insufficientSharesError
      );
    });

    it("fails if sell the last share", async () => {
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(2), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      let signInfo2 = await signSell(issuer, owner, spaceId.toNumber(), new BN(1).toNumber());
      await expectRevert(
        shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo2[1], signInfo2[0], { from: owner }),
        notSellLastShareError
      );
    });

    it("fails if sell the last share", async () => {
      let signInfo = await signSell(issuer, acc1, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.sellSharesV2(spaceId, new BN(2), minOutAmount, signInfo[1], signInfo[0], { from: acc1 });
      let signInfo2 = await signSell(issuer, owner, spaceId.toNumber(), new BN(1).toNumber());
      await expectRevert(
        shareCtr.sellSharesV2(spaceId, new BN(1), minOutAmount, signInfo2[1], signInfo2[0], { from: owner }),
        notSellLastShareError
      );
    });

  });

  describe("exit space", function() {
    let acc1InitShares = new BN(2);
    beforeEach(async () => {
      await shareCtr.createSpace({ from: owner });
      await shareCtr.setFees(protocolFee, holderFee, { from: owner });
      await shareCtr.setProtocolFeeDestination(treasury, { from: owner });
      await oleCtr.approve(shareCtr.address, maxInAmount);
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), acc1InitShares.toNumber());
      await shareCtr.buyShares(spaceId, acc1InitShares, maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
    });

    it("exit success", async () => {
      let oleBySell = new BN(await shareCtr.getSellPriceWithFees(spaceId, 1));
      let oleByReward = new BN(await shareCtr.getRewards([spaceId], owner));
      let oleByExit = oleBySell.add(oleByReward);
      let preOleBalance = new BN(await oleCtr.balanceOf(owner));
      await shareCtr.exitSpace(spaceId, 0);
      expect(await oleCtr.balanceOf(owner)).to.bignumber.eq(preOleBalance.add(oleByExit));
    });

  });

  describe("get price", function() {
    beforeEach(async () => {
      await shareCtr.createSpace({ from: owner });
      await oleCtr.approve(shareCtr.address, maxInAmount);
      await shareCtr.setFees(protocolFee, holderFee, { from: owner });
      await shareCtr.setProtocolFeeDestination(treasury, { from: owner });
    });

    it("the first share price is 0", async () => {
      let price0 = await shareCtr.getBuyPrice(notExistSpaceId, 1);
      expect(price0).to.bignumber.eq(new BN(0));
    });

    it("get buy price from 1 to 2", async () => {
      expect(await shareCtr.getBuyPrice(spaceId, 1)).to.bignumber.eq(price1);
    });

    it("get buy price from 2 to 4", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.getBuyPrice(spaceId, 2)).to.bignumber.eq(price2.add(price3));
    });

    it("get buy price from 0 to 2", async () => {
      expect(await shareCtr.getBuyPrice(notExistSpaceId, 2)).to.bignumber.eq(price1);
    });

    it("get buy price from 0 to 3", async () => {
      expect(await shareCtr.getBuyPrice(notExistSpaceId, 3)).to.bignumber.eq(price1.add(price2));
    });

    it("get buy price from 0 to 4", async () => {
      expect(await shareCtr.getBuyPrice(notExistSpaceId, 4)).to.bignumber.eq(price1.add(price2).add(price3));
    });

    it("get sell price from 2 to 1", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.getSellPrice(spaceId, 1)).to.bignumber.eq(price1);
    });

    it("get sell price from 2 to 0", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.getSellPrice(spaceId, 2)).to.bignumber.eq(price1);
    });

    it("get sell price from 4 to 2", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
      let signInfo2 = await signBuy(issuer, acc2, spaceId.toNumber(), new BN(2).toNumber());
      await shareCtr.buyShares(spaceId, new BN(2), maxInAmount, signInfo2[1], signInfo2[0], { from: acc2 });
      expect(await shareCtr.getSellPrice(spaceId, 2)).to.bignumber.eq(price2.add(price3));
    });

    it("fails if get sell price from 2 to 0", async () => {
      await expectRevert(
        shareCtr.getSellPrice(notExistSpaceId, 2),
        arithmeticError
      );
    });

    it("get sell price with fees", async () => {
      let signInfo = await signBuy(issuer, acc1, spaceId.toNumber(), new BN(1).toNumber());
      await shareCtr.buyShares(spaceId, new BN(1), maxInAmount, signInfo[1], signInfo[0], { from: acc1 });
      expect(await shareCtr.getSellPriceWithFees(spaceId, 1)).to.bignumber.eq(
        price1.mul(new BN(100).sub(protocolFee).sub(holderFee)).div(new BN(100)));
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

