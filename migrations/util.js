let arbitrum = exports.arbitrum = "arbitrum";
let optimism = exports.optimism = "optimism";

exports.deployOption = function (accounts) {
    return {from: accounts[0], overwrite: true}
}
exports.getAdmin = function (accounts) {
    return accounts[0];
}
