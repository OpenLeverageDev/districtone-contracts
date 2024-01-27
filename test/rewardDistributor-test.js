const { expect } = require("chai");
const { ethers, web3 } = require("hardhat");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { hexStringToArray } = require("./util/EtheUtil");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const VEST_DURATION = 60 * 60 * 24 * 7;
describe("RewardDistributor Contract", function() {
  let oleCtr;
  let rewardCtr;
  let deployer;
  let signer;
  let acc1;
  let acc2;
  let ts;
  beforeEach(async function() {
    oleCtr = await (await ethers.getContractFactory("MockToken")).deploy("OLE", "OLE", ethers.parseEther("1000000000"));
    [deployer, signer, acc1, acc2, ...addrs] = await ethers.getSigners();
    rewardCtr = await (await ethers.getContractFactory("RewardDistributor")).deploy(oleCtr, signer, VEST_DURATION);
    ts = (await ethers.provider.getBlock("latest")).timestamp;
  });

  describe("deployment", function() {
    it("constructor initializes  ", async function() {
      expect(await rewardCtr.OLE()).to.equal(await oleCtr.getAddress());
      expect(await rewardCtr.signerAddress()).to.equal(signer);
      expect(await rewardCtr.vestDuration()).to.equal(VEST_DURATION);
      expect(await rewardCtr.owner()).to.equal(deployer);
    });
  });

  describe("authentication", function() {
    it("set signer address only owner", async function() {
      await expect(rewardCtr.connect(acc1).setSignerAddress(acc1))
        .to.revertedWithCustomError(rewardCtr, "OwnableUnauthorizedAccount");
      await rewardCtr.setSignerAddress(acc1);
      expect(await rewardCtr.signerAddress()).to.equal(acc1);
    });
    it("fails if signer address is zero address", async function() {
      await expect(rewardCtr.setSignerAddress(ZERO_ADDRESS))
        .to.revertedWithCustomError(rewardCtr, "InvalidAddress");
    });
    it("set vest duration only owner", async function() {
      let newVestDuration = 1;
      await expect(rewardCtr.connect(acc1).setVestDuration(newVestDuration))
        .to.revertedWithCustomError(rewardCtr, "OwnableUnauthorizedAccount");
      await rewardCtr.setVestDuration(newVestDuration);
      expect(await rewardCtr.vestDuration()).to.equal(newVestDuration);
    });
    it("fails if vest duration is 0", async function() {
      await expect(rewardCtr.setVestDuration(0))
        .to.revertedWithCustomError(rewardCtr, "InvalidDuration");
    });
  });

  describe("vests", function() {
    let epochIds = [1];
    let amount = ethers.parseEther("100");
    it("emit event", async function() {
      let vestId = getVestId(acc1.address, amount, epochIds);
      let tx = rewardCtr.connect(acc1).vests(epochIds, amount, await signer.signMessage(hexStringToArray(vestId)));
      await expect(tx)
        .to.emit(rewardCtr, "VestStarted")
        .withArgs(vestId, acc1.address, amount, ts + 1, ts + 1 + VEST_DURATION
        );
      let rewardStruct = await rewardCtr.rewards(acc1, vestId);
      expect(rewardStruct.total).to.equal(amount);
      expect(rewardStruct.withdrawn).to.equal(0);
      expect(rewardStruct.startTime).to.equal(ts + 1);
      expect(rewardStruct.endTime).to.equal(ts + 1 + VEST_DURATION);
    });
    it("vest success with 1 epoch", async function() {
      let vestId = getVestId(acc1.address, amount, epochIds);
      await rewardCtr.connect(acc1).vests(epochIds, amount, await signer.signMessage(hexStringToArray(vestId)));

    });
    it("vest success with 96 epochs", async function() {
      let epochIds = Array.from({ length: 96 }, (value, index) => index + 1);
      let vestId = getVestId(acc1.address, amount, epochIds);
      await rewardCtr.connect(acc1).vests(epochIds, amount, await signer.signMessage(hexStringToArray(vestId)));
    });
    it("fails if epochIds is empty", async function() {
      let vestId = getVestId(acc1.address, amount, []);
      await expect(rewardCtr.connect(acc1).vests([], amount, await signer.signMessage(hexStringToArray(vestId))))
        .to.revertedWithCustomError(rewardCtr, "InvalidParams");
    });
    it("fails if epoch was vested", async function() {
      let vestId = getVestId(acc1.address, amount, epochIds);
      await rewardCtr.connect(acc1).vests(epochIds, amount, await signer.signMessage(hexStringToArray(vestId)));
      await expect(rewardCtr.connect(acc1).vests(epochIds, amount, await signer.signMessage(hexStringToArray(vestId))))
        .to.revertedWithCustomError(rewardCtr, "AlreadyVested");
    });
    it("fails if signature is invalid", async function() {
      let vestId = getVestId(acc1.address, amount, epochIds);
      await expect(rewardCtr.connect(acc1).vests(epochIds, amount, await acc1.signMessage(hexStringToArray(vestId))))
        .to.revertedWithCustomError(rewardCtr, "InvalidSignature");
    });
  });

  describe("withdraws", function() {
    let epochIds = [1];
    let amount = ethers.parseEther("100");
    let releaseablePerSecond = ethers.parseEther("100") / BigInt(VEST_DURATION);
    let vest1Id;
    beforeEach(async function() {
      vest1Id = getVestId(acc1.address, amount, epochIds);
      await oleCtr.transfer(rewardCtr, ethers.parseEther("10000"));
      await rewardCtr.connect(acc1).vests(epochIds, amount, await signer.signMessage(hexStringToArray(vest1Id)));
    });

    it("emit event", async function() {
      let tx = rewardCtr.connect(acc1).withdraws([vest1Id]);
      await expect(tx)
        .to.emit(rewardCtr, "Withdrawn")
        .withArgs(vest1Id, acc1.address, releaseablePerSecond
        );
    });

    it("withdraw success with 1 vest", async function() {
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      expect(await oleCtr.balanceOf(acc1)).to.equal(releaseablePerSecond);
      let rewardStruct = await rewardCtr.rewards(acc1, vest1Id);
      expect(rewardStruct.total).to.equal(amount);
      expect(rewardStruct.withdrawn).to.equal(releaseablePerSecond);
    });

    it("withdraw success with 2 vest", async function() {
      let vest2Id = getVestId(acc1.address, amount, [2]);
      await rewardCtr.connect(acc1).vests([2], amount, await signer.signMessage(hexStringToArray(vest2Id)));
      await rewardCtr.connect(acc1).withdraws([vest1Id, vest2Id]);
      expect(await oleCtr.balanceOf(acc1)).to.equal(releaseablePerSecond * BigInt(3));
    });

    it("withdraw 2 times", async function() {
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      expect(await oleCtr.balanceOf(acc1)).to.equal(releaseablePerSecond * BigInt(2));
      expect(await rewardCtr.getWithdrawable([vest1Id], acc1)).to.equal(0);
    });

    it("withdraw 3 times", async function() {
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      let rewardStruct = await rewardCtr.rewards(acc1, vest1Id);
      expect(await oleCtr.balanceOf(acc1)).to.equal(rewardStruct.withdrawn);
      expect(await rewardCtr.getWithdrawable([vest1Id], acc1)).to.equal(0);
    });

    it("withdraw after ended", async function() {
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      let rewardStruct = await rewardCtr.rewards(acc1, vest1Id);
      await time.increaseTo(rewardStruct.endTime);
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      rewardStruct = await rewardCtr.rewards(acc1, vest1Id);
      expect(amount).to.equal(rewardStruct.withdrawn);
      expect(await oleCtr.balanceOf(acc1)).to.equal(rewardStruct.withdrawn);
      expect(await rewardCtr.getWithdrawable([vest1Id], acc1)).to.equal(0);
    });

    it("fails if user reward is 0", async function() {
      await expect(rewardCtr.connect(acc2).withdraws([vest1Id]))
        .to.revertedWithCustomError(rewardCtr, "NoReward");
    });
    it("fails if withdrawable reward is 0", async function() {
      let rewardStruct = await rewardCtr.rewards(acc1, vest1Id);
      await time.increaseTo(rewardStruct.endTime);
      await rewardCtr.connect(acc1).withdraws([vest1Id]);
      await expect(rewardCtr.connect(acc1).withdraws([vest1Id]))
        .to.revertedWithCustomError(rewardCtr, "InvalidWithdrawn");
    });
  });
});

function getVestId(user, amount, epochIds) {
  return ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256[]"], [user, amount, epochIds]
  );
}
