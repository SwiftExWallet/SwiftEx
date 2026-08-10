import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Button,
  ActivityIndicator,
  TouchableOpacity,
  NativeModules,
  Platform,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import title_icon from "../../assets/title_icon.png";
import { useDispatch, useSelector } from "react-redux";
import { Generate_Wallet2 } from "../components/Redux/actions/auth";
import {
  AddToAllWallets,
  getBalance,
  setCurrentWallet,
  setUser,
  setToken,
  setWalletType,
} from "../components/Redux/actions/auth";
import { Paste } from "../utilities/utilities";
import DialogInput from "react-native-dialog-input";
import { urls } from "./constants";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { ethers } from "ethers";
import { genrateAuthToken, genUsrToken } from "./Auth/jwtHandler";
import { alert } from "./reusables/Toasts";
import styles from "../Screens/splash/style";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
import { recoverMultiChainWallet } from "../utilities/WalletManager";
import AccessNativeStorage from "./Wallets/AccessNativeStorage";
import apiHelper from "./exchange/crypto-exchange-front-end-main/src/apiHelper";
import { REACT_APP_HOST } from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
const xrpl = require("xrpl");
const { EthereumWallet } = NativeModules;

const ImportMunziWallet = (props) => {
  const navi=useNavigation();
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [visible, setVisible] = useState(false);
  const [Wallet, setWallet] = useState();
  const [disable, setDisable] = useState(true);
  const [message, setMessage] = useState("");

  const dispatch = useDispatch();

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
    }).start();

    Animated.timing(Spin, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, Spin]);

  useEffect(() => {
    if (accountName && mnemonic) {
      let valid;
      const phrase = mnemonic.trimStart();
      const trimmedPhrase = phrase.trimEnd();
      valid = ethers.utils.isValidMnemonic(trimmedPhrase);
      if (!valid) {
        setMessage("Please enter a valid mnemonic");
      } else {
        setMessage("");
      }

      if (accountName && mnemonic && valid) {
        setDisable(false);
      } else {
        setDisable(true);
      }
    } else {
      setMessage("");
    }
  }, [mnemonic]);

  const handleUsernameChange = (text) => {
    // Remove whitespace from the username
    const formattedUsername = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '');
    setAccountName(formattedUsername);
  };
  return (
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim }}
    >
      <Wallet_screen_header title="Multi-Chain Wallet" onLeftIconPress={() => navi.goBack()} />
      <View style={style.Body}>
        <View style={style.labelInputContainer}>
          <Text style={style.label}>Name</Text>
          <TextInput
            value={accountName}
            maxLength={20}
            onChangeText={(text) => {handleUsernameChange(text)}}
            style={style.textInputForCrossChain}
            placeholder={accountName?accountName: "Wallet"}
            placeholderTextColor={"gray"}
          />
        </View>
        <View
          style={style.inputView}
        >
          <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:20}}>
          <Text style={style.label}>Phrase</Text>
          <TouchableOpacity style={style.pasteCon} onPress={async ()=>{
              Paste(setMnemonic)
              setDisable(false)        
          }}>
          <Text style={style.paste}>Paste</Text>
          </TouchableOpacity>
          </View>

          <TextInput
            style={style.input}
            value={mnemonic}
            placeholder="Please enter your mnemonic phrase here"
            placeholderTextColor={"gray"}
            onChangeText={(text) => {
              setMnemonic(text);
            }}
          />
        </View>
        {!accountName?<Text style={[style.text,{color:"red"}]}>Input Wallet Name</Text>:<></>}
        <Text style={style.text}>
          Typically 12 (sometimes 18.24) words separated by single spaces
        </Text>
        {loading ? (
          <ActivityIndicator size="large" color="green" />
        ) : (
          <Text> </Text>
        )}
        <View
          style={{
            display: "flex",
            alignContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "red" }}>{message}</Text>
        </View>

          <TouchableOpacity
            style={[style.btn,{backgroundColor:disable||!accountName || !/\S/.test(accountName)?"gray":"#5B65E1",}]}
            disabled={disable||!accountName || !/\S/.test(accountName)?true:false}
            onPress={async () => {
              const pin = await AsyncStorageLib.getItem("pin");
              if (!accountName) {
                return alert("error", "Please enter an wallet name to proceed");
              }
              setLoading(true);
              setTimeout(async () => {
                try {
                  const phrase = mnemonic.trimStart();
                  const trimmedPhrase = phrase.trimEnd();
                  const check = ethers.utils.isValidMnemonic(trimmedPhrase);
                  if (!check) {
                    setLoading(false);

                    return alert(
                      "error",
                      "Incorrect Mnemonic. Please provide a valid Mnemonic"
                    );
                  }

                  // const xrpWalletFromM = // UNCOMMENT
                  //   xrpl.Wallet.fromMnemonic(trimmedPhrase); // UNCOMMENT
                  // const entropy = ethers.utils.mnemonicToEntropy(trimmedPhrase); // UNCOMMENT
                  // console.log( // UNCOMMENT
                  //   "\t===> seed Created from mnemonic", // UNCOMMENT
                  //   entropy.split("x")[1] // UNCOMMENT
                  // ); // UNCOMMENT
                  // const xrpWallet = xrpl.Wallet.fromEntropy( // UNCOMMENT
                  //   entropy.split("x")[1] // UNCOMMENT
                  // ); // This is suggested because we will get seeds also // UNCOMMENT
                  // console.log(xrpWallet); // Produces different addresses // UNCOMMENT

                  const accountFromMnemonic = Platform.OS==="android"?await EthereumWallet.recoverMultiChainWallet(trimmedPhrase):await EthereumWallet.recoverWallet(trimmedPhrase,"");
                  const wallet = {
                    address: accountFromMnemonic.ethereum.address,
                    xrp: {
                    address: "000000000"
                    },
                    stellarWallet: {
                      publicKey: accountFromMnemonic.stellar.publicKey
                    },
                  };
                  /* const response = saveUserDetails(accountFromMnemonic.address).then((response)=>{
                if(response.code===400){
                  return alert(response.message)
                }
                else if(response.code===401){
                  return alert(response.message)
                }
              }).catch((e)=>{
                setLoading(false)

                console.log(e)
              })*/
                  console.log(pin);
                  const body = {
                    accountName: accountName,
                    pin: JSON.parse(pin),
                  };
                  const token = genUsrToken(body);
                  console.log(token);

                  const accounts = {
                    address: wallet.address,
                    name: accountName,
                    xrp: {
                    address: "000000000",
                    },
                    stellarWallet: {
                      publicKey: wallet.stellarWallet.publicKey,
                    },
                    walletType: "Multi-coin",
                    wallets: [],
                  };
                  let wallets = [];
                  wallets.push(accounts);
                  const allWallets = [
                    {
                      address: wallet.address,
                      name: accountName,
                      xrp: {
                       address: "000000000",
                      },
                      stellarWallet: {
                        publicKey: wallet.stellarWallet.publicKey,
                      },
                      walletType: "Multi-coin",
                    },
                  ];

                  AsyncStorageLib.setItem(
                    "wallet",
                    JSON.stringify(allWallets[0])
                  );
                  AsyncStorageLib.setItem(
                    `${accountName}-wallets`,
                    JSON.stringify(allWallets)
                  );
                  AsyncStorageLib.setItem("user", accountName);
                  AsyncStorageLib.setItem("currentWallet", accountName);
                  AsyncStorageLib.setItem("token", token);
                  dispatch(setUser(accountName));
                  dispatch(
                    setCurrentWallet(
                      wallet.address,
                      accountName,
                      "000000000",
                      "000000000",
                      (walletType = "Multi-coin")
                    )
                  );
                  dispatch(AddToAllWallets(wallets, accountName));
                  dispatch(getBalance(wallet.address));
                  dispatch(setToken(token));
                  //dispatch(setProvider('https://data-seed-prebsc-1-s1.binance.org:8545'))
                  dispatch(setWalletType("Multi-coin"));
                  const walletResponse = await AccessNativeStorage.saveWallet({
                    name: accountName,
                    address: accountFromMnemonic.ethereum.address,
                    privatekey: accountFromMnemonic.ethereum.privateKey,
                    stellarPublicKey: accountFromMnemonic.stellar.publicKey,
                    stellarPrivateKey: accountFromMnemonic.stellar.secretKey,
                    mnemonic: trimmedPhrase,
                    walletType: "Multi-coin"
                  })
                  if (walletResponse.success) {
                    const resultApi = await apiHelper.post(REACT_APP_HOST + '/v1/wallet', {
                      "addresses": {
                        "eth": accountFromMnemonic.ethereum.address,
                        "xlm": accountFromMnemonic.stellar.publicKey,
                        "bnb": accountFromMnemonic.ethereum.address,
                        "multi": accountFromMnemonic.ethereum.address
                      },
                      "isPrimary": true
                    });
                    if (resultApi.success) {
                       setLoading(false);
                       alert("success", "wallet synced!");
                        props.navigation.navigate("HomeScreen");
                    } else {
                      alert("error", "unable to sync wallet.");
                      console.log('Error:', resultApi.error, 'Status:', resultApi.status);
                    }
                  }
                } catch (e) {
                  alert("error", e);
                  setLoading(false);
                }

                // setVisible(!visible)
                setLoading(false);
              }, 1);
            }}
          >
            <Text style={{color:"white",fontSize:19}}>Import</Text>
          </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default ImportMunziWallet;

