// import { Pool } from "@uniswap/v3-sdk";
// import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
// import { abi as QuoterABI } from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
// import IUniswapV2Factory from "@uniswap/v2-core/build/IUniswapV2Factory.json";
// import {
//   abi as SWAP_ROUTER_ABI,
//   bytecode as SWAP_ROUTER_BYTECODE,
// } from "@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json";
// import { schema } from "@uniswap/token-lists";
// import Ajv from "ajv";
// import addFormats from "ajv-formats";
// import fetch from "node-fetch";
// import {
//   ChainId,
//   Token,
//   Fetcher,
//   Route,
//   TradeType,
//   TokenAmount,
//   Trade,
//   WETH,
// } from "@uniswap/sdk";
// import "react-native-get-random-values";
// import "@ethersproject/shims";
// import { EthereumSecret, RPC } from "../constants";
// const { Percent } = require("@uniswap/sdk");
// var ethers = require("ethers");
// const UNISWAP = require("@uniswap/sdk");
// const axios = require("axios");

// const getTokens = async () => {
//   const ARBITRUM_LIST = "https://bridge.arbitrum.io/token-list-42161.json";

//   const ajv = new Ajv({ allErrors: true, verbose: true });
//   addFormats(ajv);
//   const validator = ajv.compile(schema);
//   const response = await fetch(ARBITRUM_LIST);
//   const data = await response.json();
//   //const valid = validator(data)
//   if (data) {
//     console.log(data);
//     return data;
//   }
//   if (validator.errors) {
//     throw validator.errors.map((error) => {
//       delete error.data;
//       return error;
//     });
//   }
// };

// const getPair = async () => {
//   const provider = new ethers.providers.JsonRpcProvider(
//     "https://1rpc.io/eth"
//   );
//   const poolAddress = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
//   const poolImmutablesAbi = [
//     "function factory() external view returns (address)",
//     "function token0() external view returns (address)",
//     "function token1() external view returns (address)",
//     "function fee() external view returns (uint24)",
//     "function tickSpacing() external view returns (int24)",
//     "function maxLiquidityPerTick() external view returns (uint128)",
//   ];
//   const poolContract = new ethers.Contract(
//     poolAddress,
//     poolImmutablesAbi,
//     provider
//   );

//   const response = {
//     factory: await poolContract.factory(),
//     token0: await poolContract.token0(),
//     token1: await poolContract.token1(),
//     fee: await poolContract.fee(),
//     tickSpacing: await poolContract.tickSpacing(),
//     maxLiquidityPerTick: await poolContract.maxLiquidityPerTick(),
//   };
//   console.log(response);
//   // let uniswapURL = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2" ; // https://thegraph.com/explorer/subgraph/uniswap/uniswap-v2
//   return response;
//   /*try {
//   const result = await axios.post(
//       uniswapURL,
//       {
//           query: `
//           {
//             tokens(where:{symbol:"BTC"}) {
//             name
//             id
//             whitelistPools {
//               id
//               token0 {
//                 id
//                 symbol
//               }
//               token1 {
//                 id
//                 symbol
//               }
//             }
//           }
//         }
//           `
//       }
//       );           
//       console.log ("Query result: \n", result.data.data.tokens);
// } catch (err){
//   console.log(err);
// }*/
// };

// const createPool = async (coin0, coin1) => {
//   const provider = new ethers.providers.JsonRpcProvider(
//     "https://eth-rpc.gateway.pokt.network"
//   );
//   const poolAddress = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
//   const poolContract = new ethers.Contract(
//     poolAddress,
//     IUniswapV3PoolABI,
//     provider
//   );

//   const [factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick] =
//     await Promise.all([
//       poolContract.factory(),
//       poolContract.token0(),
//       poolContract.token1(),
//       poolContract.fee(),
//       poolContract.tickSpacing(),
//       poolContract.maxLiquidityPerTick(),
//     ]);

//   const immutables = {
//     factory,
//     token0,
//     token1,
//     fee,
//     tickSpacing,
//     maxLiquidityPerTick,
//   };
//   console.log(immutables);
//   const [liquidity, slot] = await Promise.all([
//     poolContract.liquidity(),
//     poolContract.slot0(),
//   ]);

//   const PoolState = {
//     liquidity,
//     sqrtPriceX96: slot[0],
//     tick: slot[1],
//     observationIndex: slot[2],
//     observationCardinality: slot[3],
//     observationCardinalityNext: slot[4],
//     feeProtocol: slot[5],
//     unlocked: slot[6],
//   };

