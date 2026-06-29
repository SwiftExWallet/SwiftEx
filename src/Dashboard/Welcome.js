import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Animated,
  ActivityIndicator,
  NativeModules,
  Linking,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";

import W1 from "../../assets/W1.png";
import W2 from "../../assets/W2.png";
import W3 from "../../assets/W3.png";
import W4 from "../../assets/W4.png";
import CustomImageSlider from '../../Custom_scroller'; // Make sure to create this file
import { createGuestUser } from "./exchange/crypto-exchange-front-end-main/src/api";
import { useDispatch } from "react-redux";
import { AddToAllWallets, Generate_Wallet2, getBalance, setCurrentWallet, setToken, setUser, setWalletType } from "../components/Redux/actions/auth";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { genUsrToken } from "./Auth/jwtHandler";
import { alert } from "./reusables/Toasts";
import { useNavigation } from "@react-navigation/native";
import apiHelper from "./exchange/crypto-exchange-front-end-main/src/apiHelper";
import { REACT_APP_HOST } from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import * as StellarSdk from '@stellar/stellar-sdk';
import AccessNativeStorage from "./Wallets/AccessNativeStorage";
import crashlytics from '@react-native-firebase/crashlytics';
import { dydxAddressDrive } from "../dydx/dydxAddressDrive";

