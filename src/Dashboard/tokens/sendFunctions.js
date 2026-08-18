import "react-native-get-random-values";
import "@ethersproject/shims";
import { alert } from "../reusables/Toasts";
import { PGET, proxyRequest } from "../exchange/crypto-exchange-front-end-main/src/api";
import { NativeModules } from "react-native";
var ethers = require("ethers");

const sendEth = async (
  publicKey,
  amount,
  addressTo,
  addressFrom,
  balance,
  setLoading
) => {
  try {
    const { res, err } = await proxyRequest(
      `/v1/eth/wallet-address/${publicKey}/info`,
      PGET
    );
    if (err) {
      alert("error", err.message || "Something went wrong...");
      setLoading(false);
      return null;
    }

    // --- Parse everything into BigNumber up front. Never mix Number() math
    // with 18-decimal token amounts — JS Number loses precision beyond
    // ~15-17 significant digits and will silently corrupt the value. ---
    let amountBN, balanceBN;
    try {
      amountBN = ethers.utils.parseEther(amount.toString());
      balanceBN = ethers.utils.parseEther(balance.toString());
    } catch (e) {
      alert("error", "Invalid amount or balance format");
      setLoading(false);
      return null;
    }

    if (amountBN.lte(0)) {
      alert("error", "Amount must be greater than zero");
      setLoading(false);
      return null;
    }

    const gasLimit = ethers.BigNumber.from(21000);
    const rawGasPrice = res.gasFeeData.gasPrice || res.gasFeeData.maxFeePerGas;
    if (!rawGasPrice) {
      alert("error", "Unable to fetch gas price");
      setLoading(false);
      return null;
    }

    const gasPriceBN = ethers.BigNumber.from(rawGasPrice.toString());
    const bumpedGasPrice = gasPriceBN.mul(120).div(100); // +20% buffer
    const estimatedFeeBN = bumpedGasPrice.mul(gasLimit);

    if (balanceBN.lte(estimatedFeeBN)) {
      alert("error", "Balance too low to cover gas fees");
      setLoading(false);
      return null;
    }

    // --- Max-send detection done entirely in BigNumber, no float compare ---
    let finalAmountBN = amountBN;
    let isMaxSend = false;

    if (amountBN.gte(balanceBN)) {
      isMaxSend = true;
      finalAmountBN = balanceBN.sub(estimatedFeeBN);
      if (finalAmountBN.lte(0)) {
        alert("error", "Balance too low to cover gas fees");
        setLoading(false);
        return null;
      }
    } else {
      const totalRequired = amountBN.add(estimatedFeeBN);
      if (balanceBN.lt(totalRequired)) {
        alert("error", "Insufficient balance to cover amount and gas");
        setLoading(false);
        return null;
      }
    }

    const transaction = {
      nonce: ethers.utils.hexlify(res.transactionCount),
      gasPrice: ethers.utils.hexlify(bumpedGasPrice),
      gasLimit: ethers.utils.hexlify(gasLimit),
      to: addressTo,
      value: ethers.utils.hexlify(finalAmountBN),
      data: "0x",
      chainId: 1,
    };

    const signedTx = await NativeModules.TransactionSigner.signTransaction(
      "eth",
      addressFrom,
      JSON.stringify(transaction),
      1
    );

    let rawTransaction = signedTx.signedTx;
    if (rawTransaction.startsWith("0x0x")) {
      rawTransaction = rawTransaction.slice(2); // strip one leading "0x"
    }

    const info = {
      type: "Eth",
      fee: estimatedFeeBN,
      rawTransaction,
      addressTo,
      addressFrom,
      amount: ethers.utils.formatEther(finalAmountBN), // precise, BigNumber-derived
      wasMaxSend: isMaxSend,
    };

    return info;
  } catch (error) {
    console.error("sendEth Error:", error.message);
    alert("error", error.message || "Transaction failed");
    return null;
  } finally {
    setLoading(false);
  }
};