//   //const [immutables, state] = await Promise.all([getPoolImmutables(), getPoolState()])
//   console.log("hi" + immutables.token0);
//   const TokenA = new Token(5, immutables.token0, 6, "WETH", "Wrapped Ether");

//   const TokenB = new Token(5, immutables.token1, 18, coin1.symbol, coin1.name);

//   const poolExample = new Pool(
//     TokenA,
//     TokenB,
//     immutables.fee,
//     PoolState.sqrtPriceX96.toString(),
//     PoolState.liquidity.toString(),
//     PoolState.tick
//   );
//   console.log(poolExample);
//   const quoterContract = new ethers.Contract(
//     "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
//     QuoterABI,
//     provider
//   );
//   const amountIn = 1500;

//   const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
//     immutables.token0,
//     immutables.token1,
//     immutables.fee,
//     amountIn.toString(),
//     0
//   );
//   console.log(ethers.utils.formatEther(quotedAmountOut));
//   const tradePrice = ethers.utils.formatEther(quotedAmountOut);
//   return Number(tradePrice).toFixed(10);
// };
// function toHex(Amount) {
//   return `0x${Amount.raw.toString(16)}`;
// }

// // const getETHtoTokenPrice = async (tokenaddress, amount) => {
// //   try {
// //     //console.log(coin1,coin2)
// //     const provider = new ethers.providers.JsonRpcProvider(RPC.ETHRPC);
// //     const chainId = ChainId.GÖRLI;
// //     const UNISWAP_ROUTER_ADDRESS = "";
// //     const UNISWAP_ROUTER_ABI = [
// //       "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
// //       "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
// //       "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
// //     ];

// //     const UNISWAP_ROUTER_CONTRACT = new ethers.Contract(
// //       UNISWAP_ROUTER_ADDRESS,
// //       UNISWAP_ROUTER_ABI,
// //       provider
// //     );
// //     // let pair
// //     // let route
// //     // let trade

// //     let tokenAddress = tokenaddress.toString(); //
// //     const token = await Fetcher.fetchTokenData(chainId, tokenAddress, provider);

// //     const weth = WETH[token.chainId];
// //     const pair = await Fetcher.fetchPairData(token, weth, provider);
// //     const pair2 = await Fetcher.fetchPairData(weth, token, provider);

// //     const amountIn = ethers.utils.parseEther(amount);
// //     const route = new Route([pair], weth);
// //     const route2 = new Route([pair2], token);

// //     const trade = new Trade(
// //       route,
// //       new TokenAmount(weth, amountIn),
// //       TradeType.EXACT_INPUT
// //     );
// //     const trade2 = new Trade(
// //       route2,
// //       new TokenAmount(token, amountIn),
// //       TradeType.EXACT_INPUT
// //     );

// //     console.log(
// //       `Mid Price WETH --> ${token.address}:`,
// //       route.midPrice.toSignificant(6)
// //     );
// //     console.log(
// //       `Mid Price ${token.address}: --> WETH`,
// //       route2.midPrice.toSignificant(6)
// //     );
// //     const slippageTolerance = new Percent("1", "100");
// //     console.log(trade.minimumAmountOut(slippageTolerance).toSignificant(6));
// //     console.log(trade2.minimumAmountOut(slippageTolerance).toSignificant(6));

// //     const tradeDetails = {
// //       slippageTolerance: slippageTolerance.toSignificant(1),
// //       minimumAmountOut: trade
// //         .minimumAmountOut(slippageTolerance)
// //         .toSignificant(6),
// //     };

// //     return {
// //       token1totoken2: trade.minimumAmountOut(slippageTolerance).toSignificant(6),
// //       token2totoken1: trade2.minimumAmountOut(slippageTolerance).toSignificant(6),
// //       trade: tradeDetails,
// //     };
// //   } catch (err) {
// //     console.log("ERROR_SWAP_FUNCTION====",err);
// //   }
// // };

// async function getETHtoTokenPrice(tokenAddress, ethAmount) {
//   console.log("----->getting Enter",tokenAddress,ethAmount)
//   const provider = new ethers.providers.JsonRpcProvider(RPC.ETHRPC)

//   const chainId = ChainId.MAINNET;
//   const token = await Fetcher.fetchTokenData(chainId, tokenAddress, provider);
//   const weth = WETH[chainId];

//   const pair = await Fetcher.fetchPairData(token, weth, provider);
//   const route = new Route([pair], weth);

