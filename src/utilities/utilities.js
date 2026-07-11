import { RPC, tokenAddresses, urls } from '../Dashboard/constants';
import "react-native-get-random-values"
import "@ethersproject/shims"
import CryptoJS from "react-native-crypto-js";
import AsyncStorageLib from '@react-native-async-storage/async-storage';
import  Clipboard from "@react-native-clipboard/clipboard";
import React from 'react';
var ethers = require('ethers');

export const navigationRef = React.createRef();

export function NavigationController(location){
  navigationRef.current?.navigate(location);
}


export async function getNonce(address){
    const provider =  new ethers.providers.JsonRpcProvider(RPC.BSCRPC);
    const nonce = await provider.getTransactionCount(address)

    return nonce
  
}

export async function getGasPrice(){

  const provider = new ethers.providers.JsonRpcProvider(RPC.BSCRPC)
  const gasPrice = await provider.getGasPrice()
  return  gasPrice 
 
}
  
export async function getAmountsOut(amountIn,inToken,outToken,type){
  try{
    const routerAddress = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1"
    
    const provider = new ethers.providers.JsonRpcProvider(RPC.BSCRPC2)
    
    const router = new ethers.Contract(
        routerAddress,
        [
            'function getAmountsOut(uint amountIn, address[] memory path) public view returns(uint[] memory amounts)',
        ],
        provider
        );
        let amounts
        let amountsOutMin
        
        if(type==='BNBTOTOKEN'){
            
            amounts = await router.getAmountsOut(amountIn, [tokenAddresses.WBNB, outToken]);
            amountsOutMin = amounts[1].sub(amounts[1].div(10));

        }
        else if(type==='TOKENTOBNB'){
            
            amounts = await router.getAmountsOut(amountIn, [inToken,tokenAddresses.WBNB]);
            amountsOutMin = amounts[1].sub(amounts[1].div(10));

        }
        else{
            amounts = await router.getAmountsOut(amountIn, [inToken, outToken]);
            amountsOutMin = amounts[1].sub(amounts[1].div(10));

            
        }
        if(amountsOutMin){

            return amountsOutMin
        }
        else{
            return null

        }

        
    }catch(e){
        return null

    }

}

export async function sendSwapTx(signedTx,TOKEN_ADD,amount,USER_ADD,token){
 // const {signedTx,TOKEN_ADD,amount,USER_ADD} = input
  const provider = new ethers.providers.JsonRpcBatchProvider(RPC.BSCRPC2)

  const ROUTER_ADD = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1'
const erc20ABI = [
  'function allowance(address owner,address spender) public virtual view returns (uint256)',
]
const erc20Contact = new ethers.Contract(TOKEN_ADD, erc20ABI, provider)

const tx = await provider.sendTransaction(signedTx)
await tx.wait()

// Check the allowance
let routerAllowance = await erc20Contact.allowance(USER_ADD, ROUTER_ADD)
if (!routerAllowance.gte(amount)) {
  // wait for three sec
  await sleep(3000)

  routerAllowance = await erc20Contact.allowance(USER_ADD, ROUTER_ADD)
  if (!routerAllowance.gte(amount)) return 'Error in trasaction'
}


return routerAllowance.toString()


}

export async function approveSwap(tokenAdd,amount,PRIVATE_KEY,token){
  const wallet = new ethers.Wallet(PRIVATE_KEY)
  const ROUTER_ADD = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1'

  const erc20ABI = [
    'function approve(address spender, uint value) public virtual returns (bool)',
  ]
  const erc20Contact = new ethers.Contract(tokenAdd, erc20ABI)
  // const amount = ethers.utils.parseEther('0.00000002') // amount is provided by user

  const  nonce  = await getNonce(wallet.address) // get from '/getNonce' route
  const  gasPrice  = await getGasPrice() // get from '/getGasPrice' route
  const gasLimit = 500000

  const unsignedTx = await erc20Contact.populateTransaction.approve(
    ROUTER_ADD,
    amount,
    {
      nonce,
      gasPrice,
      gasLimit,
    },
  )

  const signedTx = await wallet.signTransaction(unsignedTx)

  const tx = await sendSwapTx(signedTx,tokenAdd,amount,wallet.address,token)
  return tx

}

