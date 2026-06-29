import { LOGIN_SUCCESS, LOGOUT, WALLET_SUCCESS, IMPORT_SUCCESS, BALANCE_SUCCESS, CONFIRMOTP,EXTENDED , COLLAPSE, IMPORTALLWALLETS, SETCURRENTWALLET, ADDTOALLWALLETS, CHECKWALLETS, GETWALLETSDATA, IMPORTUSINGFILE, GETDIRECTORYURI, SETTOKEN, NEWWALLET, SETUSER, SETPROVIDER, SETWALLETTYPE, ETHBALANCESUCCESS, XRPBALANCESUCCESS, MATICBALANCESUCCESS, SETPLATFORM, RAPID_STELLAR, SET_ASSET_DATA, SET_APP_THEME,PORTFOLIO_CONFIG, MULTICHAIN_PORTFOLIO, WALLET_ACTIVATION_SHOW} from "../actions/type";
import AsyncStorage from "@react-native-async-storage/async-storage";

const emailId = AsyncStorage.getItem('emailId')
const user = AsyncStorage.getItem("user");
const wallet = AsyncStorage.getItem("wallet");
const walletBalance = AsyncStorage.getItem("walletBalance");
const OTP = AsyncStorage.getItem("OTP");
const wallets= AsyncStorage.getItem(`${user}-wallets`);
const walletsData = AsyncStorage.getItem(`${user}-walletsData`)
const directoryUri = AsyncStorage.getItem("directoryUri")
const token = AsyncStorage.getItem(`${user}-token`)
const provider = AsyncStorage.getItem("provider")
const walletType = AsyncStorage.getItem("walletType")
const EthBalance = AsyncStorage.getItem("EthBalance")
const MaticBalance = AsyncStorage.getItem("MaticBalance")
const XrpBalance = AsyncStorage.getItem("XrpBalance")
const platform = AsyncStorage.getItem("platform")
const initialState = user
  ? { isLoggedIn: true, user:user, wallet, walletBalance, extended:true, otp:OTP , wallets:wallets, walletsData:null, directoryUri:directoryUri, token:token, provider:provider, walletType:walletType, EthBalance:EthBalance, MaticBalance:MaticBalance, XrpBalance:XrpBalance, platform:platform}
  : { isLoggedIn: false, user: null , wallet:null, otp:null, wallets:null, walletsData:null, directoryUri:null, token:null, provider:null, walletType:null, EthBalance:null, MaticBalance:null, XrpBalance:null, platform:null};
export default auth = (state = initialState, action) => {
  const { type, payload } = action;
switch (type) {
  case LOGIN_SUCCESS:
      return {
        ...state,
        isLoggedIn: true,
        user: payload.user,
      };
  case LOGOUT:
      return {
        ...state,
        isLoggedIn: false,
        user: null,
        walletsData:null,
        token:null,
      };
 case WALLET_SUCCESS:
        return {
          ...state,
          isLoggedIn: true,
          wallet: payload.wallet,
        };
case IMPORT_SUCCESS:
        return {
          ...state,
          isLoggedIn: true,
          wallets: payload.wallets,
        };
case BALANCE_SUCCESS:
          return {
            ...state,
            isLoggedIn: true,
            walletBalance: payload.walletBalance,
          };
case EXTENDED:
          return {
            ...state,
            isLoggedIn: true,
            extended: true,
          };
case COLLAPSE:
            return {
              ...state,
              isLoggedIn: true,
              extended: false,
            };
case CONFIRMOTP:
            return {
              ...state,
              isLoggedIn: false,
              OTP:payload.OTP
            };
case IMPORTALLWALLETS:
             return {
              ...state,
              isLoggedIn:true,
              wallets:payload.wallets
             }
  case SETCURRENTWALLET:
             return {
              ...state,
              isLoggedIn:true,
              wallet:payload.wallet
             }
  case ADDTOALLWALLETS:
              return {
               ...state,
               isLoggedIn:true,
               wallets:payload.wallets
              }

  case CHECKWALLETS:
                return {
                 ...state,
                 isLoggedIn:true,
                 wallets:payload.wallets
                }
  case GETWALLETSDATA:
                  return {
                   ...state,
                   isLoggedIn:true,
                   walletsData:payload.walletsData
                  }

   case IMPORTUSINGFILE:
                    return {
                     ...state,
                     isLoggedIn:true,
                     wallets:payload.wallets
                    }

   case GETDIRECTORYURI:
                      return {
                       ...state,
                       isLoggedIn:true,
                       directoryUri:payload.directoryUri
                      }

   case SETTOKEN:
                        return {
                         ...state,
                         isLoggedIn:true,
                         token:payload.token
                        }

  case NEWWALLET:
                          return {
                           ...state,
                           isLoggedIn:true,
                           wallet:payload.wallet
                          }
  case SETUSER:
                           return {
                              ...state,
                              isLoggedIn:true,
                              user:payload.user
                          }   
                          
  case SETPROVIDER:
                            return {
                               ...state,
                               isLoggedIn:true,
                               provider:payload.provider
                           }  
                           
  case SETWALLETTYPE:
                            return {
                               ...state,
                               isLoggedIn:true,
                               walletType:payload.walletType
                           }  
                      
   case ETHBALANCESUCCESS:
                            return {
                               ...state,
                               isLoggedIn:true,
                               EthBalance:payload.EthBalance
                           }  

 case MATICBALANCESUCCESS:
                            return {
                               ...state,
                               isLoggedIn:true,
                               MaticBalance:payload.MaticBalance
                           }  

    case XRPBALANCESUCCESS:
                            return {
                               ...state,
                               isLoggedIn:true,
                               XrpBalance:payload.XrpBalance
                           }  
   case SETPLATFORM:
                            return {
                               ...state,
                               isLoggedIn:true,
                               platform:payload.platform
                           }  
    case RAPID_STELLAR:
                            return {
                              ...state,
                              ETH_KEY: action.payload.ETH_KEY,
                              STELLAR_PUBLICK_KEY: action.payload.STELLAR_PUBLICK_KEY,
                              STELLAR_SECRET_KEY: action.payload.STELLAR_SECRET_KEY,
                              STELLAR_ADDRESS_STATUS:action.payload.STELLAR_ADDRESS_STATUS,
                              DYDX_ADDRESS_KEY:action.payload.DYDX_ADDRESS_KEY,
                              DYDX_PUBLIC_KEY:action.payload.DYDX_PUBLIC_KEY
                            }
    case SET_ASSET_DATA:
                            return {
                              ...state,
                              assetData: action.payload,
                            };
    case SET_APP_THEME:
                              return {
                                ...state,
                                THEME: action.payload,
                              };                      
    case PORTFOLIO_CONFIG:
                              return {
                                ...state,
                                isTotalInUSDVisible: action.payload.isTotalInUSDVisible,
                                totalInUSD: action.payload.totalInUSD
                              };   
    case MULTICHAIN_PORTFOLIO:
                              return {
                                ...state,
                                activeWalletPortFolio: action.payload.activeWalletPortFolio
                              };     
    case WALLET_ACTIVATION_SHOW:
                              return {
                                ...state,
                                walletActivationShow: action.payload.walletActivationShow
                              };                                                       
    default:
      return state;
  }
};