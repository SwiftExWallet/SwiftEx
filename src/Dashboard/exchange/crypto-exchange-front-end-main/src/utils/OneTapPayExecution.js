const FACTORY_ABI = require('../../../../../ethSwap/abi/factory.json');
const QUOTER_ABI = require('../../../../../ethSwap/abi/quoter.json');
const SWAP_ROUTER_ABI = require('../../../../../ethSwap/abi/swaprouter.json');
const POOL_ABI = require('../../../../../ethSwap/abi/pool.json');
const { ethers } = require('ethers');
const { proxyRequest, PPOST } = require('../api');
const { toString } = require('lodash');
const { getWalletBalance } = require('./getWalletInfo/EtherWalletService');
const { RPC } = require('../../../../constants');

const WETH_ABI = [
  "function deposit() external payable",
  "function withdraw(uint amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

// Contract Addresses
const ADDRESSES = {
  POOL_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B65B2d6b5dC217f',
  QUOTER: '0xb27308f9F90D607463bb33eA1Be4eD2508b5b3A9',
  SWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  WETH: {
    "symbol": "WETH",
    "decimals": 18,
    "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  },
  USDT: {
    "symbol": "USDT",
    "decimals": 6,
    "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  }
};

function calculateTxCost(tx) {
  const value = tx.value ? ethers.BigNumber.from(tx.value) : ethers.BigNumber.from(0);
  const gasLimit = ethers.BigNumber.from(tx.gasLimit || 0);
  const maxFeePerGas = ethers.BigNumber.from(tx.maxFeePerGas || 0);

  const gasCost = gasLimit.mul(maxFeePerGas);
  return value.add(gasCost);
}

function calculateTotalCost(rawTxs) {
  return rawTxs.reduce((acc, tx) => acc.add(calculateTxCost(tx)), ethers.BigNumber.from(0));
}

// === Main Swap Function ===
async function onSwapETHtoUSDC(amount, privateKey, fees) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC.ETHRPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = await wallet.getAddress();

    // Get ETH balance
    const ethRawBalance = await getWalletBalance(address, "ETH");
    const ethBalance = ethRawBalance.balance.toString();
    const balanceWei = ethers.utils.parseEther(ethBalance);

    const amountIn = ethers.utils.parseEther(amount);
    if (balanceWei.lt(amountIn)) {
      return {
        status: false,
        message: "Insufficient ETH balance",
        details: {
          requiredAmount: amount,
          currentBalance: ethBalance
        }
      };
    }

    const payload = {
      tokenIn: ADDRESSES.WETH,
      tokenOut: ADDRESSES.USDT,
      amount: amount,
      recipient: address,
    };
    console.log("prepare:payload", payload);

    // Send to backend
    const respo = await proxyRequest("/v1/eth/swap-transaction/prepare", PPOST, payload);
    console.log("prepare response:", respo);

    if (respo.err?.status) {
      return {
        status: false,
        message: respo.err.message||"Swap failed",
        details: respo.err.message||"failed to prepare swap"
      };
    }

    const rawTxs = respo.res;

    const totalCost = calculateTotalCost(rawTxs);
    if (balanceWei.lt(totalCost)) {
      return {
        status: false,
        message: "Insufficient funds for swap + gas",
        details: {
          available: ethers.utils.formatEther(balanceWei),
          required: ethers.utils.formatEther(totalCost),
          shortBy: ethers.utils.formatEther(totalCost.sub(balanceWei))
        }
      };
    }

    const signedTxs = [];
    for (const tx of rawTxs) {
      // Convert to BigInt for signing
      if (tx.value) tx.value = BigInt(tx.value);
      if (tx.gasLimit) tx.gasLimit = BigInt(tx.gasLimit);
      if (tx.maxFeePerGas) tx.maxFeePerGas = BigInt(tx.maxFeePerGas);
      if (tx.maxPriorityFeePerGas) tx.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);

      const signedTx = await wallet.signTransaction(tx);
      signedTxs.push(signedTx);
    }

    // Execute signed transactions
    const { res, err } = await proxyRequest(
      "/v1/eth/swap-transaction/execute",
      PPOST,
      { txs: signedTxs }
    );
console.log("execute---",res,err)
    if (err?.status) {
      return {
        status: false,
        message: err.message||"Swap failed",
        details: err.message||"failed to execute swap"
      };
    }

    if (res?.[0]?.receipt?.status === 1) {
        console.log("---inside the condition----")
      const QuotedAmountOutRes = await proxyRequest("/v1/eth/swap-quote", PPOST, {
        tokenIn: { address: ADDRESSES.WETH.address, symbol: ADDRESSES.WETH.symbol, decimals: ADDRESSES.WETH.decimals, chainId: 1 },
        tokenOut: { address: ADDRESSES.USDT.address, symbol: ADDRESSES.USDT.symbol, decimals: ADDRESSES.USDT.decimals, chainId: 1 },
        amount: toString(amount),
        recipient: address
      });
      console.log("QuotedAmountOutRes--",QuotedAmountOutRes)

      return {
        status: true,
        message: "Swap completed successfully",
        inputAmount: `${amount} ETH`,
        outputAmount: `${QuotedAmountOutRes?.res?.outputAmount}`,
        transactions: {
          approve: `https://etherscan.io/tx/${res?.[0].transactionHash}`,
          swap: `https://etherscan.io/tx/${res?.[1].transactionHash}`,
        }
      };
    }

    return {
      status: false,
      message: "Swap failed",
      details: "Unknown error after execution"
    };

  } catch (error) {
    console.log("error onSwapETHtoUSDC: ", error);
    return {
      status: false,
      message: "Swap failed",
      details: error.message
    };
  }
}

module.exports = { onSwapETHtoUSDC };