const Welcome = (props) => {
  const [Loading,setLoading]=useState(false)
  const [enableUserAccess,setenableUserAccess]=useState(false);
  const dispatch = useDispatch();
  const navigation=useNavigation();
  const images = [W1];
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const Spin = new Animated.Value(0);
  const SpinValue = Spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    Animated.timing(Spin, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, Spin]);

  useEffect(() => {
    setenableUserAccess(false);
    let isMounted = true;
    const initGuestUser = async () => {
      try {
        setLoading(true);
        const appReset=await NativeModules.StorageModule.clearAll();
        crashlytics().setCrashlyticsCollectionEnabled(true);
        const userStatus=await createGuestUser();
        console.log("userStatus:-",userStatus.status,appReset)
        if(userStatus.status)
        {
          setenableUserAccess(true);
        }else{
          setenableUserAccess(false);
        }
      } catch (error) {
        console.error("Failed to create guest user:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initGuestUser();
    return () => {
      isMounted = false;
    };
  }, []);
  const defaultWalletGenration=async()=>{
    try {
      setLoading(true);
      const response=await dispatch(Generate_Wallet2())
        if (response) {
          console.log("respoms:",response)
          const result = await apiHelper.post(REACT_APP_HOST+'/v1/wallet', {
              "addresses": {
                  "eth": response.wallet.address,
                  "xlm": response.wallet.stellarWallet.publicKey,
                  "bnb": response.wallet.address,
                  "multi": response.wallet.address
              },
              "isPrimary": true
          });
          
          if (result.success) {
             alert("success","wallet synced!");
          } else {
            alert("error","unable to sync wallet.");
            console.log('Error:', result.error, 'Status:', result.status);
          }
          if (response.status === "success") {
            const wallet = {
              wallet: response.wallet,
            };
            await dispatChingData(wallet.wallet)
          } else {
            setLoading(false);
            alert(
              "error",
              "wallet generation failed. Please try again"
            );
          }
        } else {
          setLoading(false);
          alert("error", "Wallet creation failed . Please try again");
        }      
    } catch (error) {
      console.log("--defaultWalletGenration--->",error)
      alert("error","Wallet generation failed.");
      setLoading(false);
    }
  }

  const dispatChingData=async(wallet)=>{
    try {
      const dydxAddress=await dydxAddressDrive(wallet.privateKey)
      const pin = await AsyncStorageLib.getItem("pin");
            const body = {
              accountName: "Main",
              pin: JSON.parse(pin),
            };
            const token = genUsrToken(body);
            const accounts = {
              address: wallet.address,
              name: "Main",
              walletType: "Multi-coin",
              xrp: {
                address: wallet.xrp.address
              },
              stellarWallet: {
                publicKey: wallet.stellarWallet.publicKey,
              },
              dydx: {
                dydxAddress: dydxAddress.dydxAddress,
                dydxPublicKey: dydxAddress.publicKey,
              },
              wallets: [],
            };
            let wallets = [];
            wallets.push(accounts);
            const allWallets = [
              {
                address: wallet.address,
                name: "Main",
                xrp: {
                  address: wallet.xrp.address
                },
                stellarWallet: {
                  publicKey: wallet.stellarWallet.publicKey
                },
                dydx: {
                  dydxAddress: dydxAddress.dydxAddress,
                  dydxPublicKey: dydxAddress.publicKey,
                },
                walletType: "Multi-coin",
              },
            ];
  
            AsyncStorageLib.setItem(
              "wallet",
              JSON.stringify(allWallets[0])
            );
            AsyncStorageLib.setItem(
              `${"Main"}-wallets`,
              JSON.stringify(allWallets)
            );
            AsyncStorageLib.setItem(
              "user",
              "Main"
            );
            AsyncStorageLib.setItem(
              "currentWallet",
              "Main"
            );
            AsyncStorageLib.setItem(
              `${"Main"}-token`,
              token
            );
  
            dispatch(setUser("Main"));
            dispatch(
              setCurrentWallet(
                wallet.address,
                "Main",
                "",
                "",
                (walletType = "Multi-coin")
              )
            );
            dispatch(
              AddToAllWallets(
                wallets,
                "Main"
              )
            );
            dispatch(getBalance(wallet.address));
            dispatch(setWalletType("Multi-coin"));
            dispatch(setToken(token));
            genrateStellarKeypair(wallet.address,wallet.stellarWallet.publicKey)
            const walletResponse = await AccessNativeStorage.saveWallet({
              name: "Main",
              address: wallet.address,
              privatekey: wallet.privateKey,
              stellarPublicKey: wallet.stellarWallet.publicKey,
              stellarPrivateKey: wallet.stellarWallet.secretKey,
              mnemonic: wallet.mnemonic,
              walletType: wallet.walletType,
              dydxAddress: dydxAddress.dydxAddress,
              dydxPublicKey: dydxAddress.publicKey,
              dydxMnemonic: dydxAddress.mnemonic,
              dydxPrivateKey: dydxAddress.privateKey,
              dydxWalletConnectSignature: dydxAddress.walletConnectSignature
            })
            if (walletResponse.success) {
            setLoading(false);
            navigation.navigate("HomeScreen");
            alert("success", "Wallet Genration Compleated!");
            } else {
            alert("error", "Wallet generation failed.");
            setLoading(false);
            }
    } catch (error) {
      alert("error","Wallet generation failed.");
      console.log("---Error-getting-from-dispatChingData--",error)
    }   
  }

  const genrateStellarKeypair =async(etherAddress,publicKey) => {
    try {
      let userTransactions = [];
      const transactions = await AsyncStorageLib.getItem('myDataKey');
      if (transactions) {
        userTransactions = JSON.parse(transactions);
        if (!Array.isArray(userTransactions)) {
          userTransactions = [];
        }
      }
      userTransactions.push({etherAddress,publicKey});
      await AsyncStorageLib.setItem('myDataKey', JSON.stringify(userTransactions));
    } catch (error) {
      setLoading(false);
      console.log('-->Error saving payout:', error);
      alert("error","Wallet generation failed.");
    }
  };     

  return (
    <View style={styles.container}>
      <CustomImageSlider images={images} />
      <Animated.View style={[styles.buttonContainer, { opacity: fadeAnim }]}>
       <Text style={styles.termsTxt}>By continuing, you agree to the <Text style={styles.openLink} onPress={() => { Linking.openURL("https://swiftexwallet.com/terms-of-service") }}>Terms</Text> and <Text style={styles.openLink} onPress={()=>{ Linking.openURL("https://swiftexwallet.com/privacy-policy") }}>Privacy Policy.</Text></Text>
        {/* {Loading?null:<TouchableOpacity
          style={styles.createView}
          onPress={() => props.navigation.navigate("GenerateWallet")}
          disabled={Loading}
        >
          <Text style={styles.btnText}>CREATE A NEW WALLET</Text>
        </TouchableOpacity>} */}
        {enableUserAccess ? <>
          <TouchableOpacity style={styles.createView} onPress={() => { setLoading(true), defaultWalletGenration() }} disabled={Loading}>
            {Loading ? <ActivityIndicator color={"green"} size={"large"} /> : <Text style={styles.btnText}>CREATE A NEW WALLET</Text>}
          </TouchableOpacity>

          {Loading ? null : <TouchableOpacity style={styles.importWalletView} onPress={() => props.navigation.navigate("WalletNetworkSelection",{selectionType:"importForSetupApp",backScreenName:"Welcome"})} disabled={Loading}>
            <Text style={styles.importText}>Import Wallet</Text>
          </TouchableOpacity>}
        </> :
          <View style={styles.waitCom}>
            <ActivityIndicator color={"green"} size={"large"} />
          </View>
        }
       

      </Animated.View>
    </View>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131E3A',
  },
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  createView: {
    width: wp(70),
    borderRadius: 8,
    paddingVertical: hp(1),
    backgroundColor: "#000C66",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: hp(1),
  },
  importWalletView: {
    width: wp(70),
    borderRadius: 8,
    paddingVertical: hp(0.8),
    backgroundColor: "rgba(232, 238, 239, 0.5)",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: hp(1),
    borderColor:"white",
    borderWidth:0.5
  },
  btnText: {
    color: "#fff",
    textAlign: "center",
  },
  importText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
    color: "black",
  },
  waitCom: {
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: hp(1),
  },
  termsTxt:{
    textAlign: "center",
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    fontStyle:"italic",
    marginVertical:hp(1)
  },
  openLink:{
    textAlign: "center",
    fontSize: 14,
    fontWeight: "500",
    color: "#135cfaff",
    fontStyle:"italic",
    marginVertical:hp(1)
  },
});

export default Welcome;

const style = StyleSheet.create({
  Body: {
    display: "flex",
    backgroundColor: "#131E3A",
    width: wp(100),
    height: hp(100),
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: "200",
    color: "white",
  },
  welcomeText2: {
    fontWeight: "200",
    color: "white",
  },

  tinyLogo: {
    width: wp("5"),
    height: hp("5"),
    padding: 30,
    marginTop: hp(10),
  },
  Text: {
    textAlign:"center",
    marginTop: hp(1),
    marginBottom:hp(2),
    fontSize: 15,
    fontWeight: "200",
    color: "white",
  },
  privateText: {
    color: "#fff",
    fontSize: 22,
    marginTop: hp(8),
  },
  btnText: {
    color: "#fff",
    textAlign: "center",
  },
  createView: {
    width:wp(70),
    borderRadius: 8,
    paddingVertical:hp(1),
    backgroundColor: "#000C66",
    // height: "6%",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: hp(10),
  },
  imageContainer: {
    // width:hp(100),
    // height: hp(30),
    justifyContent: "center",
  },
  imageStyle: {
    width: "100%",
    height: "100%",
  },
});
