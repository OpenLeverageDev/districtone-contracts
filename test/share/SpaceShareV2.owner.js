const { newSpaceShareV2, invalidParamError, zeroAddressError, notOwnerError } = require("./shareUtil");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { BN, expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { toBN } = require("../util/EtheUtil");
contract("SpaceShareV2.sol", function(accounts) {
  let shareCtr;
  let owner = accounts[0];
  let acc1 = accounts[1];
  beforeEach(async () => {
    shareCtr = await newSpaceShareV2(owner);
  });

  it("constructor initializes", async () => {
    expect(await shareCtr.owner()).to.eq(owner);
    expect(await shareCtr.OLE()).to.eq(ZERO_ADDRESS);
    expect(await shareCtr.signIssuerAddress()).to.eq(owner);
    expect(await shareCtr.signValidDuration()).to.bignumber.eq(new BN(0));
    expect(await shareCtr.K()).to.bignumber.eq(new BN(0));
    expect(await shareCtr.B()).to.bignumber.eq(new BN(0));
  });

  it("set sign config only owner", async () => {
    let sighIssuer = accounts[2];
    let tx = await shareCtr.setSignConf(sighIssuer, 300, { from: owner });
    expectEvent(tx, "SignConfChanged", {
      newIssuerAddress: sighIssuer,
      newSignValidDuration: new BN(300)
    });
    expect(await shareCtr.signIssuerAddress()).to.eq(sighIssuer);
    expect(await shareCtr.signValidDuration()).to.bignumber.eq(new BN(300));
    await expectRevert(
      shareCtr.setSignConf(sighIssuer, 300, { from: acc1 }),
      notOwnerError
    );
  });

  it("set sign config fails if params invalid", async () => {
    let error_sighIssuer = ZERO_ADDRESS;
    let error_validDuration = 0;
    let sighIssuer = accounts[2];
    let validDuration = 300;
    await expectRevert(
      shareCtr.setSignConf(error_sighIssuer, validDuration, { from: owner }),
      zeroAddressError
    );
    await expectRevert(
      shareCtr.setSignConf(sighIssuer, error_validDuration, { from: owner }),
      invalidParamError
    );
  });

  it("set protocol fee destination only owner", async () => {
    let destination = accounts[2];
    let tx = await shareCtr.setProtocolFeeDestination(destination, { from: owner });
    expectEvent(tx, "ProtocolFeeDestinationChanged", {
      newProtocolFeeDestination: destination
    });
    expect(await shareCtr.protocolFeeDestination()).to.eq(destination);
    await expectRevert(
      shareCtr.setProtocolFeeDestination(destination, { from: acc1 }),
      notOwnerError
    );
  });

  it("set fees only owner", async () => {
    let protocolFee = toBN(1);
    let holderFee = toBN(5);
    let tx = await shareCtr.setFees(protocolFee, holderFee, { from: owner });
    expectEvent(tx, "FeesChanged", {
      newProtocolFeePercent: protocolFee,
      newHolderFeePercent: holderFee
    });
    expect(await shareCtr.protocolFeePercent()).to.bignumber.eq(protocolFee);
    expect(await shareCtr.holderFeePercent()).to.bignumber.eq(holderFee);
    await expectRevert(
      shareCtr.setFees(protocolFee, holderFee, { from: acc1 }),
      notOwnerError
    );
  });

  it("set fee fails if params invalid", async () => {
    let protocolFee = toBN(20);
    let holderFee = toBN(31);
    await expectRevert(
      shareCtr.setFees(protocolFee, holderFee, { from: owner }),
      invalidParamError
    );
  });

  it("transfer ownership only owner", async () => {
    let newOwner = accounts[4];
    await shareCtr.transferOwnership(newOwner, { from: owner });
    await expectRevert(
      shareCtr.transferOwnership(owner, { from: owner }),
      notOwnerError
    );
  });

});