const sendBNB = async (
  publicKey,
  amount,
  addressTo,
  addressFrom,
  balance,
  setLoading
) => {
  try {
    const { res, err } = await proxyRequest(
      `/v1/bsc/wallet-address/${publicKey}/info`,
      PGET
    );
    if (err) {
      alert("error", err.message || "Something went wrong...");
      setLoading(false);
      return null;
    }

    // --- Parse everything into BigNumber up front. Never mix Number() math
    // with 18-decimal amounts — JS Number loses precision beyond ~15-17
    // significant digits and will silently corrupt the value. ---
    let amountBN, balanceBN;
    try {
      amountBN = ethers.utils.parseEther(amount.toString());
      balanceBN = ethers.utils.parseEther(balance.toString());
    } catch (e) {
      alert("error", "Invalid amount or balance format");
      setLoading(false);
      return null;
    }

    if (amountBN.lte(0)) {
      alert("error", "Amount must be greater than zero");
      setLoading(false);
      return null;
    }

    if (!res.gasFeeData.gasPrice) {
      alert("error", "Unable to fetch gas price");
      setLoading(false);
      return null;
    }

    const gasLimit = ethers.BigNumber.from(21000);
    const gasPriceBN = ethers.BigNumber.from(res.gasFeeData.gasPrice.toString());
    const estimatedFeeBN = gasPriceBN.mul(gasLimit);

    if (balanceBN.lte(estimatedFeeBN)) {
      alert("error", "Balance too low to cover gas fees");
      setLoading(false);
      return null;
    }

    // --- Max-send detection done entirely in BigNumber, no float compare ---
    let finalAmountBN = amountBN;
    let isMaxSend = false;

    if (amountBN.gte(balanceBN)) {
      isMaxSend = true;
      finalAmountBN = balanceBN.sub(estimatedFeeBN);
      if (finalAmountBN.lte(0)) {
        alert("error", "Balance too low to cover gas fees");
        setLoading(false);
        return null;
      }
    } else {
      const totalRequired = amountBN.add(estimatedFeeBN);
      if (balanceBN.lt(totalRequired)) {
        alert("error", "Insufficient balance to cover amount and gas");
        setLoading(false);
        return null;
      }
    }

    const transaction = {
      nonce: ethers.utils.hexlify(res.transactionCount),
      gasPrice: ethers.utils.hexlify(gasPriceBN),
      gasLimit: ethers.utils.hexlify(gasLimit),
      to: addressTo,
      value: ethers.utils.hexlify(finalAmountBN),
      data: "0x",
      chainId: 56,
    };

    const signedTx = await NativeModules.TransactionSigner.signTransaction(
      "bsc",
      addressFrom,
      JSON.stringify(transaction),
      56
    );

    let rawTransaction = signedTx.signedTx;
    if (rawTransaction.startsWith("0x0x")) {
      rawTransaction = rawTransaction.slice(2); // strip one leading "0x"
    }

    const info = {
      type: "BSC",
      fee: estimatedFeeBN,
      rawTransaction,
      addressTo,
      addressFrom,
      amount: ethers.utils.formatEther(finalAmountBN), // precise, BigNumber-derived
      wasMaxSend: isMaxSend,
    };

    return info;
  } catch (error) {
    console.error("sendBNB Error:", error.message);
    alert("error", error.message || "Transaction failed");
    return null;
  } finally {
    setLoading(false);
  }
};

const SendCrypto = async (recieverAddress, amount, decrypt, balance, setLoading, walletType, setDisable, myAddress, Token, navigation) => {
  try {
    setLoading(true);
    const addressTo = recieverAddress;
    const addressFrom = myAddress ? myAddress : alert("please choose a wallet first");
    if (walletType == "Ethereum") {
      const response = await sendEth(addressFrom, amount, addressTo, addressFrom, balance, setLoading);
      let info = response;
      const feeBN = ethers.BigNumber.from(info.fee.toString());
      const feeInEth = ethers.utils.formatEther(feeBN);
      let finalAmount = Number(info.amount) + Number(feeInEth);
      info.finalAmount = finalAmount
      setLoading(false);
      if (Number(finalAmount) > Number(balance)) {

        return alert("error", "You don't have enough balance to do this transaction")
      }
      navigation.navigate("Confirm Tx", {
        info,
      });
    } else if (walletType == "BSC") {
      const response = await sendBNB(addressFrom, amount, addressTo, addressFrom, balance, setLoading);
      let info = response;
      const feeBN = ethers.BigNumber.from(info.fee.toString());
      const feeInEth = ethers.utils.formatEther(feeBN);
      let finalAmount = Number(info.amount) + Number(feeInEth);
      info.finalAmount = finalAmount
      setLoading(false);
      if (Number(finalAmount) > Number(balance)) {
        return alert("error", "You don't have enough balance to do this transaction")
      }
      navigation.navigate("Confirm Tx", {
        info,
      });
    } else if (walletType === "Multi-coin") {
      if (Token === "ETH") {
        const response = await sendEth(addressFrom, amount, addressTo, addressFrom, balance, setLoading)
        let info = response;
        const feeBN = ethers.BigNumber.from(info.fee.toString());
        const feeInEth = ethers.utils.formatEther(feeBN);
        let finalAmount = Number(info.amount) + Number(feeInEth);
        info.finalAmount = finalAmount
        setLoading(false);
        if (Number(finalAmount) > Number(balance)) {
          return alert("error", "You don't have enough balance to do this transaction")
        }
        navigation.navigate("Confirm Tx", {
          info,
        });
      } else if (Token === "BNB") {
        const response = await sendBNB(
          addressFrom,
          amount,
          addressTo,
          addressFrom,
          balance,
          setLoading
        )
        let info = response;
        const feeBN = ethers.BigNumber.from(info.fee.toString());
        const feeInEth = ethers.utils.formatEther(feeBN);
        let finalAmount = Number(info.amount) + Number(feeInEth);
        info.finalAmount = finalAmount
        setLoading(false);
        if (Number(finalAmount) > Number(balance)) {
          return alert("error", "You don't have enough balance to do this transaction")
        }
        navigation.navigate("Confirm Tx", {
          info,
        });
      }
    } else {
      setDisable(true);
      setLoading(false);
      return alert("error", "chain not supported yet");
    }
    setLoading(false);
  } catch (e) {
    if (e.message == 'invalid arrayify value (argument="value", value="-0xbefe6f671f38", code=INVALID_ARGUMENT, version=bytes/5.7.0)') {
      setLoading(false);
      return alert("error", "You don't have enough balance to do this transaction")
    }
    else if (e.message == 'fractional component exceeds decimals [ See: https://links.ethers.org/v5-errors-NUMERIC_FAULT ] (fault="underflow", operation="parseFixed", code=NUMERIC_FAULT, version=bignumber/5.7.0)') {
      setLoading(false)
      return alert("error", "You don't have enough balance to do this transaction")
    }
    alert("error", e)
    console.error("catch-error", e)
    setLoading(false);
  }
};
export { SendCrypto };