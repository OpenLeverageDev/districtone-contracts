/** @type import('hardhat/config').HardhatUserConfig */
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage')
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-web3");

// task action function receives the Hardhat Runtime Environment as second argument
task("accounts", "Prints accounts", async (_, { web3 }) => {
    console.log(await web3.eth.getAccounts());
});


module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true
            },
        },
    },
    gasReporter: {
        enabled: true
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    mocha: {
        timeout: 40000
    }
};
