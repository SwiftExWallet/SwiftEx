import 'text-encoding-polyfill'
import "react-native-get-random-values";
import "@ethersproject/shims";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ethers } from "ethers";
import { RPC, WSS } from "../../../Dashboard/constants";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { NativeModules } from 'react-native';
import { getWalletBalance } from '../../../Dashboard/exchange/crypto-exchange-front-end-main/src/utils/getWalletInfo/EtherWalletService';
const { EthereumWallet } = NativeModules;

const xrpl = require("xrpl");

const logIn = async (user) => {
  let response;
  const { username } = user;
  const token = await AsyncStorageLib.getItem(`${username}-token`);
  try {
    let response = await AsyncStorageLib.getItem(`${username}-wallets`).then(
      (wallets) => {
        if (!JSON.parse(wallets)) {
          return {
            status: "Not Found",
            message: "user not found ",
            user: null,
          };
        } else {
          return {
            status: "success",
            message: "You are redirecting to home page",
            user: username,
          };
        }
      }
    );
    return response;
  } catch (e) {
    return {
      status: "Not Found",
      message: "user not found ",
      user: null,
    };
  }
};

const setToken = async (token) => {
  const user = await AsyncStorageLib.getItem("user");
  if (token) {
    AsyncStorage.setItem(`${user}-token`, token);
    return {
      status: "success",
      message: "token saved",
      token: token,
    };
  }
};

const setPlatform = async (platform) => {
  if (platform) {
    AsyncStorage.setItem("platform", platform);
    return {
      status: "success",
      message: "platform saved",
      platform: platform,
    };
  }
};

const setUser = async (user) => {
  AsyncStorage.setItem("user", user);
  return {
    status: "success",
    message: "user saved",
    user: user,
  };
};

const setWalletType = async (type) => {
  AsyncStorage.setItem("walletType", JSON.stringify(type));
  return {
    status: "success",
    message: "wallet type saved",
    walletType: type,
  };
};

const setProvider = async (provider) => {
  AsyncStorage.setItem("provider", JSON.stringify(provider));
  return {
    status: "success",
    message: "provider saved",
    provider: provider,
  };
};

const confirmOtp = async (user) => {
  return true;
};

const logOut = async () => {
  return {
    status: "success",
    message: "You are logged out",
  };
};

const Extend = async () => {
  return {
    status: "success",
    message: "Topbar Extended",
    extended: true,
  };
};

const Collapse = async () => {
  return {
    status: "success",
    message: "Topbar Collapsed",
    extended: false,
  };
};

const getBalance = async (address) => {
  try {
    if (address) {
      const bscBal=await getWalletBalance(address,"BSC");
      if(bscBal.status){
      AsyncStorage.setItem("balance", bscBal.balance);
      return {
        status: "success",
        message: "Balance fetched",
        walletBalance: bscBal.balance,
      };
    } else {
      return {
        status: "error",
        message: "failed to fetch balance",
        walletBalance: 0,
      };
    }
  }
  } catch (e) {
  }
};

const getEthBalance = async (address) => {
  try {
    if (address) {
      const ethBal=await getWalletBalance(address,"ETH");
      if(ethBal.status){
        AsyncStorage.setItem("EthBalance", ethBal.balance);
        return {
          status: "success",
          message: "Eth Balance fetched",
          EthBalance: ethBal.balance,
        };
      } else {
        return {
          status: "error",
          message: "Eth Balance fetched",
          EthBalance: 0,
        };
      }
    }
  } catch (error) {
    return {
      status: "error",
      message: "failed to fetch balance",
      EthBalance: 0,
    };
  }

};


const Generate_Wallet2 = async () => {
  const result = await EthereumWallet.createWallet();
  const Wallet = {
    address: result.ethereum.address,
    privateKey: result.ethereum.privateKey,
    mnemonic: result.mnemonic,
    xrp:{
      address: "000000000",
      privateKey: "000000000",
    },
    stellarWallet: {
        publicKey: result.stellar.publicKey,
        secretKey: result.stellar.secretKey
    },
    walletType: "Multi-coin",
  };
  if (Wallet) {
    return {
      status: "success",
      message: "Wallet generation successful",
      wallet: Wallet,
    };
  }
};

async function setCurrentWallet(
  address,
  name,
  privateKey,
  mnemonic,
  classicAddress,
  seed,
  walletType
) {
  let wallet;
  if (walletType) {
    wallet = {
      address: address,
      name: name,
      privateKey: "",
      mnemonic:'',
      xrp: {
        address: classicAddress,
        privateKey: "",
      },
    };
  } else if (classicAddress && !walletType) {
    wallet = {
      classicAddress: classicAddress,
      address: address,
      name: name,
      privateKey: "",
      mnemonic:'',
    };
  } else {
    wallet = {
      address: address,
      name: name,
      privateKey: "",
      mnemonic:''
    };
  }

  AsyncStorage.setItem("wallet", JSON.stringify(wallet));
  AsyncStorage.setItem("Wallet", JSON.stringify(wallet));

  return {
    status: "success",
    message: "Wallet Selection successful",
    wallet: wallet,
  };
}


