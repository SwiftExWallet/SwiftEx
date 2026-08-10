import Web3 from "web3"
import { RPC } from "../Dashboard/constants"
import "react-native-get-random-values";
import "@ethersproject/shims";
import { ethers } from "ethers";
import { getBalance, getEthBalance, getMaticBalance, getXrpBalance } from "../components/Redux/actions/auth";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import store from "../components/Redux/Store";
const xrpl = require("xrpl");



export const watchEtherTransfers = ()=> {
    // Instantiate web3 with WebSocket provider
    const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://rinkeby.infura.io/ws'))
  
    // Instantiate subscription object
    const subscription = web3.eth.subscribe('pendingTransactions')
  
    // Subscribe to pending transactions
    subscription.subscribe((error, result) => {
      if (error) console.log(error)
    })
    .on('data', async (txHash) => {
      try {
        // Instantiate web3 with HttpProvider
        const web3Http = new Web3(RPC.ETHRPC)
  
        // Get transaction details
        const trx = await web3Http.eth.getTransaction(txHash)
  
        const valid = validateTransaction(trx)
        // If transaction is not valid, simply return
        if (!valid) return
  
        console.log('Found incoming Ether transaction from ' + process.env.WALLET_FROM + ' to ' + process.env.WALLET_TO);
        console.log('Transaction value is: ' + process.env.AMOUNT)
        console.log('Transaction hash is: ' + txHash + '\n')
  
        // Initiate transaction confirmation
        confirmEtherTransaction(txHash)
  
        // Unsubscribe from pending transactions.
        subscription.unsubscribe()
      }
      catch (error) {
        console.log(error)
      }
    })
  }
  
  export const checkPendingTransactions = async (address)=>{
    console.log('starting....')
    const web3 = new Web3(RPC.ETHRPC)
        let block = await web3.eth.getBlock('latest');
        let number = block.number;
        let transactions = block.transactions;
        console.log('Search Block: ' + number);

    
        if (block != null && block.transactions != null) {
            for (let txHash of block.transactions) {
                //console.log(txHash)
                let tx = await web3.eth.getTransaction(txHash);
                console.log(address.toLowerCase(),tx.to.toLowerCase())
                console.log(tx.to)
                if (address.toLowerCase() == tx.to.toLowerCase()) {
                    console.log('found')
                    console.log("from: " + tx.from.toLowerCase() + " to: " + tx.to.toLowerCase() + " value: " + tx.value);
                }
            }
        }
      
    
  }

  const getPortfolioTokenBalance = (chain, tokenAddress) => {
    const tokens = store.getState()?.activeWalletPortFolio || [];
    const match = tokens.find(
      (t) => t.chain === chain && t.contractAddress?.toLowerCase() === tokenAddress?.toLowerCase()
    );
    return match ? match.balance : 0;
  };

  export const getEthTokenBalance = async (address, tokenAddress) => {
    try {
      return getPortfolioTokenBalance("ETH", tokenAddress);
    } catch (e) {
      console.error(e);
      return 0;
    }
  }

  export const getBnbTokenBalance = async (address, tokenAddress) => {
    try {
      return getPortfolioTokenBalance("BSC", tokenAddress);
    } catch (e) {
      console.error(e);
      return 0;
    }
  }

export const checkXrpAddress = (address)=>{
     const valid =  xrpl.isValidAddress(address)
       console.log(valid)
       return valid
}
  export function checkAddressValidity(address)
  {
      const validity = ethers.utils.isAddress(address)
      return validity
  }
  
  export const GetBalance =async (state,dispatch)=>{
    const address = await state.wallet.address
    dispatch(getEthBalance(address))
    dispatch(getMaticBalance(address))
    dispatch(getBalance(address))
   // dispatch(getXrpBalance(address))
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
          //await getXrpBal(address)
          /* await getXrpBal(address)
          .catch((e)=>{
            console.log(e)
          })*/
        } else if (JSON.parse(type) == "Multi-coin") {

          dispatch(getMaticBalance(address))
            
          dispatch(getEthBalance(address))
            
          dispatch(getBalance(address))
            
          dispatch(getXrpBalance(xrpAddress))
         
        } else {
          console.log('error')
         // setType("");
          /*const wallet = await state.wallet.address;

          if (wallet) {
            await dispatch(getBalance(wallet))
              .then(async () => {
                const bal = await state.walletBalance;

                if (bal) {
                  GetBalance(bal);
                } else {
                  GetBalance(0);
                }
              })
              .catch((e) => {
                console.log(e);
              });
          }*/
          //alert('No wallet selected')
        }
      });
    } catch (e) {
      console.log(e);
    }
  };
