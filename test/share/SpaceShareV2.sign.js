const {
  newOLE,
  newSpaceWithOleV2,
  price1, invalidSignatureError, expiredSignatureError
} = require("./shareUtil");
const { BN, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const { web3, ethers } = require("hardhat");
const { expect } = require("chai");
const { hexStringToArray } = require("../util/EtheUtil");
contract("SpaceShareV2.sol", function(accounts) {
  let shareCtr;
  let oleCtr;
  let spaceId = 3001;
  let owner = accounts[0];
  let trader = accounts[1];
  let maxInAmount = web3.utils.toWei("10000");
  let validDuration = 300;
  let timestamp;
  let issuer;
  let invalidIssuer;

  beforeEach(async () => {
    oleCtr = await newOLE(owner);
    [issuer, invalidIssuer] = await ethers.getSigners();
    shareCtr = await newSpaceWithOleV2(oleCtr.address, issuer.address, owner);
    timestamp = (await web3.eth.getBlock("latest")).timestamp;
    await shareCtr.createSpace({ from: owner });
    await oleCtr.mint(trader, maxInAmount);
    await oleCtr.approve(shareCtr.address, maxInAmount, { from: trader });
  });

  it("should successfully verify a valid signature", async () => {
    let validSignature = await signBuy(trader, timestamp, spaceId, 1, issuer);
    await shareCtr.buyShares(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader });
  });

  it("should fail when signature content is inconsistent", async () => {
    let validSignature = await signBuy(accounts[2], timestamp, spaceId, 1, issuer);
    await expectRevert(
      shareCtr.buyShares(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader }),
      invalidSignatureError
    );
    validSignature = await signBuy(trader, timestamp - 1, spaceId, 1, issuer);
    await expectRevert(
      shareCtr.buyShares(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader }),
      invalidSignatureError
    );
  });

  it("should fail when signature is expired", async () => {
    let newTimestamp = timestamp - 6000; // 100 minutes ago
    let expiredSignature = await signBuy(trader, newTimestamp, spaceId, 1, issuer);
    await expectRevert(
      shareCtr.buyShares(spaceId, new BN(1), price1, newTimestamp, expiredSignature, { from: trader }),
      expiredSignatureError
    );
  });

  it("should fail when owner address is inconsistent", async () => {
    let validSignature = await signBuy(trader, timestamp, spaceId, 1, invalidIssuer);
    await expectRevert(
      shareCtr.buyShares(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader }),
      invalidSignatureError
    );
  });

  it("should fail when sell shares with v1", async () => {
    await expectRevert(
      shareCtr.sellShares(spaceId, new BN(1), price1, { from: trader }),
      "Disabled"
    );


    it("sell should fail when signature content is inconsistent", async () => {
      let validSignature = await signSell(accounts[2], timestamp, spaceId, 1, issuer);
      await expectRevert(
        shareCtr.sellShareV2(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader }),
        invalidSignatureError
      );
      validSignature = await signSell(trader, timestamp - 1, spaceId, 1, issuer);
      await expectRevert(
        shareCtr.expectRevert(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader }),
        invalidSignatureError
      );
    });

    it("sell should fail when signature is expired", async () => {
      let newTimestamp = timestamp - 6000; // 100 minutes ago
      let expiredSignature = await signSell(trader, newTimestamp, spaceId, 1, issuer);
      await expectRevert(
        shareCtr.sellShareV2(spaceId, new BN(1), price1, newTimestamp, expiredSignature, { from: trader }),
        expiredSignatureError
      );
    });

    it("should fail when owner address is inconsistent", async () => {
      let validSignature = await signSell(trader, timestamp, spaceId, 1, invalidIssuer);
      await expectRevert(
        shareCtr.sellShareV2(spaceId, new BN(1), price1, timestamp, validSignature, { from: trader }),
        invalidSignatureError
      );
    });

    it("should fail when exit space with v1", async () => {
      await expectRevert(
        shareCtr.exitSpace(spaceId, new BN(1), { from: trader }),
        "Disabled"
      );
    });
  });

  async function signBuy(user, timestamp, spaceId, shares, issuer) {
    let sign;
    await issuer.signMessage(hexStringToArray(ethers.solidityPackedKeccak256(["address", "uint256", "uint256", "uint256", "bool"], [user, timestamp, spaceId, shares, true]))).then(result => {
      sign = result;
    });
    return sign;
  }

  async function signSell(user, timestamp, spaceId, shares, issuer) {
    let sign;
    await issuer.signMessage(hexStringToArray(ethers.solidityPackedKeccak256(["address", "uint256", "uint256", "uint256", "bool"], [user, timestamp, spaceId, shares, false]))).then(result => {
      sign = result;
    });
    return sign;
  }

});