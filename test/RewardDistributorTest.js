const {
  toWei, equalBN, assertThrows, advanceMultipleBlocksAndAssignTime, approxPrecisionAssertPrint
} = require("./util/EtheUtil");
const { utils } = require("ethers");
const m = require("mocha-logger");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { lastBlockTime } = require("./util/EtheUtil");
const RewardDistributor = artifacts.require("RewardDistributor");
const MockToken = artifacts.require("MockToken");
const MockXOLE = artifacts.require("MockXOLE");
const MockUniV2ClassPair = artifacts.require("MockUniV2ClassPair");

contract("OLE reward distributor", async accounts => {
  let ole;
  let usd;
  let pair;
  let xole;
  let contract;
  let day = Number(86400);
  let blockTime;
  let defaultVestDuration = 90 * day;
  let defaultExitPenaltyBase = 2000;
  let defaultExitPenaltyAdd = 6000;

  // merkle tree const
  let admin = accounts[0];
  let user1 = accounts[1];
  let user2 = accounts[2];
  let user3 = accounts[3];
  let defaultReward = toWei(10);
  const total = toWei(60).toString();
  const users = [{ address: user1, amount: defaultReward.toString() }, {
    address: user2,
    amount: toWei(20).toString()
  }, { address: user3, amount: toWei(30).toString() }];
  const leaves = users.map((x) => utils.solidityKeccak256(["address", "uint256"], [x.address, x.amount]));
  const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
  const merkleRoot = merkleTree.getHexRoot();

  beforeEach(async () => {
    m.log();
    ole = await MockToken.new("Ole", "Ole", 0);
    usd = await MockToken.new("Usd", "Usd", 0);
    pair = await MockUniV2ClassPair.new(ole.address, usd.address, toWei(10000).toString(), toWei(10000).toString());
    xole = await MockXOLE.new(pair.address);
    contract = await RewardDistributor.new(ole.address, pair.address, usd.address, xole.address, admin, 30 * day);
    await ole.mint(admin, total);
    await ole.approve(contract.address, total);
    await usd.mint(user1, defaultReward);
    blockTime = await lastBlockTime();
  });

  // ------  admin add epoch test  ------
  it("Add epoch success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    let epoch = await contract.epochs(1);
    assert.equal(epoch.merkleRoot, merkleRoot);
    equalBN(epoch.total, total);
    assert.equal(epoch.startTime, blockTime);
    assert.equal(epoch.expireTime, blockTime + day);
    assert.equal(epoch.vestDuration, defaultVestDuration);
    assert.equal(epoch.penaltyBase, defaultExitPenaltyBase);
    assert.equal(epoch.penaltyAdd, defaultExitPenaltyAdd);
    m.log("add epoch success");

    await ole.mint(admin, total);
    await ole.approve(contract.address, total);
    let tx = await contract.newEpoch(merkleRoot, total, blockTime, blockTime + 2 * day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    let epoch2 = await contract.epochs(2);
    assert.equal(epoch2.expireTime, blockTime + 2 * day);
    let epochIdx = await contract.epochIdx();
    assert.equal(epochIdx, 2);
    m.log("add second epoch success");

    m.log("start to check event ---");
    assert.equal(tx.logs[0].args.epochId, 2);
    assert.equal(tx.logs[0].args.merkleRoot, merkleRoot);
    equalBN(tx.logs[0].args.total, total);
    assert.equal(tx.logs[0].args.startTime, blockTime);
    equalBN(tx.logs[0].args.expireTime, blockTime + 2 * day);
    assert.equal(tx.logs[0].args.vestDuration, defaultVestDuration);
    assert.equal(tx.logs[0].args.penaltyBase, defaultExitPenaltyBase);
    assert.equal(tx.logs[0].args.penaltyAdd, defaultExitPenaltyAdd);
  });

  it("Add epoch fail when start time before expire time", async () => {
    await assertThrows(contract.newEpoch(merkleRoot, total, blockTime * day, blockTime * day - 1, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd), "InvalidTime()");
  });

  it("Add epoch fail when expire time before current block time", async () => {
    await assertThrows(contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd), "InvalidTime()");
  });

  it("Add epoch fail when penaltyBase + penaltyAdd >= PERCENT_DIVISOR", async () => {
    await assertThrows(contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + 2 * day, defaultVestDuration, 4000, 6000), "InvalidAmount()");
  });

  it("Add epoch fail when total is zero", async () => {
    await assertThrows(contract.newEpoch(merkleRoot, 0, blockTime - 1, blockTime + 2 * day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd), "InvalidAmount()");
  });

  it("Add epoch fail when msg sender ole amount not enough", async () => {
    await assertThrows(contract.newEpoch(merkleRoot, toWei(100), blockTime - 1, blockTime + 2 * day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd), "TFF");
  });

  // ------  user vest test  ------
  it("User vest success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    m.log("user1 ole reward is", defaultReward);
    let tx = await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    let amount = (await contract.rewards(1, user1)).amount;
    m.log("user1 vest amount is", defaultReward);
    equalBN(defaultReward, amount);

    m.log("start to check event ---");
    assert.equal(tx.logs[0].args.epochId, 1);
    assert.equal(tx.logs[0].args.account, user1);
    equalBN(tx.logs[0].args.balance, defaultReward);
  });

  it("User vest fail when duplicate vest", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    m.log("user1 vest reward success");
    m.log("user1 start duplicate vest ---");
    await assertThrows(contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 }), "AlreadyVested()");
  });

  it("User vest fail when the reward is zero", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await assertThrows(contract.vest(1, 0, merkleTree.getHexProof(leaves[0]), { from: user1 }), "InvalidAmount()");
  });

  it("User vest fail when time not start", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime + day, blockTime + 2 * day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    m.log("set epoch vest start time to one day later");
    await assertThrows(contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 }), "NotStart()");
  });

  it("User vest fail when time is expire", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await advanceMultipleBlocksAndAssignTime(1, day);
    m.log("set block time to one day later");
    await assertThrows(contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 }), "Expired()");
  });

  it("User vest fail when verify merkle proof fail", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    m.log("user1 epoch reward is", defaultReward);
    m.log("user1 start vest amount is", toWei(11));
    await assertThrows(contract.vest(1, toWei(11), merkleTree.getHexProof(leaves[0]), { from: user1 }), "IncorrectMerkleProof()");
  });

  it("User vest fail when vest amount add epoch vested amount more than total", async () => {
    await contract.newEpoch(merkleRoot, toWei(10), blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    m.log("epoch total reward is", toWei(10));
    m.log("user1 vest amount is", toWei(11));
    await assertThrows(contract.vest(1, toWei(11), merkleTree.getHexProof(leaves[0]), { from: user1 }), "InvalidAmount()");
  });

  // ------  user withdraw and early exit test  ------
  it("User withdraw released reward success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    m.log("user vest reward success, vest duration is 90 days, reward amount is", (await contract.rewards(1, user1)).amount);

    await advanceMultipleBlocksAndAssignTime(1, 30 * day);
    m.log("it's been 30 days since vest");
    m.log("current withdrawable are", (await contract.getWithdrawable(user1, [1]))[0]);
    let tx = await contract.withdraw(1, { from: user1 });
    let balance = await ole.balanceOf(user1);
    m.log("after withdraw, user1 current ole balance is", balance);
    approxPrecisionAssertPrint(balance, 3333334619341563786, 5);

    m.log("start to check event ---");
    assert.equal(tx.logs[0].args.epochId, 1);
    assert.equal(tx.logs[0].args.account, user1);
    approxPrecisionAssertPrint(tx.logs[0].args.amount, 3333333333333333333, 5);
    assert.equal(tx.logs[0].args.penalty, 0);

    await advanceMultipleBlocksAndAssignTime(1, 30 * day);
    m.log("it's been 60 days since vest");
    m.log("current withdrawable are", (await contract.getWithdrawable(user1, [1]))[0]);
    await contract.withdraw(1, { from: user1 });
    balance = await ole.balanceOf(user1);
    m.log("after withdraw, user1 current ole balance is", balance);
    approxPrecisionAssertPrint(balance, 6666669238683127572, 5);

    await advanceMultipleBlocksAndAssignTime(1, 30 * day);
    m.log("it's been 90 days since vest");
    m.log("current withdrawable are", (await contract.getWithdrawable(user1, [1]))[0]);
    await contract.withdraw(1, { from: user1 });
    balance = await ole.balanceOf(user1);
    m.log("after withdraw, user1 current ole balance is", balance);
    equalBN(balance, 10000000000000000000);
    equalBN((await contract.rewards(1, user1)).withdrawn, 10000000000000000000);

    await advanceMultipleBlocksAndAssignTime(1, day);
    m.log("it's been 91 days since vest");

    let withdrawable = (await contract.getWithdrawable(user1, [1]))[0];
    m.log("current withdrawable are", withdrawable);
    equalBN(withdrawable, 0);
    await assertThrows(contract.withdraw(1, { from: user1 }), "InvalidAmount()");
  });

  it("Use early exit success on the first day", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    m.log("user vest reward success, vest duration is 90 days, reward amount is", (await contract.rewards(1, user1)).amount);

    await advanceMultipleBlocksAndAssignTime(1, 1);
    let withdrawnInfo = await contract.getEarlyExitWithdrawable(user1, 1);
    m.log("current withdrawable for early exit are", withdrawnInfo.amount);
    m.log("current penalty for early exit are", withdrawnInfo.penalty);

    let tx = await contract.earlyExit(1, { from: user1 });
    let penalty = tx.logs[0].args.penalty;
    let withdrawn = tx.logs[0].args.amount;
    m.log("after early exit, penalty is", penalty);
    m.log("after early exit, withdraw amount is", withdrawn);
    m.log("after early exit, user1 current ole balance is", await ole.balanceOf(user1));

    approxPrecisionAssertPrint(penalty, 7998997942644032922, 5);
    approxPrecisionAssertPrint(withdrawn, 2001002057355967000, 5);
    assert.equal(tx.logs[0].args.epochId, 1);
    assert.equal(tx.logs[0].args.account, user1);
    let reward = await contract.rewards(1, user1);
    equalBN(reward.withdrawn, defaultReward);
  });

  it("Use early exit success on the mid-term", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });

    await advanceMultipleBlocksAndAssignTime(1, 45 * day);
    let withdrawnInfo = await contract.getEarlyExitWithdrawable(user1, 1);
    m.log("current withdrawable for early exit are", withdrawnInfo.amount);
    m.log("current penalty for early exit are", withdrawnInfo.penalty);

    let tx = await contract.earlyExit(1, { from: user1 });
    let penalty = tx.logs[0].args.penalty;
    let withdrawn = tx.logs[0].args.amount;
    m.log("after early exit, penalty is", penalty);
    m.log("after early exit, withdraw amount is", withdrawn);
    approxPrecisionAssertPrint(penalty, 2499499357124485597, 5);
    approxPrecisionAssertPrint(withdrawn, 7500500642875514403, 5);
    m.log("after early exit, user1 current ole balance is", await ole.balanceOf(user1));
  });

  it("Use early exit success on the last day", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });

    await advanceMultipleBlocksAndAssignTime(1, 89 * day);
    let withdrawnInfo = await contract.getEarlyExitWithdrawable(user1, 1);
    m.log("current withdrawable for early exit are", withdrawnInfo.amount);
    m.log("current penalty for early exit are", withdrawnInfo.penalty);

    let tx = await contract.earlyExit(1, { from: user1 });
    let penalty = tx.logs[0].args.penalty;
    let withdrawn = tx.logs[0].args.amount;
    m.log("after early exit, penalty is", penalty);
    m.log("after early exit, withdraw amount is", withdrawn);
    approxPrecisionAssertPrint(penalty, 22955289866255144, 5);
    approxPrecisionAssertPrint(withdrawn, 9977044710133744856, 5);
    m.log("after early exit, user1 current ole balance is", await ole.balanceOf(user1));
  });

  it("Use early exit success when part of the reward has been withdrawn", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });

    await advanceMultipleBlocksAndAssignTime(1, 30 * day);
    m.log("it's been 30 days since vest");
    await contract.withdraw(1, { from: user1 });
    let withdraw = (await contract.rewards(1, user1)).withdrawn;
    m.log("user1 withdraw unlocked reward", withdraw);
    approxPrecisionAssertPrint(withdraw, 3333334619341563786, 5);

    m.log("user1 start to early exit");
    let tx = await contract.earlyExit(1, { from: user1 });
    let penalty = tx.logs[0].args.penalty;
    let withdrawn = tx.logs[0].args.amount;
    m.log("after early exit, penalty is", penalty);
    m.log("after early exit, withdraw amount is", withdrawn);
    approxPrecisionAssertPrint(penalty, 3999331790380658436, 5);
    approxPrecisionAssertPrint(withdrawn, 2667333590277778000, 5);
    m.log("after early exit, user1 current ole balance is", await ole.balanceOf(user1));
  });

  it("User withdraw fail when the reward already converted", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    await contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 });
    m.log("user1 converted reward to XOLE");
    await assertThrows(contract.withdraw(1, { from: user1 }), "InvalidAmount()");
  });

  it("User withdraw fail when the reward already early exited", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await contract.earlyExit(1, { from: user1 });
    m.log("user1 early exited");
    await assertThrows(contract.withdraw(1, { from: user1 }), "InvalidAmount()");
  });

  it("User withdraw fail when all rewards have been withdrawn", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await advanceMultipleBlocksAndAssignTime(1, 90 * day);
    await contract.withdraw(1, { from: user1 });
    m.log("user1 withdraw all");
    let balance = await ole.balanceOf(user1);
    m.log("user1 current ole balance is", balance);
    equalBN(balance, defaultReward);
    await assertThrows(contract.withdraw(1, { from: user1 }), "InvalidAmount()");
  });

  it("User withdraw multiple epoch reward at once success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await ole.mint(admin, total);
    await ole.approve(contract.address, total);
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await contract.vest(2, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    m.log("user1 vest epoch1 and epoch2 success");

    await advanceMultipleBlocksAndAssignTime(1, 90 * day);
    await contract.withdrawMul([1, 2], { from: user1 });
    let balance = await ole.balanceOf(user1);
    m.log("user1 current ole balance is", balance);
    equalBN(balance, toWei(20));
  });

  it("User withdraw multiple epoch reward at once fail when repeated withdraw in a block", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await advanceMultipleBlocksAndAssignTime(45, day);
    await assertThrows(contract.withdrawMul([1, 1], { from: user1 }), "InvalidAmount()");
  });

  // ------  user convert reward to xole test  ------
  it("User convert reward to new xole success when the rewards are all released", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await advanceMultipleBlocksAndAssignTime(1, 90 * day);
    m.log("it's been 90 days since vest, rewards are all released");

    let usdBalanceBefore = await usd.balanceOf(user1);
    m.log("before convert, user1 usd balance is", usdBalanceBefore);
    let withdrawn = (await contract.getWithdrawable(user1, [1]))[0];
    m.log("before convert, user1 ole reward of not yet withdrawn is", withdrawn);
    let reserve = await pair.getReserves();
    m.log("current ole price is", Number(reserve.reserve1) / Number(reserve.reserve1));
    m.log("start to convert ole to new XOLE");

    await usd.approve(contract.address, defaultReward, { from: user1 });
    m.log("user1 approve contract usd spend, amount is", await usd.allowance(user1, contract.address));
    let tx = await contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 });

    equalBN((await contract.rewards(1, user1)).withdrawn, defaultReward);
    let usdBalanceAfter = await usd.balanceOf(user1);
    m.log("after convert, user1 usd balance is", usdBalanceAfter);
    assert.equal(usdBalanceAfter, 0);
    withdrawn = (await contract.getWithdrawable(user1, [1]))[0];
    m.log("after convert, user1 ole reward of not yet withdrawn change to", withdrawn);
    assert.equal(withdrawn, 0);
    let xoleBalance = await xole.balanceOf(user1);
    m.log("user xole balance is", xoleBalance);
    approxPrecisionAssertPrint(xoleBalance, 10000000000000000000, 5);
    // check event
    assert.equal(tx.logs[0].args.epochId, 1);
    assert.equal(tx.logs[0].args.account, user1);
    equalBN(tx.logs[0].args.amount, defaultReward);
  });

  it("User convert reward to new xole success when the rewards are part released", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await advanceMultipleBlocksAndAssignTime(1, 30 * day);
    m.log("it's been 30 days since vest");
    await contract.withdraw(1, { from: user1 });
    let reward = await contract.rewards(1, user1);
    m.log("user1 start withdraw, total reward is", reward.amount);
    m.log("user1 withdraw amount is", reward.withdrawn);
    let usdBalanceBefore = await usd.balanceOf(user1);
    m.log("before convert, user1 usd balance is", usdBalanceBefore);
    m.log("start to convert ole to new XOLE");

    await usd.approve(contract.address, defaultReward, { from: user1 });
    await contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 });

    equalBN((await contract.rewards(1, user1)).withdrawn, defaultReward);
    let usdBalanceAfter = await usd.balanceOf(user1);
    m.log("after convert, user1 usd balance is", usdBalanceAfter);
    equalBN(usdBalanceAfter, reward.withdrawn);
    let withdrawn = (await contract.getWithdrawable(user1, [1]))[0];
    m.log("after convert, user1 ole reward of not yet withdrawn change to", withdrawn);
    assert.equal(withdrawn, 0);
    let xoleBalance = await xole.balanceOf(user1);
    m.log("user xole balance is", xoleBalance);
    approxPrecisionAssertPrint(xoleBalance, 6666665380658435214, 5);
  });

  it("User convert reward to new xole for others success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    let usdBalanceBefore = await usd.balanceOf(user1);
    m.log("before convert, user1 usd balance is", usdBalanceBefore);
    m.log("start to convert ole to new XOLE for user2");
    await usd.approve(contract.address, defaultReward, { from: user1 });
    await contract.convertToNewXoleForOthers(1, user2, defaultReward, blockTime + 150 * day, { from: user1 });

    equalBN((await contract.rewards(1, user1)).withdrawn, defaultReward);
    let usdBalanceAfter = await usd.balanceOf(user1);
    m.log("after convert, user1 usd balance is", usdBalanceAfter);
    equalBN(usdBalanceAfter, 0);
    let withdrawn = (await contract.getWithdrawable(user1, [1]))[0];
    m.log("after convert, user1 ole reward of not yet withdrawn change to", withdrawn);
    assert.equal(withdrawn, 0);

    let user1XoleBalance = await xole.balanceOf(user1);
    m.log("user1 xole balance is", user1XoleBalance);
    equalBN(user1XoleBalance, 0);
    let user2XoleBalance = await xole.balanceOf(user2);
    m.log("user2 xole balance is", user2XoleBalance);
    approxPrecisionAssertPrint(user2XoleBalance, 10000000000000000000, 5);
  });

  it("User convert reward to increase xole amount success", async () => {
    await pair.mint(user1, toWei(10));
    await pair.approve(xole.address, toWei(10), { from: user1 });
    await xole.create_lock_for(user1, toWei(10), blockTime + 6 * 7 * 86400, { from: user1 });
    let lockInfoBefore = await xole.locked(user1);
    m.log("create user1 xole lock finished");
    m.log("current user xole amount is", lockInfoBefore.amount);
    m.log("current user xole end is", lockInfoBefore.end);

    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    m.log("user1 start convert reward to XOLE");
    await contract.convertAndIncreaseXoleAmount(1, defaultReward, { from: user1 });
    let lockInfoAfter = await xole.locked(user1);
    m.log("user1 convert reward to XOLE finished");
    m.log("current user xole amount is", lockInfoAfter.amount);
    m.log("current user xole end is", lockInfoAfter.end);
    equalBN(lockInfoAfter.amount, 20010000000000000000);
    equalBN(lockInfoBefore.end, lockInfoAfter.end);
  });

  it("User convert reward to increase xole amount success for others success", async () => {
    await pair.mint(user2, toWei(10));
    await pair.approve(xole.address, toWei(10), { from: user2 });
    await xole.create_lock_for(user2, toWei(10), blockTime + 6 * 7 * 86400, { from: user2 });
    let lockInfoBefore = await xole.locked(user2);
    m.log("create user2 xole lock finished");
    m.log("current user2 xole amount is", lockInfoBefore.amount);
    m.log("current user2 xole end is", lockInfoBefore.end);

    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    m.log("user1 start convert reward to increase XOLE amount for user2");
    await contract.convertAndIncreaseXoleAmountForOthers(1, user2, defaultReward, { from: user1 });
    let lockInfoAfter = await xole.locked(user2);
    m.log("user1 convert reward to increase XOLE amount for user2 finished");
    m.log("current user2 xole amount is", lockInfoAfter.amount);
    m.log("current user2 xole end is", lockInfoAfter.end);
    equalBN(lockInfoAfter.amount, 20010000000000000000);
    equalBN(lockInfoBefore.end, lockInfoAfter.end);
  });

  it("User convert reward to xole fail when ole price change too high more than max limit", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await pair.addReserves(usd.address, toWei(500).toString());
    let price = Number(await pair.getPrice(ole.address)) / Number(Math.pow(10, 24));
    m.log("change ole price from 1 to", price);
    await usd.mint(user1, toWei(10));
    await usd.approve(contract.address, toWei(20), { from: user1 });
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 }), "ExceedMax()");
    let token1MaxAmount = Number(defaultReward) * price;
    m.log("change token1MaxAmount to", token1MaxAmount);
    await contract.convertToNewXole(1, token1MaxAmount.toString(), blockTime + 150 * day, { from: user1 });
    m.log("convert success");
  });

  it("User convert reward to xole fail when user approve token1 amount is not enough", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, toWei(5), { from: user1 });
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 }), "TFF");
  });

  it("User convert reward to xole fail when the reward already converted", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    await contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 });
    m.log("user1 convert epoch 1 reward success");
    m.log("user1 start to duplicate convert epoch 1 reward");
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 }), "InvalidAmount()");
  });

  it("User convert reward to xole fail when the reward already early exited", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await contract.earlyExit(1, { from: user1 });
    m.log("user1 early exit epoch 1 reward success");
    m.log("user1 start to convert epoch 1 reward");
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 }), "InvalidAmount()");
  });

  it("User convert reward to xole fail when all rewards have been withdrawn", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await advanceMultipleBlocksAndAssignTime(1, 90 * day);
    await contract.withdraw(1, { from: user1 });
    assert.equal((await contract.getWithdrawable(user1, [1]))[0], 0);
    m.log("user1 withdraw epoch 1 all reward");
    m.log("user1 start to convert epoch 1 reward");
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 150 * day, { from: user1 }), "InvalidAmount()");
  });

  it("User convert reward to xole fail when create lock and unlock time is too short", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    m.log("start to convert with unlock time is 20 days later");
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 20 * day, { from: user1 }), "InvalidTime()");
  });

  it("User convert reward to xole fail when create lock and unlock time long more than 4 years", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    m.log("start to convert with unlock time is 5 years later");
    await assertThrows(contract.convertToNewXole(1, defaultReward, blockTime + 5 * 365 * day, { from: user1 }), "InvalidTime()");
  });

  it("User convert reward to xole fail when increase lock amount and unlock time is too short", async () => {
    await pair.mint(user1, toWei(10));
    await pair.approve(xole.address, toWei(10), { from: user1 });
    await xole.create_lock_for(user1, toWei(10), blockTime + 3 * 7 * 86400, { from: user1 });
    await xole.locked(user1);
    m.log("create user1 xole lock finished");
    m.log("current end is 21 days");
    m.log("convert min unlock time require is 30 days");
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await usd.approve(contract.address, defaultReward, { from: user1 });
    m.log("start to convert with exist xole lock");
    await assertThrows(contract.convertAndIncreaseXoleAmount(1, defaultReward, { from: user1 }), "InvalidTime()");
  });

  // ------  admin competence test  ------
  it("Admin withdraw expire amount success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await advanceMultipleBlocksAndAssignTime(1, 31 * day);
    m.log("it's been 31 days since vest, only user1 vest, reward is expire");
    let before = await ole.balanceOf(admin);
    await contract.recycle([1]);
    let after = await ole.balanceOf(admin);
    m.log("admin withdraw expire amount is", after - before);
    approxPrecisionAssertPrint(total - defaultReward, after - before, 5);
    m.log("start to duplicate withdraw");
    await assertThrows(contract.recycle([1]), "AlreadyRecycled()");
  });

  it("Withdraw expire amount fail when the operator is not admin", async () => {
    await assertThrows(contract.recycle([1], { from: user1 }), "caller must be admin");
  });

  it("Admin withdraw penalty amount success", async () => {
    await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd);
    await contract.vest(1, defaultReward, merkleTree.getHexProof(leaves[0]), { from: user1 });
    await contract.earlyExit(1, { from: user1 });
    let penalty = await contract.withdrawablePenalty();
    m.log("user early exit epoch, penalty amount is", penalty);
    let before = await ole.balanceOf(admin);
    await contract.withdrawPenalty();
    let after = await ole.balanceOf(admin);
    m.log("admin withdraw penalty amount is", after - before);
    approxPrecisionAssertPrint(penalty, after - before, 5);
    equalBN(await contract.withdrawablePenalty(), 0);
    m.log("start to duplicate withdraw");
    await assertThrows(contract.withdrawPenalty(), "InvalidAmount()");
  });

  it("Withdraw penalty amount when the operator is not admin", async () => {
    await assertThrows(contract.withdrawPenalty({ from: user1 }), "caller must be admin");
  });

  it("Modify minXOLELockDuration success", async () => {
    let minXOLELockDurationBefore = await contract.minXOLELockDuration();
    m.log("before modify, minXOLELockDuration is", minXOLELockDurationBefore);
    await contract.setMinXOLELockDuration(60 * day);
    let minXOLELockDurationAfter = await contract.minXOLELockDuration();
    m.log("after modify, minXOLELockDuration is", minXOLELockDurationAfter);
    assert.equal(60 * day, minXOLELockDurationAfter);
  });

  it("Modify minXOLELockDuration fail when the operator is not admin", async () => {
    await assertThrows(contract.setMinXOLELockDuration(60 * day, { from: user1 }), "caller must be admin");
  });

  it("Add epoch fail when the operator is not admin or dev", async () => {
    await assertThrows(contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, defaultVestDuration, defaultExitPenaltyBase, defaultExitPenaltyAdd, { from: user1 }), "Only admin or dev");
  });

});
