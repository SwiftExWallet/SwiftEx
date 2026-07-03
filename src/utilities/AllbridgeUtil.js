import { RPC } from '../Dashboard/constants';
import {
  AllbridgeCoreSdk,
  Messenger,
  FeePaymentMethod,
  AmountFormat,
  nodeRpcUrlsDefault,
  mainnet,
} from "@allbridge/bridge-core-sdk";
import {rpc,Transaction, xdr} from '@stellar/stellar-sdk';
import LocalTxManager from './LocalTxManager';
import { SRBRPC } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/ExchangeConstants';
import { NativeModules } from 'react-native';
import ShortTermStorage from '../utilities/ShortTermStorage';

export async function getChainTokenData(sourceChain, destChain, sourceToken, destToken, amount) {
  console.log("Allbridge-Info--", sourceChain, destChain, sourceToken, destToken, amount);
  try {
    const sdk = new AllbridgeCoreSdk({ ETH: RPC.ETHRPC });
    if (!sourceChain || !destChain) {
      throw new Error("Both sourceChain and destChain are required.");
    }
    if (!sourceToken || !destToken) {
      throw new Error("Both sourceToken and destToken are required.");
    }
    if (!amount || isNaN(Number(amount))) {
      throw new Error("A valid numeric amount is required.");
    }
    const chains = await sdk.chainDetailsMap();
    const srcChain = chains[sourceChain];
    const dstChain = chains[destChain];
    if (!srcChain) throw new Error(`Source chain '${sourceChain}' not found.`);
    if (!dstChain) throw new Error(`Destination chain '${destChain}' not found.`);
    const srcToken = srcChain.tokens.find((t) => t.symbol === sourceToken);
    const dstToken = dstChain.tokens.find((t) => t.symbol === destToken);
    if (!srcToken) throw new Error(`Source token '${sourceToken}' not found for ${sourceChain}.`);
    if (!dstToken) throw new Error(`Destination token '${destToken}' not found for ${destChain}.`);
    const minimumReceiveAmount = await sdk.getAmountToBeReceived(
      amount,
      srcToken,
      dstToken,
      Messenger.ALLBRIDGE
    );
    const { gasFeeOptions } = await sdk.getAmountToBeReceivedAndGasFeeOptions(
      amount,
      srcToken,
      dstToken,
      Messenger.ALLBRIDGE
    );
    const feeObj = {
      native: {
        amount: gasFeeOptions.native.float,
        symbol: srcChain.nativeCurrencySymbol || "Native"
      },
      stablecoin: {
        amount: gasFeeOptions?.stablecoin?.float || "0",
        symbol: srcToken.symbol
      },
    };
    const trasTMinSec = sdk.getAverageTransferTime(srcToken, dstToken, Messenger.ALLBRIDGE);
    const trasTM = trasTMinSec !== null ? (trasTMinSec / 1000 / 60).toFixed(2) : null;
    const conversionRate = (parseFloat(minimumReceiveAmount) / parseFloat(amount)).toFixed(12);
    return {
      success: true,
      info: {
        conversionRate: conversionRate,
        minimumAmountOut: minimumReceiveAmount,
        slippageTolerance: 1,
        completionTime: trasTM + " Min",
        fee: feeObj,
      }
    };
  } catch (error) {
    const errorMsg = error.message || "Unknown error occurred.";
    console.debug("Error in allbridge quotes:", errorMsg);

    if (errorMsg.toLowerCase().includes("amount must be greater than zero")) {
      return {
        success: false,
        error: "Amount too low. Please enter a higher amount to proceed with the bridge."
      };
    }

    return { success: false, error: errorMsg };
  }
}

