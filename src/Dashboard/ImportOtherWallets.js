import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  NativeModules,
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
  setProvider,
  setWalletType,
} from "../components/Redux/actions/auth";
import { Paste } from "../utilities/utilities";
import DialogInput from "react-native-dialog-input";
import { urls } from "./constants";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { ethers } from "ethers";
import { genUsrToken } from "./Auth/jwtHandler";
import { alert } from "./reusables/Toasts";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
import { recoverMultiChainWallet } from "../utilities/WalletManager";
import * as StellarSdk from '@stellar/stellar-sdk';
import AccessNativeStorage from "./Wallets/AccessNativeStorage";
import apiHelper from "./exchange/crypto-exchange-front-end-main/src/apiHelper";
import { REACT_APP_HOST } from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
const { EthereumWallet } = NativeModules;

const ImportBscWallet = (props) => {
  const navi=useNavigation();
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [visible, setVisible] = useState(false);
  const [Wallet, setWallet] = useState();
  const [label, setLabel] = useState("privateKey");
  const [privateKey, setPrivateKey] = useState("");
  const [json, setJson] = useState();
  const [jsonKey, setJsonKey] = useState();
  const [optionVisible, setOptionVisible] = useState(false);
  const [provider, setProvider] = useState("");
  const [disable, setDisable] = useState(true);
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");

  const dispatch = useDispatch();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const Spin = new Animated.Value(0);

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
    if (accountName && (privateKey || mnemonic || json)) {
      let valid;
      if (label === "mnemonic") {
        const phrase = mnemonic.trimStart();
        const trimmedPhrase = phrase.trimEnd();
        valid = ethers.utils.isValidMnemonic(trimmedPhrase);
        if (!valid) {
          setMessage("Please enter a valid mnemonic");
        } else {
          setMessage("");
        }
      } else if (label === "privateKey") {
        valid = ethers.utils.isHexString(privateKey, 32);
        if (!valid) {
          setMessage("Please enter a valid private key");
        } else {
          setMessage("");
        }
      }
      if (label === "JSON") {
        const phrase = mnemonic.trimStart();
        const trimmedPhrase = phrase.trimEnd();
        valid = ethers.utils.isValidMnemonic(trimmedPhrase);
        if (!valid) {
          setMessage("Please enter a valid mnemonic");
        } else {
          setMessage("");
        }
      }

      if (accountName && (mnemonic || privateKey || json) && valid) {
        setDisable(false);
      } else {
        setDisable(true);
      }
    } else {
      setMessage("");
    }
  }, [mnemonic, privateKey, json]);
  const handleUsernameChange = (text) => {
    const formattedUsername = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '');
    setAccountName(formattedUsername);
  };

  return (
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim }}
    >
      <Wallet_screen_header title="Ethereum Wallet" onLeftIconPress={() => navi.goBack()} />
      <View style={style.Body}>
        <View style={style.Button}>
          <TouchableOpacity
            style={
              label == "privateKey"
                ? { ...style.tabBtns, borderColor: "#5B65E1" }
                : style.tabBtns
            }
            // color={label == "privateKey" ? "green" : "grey"}
            onPress={() => {
              setOptionVisible(false);
              setLabel("privateKey");
              if (text) {
                setPrivateKey(text);
              }
            }}
          >
            <Text style={{ color: "black" }}>
              PrivateKey
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              label == "mnemonic"
                ? { ...style.tabBtns, borderColor: "#5B65E1" }
                : style.tabBtns
            } // color={label == "mnemonic" ? "green" : "grey"}
            onPress={() => {
              setOptionVisible(false);
              setLabel("mnemonic");
              if (text) {
                setMnemonic(text);
              }
            }}
          >
            <Text style={{ color: "black" }}>
              Mnemonic
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              label == "JSON"
                ? { ...style.tabBtns, borderColor: "#5B65E1" }
                : style.tabBtns
            }
            // color={label == "JSON" ? "green" : "grey"}
            onPress={() => {
              setLabel("JSON");
              setOptionVisible(true);
              if (text) {
                setJson(text);
              }
            }}
          >
            <Text style={{ color: "black" }}>
              JSON key
            </Text>
          </TouchableOpacity>
        </View>

        <View style={style.labelInputContainer}>
          <Text style={style.label}>Name</Text>
          <TextInput
            value={accountName}
            maxLength={20}
            onChangeText={(text) => {
              handleUsernameChange(text)
            }}
            style={style.input}
            placeholder={accountName ? accountName : "Wallet 1"}
            placeholderTextColor={"gray"}
          />
        </View>

        <View style={style.inputView}>
          <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:20}}>
          <Text style={style.label}>Phrase</Text>
          <TouchableOpacity style={style.pasteCon} onPress={async ()=>{
           // setText('abc')
           setDisable(false)
            if (label === "privateKey") {
              await Paste(setText)
              .then((text)=>{
                console.log(text)
                setPrivateKey(text)
              })

            } else if (label === "mnemonic") {
              
              Paste(setText)
              .then((text)=>{

                setMnemonic(text)
              })

            } else if (label === "JSON") {
              Paste(
                setText
              ).then((text)=>{

                setJson(text)
              })


            } else {
              return alert(`please input ${label} to proceed `);
            }
          }}>
          <Text style={style.paste}>Paste</Text>
          </TouchableOpacity>
          </View>
          <TextInput
            style={style.input}
            value={text}
            onChangeText={(text) => {
              if (label === "privateKey") {
                setText(text);
                setPrivateKey(text);
              } else if (label === "mnemonic") {
                setText(text);
                setMnemonic(text);
              } else if (label === "JSON") {
                setText(text);
                setJson(text);
                setMnemonic(text);
              } else {
                return alert(`please input ${label} to proceed `);
              }
            }}
            placeholder={
              label === "privateKey"
                ? "Enter your private Key here"
                : label === "JSON"
                ? "Enter your secret phrase Key here"
                : "Enter your secret phrase here"
            }
          />
        </View>

        {label==="JSON"&&<TextInput
          style={[style.jsonInput,{color:"black"}]}
          value={jsonKey}
          onChangeText={(text) => {
            setJsonKey(text);
          }}
          placeholderTextColor="gray"
          autoCapitalize={"none"}
          placeholder="JSON password"
        />}

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
        {!accountName?<Text style={[{margin:20,color:"red"}]}>Input Wallet Name</Text>:<></>}
        <TouchableOpacity
          style={style.btn}
          disabled={disable}
          onPress={async () => {
            Keyboard.dismiss()
            const pin = await AsyncStorageLib.getItem("pin");
            if (!accountName) {
              return alert("error", "Please enter an wallet name to proceed");
            }
            setLoading(true);

            if (label === "JSON"||label==="mnemonic") {
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
                const accountFromMnemonic = Platform.OS === "android" ? await EthereumWallet.recoverMultiChainWallet(trimmedPhrase) : await EthereumWallet.recoverWallet(trimmedPhrase,"");
                const wallet = {
                  address: accountFromMnemonic.ethereum.address,
                  xrp: {
                    address: "000000000",
                  },
                  stellarWallet: {
                    publicKey: accountFromMnemonic.stellar.publicKey,
                  },
                };
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
                AsyncStorageLib.setItem("token", token);
                AsyncStorageLib.setItem("currentWallet", accountName);

                dispatch(setUser(accountName));
                dispatch(
                  setCurrentWallet(
                    wallet.address,
                    accountName
                  )
                );
                dispatch(AddToAllWallets(wallets, accountName));
                dispatch(getBalance(wallet.address));
                dispatch(setToken(token));
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
                  await apiHelper.post(REACT_APP_HOST + '/v1/wallet', {
                      "addresses": {
                        "eth": accountFromMnemonic.ethereum.address,
                        "xlm": accountFromMnemonic.stellar.publicKey,
                        "bnb": accountFromMnemonic.ethereum.address,
                        "multi": accountFromMnemonic.ethereum.address
                      },
                      "isPrimary": true
                    });
                  setLoading(false);
                  alert("success","Wallet import success.");
                  props.navigation.navigate("HomeScreen");
                }else{
                  setLoading(false);
                  alert("error","Wallet import faild.");
                }
              } catch (e) {
                console.log(e);
                alert("error", e);
                setLoading(false);
              }
            } else if (label === "privateKey") {
              try {
                console.log('starting private key')
                const check = ethers.utils.isHexString(privateKey, 32);
                if (!check) {
                  setLoading(false);
                  return alert(
                    "error",
                    "Incorrect PrivateKey. Please provide a valid privatekey"
                  );
                }
                const etherWalletRes = await NativeModules.EthereumWallet.importEthPrivateKey(privateKey);
                if (!etherWalletRes.generated) {
                  setLoading(false);
                  alert('error', "Account Not import yet.");
                } else {
                  const walletResponse = await AccessNativeStorage.saveWallet({
                    name: accountName,
                    address: etherWalletRes.original.address,
                    privatekey: etherWalletRes.original.privateKey,
                    stellarPublicKey: etherWalletRes.generated.publicKey,
                    stellarPrivateKey: etherWalletRes.generated.secretKey,
                    mnemonic: "",
                    walletType: "Multi-coin"
                  })
                  if (walletResponse.success) {
                    const wallet = {
                      address: etherWalletRes.original.address,
                      xrp: {
                        address: "000000000",
                      },
                      stellarWallet: {
                        publicKey: etherWalletRes.generated.publicKey
                      },
                    };
                    const body = {
                      accountName: accountName,
                      pin: JSON.parse(pin),
                    };
                    const token = genUsrToken(body);
                    const accounts = {
                      address: wallet.address,
                      name: accountName,
                      xrp: {
                        address: "000000000",
                      },
                      stellarWallet: {
                        publicKey: wallet.stellarWallet.publicKey
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
                    AsyncStorageLib.setItem("token", token);
                    AsyncStorageLib.setItem("currentWallet", accountName);

                    dispatch(setUser(accountName));
                    dispatch(
                      setCurrentWallet(
                        wallet.address,
                        accountName
                      )
                    );
                    dispatch(AddToAllWallets(wallets, accountName));
                    dispatch(getBalance(wallet.address));
                    dispatch(setToken(token));
                    dispatch(setWalletType("Multi-coin"));
                    setLoading(false);
                    props.navigation.navigate("HomeScreen");
                  }
                }
                } catch (e) {
                  console.log(e);
                  setLoading(false);
                  return alert("error", e);
                }
              }
          }}
        >
          <Text style={{ color: "white",fontSize:19 }}>Import</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default ImportBscWallet;

