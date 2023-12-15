
module.exports = async function (deployer, network, accounts) {

};

function toWei(bn) {
  return web3.utils.toBN(bn).mul(web3.utils.toBN(1e18));
}