const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const K = ethers.parseEther("0.1");
const B = ethers.parseEther("10");
const DEX_FEES = 25;
let WEEK_4 = 60 * 60 * 24 * 7 * 4;
describe("Zap Contract", function() {
  let oleCtr;
  let wethCtr;
  let oleEthCtr;
  let soleCtr;
  let spaceShareCtr;
  let zapCtr;
  let deployer;
  let acc1;
  let ts;
  beforeEach(async function() {
    oleCtr = await (await ethers.getContractFactory("MockToken")).deploy("OLE", "OLE", ethers.parseEther("1000000000"));
    wethCtr = await (await ethers.getContractFactory("MockWETH")).deploy();
    oleEthCtr = await (await ethers.getContractFactory("MockPancakePair")).deploy(oleCtr, wethCtr,
      ethers.parseEther("100000"), ethers.parseEther("1"));
    soleCtr = await (await ethers.getContractFactory("MockSOLE")).deploy(oleEthCtr);
    spaceShareCtr = await (await ethers.getContractFactory("MockSpaceShare")).deploy(oleCtr, K, B);
    zapCtr = await (await ethers.getContractFactory("OPZap")).deploy(oleCtr, wethCtr,
      oleEthCtr, DEX_FEES, soleCtr, spaceShareCtr);
    [deployer, acc1, ...addrs] = await ethers.getSigners();
    ts = (await ethers.provider.getBlock("latest")).timestamp;
  });

  describe("deployment", function() {
    it("constructor initializes  ", async function() {
      expect(await zapCtr.OLE()).to.equal(await oleCtr.getAddress());
      expect(await zapCtr.WETH()).to.equal(await wethCtr.getAddress());
      expect(await zapCtr.OLE_ETH()).to.equal(await oleEthCtr.getAddress());
      expect(await zapCtr.DEX_FEES()).to.equal(DEX_FEES);
      expect(await zapCtr.SOLE()).to.equal(await soleCtr.getAddress());
      expect(await zapCtr.SPACE()).to.equal(await spaceShareCtr.getAddress());
    });
  });

  describe("swap eth for ole", function() {
    it("swap 0.1eth for ole ", async function() {
      let tx = await zapCtr.swapETHForOLE(0, { value: ethers.parseEther("0.1") });
      await expect(tx)
        .to.emit(oleCtr, "Transfer")
        .withArgs(
          await oleEthCtr.getAddress(),
          deployer,
          ethers.parseEther("9070.243237099340759263")
        );
    });
    it("swap 0.2eth for ole ", async function() {
      await zapCtr.connect(acc1).swapETHForOLE(0, { value: ethers.parseEther("0.2") });
      expect(await oleCtr.balanceOf(acc1)).to.equal(ethers.parseEther("16631.929970821175489787"));
    });

    it("fail if bought ole lt min", async function() {
      await expect(zapCtr.swapETHForOLE(ethers.parseEther("9071"), { value: ethers.parseEther("0.1") }))
        .to.revertedWithCustomError(zapCtr, "InsufficientOleReturn");
    });

  });

  describe("create sole by eth", function() {
    it("fails if lp return less than minimum", async function() {
      await expect(zapCtr.createXoleByETH(ethers.parseEther("10000000"), 0,
        { value: ethers.parseEther("0.1") }))
        .to.revertedWithCustomError(zapCtr, "InsufficientLpReturn");
    });

    it("fails if unlockTime is 0", async function() {
      await expect(zapCtr.createXoleByETH(0, 0,
        { value: ethers.parseEther("0.1") }))
        .to.revertedWith("Can only lock until time in the future");
    });

    it("create sole for 0.1eth", async function() {
      await zapCtr.createXoleByETH(0, ts + WEEK_4,
        { value: ethers.parseEther("0.1") });
      expect(await soleCtr.balanceOf(deployer)).to.equal(ethers.parseEther("16.043334483042573679"));
    });

    it("create sole for 0.00002eth", async function() {
      await zapCtr.createXoleByETH(0, ts + WEEK_4,
        { value: ethers.parseEther("0.00002") });
      expect(await soleCtr.balanceOf(deployer)).to.equal(ethers.parseEther("0.003289686994807449"));
      expect(await wethCtr.balanceOf(zapCtr)).to.equal(ethers.parseEther("0.000000000015376133"));
    });
  });

  describe("increase sole by eth", function() {
    it("fails if lp return less than minimum", async function() {
      await expect(zapCtr.increaseXoleByETH(ethers.parseEther("10000000"),
        { value: ethers.parseEther("0.1") }))
        .to.revertedWithCustomError(zapCtr, "InsufficientLpReturn");
    });

    it("fails if sole no existing", async function() {
      await expect(zapCtr.increaseXoleByETH(0,
        { value: ethers.parseEther("0.1") }))
        .to.revertedWith("No existing lock found");
    });

    it("increase sole for 0.1eth", async function() {
      await zapCtr.createXoleByETH(0, ts + WEEK_4,
        { value: ethers.parseEther("0.1") });
      await zapCtr.increaseXoleByETH(0,
        { value: ethers.parseEther("0.1") });
      expect(await soleCtr.balanceOf(deployer)).to.equal(ethers.parseEther("31.374462444393170257"));
    });
  });

  describe("buy shares by eth", function() {
    let spaceId = 1;
    beforeEach(async function() {
      await spaceShareCtr.createSpace();
    });

    it("fails if for insufficient eth", async function() {
      await expect(zapCtr.connect(acc1).buySharesByETH(spaceId, 10, 0, "0x00", 0,
        { value: ethers.parseEther("0.00001") }))
        .to.revertedWithCustomError(spaceShareCtr, "InsufficientInAmount");
    });

    it("buy shares for 0.01eth", async function() {
      await zapCtr.connect(acc1).buySharesByETH(spaceId, 10, 0, "0x00", 0,
        { value: ethers.parseEther("0.01") });
      expect(await spaceShareCtr.sharesBalance(spaceId, acc1)).to.equal(10);
      expect(await oleCtr.balanceOf(acc1)).to.equal(ethers.parseEther("882.148209114086982351"));
    });

    it("buy shares for 0.1eth", async function() {
      await zapCtr.connect(acc1).buySharesByETH(spaceId, 10, 0, "0x00", 0,
        { value: ethers.parseEther("0.1") });
      expect(await spaceShareCtr.sharesBalance(spaceId, acc1)).to.equal(10);
      expect(await oleCtr.balanceOf(acc1)).to.equal(ethers.parseEther("8964.743237099340759263"));
    });

    it("fail if bought ole lt min", async function() {
      await expect(zapCtr.connect(acc1).buySharesByETH(spaceId, 10, 0, "0x00", ethers.parseEther("9071"),
        { value: ethers.parseEther("0.1") }))
        .to.revertedWithCustomError(zapCtr, "InsufficientOleReturn");
    });
  });
});