export const SaveTransaction = async (type,hash,user,Token,walletType,chainType) => {
  let userTransactions = [];
  
  await AsyncStorageLib.getItem(`${user}-transactions`)
   .then(async (transactions)=>{
    const data = JSON.parse(transactions)
    if(data){
      data.map((item)=>{

        userTransactions.push(item)
      })
      let txBody ={
        hash,
        type,
        walletType,
        chainType
      }
     userTransactions.push(txBody)
     await AsyncStorageLib.setItem(`${user}-transactions`,JSON.stringify(userTransactions))
     return userTransactions
    }else{
      let transactions =[]
      let txBody ={
        hash,
        type,
        walletType,
        chainType
      }
      transactions.push(txBody)
      await AsyncStorageLib.setItem(`${user}-transactions`,JSON.stringify(transactions))
      return transactions
      }
   })    
  };

  export const SavePayout = async (senderId, receiverId, date, time, g_amount, g_ASSET, status) => {
    let userTransactions = [];
  
    try {
        const transactions = await AsyncStorageLib.getItem(`${senderId}-transactions`);
  
        const data = JSON.parse(transactions);
  
        if (data) {
            data.forEach((item) => {
                userTransactions.push(item);
            });
  
  
            let txBody = {
                senderId,
                receiverId,
                date,
                time,
                g_amount,
                g_ASSET,
                status,
            };
  
            userTransactions.push(txBody);
  
            await AsyncStorageLib.setItem(`${senderId}-transactions`, JSON.stringify(userTransactions));
        } else {
            let transactions = [];
            let txBody = {
                senderId,
                receiverId,
                date,
                time,
                g_amount,
                g_ASSET,
                status,
            };
            transactions.push(txBody);
  
            await AsyncStorageLib.setItem(`${senderId}-transactions`, JSON.stringify(transactions));
  
            userTransactions = transactions;
        }
  
  
        return userTransactions;
    } catch (error) {
        console.error("Error saving payout:", error);
        throw error;
    }
};

export const getAllDataAndShow = async (senderId) => {
  try {
      const transactions = await AsyncStorageLib.getItem(`${senderId}-transactions`);
      const data = JSON.parse(transactions);

      if (data) {
          const transactionList = data.map((item, index) => {
              return {
                  id: index + 1,
                  ...item,
              };
          });
          return transactionList;
      } else {
          return [];
      }
  } catch (error) {
      console.error("Error retrieving data:", error);
      throw error;
  }
};

  export const getEthPrice = async ()=>{
    const response =await fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD')
    .then((res)=>res.json())
    .then((resJson)=>{
      return resJson
    })
    return response
  }

  export const getXLMPrice = async ()=>{
    const response =await fetch('https://min-api.cryptocompare.com/data/price?fsym=XLM&tsyms=USD')
    .then((res)=>res.json())
    .then((resJson)=>{
      return resJson
    })
    return response
  }

  export const getBnbPrice = async ()=>{
    const response =await fetch('https://min-api.cryptocompare.com/data/price?fsym=BNB&tsyms=USD')
    .then((res)=>res.json())
    .then((resJson)=>{
      return resJson
    })
    return response
  }

  export const getXrpPrice = async ()=>{
    const response =await fetch('https://min-api.cryptocompare.com/data/price?fsym=XRP&tsyms=USD')
    .then((res)=>res.json())
    .then((resJson)=>{
      return resJson
    })
    return response
  }



  export function isFloat(value) {
    if (
      !Number.isNaN(Number(value)) &&
      !Number.isInteger(Number(value))
    ) {
      return true;
    }
  
    return false;
  }

  export function isInteger(value)
  {
    if(value &&  Number.isSafeInteger(Number(value)))
    {
      return true
    }
    return false
  }
  
  export const Paste = async (func) => {
    try {
      const text = await Clipboard.getString();
      if (func && typeof func === 'function') {
        func(text);
      }
      return text;
    } catch (error) {
      console.error("Error accessing clipboard:", error);
      return null;
    }
  };