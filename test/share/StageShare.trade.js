const {
    newOLE,
    newStageWithOle, price1, price2, zeroAmountError, stageNotExistsError,
    insufficientInAmountError, FEE_DENOMINATOR, notSellLastShareError,
    insufficientOutAmountError, insufficientSharesError, price3, arithmeticError,getSign, clearOleBalance
} = require("./shareUtil");
const {expectEvent, BN, expectRevert} = require("@openzeppelin/test-helpers");
const {expect} = require("chai");
const {ZERO_ADDRESS} = require("@openzeppelin/test-helpers/src/constants");
const {web3, ethers } = require("hardhat");
contract('StageShare', function (accounts) {

    let shareCtr;
    let oleCtr;
    let owner = accounts[0];
    let acc1 = accounts[3];
    let acc2 = accounts[4];
    let treasury = accounts[9];

    let creatorInitShare = new BN(1);
    let stageId = new BN(1);
    let notExistStageId = stageId.addn(2);
    let maxInAmount = web3.utils.toWei('10000');
    let minOutAmount = web3.utils.toWei('0');
    let protocolFee = new BN(100);
    let holderFee = new BN(500);

    let issuer;
    let sign1;
    let signTimeStamp1;
    let sign2;
    let signTimeStamp2;

    beforeEach(async () => {
        oleCtr = await newOLE(owner);
        [issuer] = await ethers.getSigners();
        shareCtr = await newStageWithOle(oleCtr.address, issuer.address, owner);
        await oleCtr.approve(shareCtr.address, maxInAmount, {from: owner});
        await oleCtr.mint(acc1, maxInAmount);
        await oleCtr.approve(shareCtr.address, maxInAmount, {from: acc1});
        await oleCtr.mint(acc2, maxInAmount);
        await oleCtr.approve(shareCtr.address, maxInAmount, {from: acc2});
        let signInfo1 = await getSign(issuer, acc1);
        sign1 = signInfo1[0];
        signTimeStamp1 = signInfo1[1];
        let signInfo2 = await getSign(issuer, acc2);
        sign2 = signInfo2[0];
        signTimeStamp2 = signInfo2[1];
    });

    describe('create stage', function () {
        let txReceipt;
        beforeEach(async () => {
            txReceipt = await shareCtr.createStage({from: owner});
        });

        it('create stage emit event', async () => {
            expectEvent(txReceipt, 'StageCreated', {
                stageId: stageId, creator: owner
            });
            expectEvent(txReceipt, 'Trade', {
                stageId: stageId, trader: owner, isBuy: true, shares: creatorInitShare, price: new BN(0),
                protocolFee: new BN(0), holderFee: new BN(0), supply: creatorInitShare
            });
        });

        it('creator balance and total supply will change after create stage', async () => {
            expect(await shareCtr.sharesSupply(stageId)).to.bignumber.eq(creatorInitShare);
            expect(await shareCtr.sharesBalance(stageId, owner)).to.bignumber.eq(creatorInitShare);
        });
    });

    describe('buy shares', function () {
        beforeEach(async () => {
            await shareCtr.createStage({from: owner});
        });

        it('buy shares emit event', async () => {
            let txReceipt = await shareCtr.buyShares(stageId, new BN(1), price1, signTimeStamp1, sign1, {from: acc1});
            expectEvent(txReceipt, 'Trade', {
                stageId: stageId, trader: acc1, isBuy: true, shares: creatorInitShare, price: price1,
                protocolFee: new BN(0), holderFee: new BN(0), supply: new BN(2)
            });
        });

        it('account balance change after buy 1 share', async () => {
            await shareCtr.buyShares(stageId, new BN(1), price1, signTimeStamp1, sign1, {from: acc1});
            expect(await shareCtr.sharesSupply(stageId)).to.bignumber.eq(new BN(2));
            expect(await shareCtr.sharesBalance(stageId, acc1)).to.bignumber.eq(new BN(1));
        });

        it('account balance change after buy 2 shares', async () => {
            await shareCtr.buyShares(stageId, new BN(2), price1.add(price2), signTimeStamp1, sign1, {from: acc1});
            expect(await shareCtr.sharesSupply(stageId)).to.bignumber.eq(new BN(3));
            expect(await shareCtr.sharesBalance(stageId, acc1)).to.bignumber.eq(new BN(2));
        });

        it('account can buy shares more times', async () => {
            await shareCtr.buyShares(stageId, new BN(1), price1, signTimeStamp1, sign1, {from: acc1});
            await shareCtr.buyShares(stageId, new BN(1), price2, signTimeStamp1, sign1, {from: acc1});
            expect(await shareCtr.sharesSupply(stageId)).to.bignumber.eq(new BN(3));
            expect(await shareCtr.sharesBalance(stageId, acc1)).to.bignumber.eq(new BN(2));
        });

        it('share can buy by several accounts', async () => {
            await shareCtr.buyShares(stageId, new BN(1), price1, signTimeStamp1, sign1, {from: acc1});
            await shareCtr.buyShares(stageId, new BN(1), price2, signTimeStamp2, sign2, {from: acc2});
            expect(await shareCtr.sharesSupply(stageId)).to.bignumber.eq(new BN(3));
        });

        it('fails if input share amount is 0 ', async () => {
            await expectRevert(
              shareCtr.buyShares(stageId, new BN(0), price1, signTimeStamp1, sign1, {from: acc1}),
              zeroAmountError
            );
        });

        it('fails if share not exists', async () => {
            await expectRevert(
              shareCtr.buyShares(notExistStageId, new BN(1), price1, signTimeStamp1, sign1, {from: acc1}),
              stageNotExistsError
            );
        });

        it('fails if max in amount not enough', async () => {
            await expectRevert(
              shareCtr.buyShares(stageId, new BN(1), price1.subn(1), signTimeStamp1, sign1, {from: acc1}),
              insufficientInAmountError
            );
        });
    });

    describe('sell shares', function () {
        let acc1InitShares = new BN(2);
        beforeEach(async () => {
            await shareCtr.createStage({from: owner});
            await shareCtr.setFees(protocolFee, holderFee, {from: owner});
            await shareCtr.setProtocolFeeDestination(treasury, {from: owner});
            await oleCtr.approve(shareCtr.address, maxInAmount);
            await shareCtr.buyShares(stageId, acc1InitShares, maxInAmount, signTimeStamp1, sign1, {from: acc1});
        });

        it('sell shares emit event', async () => {
            let txReceipt = await shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: acc1});
            expectEvent(txReceipt, 'Trade', {
                stageId: stageId, trader: acc1, isBuy: false, shares: new BN(1), price: price2,
                protocolFee: protocolFee.mul(price2).divn(FEE_DENOMINATOR),
                holderFee: holderFee.mul(price2).divn(FEE_DENOMINATOR),
                supply: new BN(2)
            });
        });

        it('account balance change after sell 1 share', async () => {
          await clearOleBalance(oleCtr, acc1);
          await shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: acc1});
            expect(await shareCtr.sharesSupply(stageId)).to.bignumber.eq(new BN(2));
            expect(await shareCtr.sharesBalance(stageId, acc1)).to.bignumber.eq(new BN(1));
            expect(await oleCtr.balanceOf(acc1)).to.bignumber.eq(price2.mul(FEE_DENOMINATOR.sub(protocolFee).sub(holderFee))
              .div(FEE_DENOMINATOR));
        });

        it('account balance change after sell 2 share', async () => {
            await shareCtr.sellShares(stageId, new BN(2), minOutAmount, {from: acc1});
            expect(await shareCtr.sharesBalance(stageId, acc1)).to.bignumber.eq(new BN(0));
        });

        it('account can sell shares more times', async () => {
            await shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: acc1});
            await shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: acc1});
            expect(await shareCtr.sharesBalance(stageId, acc1)).to.bignumber.eq(new BN(0));
        });

        it('sell shares will collect fee', async () => {
            await shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: acc1});
            expect(await oleCtr.balanceOf(treasury)).to.bignumber.eq(protocolFee.mul(price2).divn(FEE_DENOMINATOR));
        });

        it('sell shares with holder fee is 0', async () => {
            await shareCtr.setFees(protocolFee, new BN(0), {from: owner});
            await shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: acc1});
        });

        it('fails if input share amount is 0 ', async () => {
            await expectRevert(
              shareCtr.sellShares(stageId, new BN(0), minOutAmount, {from: acc1}),
              zeroAmountError
            );
        });

        it('fails if share not exists', async () => {
            await expectRevert(
              shareCtr.sellShares(notExistStageId, new BN(1), minOutAmount, {from: acc1}),
              stageNotExistsError
            );
        });

        it('fails if returns lt min out amount', async () => {
            let min = price2.mul(FEE_DENOMINATOR.sub(protocolFee).sub(holderFee))
              .div(FEE_DENOMINATOR).addn(1);
            await expectRevert(
              shareCtr.sellShares(stageId, new BN(1), min, {from: acc1}),
              insufficientOutAmountError
            );
        });

        it('fails if sell amount exceeds balance', async () => {
            await expectRevert(
              shareCtr.sellShares(stageId, new BN(2), minOutAmount, {from: owner}),
              insufficientSharesError
            );
        });

        it('fails if sell the last share', async () => {
            await shareCtr.sellShares(stageId, new BN(2), minOutAmount, {from: acc1});
            await expectRevert(
              shareCtr.sellShares(stageId, new BN(1), minOutAmount, {from: owner}),
              notSellLastShareError
            );
        });


    });

    describe('get price', function () {
        beforeEach(async () => {
            await shareCtr.createStage({from: owner});
            await oleCtr.approve(shareCtr.address, maxInAmount);
            await shareCtr.setFees(protocolFee, holderFee, {from: owner});
        });

        it('the first share price is 0', async () => {
            let price0 = await shareCtr.getBuyPrice(notExistStageId, 1);
            expect(price0).to.bignumber.eq(new BN(0));
        });

        it('get buy price from 1 to 2', async () => {
            expect(await shareCtr.getBuyPrice(stageId, 1)).to.bignumber.eq(price1);
        });

        it('get buy price from 2 to 4', async () => {
            await shareCtr.buyShares(stageId, new BN(1), maxInAmount, signTimeStamp1, sign1, {from: acc1});
            expect(await shareCtr.getBuyPrice(stageId, 2)).to.bignumber.eq(price2.add(price3));
        });

        it('fails if get buy price from 0 to 2', async () => {
            await expectRevert(
              shareCtr.getBuyPrice(notExistStageId, 2),
              arithmeticError
            );
        });

        it('get sell price from 2 to 1', async () => {
            await shareCtr.buyShares(stageId, new BN(1), maxInAmount, signTimeStamp1, sign1, {from: acc1});
            expect(await shareCtr.getSellPrice(stageId, 1)).to.bignumber.eq(price1);

        });

        it('get sell price from 4 to 2', async () => {
            await shareCtr.buyShares(stageId, new BN(1), maxInAmount, signTimeStamp1, sign1, {from: acc1});
            await shareCtr.buyShares(stageId, new BN(2), maxInAmount, signTimeStamp2, sign2, {from: acc2});
            expect(await shareCtr.getSellPrice(stageId, 2)).to.bignumber.eq(price2.add(price3));
        });

        it('fails if get sell price from 2 to 0', async () => {
            await expectRevert(
              shareCtr.getSellPrice(notExistStageId, 2),
              arithmeticError
            );
        });

        it('get sell price with fees', async () => {
            await shareCtr.buyShares(stageId, new BN(1), maxInAmount, signTimeStamp1, sign1, {from: acc1});
            expect(await shareCtr.getSellPriceWithFees(stageId, 1)).to.bignumber.eq(
              price1.mul(FEE_DENOMINATOR.sub(protocolFee).sub(holderFee)).div(FEE_DENOMINATOR));
        });

    });

});