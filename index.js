const ethers = require("ethers")
const optimismSDK = require("@eth-optimism/sdk")
// get .env value
require('dotenv').config()
const mnemonic = process.env.MNEMONIC
const words = process.env.MNEMONIC.match(/[a-zA-Z]+/g).length
validLength = [12, 15, 18, 24]
if (!validLength.includes(words)) {
    console.log(`The mnemonic (${process.env.MNEMONIC}) is the wrong number of words`)
    process.exit(-1)
}
// init L1 L2 provider
const l1Url = `https://goerli.infura.io/v3/${process.env.GOERLI_INFURA_KEY}`
const l2Url = `http://54.95.181.155:8545`
let crossChainMessenger
let addr    // Our address
const getSigners = async () => {
    const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
    const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic)
    const privateKey = hdNode.derivePath(ethers.utils.defaultPath).privateKey
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}
// input L1 contracts address to init bridges 
zeroAddr = "0x".padEnd(42, "0")
l1Contracts = {
    StateCommitmentChain: zeroAddr,
    CanonicalTransactionChain: zeroAddr,
    BondManager: zeroAddr,
    AddressManager: "0xEb9bF3C90b1d3ED73713f29e9C79A287C50e006d",   // Lib_AddressManager.json
    L1CrossDomainMessenger: "0x232903d65f058c94957c8bB5942775264faFC69f",   // Proxy__OVM_L1CrossDomainMessenger.json
    L1StandardBridge: "0xD267904d2D4b6FD38a41Fb2fA547C2A5E124f142",   // Proxy__OVM_L1StandardBridge.json
    OptimismPortal: "0xc1f6CB9144a62e23EAA5014950709879617c0541",   // OptimismPortalProxy.json
    L2OutputOracle: "0xC4a5A26fAFAb352d5e4D286b4b521b4cDb59b98b",   // L2OutputOracleProxy.json
}
bridges = {
    Standard: {
        l1Bridge: l1Contracts.L1StandardBridge,
        l2Bridge: "0x4200000000000000000000000000000000000010",
        Adapter: optimismSDK.StandardBridgeAdapter
    },
    ETH: {
        l1Bridge: l1Contracts.L1StandardBridge,
        l2Bridge: "0x4200000000000000000000000000000000000010",
        Adapter: optimismSDK.ETHBridgeAdapter
    }
}
const setup = async() => {
    const [l1Signer, l2Signer] = await getSigners()
    addr = l1Signer.address
    crossChainMessenger = new optimismSDK.CrossChainMessenger({
        bedrock: true,
        contracts: {
            l1: l1Contracts
        },
        bridges: bridges,
        l1ChainId: await l1Signer.getChainId(),
        l2ChainId: await l2Signer.getChainId(),
        l1SignerOrProvider: l1Signer,
        l2SignerOrProvider: l2Signer,
    })
}

// get balance in L1 and L2
const gwei = BigInt(1e9)
const eth = gwei * gwei
const centieth = eth/100n
const reportBalances = async () => {
    const l1Balance = (await crossChainMessenger.l1Signer.getBalance()).toString().slice(0,-9)
    const l2Balance = (await crossChainMessenger.l2Signer.getBalance()).toString().slice(0,-9)

    console.log(`On L1:${l1Balance} Gwei On L2:${l2Balance} Gwei`)
}

// depositETH
const depositETH = async () => {
    console.log("Deposit ETH")
    await reportBalances()
    const start = new Date()
    
   // depositETH  1000gwei== 0.0000001eth
    const response = await crossChainMessenger.depositETH(1000n * gwei)
    console.log(`Transaction hash (on L1): ${response.hash}`)
    await response.wait()
    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date()-start)/1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        optimismSDK.MessageStatus.RELAYED)
    await reportBalances()
    console.log(`depositETH took ${(new Date()-start)/1000} seconds\n\n`)
}
const withdrawETH = async () => {
    console.log("Withdraw ETH")
    const start = new Date()
    await reportBalances()
    const response = await crossChainMessenger.withdrawETH(centieth)
    console.log(`Transaction hash (on L2): ${response.hash}`)
    console.log(`\tFor more information: http://54.95.181.155:4000/tx/${response.hash}`)
    await response.wait()
    console.log("Waiting for status to be READY_TO_PROVE")
    console.log(`Time so far ${(new Date()-start)/1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        optimismSDK.MessageStatus.READY_TO_PROVE)
    console.log(`Time so far ${(new Date()-start)/1000} seconds`)
    await crossChainMessenger.proveMessage(response.hash)
    console.log("In the challenge period, waiting for status READY_FOR_RELAY")
    console.log(`Time so far ${(new Date()-start)/1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        optimismSDK.MessageStatus.READY_FOR_RELAY)
    console.log("Ready for relay, finalizing message now")
    console.log(`Time so far ${(new Date()-start)/1000} seconds`)
    await crossChainMessenger.finalizeMessage(response.hash)
    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date()-start)/1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response,
        optimismSDK.MessageStatus.RELAYED)
    await reportBalances()
    console.log(`withdrawETH took ${(new Date()-start)/1000} seconds\n\n\n`)
}

const main = async () => {
    await setup()
    await depositETH()
    await withdrawETH()
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })




