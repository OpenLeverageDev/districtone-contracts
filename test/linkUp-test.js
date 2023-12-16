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
            let rawSig = owner.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            expect(await linkUp.connect(addr1).verifySig(owner.address, inviter, rawSig)).to.be.true
            const joinTx = await linkUp.connect(addr1).join(inviter, rawSig, { value: ethers.parseEther("0.0015") });

            let invitee = addr1.address;
            await expect(joinTx).to.emit(linkUp, "Joined").withArgs(invitee, inviter);
            expect(await linkUp.inviterOf(invitee)).to.equal(inviter);
        });

        it("Should fail if JOIN_FEE is not met", async function () {
            const inviter = addr2.address;
            let rawSig = owner.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await expect(linkUp.connect(addr1).join(inviter, rawSig, {value: ethers.parseEther("0.001")}))
                .to.be.revertedWith('Incorrect fee');
        });

        it("Should fail if the inviter is himself", async function () {
            const inviter = addr1.address;
            let rawSig = owner.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await expect(linkUp.connect(addr1).join(inviter, rawSig, {value: ethers.parseEther("0.0015")}))
                .to.be.revertedWith('Invalid inviter');
        });

        it("Should fail if the inviter is zero address", async function () {
            const inviter = ethers.ZeroAddress;
            let rawSig = owner.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await expect(linkUp.connect(addr1).join(inviter, rawSig, {value: ethers.parseEther("0.0015")}))
                .to.be.revertedWith('Invalid inviter');
        });

        it("Should fail if the user tries to join twice", async function () {
            const inviter = addr2.address;
            let signature = owner.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await linkUp.connect(addr1).join(inviter, signature, {value: ethers.parseEther("0.0015")});
            await expect(linkUp.connect(addr1).join(inviter, signature, {value: ethers.parseEther("0.0015")}))
                .to.be.revertedWith('Already joined');
        });


    });

    describe("Withdrawing balance", function () {
        it("Should allow a user to withdraw their balance", async function () {
            // Setup: addr1 joins under addr2, then addr3 joins under addr1
            const signature1 = await owner.signMessage(hexStringToArray(ethers.keccak256(addr1.address)));
            const signature2 = await owner.signMessage(hexStringToArray(ethers.keccak256(addr2.address)));
            await linkUp.connect(addr1).join(addr2.address, signature2, {value: ethers.parseEther("0.0015")});
            await linkUp.connect(addrs[3]).join(addr1.address, signature1, {value: ethers.parseEther("0.0015")});

            // Withdraw balance
            const initialBalance = await ethers.provider.getBalance(addr1.address);
            const withdrawTx = await linkUp.connect(addr1).withdraw();
            const receipt = await withdrawTx.wait();

            // Using BigInt for arithmetic operation
            let gasPrice;
            if (receipt.effectiveGasPrice) {
                gasPrice = BigInt(receipt.effectiveGasPrice.toString());
            } else {
                const tx = await ethers.provider.getTransaction(withdrawTx.hash);
                gasPrice = tx.gasPrice ? BigInt(tx.gasPrice.toString()) : BigInt(tx.maxFeePerGas.toString());
            }

            const gasUsed = BigInt(receipt.cumulativeGasUsed) * gasPrice;
            const finalBalance = await ethers.provider.getBalance(addr1.address);

            expect(BigInt(finalBalance.toString()) + gasUsed).to.be.above(BigInt(initialBalance.toString()));
        });

        it("Should fail if there is no balance to withdraw", async function () {
            await expect(linkUp.connect(addr1).withdraw())
                .to.be.revertedWith('No balance to withdraw');
        });
    });

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
