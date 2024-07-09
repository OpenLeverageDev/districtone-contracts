const { expect } = require("chai");
const { ethers } = require("hardhat");
const {hexStringToArray} = require("./util/EtheUtil");

describe("ETHDistributor", function () {
    let ETHDistributor, ethDistributor, owner, addr1, addr2;

    beforeEach(async function () {
        // Correctly import ethers from hardhat
        ETHDistributor = await ethers.getContractFactory("ETHDistributor");
        [owner, addr1, addr2] = await ethers.getSigners();
        // Ensure parseEther is called correctly
        ethDistributor = await ETHDistributor.deploy(ethers.parseUnits("100", "ether"), 20);
        expect(await ethDistributor.getAddress()).to.not.be.undefined;

    });

    it("should set the correct owner", async function () {
        expect(await ethDistributor.owner()).to.equal(owner.address);
    });


    it("should allow owner to set and get signing address", async function () {
        await ethDistributor.setSigningAddr(addr1.address);
        expect(await ethDistributor.getSigningAddr()).to.equal(addr1.address);
    });


    it("should not allow a user to claim with an invalid signature", async function () {
        await ethDistributor.setSigningAddr(owner.address);

        const data = ethers.solidityPacked(
            ["address", "address"],
            [await ethDistributor.getAddress(), addr1.address]
        );
        const hash = ethers.keccak256(data);

        const invalidSignature = await addr1.signMessage(hexStringToArray(hash));
        await expect(ethDistributor.connect(addr1).claim(invalidSignature)).to.be.revertedWith("ETHDistributor: Invalid signature");
    });

    it("should allow a user to claim with a valid signature", async function () {
        await owner.sendTransaction({
            to: await ethDistributor.getAddress(),
            value: ethers.parseUnits("200", "ether")
        });

        await ethDistributor.setSigningAddr(addr1.address);
        const data = ethers.solidityPackedKeccak256(
            ["address", "address"],
            [await ethDistributor.getAddress(), addr2.address]
        );
        const validSignature = await addr1.signMessage(hexStringToArray(data));


        // Assuming initial balance is zero for simplicity
        const balance1 = await ethers.provider.getBalance(addr2.address);

        // Claim the amount
        await ethDistributor.connect(addr2).claim(validSignature);

        // Check the new balance after claiming
        const balance2 = await ethers.provider.getBalance(addr2.address);

        expect(balance2).to.be.gt(balance1);

        await expect(ethDistributor.connect(addr2).claim(validSignature)).to.be.revertedWith("ETHDistributor: Address has already claimed");
    });

    it("should allow the owner to claim the remaining balance", async function () {
        await owner.sendTransaction({
            to: await ethDistributor.getAddress(),
            value: ethers.parseUnits("1", "ether")
        });

        const initialOwnerBalance = await ethers.provider.getBalance(owner.address);

        await ethDistributor.claimRemainingBalance();

        const finalOwnerBalance = await ethers.provider.getBalance(owner.address);

        expect(finalOwnerBalance).to.be.gt(initialOwnerBalance);
    });

});
