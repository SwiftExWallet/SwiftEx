import { LOGIN_SUCCESS, LOGOUT, WALLET_SUCCESS , IMPORT_SUCCESS, BALANCE_SUCCESS, EXTENDED, CONFIRMOTP,COLLAPSE, IMPORTALLWALLETS, SETCURRENTWALLET, ADDTOALLWALLETS, CHECKWALLETS, GETWALLETSDATA, IMPORTUSINGFILE, GETDIRECTORYURI, SETTOKEN, NEWWALLET, SETUSER, SETPROVIDER, SETWALLETTYPE, ETHBALANCESUCCESS, MATICBALANCESUCCESS, XRPBALANCESUCCESS, SETPLATFORM, BALANCEERROR} from "./type";
import AuthService from "../services/authService";
export const login = (user) => (dispatch) => {
  return AuthService.logIn(user).then(
    (response) => {
      if (response.status === "success") {
        dispatch({
          type: LOGIN_SUCCESS,
          payload: { user: response.user },
        });
Promise.resolve();
        return response;
      }
      if(response.status==='verifyotp'){
        return response;
      }
      if(response.status==='invalid'){
        return response;
      }
      if(response.status==='Not Found'){
        return response;
      }

    },
    (error) => {
      const message = error.toString();
Promise.reject();
      return message;
    }
  );
};

export const confirmOtp = (user) => (dispatch) => {
  return AuthService.confirmOtp(user).then(
    (response) => {
      if(response.status==='invalid'){
        return response;
      }
      if (response.status === "success") {
        dispatch({
          type: CONFIRMOTP,
          payload: { OTP: response.OTP },
        });
Promise.resolve();
        return response;
      }
    },
    (error) => {
      const message = error.toString();
Promise.reject();
      return message;
    }
  );
};
export const logout = () => (dispatch) => {
  return AuthService.logOut().then((response) => {
    if (response.status === "success") {
      dispatch({
        type: LOGOUT,
      });
      Promise.resolve();
      return response;
    }
  });
};



export const Extend = () => (dispatch) => {
  
  return AuthService.Extend().then((response) => {
    if (response.status === "success") {
      dispatch({
        type: EXTENDED,
      });
      Promise.resolve();
      return response;
    }
  });
};

export const Collapse = () => (dispatch) => {
  
  return AuthService.Collapse().then((response) => {
    if (response.status === "success") {
      dispatch({
        type: COLLAPSE,
      });
      Promise.resolve();
      return response;
    }
  });
};




export const Generate_Wallet  = (name,password,emailId, dispatch, getDirectoryUri, FolderUri) => (dispatch) => {
 
  return AuthService.Generate_Wallet(name,password,emailId, dispatch, getDirectoryUri, FolderUri).then((response) => {
    
    if (response.status === "success") {
      
      dispatch({
        type: WALLET_SUCCESS,
        payload: { wallet: response.wallet },
      });
      Promise.resolve();
      return response;
    }
  });
};

export const Generate_Wallet2  = () => (dispatch) => {
 
  return AuthService.Generate_Wallet2().then((response) => {
    
    if (response.status === "success") {
      
      // dispatch({
      //   type: NEWWALLET,
      //   payload: { wallet: response.wallet },
      // });
      Promise.resolve();
      return response;
    }
  });
};

export const Import_Wallet  = (privateKey,mnemonic, name, wallets) => (dispatch) => {
  return AuthService.ImportWallet(privateKey, mnemonic, name, wallets).then((response) => {
    if (response.status === "success") {
      dispatch({
        type: IMPORT_SUCCESS,
        payload: { wallets: response.wallets },
      });
      Promise.resolve();
      return response;
    }
  });
};

export const importAllWallets  = (accounts,emailId) => (dispatch) => {
  return AuthService.importAllWallets(accounts,emailId).then((response) => {
    if (response) {
      dispatch({
        type: IMPORTALLWALLETS,
        payload: { wallets: response.wallets },
      });
      Promise.resolve();
      return response;
      
    }
  });
};

export const AddToAllWallets  = (account,user) => (dispatch) => {
  return AuthService.AddToAllWallets(account,user).then((response) => {
    if (response) {
      dispatch({
        type: ADDTOALLWALLETS,
        payload: { wallets: response.wallets },
      });
      Promise.resolve();
      return response;
      
    }
  });
};

export const setCurrentWallet = (address, name, privateKey, mnemonic,classicAddress,seed,walletType) => (dispatch) => {
  return AuthService.setCurrentWallet(address, name, privateKey, mnemonic,classicAddress,seed,walletType).then((response) => {
    if (response.status === "success") {
      dispatch({
        type: SETCURRENTWALLET,
        payload: { wallet: response.wallet },
      });
      Promise.resolve();
      return response;
    }
  });
};