//   const amountIn = ethers.utils.parseEther(ethAmount);
//   const trade = new Trade(route, new TokenAmount(weth, amountIn), TradeType.EXACT_INPUT);

//   const slippageTolerance = new Percent("1", "100");
//   const token1totoken2 = trade.minimumAmountOut(slippageTolerance).toSignificant(6);

//   const pair2 = await Fetcher.fetchPairData(weth, token, provider);
//   const route2 = new Route([pair2], token);
//   const trade2 = new Trade(route2, new TokenAmount(token, amountIn), TradeType.EXACT_INPUT);
//   const token2totoken1 = trade2.minimumAmountOut(slippageTolerance).toSignificant(6);

//   const tradeDetails = {
//     slippageTolerance: slippageTolerance.toSignificant(1),
//     minimumAmountOut: trade.minimumAmountOut(slippageTolerance).toSignificant(6),
//     conversionRate: trade2.executionPrice.toSignificant(6)
//   };
//   console.log("----->getting Return",  token1totoken2,token2totoken1,tradeDetails,)
//   return {
//     token1totoken2,
//     token2totoken1,
//     trade: tradeDetails,
//   };
// }
// const getTokentoEthPrice = async (tokenaddress, amount) => {
//   try {
//     //console.log(coin1,coin2)
//     const provider = new ethers.providers.JsonRpcProvider(RPC.ETHRPC);
//     const chainId = ChainId.MAINNET;
//     const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
//     const UNISWAP_ROUTER_ABI = [
//       "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
//       "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//       "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//     ];

//     const UNISWAP_ROUTER_CONTRACT = new ethers.Contract(
//       UNISWAP_ROUTER_ADDRESS,
//       UNISWAP_ROUTER_ABI,
//       provider
//     );
//     // let pair
//     // let route
//     // let trade

//     let tokenAddress = tokenaddress.toString(); //'0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60'
//     const token = await Fetcher.fetchTokenData(chainId, tokenAddress, provider);

//     const weth = WETH[token.chainId];
//     const pair = await Fetcher.fetchPairData(weth, token, provider);
//     const pair2 = await Fetcher.fetchPairData(weth, token, provider);

//     const amountIn = ethers.utils.parseEther(amount);
//     const route = new Route([pair], weth);
//     const route2 = new Route([pair2], token);

//     const trade = new Trade(
//       route,
//       new TokenAmount(weth, amountIn),
//       TradeType.EXACT_INPUT
//     );
//     const trade2 = new Trade(
//       route2,
//       new TokenAmount(token, amountIn),
//       TradeType.EXACT_INPUT
//     );

//     console.log(
//       `Mid Price WETH --> ${token.address}:`,
//       route.midPrice.toSignificant(6)
//     );
//     console.log(
//       `Mid Price ${token.address}: --> WETH`,
//       route2.midPrice.toSignificant(6)
//     );
//     const slippageTolerance = new Percent("1", "100");
//     console.log(trade2.minimumAmountOut(slippageTolerance).toSignificant(6));
//     const tradeDetails = {
//       slippageTolerance: slippageTolerance.toSignificant(1),
//       minimumAmountOut: trade2
//         .minimumAmountOut(slippageTolerance)
//         .toSignificant(6),
//     };

//     return {
//       token1totoken2: trade2.minimumAmountOut(slippageTolerance).toSignificant(6),
//       token2totoken1: trade.minimumAmountOut(slippageTolerance).toSignificant(6),
//       trade: tradeDetails,
//     };
//   } catch (err) {
//     console.log(err);
//   }
// };

// const swapTokensforEth = async (privateKey, address, tokenaddress, amount) => {
//   try {
//     const provider = new ethers.providers.JsonRpcProvider(RPC.ETHRPC);
//     const chainId = ChainId.MAINNET;
//     const gas = await provider.getGasPrice();
//     const UNISWAP_ROUTER_ABI = [
//       "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
//       "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//       "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//     ];

//     const tokenAddress = tokenaddress; //'0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60'
//     const token = await Fetcher.fetchTokenData(chainId, tokenAddress, provider);

