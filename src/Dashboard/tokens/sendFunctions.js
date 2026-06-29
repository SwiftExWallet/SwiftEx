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

  const { res, err } = await proxyRequest(`/v1/eth/wallet-address/${publicKey}/info`, PGET);
  if (err) {
    alert("error", err.message || "Something went wrong...");
    return;
  }

  const gasLimit = 21000;
  const rawGasPrice = res.gasFeeData.gasPrice || res.gasFeeData.maxFeePerGas;
  const gasPriceBN = ethers.BigNumber.from(rawGasPrice.toString());
  const bumpedGasPrice = gasPriceBN.mul(120).div(100);
  const estimatedFeeBN = bumpedGasPrice.mul(gasLimit);
  const feeInEth = ethers.utils.formatEther(estimatedFeeBN);

  if (Number(amount) === Number(balance)) {
    amount = (Number(amount) - Number(feeInEth)).toString();
  }

  const transaction = {
    nonce: ethers.utils.hexlify(res.transactionCount),
    gasPrice: ethers.utils.hexlify(bumpedGasPrice),
    gasLimit: ethers.utils.hexlify(gasLimit),
    to: addressTo,
    value: ethers.utils.hexlify(ethers.utils.parseEther(amount)),
    data: "0x",
  };

  const signedTx = await NativeModules.TransactionSigner.signTransaction(
    "eth",
    addressFrom,
    JSON.stringify(transaction),
    1
  );

  let rawTransaction = signedTx.signedTx;
  if (rawTransaction.startsWith("0x0x")) {
    rawTransaction = rawTransaction.replace(/^0x/, "");
  }
  setLoading(false);
  const info = {
    type: "Eth",
    fee: estimatedFeeBN,
    rawTransaction: rawTransaction,
    addressTo: addressTo,
    addressFrom: addressFrom,
    amount: amount,
  };
  return info;
};

const sendBNB = async (publicKey, amount, addressTo, addressFrom, balance, setLoading) => {
  const { res, err } = await proxyRequest(`/v1/bsc/wallet-address/${publicKey}/info`, PGET);
  if (err) {
    alert("error", err.message || "Something went wrong...");
    return;
  }
  const gasPriceBN = ethers.BigNumber.from(res.gasFeeData.gasPrice);
  const gasLimit = 21000;
  const estimatedFeeBN = gasPriceBN.mul(gasLimit);
  const feeInEth = ethers.utils.formatEther(estimatedFeeBN);

  if (Number(amount) === Number(balance)) {
    let Amount = Number(amount) - Number(feeInEth);
    amount = Amount.toString();
  }

  let transaction = {
    nonce: ethers.utils.hexlify(res.transactionCount),
    gasPrice: ethers.utils.hexlify(gasPriceBN),
    gasLimit: ethers.utils.hexlify(gasLimit),
    to: addressTo,
    value: ethers.utils.hexlify(ethers.utils.parseEther(amount)),
    data: "0x",
  };

  const signedTx = await NativeModules.TransactionSigner.signTransaction(
    "bsc",
    addressFrom,
    JSON.stringify(transaction),
    56
  );

  let rawTransaction = signedTx.signedTx;
  if (rawTransaction.startsWith("0x0x")) {
    rawTransaction = rawTransaction.replace(/^0x/, "");
  }
  setLoading(false);
  const info = {
    type: "BSC",
    fee: estimatedFeeBN,
    rawTransaction: rawTransaction,
    addressTo: addressTo,
    addressFrom: addressFrom,
    amount: amount,
  };
  return info;
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