export const getBalance =  (user) => (dispatch) => {
  return AuthService.getBalance(user).then(
   (response) => {
      let res =  response
      if (res.status === "success") {
        dispatch({
          type: BALANCE_SUCCESS,
          payload: { walletBalance: response.walletBalance },
        });
      Promise.resolve();
        return response;
      }
      else{
        dispatch({
          type: BALANCE_SUCCESS,
          payload: { walletBalance: 0 },
        });
      }
      Promise.resolve();
      return response;
    },
    (error) => {
      const message = error.toString();
Promise.reject();
      return message;
    }
  );
};

export const CheckWallets  = (accounts) => (dispatch) => {
  return AuthService.CheckWallets(accounts).then((response) => {
    if (response) {
      dispatch({
        type: CHECKWALLETS,
        payload: { wallets: response.wallets },
      });
      Promise.resolve();
      return response;
      
    }
  });
};


export const getDirectoryUri  = (uri) => (dispatch) => {
  return AuthService.getDirectoryUri(uri).then((response) => {
    if (response) {
      dispatch({
        type: GETDIRECTORYURI,
        payload: { directoryUri: response.directoryUri },
      });
      Promise.resolve();
      return response;
      
    }
  });
};

export const setToken  = (token) => (dispatch) => {
  return AuthService.setToken(token).then((response) => {
    if (response) {
      dispatch({
        type: SETTOKEN,
        payload: { token: response.token},
      });
      Promise.resolve();
      return response;
      
    }
  });
};


export const setUser = (user) => (dispatch) => {
  return AuthService.setUser(user).then((response) => {
    if (response) {
      dispatch({
        type: SETUSER,
        payload: { user: response.user},
      });
      Promise.resolve();
      return response;
      
    }
  });
};

export const setProvider = (provider) => (dispatch) => {
  return AuthService.setProvider(provider).then((response) => {
    if (response) {
      dispatch({
        type: SETPROVIDER,
        payload: { provider: response.provider},
      });
      Promise.resolve();
      return response;
      
    }
  });
};

export const setWalletType = (type) => (dispatch) => {
  return AuthService.setWalletType(type).then((response) => {
    if (response) {
      dispatch({
        type: SETWALLETTYPE,
        payload: { walletType: response.walletType},
      });
      Promise.resolve();
      return response;
      
    }
  });
};

export const getEthBalance =  (address) => (dispatch) => {
  return AuthService.getEthBalance(address).then(
   (response) => {
      let res =  response
      if (res.status === "success") {
        dispatch({
          type: ETHBALANCESUCCESS,
          payload: { EthBalance: response.EthBalance },
        });
      Promise.resolve();
        return response;
      }else{
        dispatch({
          type: ETHBALANCESUCCESS,
          payload: { EthBalance: 0 },
        });
      Promise.resolve();
        return response;
      }
    },
    (error) => {
      const message = error.toString();
Promise.reject();
      return message;
    }
  );
};

export const getMaticBalance =  (address) => (dispatch) => {
  return AuthService.getMaticBalance(address).then(
   (response) => {
      let res =  response
      if (res.status === "success") {
        dispatch({
          type: MATICBALANCESUCCESS,
          payload: { MaticBalance: response.MaticBalance },
        });
      Promise.resolve();
        return response;
      }
      else{
        dispatch({
          type: MATICBALANCESUCCESS,
          payload: { MaticBalance: 0 },
        });
      Promise.resolve();
        return response;
      }
    },
    (error) => {
      const message = error.toString();
Promise.reject();
      return message;
    }
  );
};

export const getXrpBalance =  (address) => (dispatch) => {
  return AuthService.getXrpBalance(address).then(
   (response) => {
      let res =  response
      if (res.status === "success") {
        dispatch({
          type: XRPBALANCESUCCESS,
          payload: { XrpBalance: response.XrpBalance },
        });
      Promise.resolve();
        return response;
      }else{
        dispatch({
          type: XRPBALANCESUCCESS,
          payload: { XrpBalance: 0 },
        });
      Promise.resolve();
        return response;
      }
    },
    (error) => {
      const message = error.toString();
Promise.reject();
      return message;
    }
  );
};

export const setPlatform  = (platform) => (dispatch) => {
  return AuthService.setPlatform(platform).then((response) => {
    if (response) {
      dispatch({
        type: SETPLATFORM,
        payload: { platform: response.platform},
      });
      Promise.resolve();
      return response;
      
    }
  });
};