const style = StyleSheet.create({
  Body: {
    backgroundColor: "white",
    height: hp(100),
  },
  welcomeText: {
    fontSize: 15,
    fontWeight: "200",
    color: "black",
    marginLeft: 10,
  },
  welcomeText2: {
    fontSize: 15,
    fontWeight: "200",
    color: "white",
    marginTop: hp(1),
  },
  Button: {
    marginTop: hp(10),
    display: "flex",
    flexDirection: "row",
    alignContent: "space-around",
    alignItems: "center",
  },
  tinyLogo: {
    width: wp("5"),
    height: hp("5"),
    padding: 30,
    marginTop: hp(10),
  },
  Text: {
    marginTop: hp(5),
    fontSize: 15,
    fontWeight: "200",
    color: "white",
  },
  textInput: {
    width: wp(90),
    borderWidth: StyleSheet.hairlineWidth * 1,
    borderColor: "gray",
    alignSelf: "center",
    marginTop: hp(3),
    paddingVertical: hp(8),
    borderRadius: hp(1),
  },

  input2: {
    borderWidth: 1,
    borderColor: "grey",
    height: hp(5),
    width: wp(95),
    margin: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.58,
    shadowRadius: 16.0,

    elevation: 24,
  },
  labelInputContainer: {
    width: wp(90),
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    alignSelf: "center",
    marginTop: hp(3),
    borderRadius: wp(2),
    backgroundColor: "#F4F4F8",
    paddingLeft: wp(3),
    paddingVertical: hp(2),
  },
  labelInputContainer1: {
    position: "relative",
    width: wp(90),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "center",
    marginTop: hp(3),
    borderRadius: wp(2),
    backgroundColor: "white",
    borderWidth: 1,
    paddingLeft: wp(3),
    paddingVertical: hp(8),
    borderColor: "#DADADA",
  },
  label: {
    left: 10,
    color: "gray",
    fontSize:16
  },
  text: {
    marginHorizontal: wp(6),
    marginTop: hp(2),
    color: "gray",
  },
  inputView:{
    backgroundColor:"#F4F4F8",
    width: wp(90),
    alignSelf: "center",
    paddingHorizontal:wp(3),
    marginTop: hp(1.5),
    borderRadius: hp(1),
  },
  input:{
    marginVertical:hp(2),
    width:"98%",
    paddingHorizontal: wp(2),
    paddingVertical:  Platform.OS=="android"?hp(1):hp(2),
    backgroundColor:"#fff",
    borderRadius:10,
    color:"black",
    fontSize:15
  },
  pasteCon:{
    paddingVertical:5,
    paddingHorizontal:10,
    backgroundColor:"#5B65E1",
    borderRadius:10
  },
  paste:{ 
    fontSize:16,
    color:"#FFF"
  },
  btn:{
    backgroundColor: "#5B65E1",
    paddingVertical: hp(2),
    width: wp(90),
    alignSelf: "center",
    borderRadius: hp(1),
    alignItems: "center",
  },
  textInputForCrossChain: {
    width:"95%",
    paddingHorizontal: wp(2),
    paddingVertical:  Platform.OS=="android"?hp(1):hp(2),
    backgroundColor:"#fff",
    borderRadius:10,
    marginTop:4,
    color:"black",
    fontSize:15
  },
});
