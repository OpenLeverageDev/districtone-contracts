const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Signature } = require("ethers");
const { hexStringToArray } = require("./util/EtheUtil");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

describe("LinkUp Contract", function() {
  let LinkUp;
  let linkUp;
  let MockXOLE;
  let mocksOLE;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  let signer;
  let oleCtr;
  let wethCtr;

  beforeEach(async function() {
    oleCtr = await (await ethers.getContractFactory("MockToken")).deploy("OLE", "OLE", ethers.parseEther("1000000000"));
    wethCtr = await (await ethers.getContractFactory("MockWETH")).deploy();
    let zapCtr = await (await ethers.getContractFactory("MockZap")).deploy(oleCtr, wethCtr);
    await oleCtr.mint(await zapCtr.getAddress(), ethers.parseEther("10000"));
    LinkUp = await ethers.getContractFactory("LinkUp");
    MockXOLE = await ethers.getContractFactory("MockSOLE");
    mocksOLE = await MockXOLE.deploy(ZERO_ADDRESS);
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    signer = addrs[9];
    linkUp = await LinkUp.connect(owner).deploy(signer, mocksOLE, oleCtr, zapCtr);
  });

  async function setupXOLEBalances(directInviterHasXOLE, secondTierInviterHasXOLE) {
    if (directInviterHasXOLE) {
      await mocksOLE.mint(addr1.address, ethers.parseEther("100")); // Direct inviter has sOLE
    } // else do not mint to simulate no balance

    if (secondTierInviterHasXOLE) {
      await mocksOLE.mint(addr2.address, ethers.parseEther("100")); // Second-tier inviter has sOLE
    } // else do not mint to simulate no balance
  }

  describe("Deployment", function() {
    it("Should set the right owner", async function() {
      expect(await linkUp.owner()).to.equal(owner.address);
    });

    it("Should set the join fee correctly", async function() {
      expect(await linkUp.joinFee()).to.equal(ethers.parseUnits("0.0015", "ether"));
    });
  });

  describe("Joining the platform", function() {
    it("Should allow a user to join and emit an event", async function() {

      // Sign inviter address
      const inviter = addr2.address;
      let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      const joinTx = await linkUp.connect(addr1).join(inviter, rawSig, { value: ethers.parseEther("0.0015") });

      let invitee = addr1.address;
      // Correctly using ethers.utils.parseEther for fee values
      await expect(joinTx)
        .to.emit(linkUp, "Joined")
        .withArgs(
          invitee,
          inviter,
          ethers.parseEther("100"), // directInviterFee (example value)
          ethers.parseEther("0"),  // secondTierInviterFee (example value)
          ethers.parseEther("0.0006")  // protocolFee (example value)
        );
      expect(await linkUp.inviterOf(invitee)).to.equal(inviter);
    });

    it("Should fail if JOIN_FEE is not met", async function() {
      const inviter = addr2.address;
      let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      await expect(linkUp.connect(addr1).join(inviter, rawSig, { value: ethers.parseEther("0.001") }))
        .to.be.revertedWithCustomError(linkUp, "IncorrectFee");
    });

    it("Should fail if the inviter is himself", async function() {
      const inviter = addr1.address;
      let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      await expect(linkUp.connect(addr1).join(inviter, rawSig, { value: ethers.parseEther("0.0015") }))
        .to.be.revertedWithCustomError(linkUp, "InvalidInviter");
    });

    it("Should fail if the inviter is zero address", async function() {
      const inviter = ethers.ZeroAddress;
      let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      await expect(linkUp.connect(addr1).join(inviter, rawSig, { value: ethers.parseEther("0.0015") }))
        .to.be.revertedWithCustomError(linkUp, "InvalidInviter");
    });

    it("Should fail if the user tries to join twice", async function() {
      const inviter = addr2.address;
      let signature = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      await linkUp.connect(addr1).join(inviter, signature, { value: ethers.parseEther("0.0015") });
      await expect(linkUp.connect(addr1).join(inviter, signature, { value: ethers.parseEther("0.0015") }))
        .to.be.revertedWithCustomError(linkUp, "AlreadyJoined");
    });

    it("Should distribute fees correctly when only the direct inviter owns sOLE", async function() {
      // addr1 is the direct inviter and owns enough sOLE tokens
      // addr2 is the second-tier inviter and does not own enough sOLE tokens

      // Sign inviter address
      const inviter = addr1.address; // Direct inviter
      const secondTierInviter = addr2.address; // Second-tier inviter
      const invitee = addrs[3].address; // New user being invited

      // Ensure addr2 has no sOLE to affect the distribution
      await setupXOLEBalances(true, false);

      // Generate signatures
      const signatureForInviter = await signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      const signatureForSecondTier = await signer.signMessage(hexStringToArray(ethers.keccak256(secondTierInviter)));

      // addr1 invites addr3
      await linkUp.connect(addr1).join(secondTierInviter, signatureForSecondTier, { value: ethers.parseEther("0.0015") });
      // addr3 joins under addr1
      const joinTx = await linkUp.connect(addrs[3]).join(inviter, signatureForInviter, { value: ethers.parseEther("0.0015") });

      // Define the expected fee distribution based on your contract logic
      const expectedDirectInviterFee = ethers.parseEther("88.888888888888888888"); // Replace with actual expected value
      const expectedSecondTierInviterFee = ethers.parseEther("11.111111111111111112"); // Replace with actual expected value
      const expectedProtocolFee = ethers.parseEther("0.00015"); // Replace with actual expected value

      // Validate the Joined event with the expected fee distribution
      await expect(joinTx)
        .to.emit(linkUp, "Joined")
        .withArgs(
          invitee,
          inviter,
          expectedDirectInviterFee,
          expectedSecondTierInviterFee,
          expectedProtocolFee
        );
    });

    it("Should distribute fees correctly when only the second-tier inviter owns sOLE", async function() {
      // Setup: addr2 is the direct inviter and does not own enough sOLE tokens
      // addr1 is the second-tier inviter and owns enough sOLE tokens
      // Sign inviter address
      const inviter = addr1.address; // Direct inviter
      const secondTierInviter = addr2.address; // Second-tier inviter
      const invitee = addrs[3].address; // New user being invited
      await setupXOLEBalances(false, true);

      // Generate signatures
      const signatureForInviter = await signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      const signatureForSecondTier = await signer.signMessage(hexStringToArray(ethers.keccak256(secondTierInviter)));

      // addr1 invites addr3
      await linkUp.connect(addr1).join(secondTierInviter, signatureForSecondTier, { value: ethers.parseEther("0.0015") });
      // addr3 joins under addr1
      const joinTx = await linkUp.connect(addrs[3]).join(inviter, signatureForInviter, { value: ethers.parseEther("0.0015") });


      // Define the expected fee distribution based on your contract logic for this scenario
      const expectedDirectInviterFee = ethers.parseEther("55.555555555555555555"); // Adjust the value based on your contract
      const expectedSecondTierInviterFee = ethers.parseEther("44.444444444444444445"); // Adjust the value based on your contract
      const expectedProtocolFee = ethers.parseEther("0.00015"); // Adjust the value based on your contract

      // Validate the Joined event with the expected fee distribution
      await expect(joinTx)
        .to.emit(linkUp, "Joined")
        .withArgs(
          invitee,
          inviter,
          expectedDirectInviterFee,
          expectedSecondTierInviterFee,
          expectedProtocolFee
        );
    });

    it("Should distribute fees correctly when both inviters own sOLE", async function() {
      // Setup: Both addr1 and addr2 own enough sOLE tokens
      const inviter = addr1.address; // Direct inviter
      const secondTierInviter = addr2.address; // Second-tier inviter
      const invitee = addrs[3].address; // New user being invited
      await setupXOLEBalances(true, true);

      // Generate signatures
      const signatureForInviter = await signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      const signatureForSecondTier = await signer.signMessage(hexStringToArray(ethers.keccak256(secondTierInviter)));

      // addr1 invites addr3
      await linkUp.connect(addr1).join(secondTierInviter, signatureForSecondTier, { value: ethers.parseEther("0.0015") });
      // addr3 joins under addr1
      const joinTx = await linkUp.connect(addrs[3]).join(inviter, signatureForInviter, { value: ethers.parseEther("0.0015") });


      // Define the expected fee distribution based on your contract logic for this scenario
      const expectedDirectInviterFee = ethers.parseEther("70"); // Adjust the value based on your contract
      const expectedSecondTierInviterFee = ethers.parseEther("30"); // Adjust the value based on your contract
      const expectedProtocolFee = ethers.parseEther("0"); // Adjust the value based on your contract

      // Validate the Joined event with the expected fee distribution
      await expect(joinTx)
        .to.emit(linkUp, "Joined")
        .withArgs(
          invitee,
          inviter,
          expectedDirectInviterFee,
          expectedSecondTierInviterFee,
          expectedProtocolFee
        );
    });

    it("Should distribute fees correctly when neither inviter owns sOLE", async function() {
      // Setup: Neither addr1 nor addr2 owns enough sOLE tokens
      const inviter = addr1.address; // Direct inviter
      const secondTierInviter = addr2.address; // Second-tier inviter
      const invitee = addrs[3].address; // New user being invited

      await setupXOLEBalances(false, false);

      // Generate signatures
      const signatureForInviter = await signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
      const signatureForSecondTier = await signer.signMessage(hexStringToArray(ethers.keccak256(secondTierInviter)));

      // addr1 invites addr3
      await linkUp.connect(addr1).join(secondTierInviter, signatureForSecondTier, { value: ethers.parseEther("0.0015") });
      // addr3 joins under addr1
      const joinTx = await linkUp.connect(addrs[3]).join(inviter, signatureForInviter, { value: ethers.parseEther("0.0015") });

      // Define the expected fee distribution based on your contract logic for this scenario
      const expectedDirectInviterFee = ethers.parseEther("75"); // Adjust the value based on your contract
      const expectedSecondTierInviterFee = ethers.parseEther("25"); // Adjust the value based on your contract
      const expectedProtocolFee = ethers.parseEther("0.0003"); // Adjust the value based on your contract

      // Validate the Joined event with the expected fee distribution
      await expect(joinTx)
        .to.emit(linkUp, "Joined")
        .withArgs(
          invitee,
          inviter,
          expectedDirectInviterFee,
          expectedSecondTierInviterFee,
          expectedProtocolFee
        );
    });

  });

  describe("Withdrawing balance", function() {
    it("Should allow a user to withdraw their balance", async function() {
      // Setup: addr1 joins under addr2, then addr3 joins under addr1
      const signature1 = await signer.signMessage(hexStringToArray(ethers.keccak256(addr1.address)));
      const signature2 = await signer.signMessage(hexStringToArray(ethers.keccak256(addr2.address)));
      await linkUp.connect(addr1).join(addr2.address, signature2, { value: ethers.parseEther("0.0015") });
      await linkUp.connect(addrs[3]).join(addr1.address, signature1, { value: ethers.parseEther("0.0015") });

      // Withdraw balance
      const initialBalance = await oleCtr.balanceOf(addr1.address);
      await linkUp.connect(addr1).withdraw();

      const finalBalance = await oleCtr.balanceOf(addr1.address);

      expect(BigInt(finalBalance.toString())).to.be.above(BigInt(initialBalance.toString()));
    });
    it("Should fail if there is no balance to withdraw", async function() {
      await expect(linkUp.connect(addr1).withdraw())
        .to.be.revertedWithCustomError(linkUp, "NoBalanceToWithdraw");

    });
  });

  describe("Withdrawing protocol fee", function() {
    it("Withdraw and reset protocol fee", async function() {
      // Setup: addr1 joins under addr2, then addr3 joins under addr1
      const signature1 = await signer.signMessage(hexStringToArray(ethers.keccak256(addr1.address)));
      const signature2 = await signer.signMessage(hexStringToArray(ethers.keccak256(addr2.address)));
      await linkUp.connect(addr1).join(addr2.address, signature2, { value: ethers.parseEther("0.0015") });
      await linkUp.connect(addrs[3]).join(addr1.address, signature1, { value: ethers.parseEther("0.0015") });

      // Withdraw balance
      const initialBalance = await ethers.provider.getBalance(addr1.address);
      let protocolFee = await linkUp.protocolFee();
      await linkUp.connect(owner).withdrawProtocolFee(addr1.address);
      const finalBalance = await ethers.provider.getBalance(addr1.address);
      expect(BigInt(finalBalance.toString())).to.equal(BigInt(initialBalance.toString()) + BigInt(protocolFee));
      expect(BigInt(await linkUp.protocolFee())).to.equal(0);

    });
    it("Should fail if sender is not owner", async function() {
      await expect(linkUp.connect(addr1).withdrawProtocolFee(addr2))
        .to.be.revertedWithCustomError(linkUp, "OwnableUnauthorizedAccount");
    });

    it("Should fail if sender is not owner", async function() {
      await expect(linkUp.connect(addr1).setMinSoleBalance(1))
        .to.be.revertedWithCustomError(linkUp, "OwnableUnauthorizedAccount");
      await linkUp.setMinSoleBalance(1);
      expect(await linkUp.minSoleBalance()).to.equal(1);
    });
  });

});