//     const weth = WETH[token.chainId];
//     const pair = await Fetcher.fetchPairData(token, weth, provider);
//     const amountIn = ethers.utils.parseEther(amount);
//     const route = new Route([pair], token);
//     const trade = new Trade(
//       route,
//       new TokenAmount(token, amountIn),
//       TradeType.EXACT_INPUT
//     );
//     console.log(
//       `Mid Price ${token.address}  --> WETH:`,
//       route.midPrice.toSignificant(6)
//     );
//     const slippageTolerance = new Percent("1", "100");
//     const amountOutMin = toHex(trade.minimumAmountOut(slippageTolerance));
//     if (trade.minimumAmountOut(slippageTolerance)) {
//       const path = [token.address, weth.address];
//       const to = address;
//       const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
//       const value = toHex(trade.inputAmount);

//       const signer = new ethers.Wallet(privateKey);
//       const account = signer.connect(provider);
//       const uniswap = new ethers.Contract(
//         "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
//         [
//           "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//           "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//           "function approve(address _spender, uint256 _value) public returns (bool success)",
//           "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
//         ],
//         account
//       );
//       console.log(gas);
//       const amountOut = toHex(trade.minimumAmountOut(slippageTolerance));
//       const approveToken = new ethers.Contract(
//         token.address,
//         ["function approve(address spender, uint amount) public returns(bool)"],
//         account
//       );

//       await approveToken.connect(account).approve(
//         "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
//         value // APPROVE TRADING 1000 DOBO?
//       );
//       const tx = await uniswap.swapExactTokensForETH(
//         value,
//         amountOut,
//         path,
//         to,
//         deadline,
//         { gasLimit: 500000 }
//       );

//       tx.wait();
//       console.log(tx);
//       const txx = tx.wait();
//       if (txx) {
//         console.log(txx);
//         return { Code: 401, tx: txx };
//       } else {
//         return 400;
//       }

//       return tx;
//     } else {
//       const response = 404;
//       return response;
//     }
//   } catch (error) {
//     console.log(error);
//   }
// };
// const SwapEthForTokens = async (privateKey, address, tokenaddress, amount) => {
//   try {
//     const provider = new ethers.providers.JsonRpcProvider(RPC.ETHRPC);
//     const chainId = ChainId.MAINNET;
//     const gas = await provider.getGasPrice();
//     const UNISWAP_ROUTER_ABI = [
//       "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
//       "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//       "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//     ];

//     const tokenAddress = tokenaddress; //'0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60'
//     const token = await Fetcher.fetchTokenData(chainId, tokenAddress, provider);

//     const weth = WETH[token.chainId];
//     const pair = await Fetcher.fetchPairData(token, weth, provider);
//     console.log("****pair******",pair)

//     const amountIn = ethers.utils.parseEther(amount);
//     const route = new Route([pair], weth);
//     const trade = new Trade(
//       route,
//       new TokenAmount(weth, amountIn),
//       TradeType.EXACT_INPUT
//     );
//     console.log(
//       `Mid Price WETH --> ${token.address}:`,
//       route.midPrice.toSignificant(6)
//     );
//     const slippageTolerance = new Percent("1", "100");
//     const amountOutMin = toHex(trade.minimumAmountOut(slippageTolerance));
//     if (trade.minimumAmountOut(slippageTolerance)) {
//       const path = [weth.address, token.address];
//       const path2 = [token.address, weth.address];
//       const to = address;
//       const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
//       const value = toHex(trade.inputAmount);

//       const signer = new ethers.Wallet(privateKey);
//       const account = signer.connect(provider);
//       const uniswap = new ethers.Contract(
//         "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
//         [
//           "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//           "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//         ],
//         account
//       );

//       const tx = await uniswap.swapExactETHForTokens(
//         amountOutMin,
//         path,
//         to,
//         deadline,
//         { value, gasPrice: gas }
//       );
//       tx.wait();
//       console.log(tx.wait());
//       const txx = await tx.wait();
//       console.log("*************-------",txx)
//       if (txx) {
//         return { code: 401, tx: txx };
//       } else {
//         return { code: 400 };
//       }
//     } else {
//       const response = 404;
//       return response;
//     }
//   } catch (error) {
//     console.log("-----OP----",error);
//   }
// };

// export {
//   getPair,
//   getETHtoTokenPrice,
//   getTokentoEthPrice,
//   getTokens,
//   createPool,
//   SwapEthForTokens,
//   swapTokensforEth,
// };

// /* let uniswapURL = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2" 
//         const result = await axios.post(
//             uniswapURL,
//             {
//                 query: `
                
//                 {
//  query tokens($skip: Int!) {
//    tokens(first: 1000, skip: $skip) {
//      id
//      name
//      symbol
//    }
//  }
// }
//                 `
//             }
//             );           
//             console.log ("Query result: \n", result.data.data.pair);*/
