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

        linkUp = await LinkUp.connect(owner).deploy();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await linkUp.rootAddress()).to.equal(owner.address);
        });

        it("Should set the JOIN_FEE correctly", async function () {
            expect(await linkUp.JOIN_FEE()).to.equal(ethers.parseEther("0.0015"));
        });
    });

    describe("Joining the platform", function () {
        it("Should allow a user to join and emit an event", async function () {

            // Sign inviter address
            const inviter = addr2.address;
            const addressBytes = hexStringToArray(ethers.keccak256(inviter));
            let rawSig = owner.signMessage(addressBytes);
            expect(await linkUp.connect(addr1).verifySig(owner.address, inviter, rawSig)).to.be.true
            const joinTx = await linkUp.connect(addr1).join(inviter, rawSig, { value: ethers.parseEther("0.0015") });

            let invitee = addr1.address;
            await expect(joinTx).to.emit(linkUp, "Joined").withArgs(invitee, inviter);
            expect(await linkUp.inviterOf(invitee)).to.equal(inviter);
        });

        // it("Should fail if JOIN_FEE is not met", async function () {
        //     let rawSig = await owner.signMessage(addr2.address);
        //     let sig = Signature.from(rawSig);
        //     await expect(linkUp.connect(addr1).join(addr2.address, sig, { value: ethers.parseEther("0.001") }))
        //         .to.be.revertedWith('Incorrect fee');
        // });

        // Add more tests for other scenarios, such as invalid inviter, already joined, etc.
    });

    describe("Withdrawing balance", function () {
        // Tests for the withdraw function
    });

    // Add more test cases as needed
});

function hexStringToArray(hexString) {
    if (hexString.startsWith('0x')) {
        hexString = hexString.slice(2);
    }

    if (hexString.length % 2 !== 0) {
        hexString = '0' + hexString;
    }

    const byteArray = new Uint8Array(hexString.length / 2);

    for (let i = 0, j = 0; i < hexString.length; i += 2, j++) {
        byteArray[j] = parseInt(hexString.slice(i, i + 2), 16);
    }

    return byteArray;
}
