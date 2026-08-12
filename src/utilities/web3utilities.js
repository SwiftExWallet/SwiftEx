import "react-native-get-random-values";
import "@ethersproject/shims";
import { ethers } from "ethers";
import { getBalance, getEthBalance, getMaticBalance, getXrpBalance } from "../components/Redux/actions/auth";
import AsyncStorageLib from "@react-native-async-storage/async-storage";

  export function checkAddressValidity(address) {
    const validity = ethers.utils.isAddress(address)
    return validity
  }

  export const getAllBalances = async (state,dispatch) => {
    try {
      const wallet = await AsyncStorageLib.getItem("wallet");
      const xrpAddress = await state.wallet.xrp.address?await state.wallet.xrp.address:''
      const address = (await state.wallet.address)
        ? await state.wallet.address
        : "";

      AsyncStorageLib.getItem("walletType").then(async (type) => {
        console.log("hi" + JSON.parse(type));
        if (!state.wallet.address) {
          console.log('no wallet selected');
        } else if (JSON.parse(type) == "Matic") {
          await dispatch(getMaticBalance(address))
            .then(async (res) => {
              let bal = await AsyncStorageLib.getItem("MaticBalance");
              console.log(bal);
              if (res) {
                console.log(res);
              } else {
                console.log("coudnt get balance");
              }
            })
            .catch((e) => {
              console.log(e);
            });
        } else if (JSON.parse(type) == "Ethereum") {
          dispatch(getEthBalance(address))
            .then(async (e) => {
              const Eth = await e.EthBalance;
              let bal = await AsyncStorageLib.getItem("EthBalance");

              if (Eth) {
                console.log(res);
              } else {
                console.log("coudnt get balance");
              }
            })
            .catch((e) => {
              console.log(e);
            });
        } else if (JSON.parse(type) == "BSC") {
          const balance = await state.walletBalance;
          if (balance) {
            console.log(res);
          }
        } else if (JSON.parse(type) == "Xrp") {
          console.log("entering xrp balance");
          try {
            const resp = dispatch(getXrpBalance(address))
              .then((response) => {
                console.log(response);
              })
              .catch((e) => {
                console.log(e);
              });
          } catch (e) {
            console.log(e);
          }
        } else if (JSON.parse(type) == "Multi-coin") {

          dispatch(getMaticBalance(address))
          dispatch(getEthBalance(address))
          dispatch(getBalance(address))
          dispatch(getXrpBalance(xrpAddress))
        } else {
          console.log('error')
        }
      });
    } catch (e) {
      console.log(e);
    }
  };
