const { expect } = require("chai");
const { ethers } = require("hardhat");
const {Signature} = require("ethers");

describe("LinkUp Contract", function () {
    let LinkUp;
    let linkUp;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    beforeEach(async function () {
        LinkUp = await ethers.getContractFactory("LinkUp");
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        linkUp = await LinkUp.deploy();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await linkUp.rootAddress()).to.equal(owner.address);
        });

        it("Should set the JOIN_FEE correctly", async function () {
            expect(await linkUp.JOIN_FEE()).to.equal(ethers.parseEther("0.0015"));
        });
    });

    // describe("Joining the platform", function () {
    //     it("Should allow a user to join and emit an event", async function () {
    //         let rawSig = await owner.signMessage(addr2.address);
    //         let sig = Signature.from(rawSig);
    //         const joinTx = await linkUp.connect(addr1).join(addr2.address, sig, { value: ethers.parseEther("0.0015") });
    //
    //         await expect(joinTx).to.emit(linkUp, "Joined").withArgs(addr1.address, addr2.address);
    //         expect(await linkUp.inviterOf(addr1.address)).to.equal(addr2.address);
    //     });
    //
    //     it("Should fail if JOIN_FEE is not met", async function () {
    //         let rawSig = await owner.signMessage(addr2.address);
    //         let sig = Signature.from(rawSig);
    //         await expect(linkUp.connect(addr1).join(addr2.address, sig, { value: ethers.parseEther("0.001") }))
    //             .to.be.revertedWith('Incorrect fee');
    //     });
    //
    //     // Add more tests for other scenarios, such as invalid inviter, already joined, etc.
    // });

    describe("Withdrawing balance", function () {
        // Tests for the withdraw function
    });

    // Add more test cases as needed
});
