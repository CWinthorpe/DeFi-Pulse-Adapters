const sdk = require("../../sdk");
const ethers  = require('ethers');
const { default: BigNumber } = require("bignumber.js");
const ABI = require('./abi.json');
var axios = require('axios');
const { abi } = require("../../sdk/api");

const boosterAddress = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const currentRegistryAddress = "0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5";
const cvxAddress = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const cvxRewardsAddress = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const cvxcrvAddress = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";

var allCoins = {};


async function tvl(timestamp, block) {
  console.log('convex start')

  const poolLength = (await sdk.api.abi.call({
    target: boosterAddress,
    abi: ABI.poolLength,
    block
  })).output;
  var poolInfo = [];
  var calldata = [];
  for (var i = 0; i < poolLength; i++) {
    calldata.push({
      target: boosterAddress,
      params: [i]
    })
  }
  var returnData = await sdk.api.abi.multiCall({
    abi: ABI.poolInfo,
    calls: calldata,
    block
  })
  for (var i = 0; i < poolLength; i++) {
    var pdata = returnData.output[i].output;
    poolInfo.push(pdata);
  }
  await Promise.all([...Array(Number(poolLength)).keys()].map(async i => {
    console.log("getting supplies and balances for pool " + i + "...");

    var convexsupply = await sdk.api.erc20.totalSupply({
      target: poolInfo[i].token,
      block
    });

    var totalsupply = await sdk.api.erc20.totalSupply({
      target: poolInfo[i].lptoken,
      block
    })

    var pool = await sdk.api.abi.call({
      target: currentRegistryAddress,
      block,
      abi: ABI.get_pool_from_lp_token,
      params: poolInfo[i].lptoken
    })

    var share = ethers.BigNumber.from(convexsupply.output).mul((1e18).toString()).div(totalsupply.output);

    var underlyingcoins = await sdk.api.abi.call({
      target: currentRegistryAddress,
      block,
      abi: ABI.get_underlying_coins,
      params: pool.output
    });

    var maincoins = await sdk.api.abi.call({
      target: currentRegistryAddress,
      block,
      abi: ABI.get_coins,
      params: pool.output
    });

    var balances = await sdk.api.abi.call({
      target: currentRegistryAddress,
      block,
      abi: ABI.get_underlying_balances,
      params: pool.output
    })

    // var underlyingDecimals = await sdk.api.abi.call({
    //   target: currentRegistryAddress,
    //   block,
    //   abi: REGISTRY_ABI.get_underlying_decimals,
    //   params: pool.output
    // })
    
    // var mainDecimals = await sdk.api.abi.call({
    //   target: currentRegistryAddress,
    //   block,
    //   abi: REGISTRY_ABI.get_decimals,
    //   params: pool.output
    // })

    // var decimals = [];
    // for (var d = 0; d < underlyingDecimals.output.length; d++) {
    //   if (underlyingDecimals.output[d].toString() == "0") {
    //     decimals.push(mainDecimals.output[d]);
    //   } else {
    //     decimals.push(underlyingDecimals.output[d]);
    //   }
    // }

    var coins = [];
    for (var c = 0; c < underlyingcoins.output.length; c++) {
      //there are pools (ex. ren) that return underlying coins of 0x0 address. replace those with normal coin address
      if (underlyingcoins.output[c] == "0x0000000000000000000000000000000000000000") {
        coins.push(maincoins.output[c]);
      } else {
        coins.push(underlyingcoins.output[c]);
      }

      // //balances returned do not always match the decimals returns
      // if (maincoins.output[c] == "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643") { //cDai
      //   decimals.output[c] = 18;
      // }
      // if (maincoins.output[c] == "0x39AA39c021dfbaE8faC545936693aC917d5E7563") { //cUsdc
      //   decimals.output[c] = 18;
      // }
      // if (maincoins.output[c] == "0xdAC17F958D2ee523a2206206994597C13D831ec7") { //usdt
      //   decimals.output[c] = 6;
      // }
      // if (pool.output == "0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51" //ypool
      //   ||
      //   pool.output == "0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27" //busd
      //   ||
      //   pool.output == "0x06364f10B501e868329afBc005b3492902d6C763" //pax
      //   ||
      //   pool.output == "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF" //iron
      //   ||
      //   pool.output == "0xDeBF20617708857ebe4F679508E7b7863a8A8EeE" //aave
      //   ||
      //   pool.output == "0xEB16Ae0052ed37f479f7fe63849198Df1765a733" //saave
      // ) {
      //   decimals.output[c] = 18;
      // }
    }

    //format decimals
    var balanceShares = [];
    for (var b = 0; b < balances.output.length; b++) {
        //var dec = Math.pow(10, Number(decimals.output[b]));
        //var formattedBal = new BN(balances[b].toString()).multiply(1e5).divide(dec.toString());
        //var formattedBal = ethers.BigNumber.from(balances.output[b].toString()).mul(1e5).div(dec.toString());
        //formattedBal = Number(formattedBal.toString()) / 1e5;
        balanceShare = ethers.BigNumber.from(balances.output[b].toString()).mul(share).div((1e18).toString());
        balanceShares.push(balanceShare);
    }

    //sum pools together
    for (var c = 0; c < coins.length; c++) {
      if (coins[c] == "0x0000000000000000000000000000000000000000") break;
      if (coins[c] == "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        coins[c] = '0x0000000000000000000000000000000000000000';
      }
      if (allCoins[coins[c]] == undefined) {
          allCoins[coins[c]] = balanceShares[c].toString();
      } else {
          allCoins[coins[c]] = ethers.BigNumber.from(allCoins[coins[c]]).add(balanceShares[c]).toString();
      }
  }
  }))
  

  //staked cvx
  var cvxStakedSupply = await sdk.api.erc20.totalSupply({
    target: cvxRewardsAddress,
    block
  });

  allCoins[cvxAddress] = cvxStakedSupply.output.toString();

  var cvxcrvSupply = await sdk.api.erc20.totalSupply({
    target: cvxcrvAddress,
    block
  });

  allCoins[cvxcrvAddress] = cvxcrvSupply.output.toString();

  console.log(allCoins);

  return allCoins;
  // sumSingleBalance(balances, crv, (await cvxCRVSupply).output)
  // sumSingleBalance(balances, cvx, (await cvxStaked).output)
  // console.log('convex end', balances)
  // return balances
}


function sumSingleBalance(
  balances,
  token,
  balance
) {
    const prevBalance = ethers.BigNumber.from(balances[token] ?? "0");
    balances[token] = prevBalance.add(ethers.BigNumber.from(balance)).toString();
}

module.exports = {
  name: 'Convex Finance', // project name
  token: "CVX",              // null, or token symbol if project has a custom token
  category: 'assets',       // allowed values as shown on DefiPulse: 'Derivatives', 'DEXes', 'Lending', 'Payments', 'Assets'
  start: 12457381,        // unix timestamp (utc 0) specifying when the project began, or where live data begins
  tvl                       // tvl adapter
}