const style = StyleSheet.create({
  Body: {
    display: "flex",
    backgroundColor: "white",
    height: hp(100),
    width: wp(100),
    textAlign: "center",
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
    flexDirection: "row",
    justifyContent: "space-between",
    width: wp(85),
    marginTop: hp(3),
    alignSelf: "center",
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
    borderWidth: 1,
    borderColor: "grey",
    height: hp(20),
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
  label: {
    left: 10,
    color: "gray",
    fontSize:16
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
    paddingVertical: hp(2),
    backgroundColor:"#fff",
    borderRadius:10,
    paddingLeft:10,
    color:"black",
    fontSize:15,
    width:wp(83)
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
  btn: {
    backgroundColor: "#5B65E1",
    paddingVertical: hp(1.6),
    width: wp(90),
    alignSelf: "center",
    borderRadius: hp(1),
    alignItems: "center",
  },
  jsonInput: {
    backgroundColor:"#F4F4F8",
    marginTop: hp(1.5),
    width: wp(90),
    borderRadius: hp(1),
    paddingVertical: hp(1.6),
    alignSelf: "center",
    paddingHorizontal: wp(2),
    paddingLeft:30
  },
  tabBtns: {
    borderBottomWidth: 1,
    width: "26%",
    alignItems: "center",
    padding: 3,
  },
});