async function AddToAllWallets(wallets, user) {
  let allWallets = wallets[0].wallets ? wallets[0].wallets : [];
  let found

  allWallets.map((item)=>{
    if(item.name===wallets[0].name){
      found=true
    }
  })
  if(found===true){
    return {
      status: "Already Exists",
      message: "Wallet import failed",
      wallets: allWallets,
    };
  }
  else{

    if (wallets[0].walletType === "Multi-coin") {

      allWallets.push({
        name: wallets[0].name,
        privateKey: "",
        address: wallets[0].address,
        mnemonic: "",
        walletType: wallets[0].walletType,
        xrp: {
          address: wallets[0].xrp.address,
          privateKey: "",
        },
        dydx:{
            dydxAddress:wallets[0].dydx.dydxAddress,
            dydxPublicKey:wallets[0].dydx.dydxPublicKey,
        }
      });
         const Ether_address= wallets[0].address;
        const publicKey = wallets[0].stellarWallet.publicKey;
        const secretKey = wallets[0].stellarWallet.secretKey;
      
        try {
          let userTransactions = [];
          const transactions = await AsyncStorageLib.getItem('myDataKey');
          if (transactions) {
            userTransactions = JSON.parse(transactions);
            if (!Array.isArray(userTransactions)) {
              userTransactions = [];
            }
          }
          const newTransaction = {
            Ether_address,
            publicKey,
            secretKey,
            dydxAddress:wallets[0].dydx.dydxAddress,
            dydxPublicKey:wallets[0].dydx.dydxPublicKey,
          };
          userTransactions.push(newTransaction);
          await AsyncStorageLib.setItem('myDataKey', JSON.stringify(userTransactions));
        } catch (error) {
          console.error('Error saving payout:', error);
          throw error;
        }
    } else if (wallets[0].classicAddress) {
      allWallets.push({
        name: wallets[0].name,
        privateKey: "",
        mnemonic: '',
        address: wallets[0].address,
        classicAddress: wallets[0].classicAddress,
        walletType: wallets[0].walletType,
      });
    } else {
      allWallets.push({
        name: wallets[0].name,
        privateKey: "",
        mnemonic: '',
        address: wallets[0].address,
        walletType: wallets[0].walletType,
      });
    }
    
    AsyncStorage.setItem(`${user}-wallets`, JSON.stringify(allWallets));
    try {
      const Ether_address= wallets[0].address;
      const publicKey = wallets[0].stellarWallet.publicKey;
      const secretKey = wallets[0].stellarWallet.secretKey;
      let userTransactions = [];
      const transactions = await AsyncStorageLib.getItem('myDataKey');
      if (transactions) {
        userTransactions = JSON.parse(transactions);
        if (!Array.isArray(userTransactions)) {
          userTransactions = [];
        }
      }
      const newTransaction = {
        Ether_address,
        publicKey,
        secretKey,
        dydxAddress:wallets[0].dydx.dydxAddress,
        dydxPublicKey:wallets[0].dydx.dydxPublicKey,
      };
      userTransactions.push(newTransaction);
      await AsyncStorageLib.setItem('myDataKey', JSON.stringify(userTransactions));
      // return userTransactions;
    } catch (error) {
      console.error('Error saving payout:', error);
      throw error;
    }
    return {
      status: "success",
      message: "Wallet import successful",
      wallets: allWallets,
    };
  }
}


async function getDirectoryUri(uri) {
  AsyncStorage.setItem("directoryUri", uri);
  return {
    status: "success",
    message: "Directory uri saved",
    directoryUri: uri,
  };
}

const getMaticBalance = async (address) => {
  try {
    if (address) {
      const provider = new ethers.providers.JsonRpcProvider(RPC.MATICRPC);
      const MaticBalance = await provider.getBalance(address);
      const balanceInEth = ethers.utils.formatEther(MaticBalance);
      AsyncStorage.setItem("MaticBalance", balanceInEth);

      return {
        status: "success",
        message: "Matic Balance fetched",
        MaticBalance: balance.toFixed(3),
      };
    } else {
      return {
        status: "error",
        message: "Matic Balance fetch  failed",
        MaticBalance: 0,
      };
    }
  } catch (error) {
    return {
      status: "error",
      message: "Matic Balance fetch  failed",
      MaticBalance: 0,
    };
  }
  };
const getXrpBalance = async (address) => {

    try{      
        const client = new xrpl.Client(WSS.XRPWSS)
        await client.connect()
        const my_balance = (await client.getXrpBalance(address) )   
        AsyncStorage.setItem('XrpBalance', my_balance);
        
        await client.disconnect()
        if(my_balance){
            
          return {
            status: "success",
            message: "Xrp Balance fetched",
            XrpBalance: my_balance
          };
        }else{
          return {
            status: "error",
            message: "Xrp Balance fetch failed",
            XrpBalance: 0
          }; 
        }
      
    }catch(error){
     return {
        status: "error",
        message: "Xrp Balance fetch failed",
        XrpBalance: 0
      };
   }
};

export default {
  logIn,

  logOut,

  getBalance,

  Extend,

  Collapse,

  confirmOtp,

  setCurrentWallet,

  AddToAllWallets,

  getDirectoryUri,

  setToken,

  Generate_Wallet2,

  setUser,

  setProvider,

  setWalletType,

  getEthBalance,

  getMaticBalance,

  getXrpBalance,

  setPlatform,
};
