const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LinkUp Contract", function () {
    let LinkUp;
    let linkUp;
    let MockXOLE;
    let mockxOLE;
    let owner;
    let addr1;
    let addr2;
    let addrs;
    let signer;

    beforeEach(async function () {
        LinkUp = await ethers.getContractFactory("LinkUp");
        MockXOLE = await ethers.getContractFactory("MockXOLE");
        mockxOLE = await MockXOLE.deploy();
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        signer = addrs[9];
        linkUp = await LinkUp.connect(owner).deploy(signer, mockxOLE);
    });

    async function setupXOLEBalances(directInviterHasXOLE, secondTierInviterHasXOLE) {
        if (directInviterHasXOLE) {
            await mockxOLE.mint(addr1.address, ethers.parseEther("100")); // Direct inviter has xOLE
        } // else do not mint to simulate no balance

        if (secondTierInviterHasXOLE) {
            await mockxOLE.mint(addr2.address, ethers.parseEther("100")); // Second-tier inviter has xOLE
        } // else do not mint to simulate no balance
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await linkUp.owner()).to.equal(owner.address);
        });

        it("Should set the join fee correctly", async function () {
            expect(await linkUp.joinFee()).to.equal(ethers.parseUnits("0.0015", "ether"));
        });
    });

    describe("Joining the platform", function () {
        it("Should allow a user to join and emit an event", async function () {

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
                    ethers.parseEther("0.00105"), // directInviterFee (example value)
                    ethers.parseEther("0"),  // secondTierInviterFee (example value)
                    ethers.parseEther("0.00045")  // protocolFee (example value)
                );
            expect(await linkUp.inviterOf(invitee)).to.equal(inviter);
        });

        it("Should fail if JOIN_FEE is not met", async function () {
            const inviter = addr2.address;
            let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await expect(linkUp.connect(addr1).join(inviter, rawSig, {value: ethers.parseEther("0.001")}))
                .to.be.revertedWithCustomError(linkUp, 'IncorrectFee');
        });

        it("Should fail if the inviter is himself", async function () {
            const inviter = addr1.address;
            let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await expect(linkUp.connect(addr1).join(inviter, rawSig, {value: ethers.parseEther("0.0015")}))
                .to.be.revertedWithCustomError(linkUp, 'InvalidInviter');
        });

        it("Should fail if the inviter is zero address", async function () {
            const inviter = ethers.ZeroAddress;
            let rawSig = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await expect(linkUp.connect(addr1).join(inviter, rawSig, {value: ethers.parseEther("0.0015")}))
                .to.be.revertedWithCustomError(linkUp, 'InvalidInviter');
        });

        it("Should fail if the user tries to join twice", async function () {
            const inviter = addr2.address;
            let signature = signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            await linkUp.connect(addr1).join(inviter, signature, {value: ethers.parseEther("0.0015")});
            await expect(linkUp.connect(addr1).join(inviter, signature, {value: ethers.parseEther("0.0015")}))
                .to.be.revertedWithCustomError(linkUp, "AlreadyJoined");
        });

        it("Should distribute fees correctly when only the direct inviter owns xOLE", async function () {
            // addr1 is the direct inviter and owns enough xOLE tokens
            // addr2 is the second-tier inviter and does not own enough xOLE tokens

            // Sign inviter address
            const inviter = addr1.address; // Direct inviter
            const secondTierInviter = addr2.address; // Second-tier inviter
            const invitee = addrs[3].address; // New user being invited

            // Ensure addr2 has no xOLE to affect the distribution
            await setupXOLEBalances(true, false);

            // Generate signatures
            const signatureForInviter = await signer.signMessage(hexStringToArray(ethers.keccak256(inviter)));
            const signatureForSecondTier = await signer.signMessage(hexStringToArray(ethers.keccak256(secondTierInviter)));

            // addr1 invites addr3
            await linkUp.connect(addr1).join(secondTierInviter, signatureForSecondTier, { value: ethers.parseEther("0.0015") });
            // addr3 joins under addr1
            const joinTx = await linkUp.connect(addrs[3]).join(inviter, signatureForInviter, { value: ethers.parseEther("0.0015") });

            // Define the expected fee distribution based on your contract logic
            const expectedDirectInviterFee = ethers.parseEther("0.0012"); // Replace with actual expected value
            const expectedSecondTierInviterFee = ethers.parseEther("0.000225"); // Replace with actual expected value
            const expectedProtocolFee = ethers.parseEther("0.000075"); // Replace with actual expected value

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

        it("Should distribute fees correctly when only the second-tier inviter owns xOLE", async function () {
            // Setup: addr2 is the direct inviter and does not own enough xOLE tokens
            // addr1 is the second-tier inviter and owns enough xOLE tokens
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
            const expectedDirectInviterFee = ethers.parseEther("0.000975"); // Adjust the value based on your contract
            const expectedSecondTierInviterFee = ethers.parseEther("0.00045"); // Adjust the value based on your contract
            const expectedProtocolFee = ethers.parseEther("0.000075"); // Adjust the value based on your contract

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

        it("Should distribute fees correctly when both inviters own xOLE", async function () {
            // Setup: Both addr1 and addr2 own enough xOLE tokens
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
            const expectedDirectInviterFee = ethers.parseEther("0.001125"); // Adjust the value based on your contract
            const expectedSecondTierInviterFee = ethers.parseEther("0.000375"); // Adjust the value based on your contract
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

        it("Should distribute fees correctly when neither inviter owns xOLE", async function () {
            // Setup: Neither addr1 nor addr2 owns enough xOLE tokens
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
            const expectedDirectInviterFee = ethers.parseEther("0.00105"); // Adjust the value based on your contract
            const expectedSecondTierInviterFee = ethers.parseEther("0.0003"); // Adjust the value based on your contract
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

    });

    describe("Withdrawing balance", function () {
        it("Should allow a user to withdraw their balance", async function () {
            // Setup: addr1 joins under addr2, then addr3 joins under addr1
            const signature1 = await signer.signMessage(hexStringToArray(ethers.keccak256(addr1.address)));
            const signature2 = await signer.signMessage(hexStringToArray(ethers.keccak256(addr2.address)));
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
                .to.be.revertedWithCustomError(linkUp, 'NoBalanceToWithdraw');

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
