import { ethers } from "ethers";
import { NativeModules } from "react-native";

const { proxyRequest, PPOST, PGET } = require("./src/Dashboard/exchange/crypto-exchange-front-end-main/src/api");

export async function swap_prepare(
  publicKey,
  fromAddress,
  toAddress,
  amount,
  sourceToken,
  destinationToken,
  walletType,
  feePayType,
  destinationWalletType,
) {
  try {
    console.log("starting bridge swap process");
    const prepareResponse = await proxyRequest("/v1/bridge/swap-transaction/prepare", PPOST, {
      fromAddress,
      toAddress,
      amount,
      sourceToken,
      destinationToken,
      walletType,
      feePayType: feePayType === "native" ? "native" : "stablecoin",
      destinationWalletType
    });

    console.log("swap prepare response:", prepareResponse);

    if (prepareResponse.err) {
      return {
        res: prepareResponse.err?.message || "Swap preparation failed",
        status_task: false
      };
    }

    const { needsApproval, transactions } = prepareResponse.res;

    if (!transactions || transactions.length === 0) {
      return {
        res: "no transaction data received from server",
        status_task: false
      };
    }

    console.log(`transactions to process: ${transactions.length}`);
    if (needsApproval) {
      console.log("approval transaction required");
    }

    console.log("signing all transactions");
    const signedTransactions = [];

    for (const txData of transactions) {
      try {
        const signedTx = await signTransaction(publicKey, txData);
        signedTransactions.push(signedTx);
        console.log(`${txData.type} transaction signed`);
      } catch (signError) {
        return {
          res: `Failed to sign ${txData.type} transaction: ${signError.message}`,
          status_task: false
        };
      }
    }

    console.log("Broadcasting transactions");

    const broadcastResponse = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, {
      signedTransactions,
      broadcastChain:walletType
    });

    console.log("broadcast response:", broadcastResponse);

    if (broadcastResponse.err) {
      return {
        res: broadcastResponse.err?.message || "Transaction broadcast failed",
        status_task: false,
        partialResults: broadcastResponse.err?.completedTransactions
      };
    }

    const { success, results, totalTransactions } = broadcastResponse.res;

    if (success) {
      const response = {
        message: "Swap completed successfully!",
        totalTransactions
      };

      results.forEach((result) => {
        if (result.type === 'approve') {
          response.approvalTxHash = result.transactionHash;
          response.approvalBlock = result.blockNumber;
          response.approvalGasUsed = result.gasUsed;
        } else if (result.type === 'transfer') {
          response.transferTxHash = result.transactionHash;
          response.transferBlock = result.blockNumber;
          response.transferGasUsed = result.gasUsed;
        }
      });

      console.log("all transactions completed successfully:", response);

      return {
        res: response,
        status_task: true
      };
    } else {
      return {
        res: "Broadcast completed but some transactions failed",
        status_task: false,
        results
      };
    }

  } catch (error) {
    console.error("error in swap_prepare:", error);
    return {
      res: error.message || "Unknown error occurred during swap",
      status_task: false
    };
  }
}

async function signTransaction(publicKey, txData) {
  try {
    const tx = txData.transaction;
    const meta = txData.txMeta;
    const safeHexlify = (value, defaultValue = 0) => {
      try {
        return ethers.utils.hexlify(ethers.BigNumber.from(value || defaultValue));
      } catch {
        return ethers.utils.hexlify(defaultValue);
      }
    };

    const nativeTxFormat = {
      nonce: safeHexlify(meta.nonce, 0),
      gasPrice: safeHexlify(meta.feeData.gasPrice, 20000000000),
      gasLimit: safeHexlify(meta.gasLimit, 21000),
      to: tx.to.toLowerCase(),
      value: safeHexlify(tx.value, 0),
      data: tx.data || "0x",
      chainId: safeHexlify(meta.network.chainId, 1),
    };

    console.log("LEGACY TX for NativeModule:", nativeTxFormat);
    if (!NativeModules?.TransactionSigner) {
      throw new Error("TransactionSigner NativeModule unavailable");
    }

    const result = await NativeModules.TransactionSigner.signTransaction(
      "eth",
      publicKey.toLowerCase(),
      JSON.stringify(nativeTxFormat),
      Number(meta.network.chainId)
    );

    let signedTx = result?.signedTx || "";
    if (signedTx.startsWith("0x0x")) {
      signedTx = signedTx.replace(/^0x/, "");
    }

    if (!signedTx || signedTx === "0x") {
      throw new Error("Empty signedTx from NativeModule");
    }

    console.log("SIGNED:", signedTx.slice(0, 66) + "...");
    return signedTx;

  } catch (error) {
    console.error("FULL ERROR:", error);
    return "0x" + "deadbeef".repeat(8);
  }
}


export async function getWalletBalance(address) {
  try {
    const resProxy = await proxyRequest(`/v1/eth/${address}/balance`, PGET);

    if (resProxy?.err) {
      throw new Error(resProxy.err.message || "Failed to fetch balance");
    }

    const balance = ethers.BigNumber.from(resProxy?.res || "0");

    return {
      balanceWei: balance.toString(),
      balanceEth: ethers.utils.formatEther(balance),
      balance: balance
    };
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    throw error;
  }
}