export async function swapPepare(
  sourceChain,
  destChain,
  sourceTokenSymbol,
  destTokenSymbol,
  amount,
  recipientAddress,
  stellarWallet,
  payFeeMode,
  isOtherAddress = false,
  userAddress
) {
  console.log("Allbridge-swap--", sourceChain, destChain, sourceTokenSymbol, destTokenSymbol, amount, recipientAddress);

  try {
    if (!stellarWallet) throw new Error("Wallet (signer) is required.");
    if (!recipientAddress) throw new Error("Recipient address is required.");

    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      SRB: SRBRPC,
      BNB: RPC.BSCRPC,
      ETH: RPC.ETHRPC
    });

    const sendTransactionWithRetry = async (
      sdk,
      sendParams,
      stellarWallet,
    ) => {
      try {
        const xdrTx = await sdk.bridge.rawTxBuilder.send(sendParams);
        const sorobanServer = new rpc.Server(SRBRPC);
        const env = xdr.TransactionEnvelope.fromXDR(xdrTx, "base64");
        const resourceFee = Number(env.v1().tx().ext().sorobanData().resourceFee().toString());
        env.v1().tx().fee(resourceFee + 5000);
        const transaction = new Transaction(env, mainnet.sorobanNetworkPassphrase);
        const txXDR = transaction.toXDR();
        const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
        transaction.addSignature(signedTx.publicKey, signedTx.signature);
        const result = await sorobanServer.sendTransaction(transaction);
        return result;
      } catch (error) {
        console.log(`error:`, error.message);
        throw error;
      }
    };

    const chainDetailsMap = await sdk.chainDetailsMap();
    const srcChain = chainDetailsMap[sourceChain];
    const dstChain = chainDetailsMap[destChain];

    if (!srcChain) throw new Error("Source chain not found.");
    if (!dstChain) throw new Error(`Destination chain '${destChain}' not found.`);

    const srcToken = srcChain.tokens.find((t) => t.symbol === sourceTokenSymbol);
    const dstToken = dstChain.tokens.find((t) => t.symbol === destTokenSymbol);

    if (!srcToken) throw new Error(`Source token '${sourceTokenSymbol}' not found for ${sourceChain}.`);
    if (!dstToken) throw new Error(`Destination token '${destTokenSymbol}' not found for ${destChain}.`);

    const sendParams = {
      amount: amount,
      fromAccountAddress: stellarWallet.publicKey,
      toAccountAddress: recipientAddress,
      sourceToken: srcToken,
      destinationToken: dstToken,
      messenger: Messenger.ALLBRIDGE,
      // extraGas: "1.5",
      // extraGasFormat: AmountFormat.FLOAT,
      gasFeePaymentMethod: payFeeMode === "native"
        ? FeePaymentMethod.WITH_NATIVE_CURRENCY
        : FeePaymentMethod.WITH_STABLECOIN,
    };

    const sent = await sendTransactionWithRetry(sdk, sendParams, stellarWallet, 2);

    if (sent.status === "ERROR") {
      return { success: false, error: "Transaction failed" };
    }

    if (sent.status === "TRY_AGAIN_LATER") {
      return { success: false, error: "Network busy. Please try again later." };
    }

    if (sent.status === "DUPLICATE") {
      return { success: false, error: "Duplicate transaction detected." };
    }

    if (sent.status === "PENDING") {
      await LocalTxManager.saveTx(isOtherAddress?userAddress:recipientAddress, {
        chain: sourceChain,
        hash: sent.hash,
        status: "pending",
        statusColor: "#eec14fff",
        timestamp: Date.now(),
        symbol: sourceTokenSymbol,
        amount: amount?.toString(),
      });
       await ShortTermStorage.syncTx({
          txHash: sent.hash,
          walletAddress: stellarWallet.publicKey,
          provider: "ALLBRIDGE",
          fromChain: sourceChain,
          fromToken: sourceTokenSymbol,
          toChain: destChain,
          toToken: destTokenSymbol,
          amountIn: amount?.toString(),
          amountOut: amount?.toString(),
          txType:"Bridge"
        })

      return { success: true, txHash: sent.hash };
    }

    console.warn("Unexpected transaction status:", sent.status);
    return { success: false, error: `Unexpected status: ${sent.status}` };

  } catch (err) {
    console.error("Error in allbridge swap:", err.message || err);
    return { success: false, error: err.message || "Unknown error occurred." };
  }
}