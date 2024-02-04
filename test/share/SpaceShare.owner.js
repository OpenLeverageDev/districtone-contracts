const {newSpace, invalidParamError, zeroAddressError, notOwnerError} = require("./shareUtil");
const {expect} = require("chai");
const {ZERO_ADDRESS} = require("@openzeppelin/test-helpers/src/constants");
const {BN, expectRevert} = require("@openzeppelin/test-helpers");
const {toBN} = require("../util/EtheUtil");
contract('SpaceShare.sol', function (accounts) {
    let shareCtr;
    let owner = accounts[0];
    let acc1 = accounts[1];
    beforeEach(async () => {
        shareCtr = await newSpace(owner);
    });

    it('constructor initializes', async () => {
        expect(await shareCtr.owner()).to.eq(owner);
        expect(await shareCtr.OLE()).to.eq(ZERO_ADDRESS);
        expect(await shareCtr.signIssuerAddress()).to.eq(ZERO_ADDRESS);
        expect(await shareCtr.signValidDuration()).to.bignumber.eq(new BN(0));
        expect(await shareCtr.K()).to.bignumber.eq(new BN(0));
        expect(await shareCtr.B()).to.bignumber.eq(new BN(0));
    });

    it('set sign config only owner', async () => {
        let sighIssuer = accounts[2];
        await shareCtr.setSignConf(sighIssuer, 300, {from: owner});
        expect(await shareCtr.signIssuerAddress()).to.eq(sighIssuer);
        expect(await shareCtr.signValidDuration()).to.bignumber.eq(new BN(300));
        await expectRevert(
          shareCtr.setSignConf(sighIssuer, 300, {from: acc1}),
          notOwnerError
        );
    });

    it('set sign config fails if params invalid', async () => {
        let error_sighIssuer = ZERO_ADDRESS;
        let error_validDuration = 0;
        let sighIssuer = accounts[2];
        let validDuration = 300
        await expectRevert(
          shareCtr.setSignConf(error_sighIssuer, validDuration, {from: owner}),
          zeroAddressError
        );
        await expectRevert(
          shareCtr.setSignConf(sighIssuer, error_sighIssuer, {from: owner}),
          invalidParamError
        );
    });

    it('set protocol fee destination only owner', async () => {
        let destination = accounts[2];
        await shareCtr.setProtocolFeeDestination(destination, {from: owner});
        expect(await shareCtr.protocolFeeDestination()).to.eq(destination);
        await expectRevert(
          shareCtr.setProtocolFeeDestination(destination, {from: acc1}),
          notOwnerError
        );
    });

    it('set fees only owner', async () => {
        let protocolFee = toBN(100);
        let holderFee = toBN(500);
        await shareCtr.setFees(protocolFee, holderFee, {from: owner});
        expect(await shareCtr.protocolFeePercent()).to.bignumber.eq(protocolFee);
        expect(await shareCtr.holderFeePercent()).to.bignumber.eq(holderFee);
        await expectRevert(
          shareCtr.setFees(protocolFee, holderFee, {from: acc1}),
          notOwnerError
        );
    });

    it('set fee fails if params invalid', async () => {
        let protocolFee = toBN(2000);
        let holderFee = toBN(3001);
        await expectRevert(
          shareCtr.setFees(protocolFee, holderFee, {from: owner}),
          invalidParamError
        );
    });

    it('transfer ownership only owner', async () => {
        let newOwner = accounts[4];
        await shareCtr.transferOwnership(newOwner, {from: owner});
        await expectRevert(
          shareCtr.transferOwnership(owner, {from: owner}),
          notOwnerError
        );
    });

});