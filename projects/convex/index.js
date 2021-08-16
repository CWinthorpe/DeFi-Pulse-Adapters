const sdk = require("../../sdk");
const ethers  = require('ethers');
const { default: BigNumber } = require("bignumber.js");
const ABI = require('./abi.json');
const { abi } = require("../../sdk/api");

//ONLY USED FOR TESTING
var axios = require('axios');

const addressZero = "0x0000000000000000000000000000000000000000"
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
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

    if(pool.output == addressZero){
      console.log("pool " +i +" not in registry yet.")
      return;
    }

    var share = ethers.BigNumber.from(convexsupply.output).mul((1e18).toString()).div(totalsupply.output);

    var maincoins = await sdk.api.abi.call({
      target: currentRegistryAddress,
      block,
      abi: ABI.get_coins,
      params: pool.output
    });

    var coins = [];

    for (var coinlist = 0; coinlist < maincoins.output.length; coinlist++) {
      var coin = maincoins.output[coinlist];
      if(coin == addressZero){
        continue;
      }
     // console.log("pool " +i +" coin: " +coin);

      if(coin != ethAddress ){
          var bal = await sdk.api.erc20.balanceOf({
            target: coin,
            owner: pool.output,
            block
          })
          //console.log("pool " +i +" coin "+coin +" bal: " +bal.output);
          coins.push({coin:coin, balance:bal.output});
      }else{
        var ethbal = await sdk.api.eth.getBalance({
          target: pool.output,
          block
        })
        //console.log("get eth for pool " +i +" = " +ethbal.output);

        //use zero address to represent eth
        coins.push({coin:addressZero, balance:ethbal.output})
      }
    }


    //calc convex share of pool
    for (var c = 0; c < coins.length; c++) {
        var balanceShare = ethers.BigNumber.from(coins[c].balance.toString()).mul(share).div((1e18).toString());
        //balanceShareskeys[c] = balanceShare;
        if (allCoins[coins[c].coin] == undefined) {
            allCoins[coins[c].coin] = balanceShare.toString();
        } else {
            allCoins[coins[c].coin] = ethers.BigNumber.from(allCoins[coins[c].coin]).add(balanceShare).toString();
        }
    }
  }))
  

  //staked cvx
  var cvxStakedSupply = await sdk.api.erc20.totalSupply({
    target: cvxRewardsAddress,
    block
  });

  allCoins[cvxAddress] = cvxStakedSupply.output.toString();

  //cvxcrv supply
  var cvxcrvSupply = await sdk.api.erc20.totalSupply({
    target: cvxcrvAddress,
    block
  });

  allCoins[cvxcrvAddress] = cvxcrvSupply.output.toString();

  console.log(allCoins);

  ////// BEGING TESTING AREA /////////////

  var decimals = {};
  var keys = Object.keys(allCoins)
  for(var i = 0; i < keys.length; i++){
      var dec = await sdk.api.erc20.decimals(keys[i]);
      decimals[keys[i]] = Number(dec.output);
  }

  //convert weird stuff
  var convert = {};
  convert["0x8e595470ed749b85c6f7669de83eae304c2ec68f"] = 0
  convert["0x48759f220ed983db51fa7a8c0d2aab8f3ce4166a"] = 0;
  convert["0x76eb2fe28b36b3ee97f3adae0c69606eedb2a37c"] = 0;

  let values = {};
  await Promise.all(Object.keys(allCoins).map(async i => {
    console.log("getting value for token " + i + "..." +allCoins[i]);

    if (i == "0x0000000000000000000000000000000000000000") {
        var url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=USD";
    } else {
        var url = "https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=" + i + "&vs_currencies=USD";
    }

    await axios.get(url)
      .then(response => {
          if (response.data.ethereum != undefined) {
              values[i] = allCoins[i] * Number(response.data.ethereum.usd) / 1e18;
          } else {
            if(response.data[i.toLowerCase()] == undefined || response.data[i.toLowerCase()].usd == undefined){
              var v = 1.0;
              if(convert[i.toLowerCase()] != undefined){
                v = convert[i.toLowerCase()];
              }
              values[i] = allCoins[i] * v / Math.pow(10,decimals[i]);
              console.log("could not find value of " +i.toLowerCase() +" -> " +values[i]);
            }else{
              values[i] = allCoins[i] * Number(response.data[i.toLowerCase()].usd) / Math.pow(10,decimals[i]);
            }
          }
      })
      .catch(error => {
          //console.log(error);
          var v = 1.0;
          if(convert[i.toLowerCase()] != undefined){
            v = convert[i.toLowerCase()];
          }
          values[i] = allCoins[i] * v / Math.pow(10,decimals[i]);
          console.log("fail getting coingecko price: " +i.toLowerCase());
      });
  }));
  console.log(values);
  var totalusd = 0;
  for (value in values) {
      totalusd += (Number(values[value]) / 1e6);
  }
  console.log("total usd: " + totalusd + "m");

  //////// END TESTING AREA /////////////

  return allCoins;
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