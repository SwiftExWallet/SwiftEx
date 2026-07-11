const xrpl = require("xrpl");
import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Button,
  TextInput,
  ActivityIndicator,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import title_icon from "../../assets/title_icon.png";
import { useDispatch, useSelector } from "react-redux";
import {
  Generate_Wallet2,
  getXrpBalance,
} from "../components/Redux/actions/auth";
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
import { genUsrToken } from "./Auth/jwtHandler";
import { utils } from "xrpl-accountlib";
import { ethers } from "ethers";
import { alert } from "./reusables/Toasts";
import  Clipboard from "@react-native-clipboard/clipboard";

const ImportXrp = (props) => {
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [visible, setVisible] = useState(false);
  const [Wallet, setWallet] = useState();
  const [label, setLabel] = useState("mnemonic");
  const [privateKey, setPrivateKey] = useState();
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
    if (accountName && (mnemonic || privateKey)) {
      let valid;

      if (label === "mnemonic") {
        const phrase = mnemonic.trimStart();
        const trimmedPhrase = phrase.trimEnd();
        valid = utils.isValidMnemnic(trimmedPhrase);

        if (!valid) {
          setMessage("Please enter a valid mnemonic");
        } else {
          setMessage("");
        }
      } else if (label === "privateKey") {
        valid = utils.isValidSeed(privateKey);
        if (!valid) {
          setMessage("Please enter a valid private key");
        } else {
          setMessage("");
        }
        console.log(valid);
      } else {
        setMessage("");
      }

      if (accountName && (mnemonic || privateKey) && valid) {
        setDisable(false);
      } else {
        setDisable(true);
      }
    } else {
      setMessage("");
    }
  }, [mnemonic, privateKey]);

  return (
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim }}
    >
      <View style={style.Body}>
        <View style={style.Button}>
          <TouchableOpacity
            style={
              label == "mnemonic"
                ? { ...style.tabBtns, borderColor: "#4CA6EA" }
                : style.tabBtns
            }
            onPress={() => {
              setOptionVisible(false);
              setLabel("mnemonic");
              if (text) {
                setMnemonic(text);
              }
            }}
          >
            <Text style={{ color: label == "mnemonic" ? "#4CA6EA" : "grey" }}>
              Mnemonic
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              label == "privateKey"
                ? { ...style.tabBtns, borderColor: "#4CA6EA" }
                : style.tabBtns
            }
            onPress={() => {
              setLabel("privateKey");
              setOptionVisible(true);
              if (text) {
                setPrivateKey(text);
              }
            }}
          >
            <Text style={{ color: label == "privateKey" ? "#4CA6EA" : "grey" }}>
              PrivateKey
            </Text>
          </TouchableOpacity>
        </View>

        <View style={style.labelInputContainer}>
          <Text style={style.label}>Name</Text>
          <TextInput
            value={accountName}
            maxLength={20}
            onChangeText={(text) => {
              setAccountName(text);
            }}
            style={{ width: wp("78%") }}
            placeholder={accountName?accountName: "Wallet 1"}
            placeholderTextColor={"gary"}
          />
        </View>

        <View style={style.inputView}>
        <TouchableOpacity onPress={async ()=>{
           // setText('abc')
           const text_copy = await Clipboard.getStringAsync();
           
            if (label === "privateKey") {
              setText(text_copy)
                setPrivateKey(text_copy)
              // await Paste(setText)
              // .then((text)=>{
              //   console.log(text)
              // })

            } else if (label === "mnemonic") {
              setText(text_copy)
              setMnemonic(text_copy)
              
              // Paste(setText)
              // .then((text)=>{

              // })

            } else if (label === "JSON") {
              // Paste(
                // setText
              // ).then((text)=>{

                setJson(text)
              // })


            } else {
              return alert(`please input ${label} to proceed `);
            }
          }}>
          <Text style={style.paste}>Paste</Text>
          </TouchableOpacity>
            <Text>Phrase</Text>
          <TextInput
          value={text}
            style={style.input}
            onChangeText={(text) => {
              if (label === "mnemonic") {
                setMnemonic(text);
                setText(text);
              } else if (label === "privateKey") {
                setPrivateKey(text);
                setText(text);
              } else {
                return alert("error", `please input ${label} to proceed `);
              }
            }}
            placeholder={
              label === "privateKey"
                ? "Enter your private Key here"
                : label === "JSON"
                ? "Enter your secret JSON Key here"
                : "Enter your secret phrase here"
            }
          />
        </View>

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
            const pin = await AsyncStorageLib.getItem("pin");
            if (!accountName) {
              return alert("error", "Please enter an wallet name to proceed");
            }
            setLoading(true);
            setTimeout(async () => {
              if (label === "mnemonic") {
                try {
                  /*Wallet {
  "classicAddress": "rBF6yd1gkfBQ4DbgjjFb8eG2QNPHYGgyZH",
  "privateKey": "ED3C6A54C6B61A02CF1739FAA2E1D7CD2384CFB23ABE5B8C6C94E13552E196FA5C",
  "publicKey": "ED79A51B1B6CA6701A10143380A7B6520A23F900AE21F8CE2877BE62DAA84A7F17",
  "seed": "sEdTB7KBmtuNsMqGK5rTbUkgi5GXzWb",
} */
                  const phrase = mnemonic.trimStart();
                  const trimmedPhrase = phrase.trimEnd();
                  const accountFromMnemonic =
                    xrpl.Wallet.fromSeed(trimmedPhrase);
                  const privateKey = accountFromMnemonic.seed;
                  const wallet = {
                    classicAddress: accountFromMnemonic.classicAddress,
                    address: accountFromMnemonic.classicAddress,
                    privateKey: privateKey,
                  };
                  /*const response = await saveUserDetails(wallet.address).then((response)=>{
                      if(response.code===400){
                        return alert(response.message)
                      }
                      else if(response.code===401){
                        return alert(response.message)
                      }
                      console.log(pin)
                      }).catch((e)=>{
                        console.log(e)
                        setLoading(false)
                        alert(e)
  
                      })*/
                  const body = {
                    accountName: accountName,
                    pin: JSON.parse(pin),
                  };
                  const token = genUsrToken(body);
                  console.log(token);

                  const accounts = {
                    classicAddress: wallet.classicAddress,
                    address: wallet.classicAddress,
                    privateKey: privateKey,
                    mnemonic: trimmedPhrase,
                    name: accountName,
                    walletType: "Xrp",
                    wallets: [],
                  };
                  let wallets = [];
                  wallets.push(accounts);
                  const allWallets = [
                    {
                      classicAddress: wallet.classicAddress,
                      address: wallet.classicAddress,
                      privateKey: privateKey,
                      mnemonic: trimmedPhrase,
                      name: accountName,
                      walletType: "Xrp",
                    },
                  ];
                  AsyncStorageLib.setItem(
                    `${accountName}-wallets`,
                    JSON.stringify(allWallets)
                  );
                  AsyncStorageLib.setItem("user", accountName);
                  AsyncStorageLib.setItem(
                    "wallet",
                    JSON.stringify(allWallets[0])
                  );
                  AsyncStorageLib.setItem("currentWallet", accountName);
                  AsyncStorageLib.setItem("token", token);
                  dispatch(setUser(accountName));
                  dispatch(
                    setCurrentWallet(
                      wallet.classicAddress,
                      accountName,
                      privateKey,
                      wallet.classicAddress,
                      trimmedPhrase
                    )
                  );

                  dispatch(AddToAllWallets(wallets, accountName));
                  dispatch(getXrpBalance(wallet.address));
                  dispatch(setToken(token));
                  //dispatch(setProvider('https://data-seed-prebsc-1-s1.binance.org:8545'))
                  dispatch(setWalletType("Xrp"));
                  setLoading(false);

                  props.navigation.navigate("HomeScreen");
                } catch (e) {
                  console.log(e);
                  alert("error", e);
                  setLoading(false);
                }
              } else {
                try {
                  const walletPrivateKey = xrpl.Wallet.fromSecret(privateKey);
                  console.log(walletPrivateKey);
                  const privatekey = walletPrivateKey.seed;
                  const wallet = {
                    address: walletPrivateKey.classicAddress,
                    privateKey: privatekey,
                    classicAddress: walletPrivateKey.classicAddress,
                  };
                  /*const response = await saveUserDetails(wallet.address).then((response)=>{
                      if(response.code===400){
                        return alert(response.message)
                      }
                      else if(response.code===401){
                        return alert(response.message)
                      }
                    }).catch((e)=>{
                      console.log(e)
                      setLoading(false)

                      return alert('failed to create account. please try again')
                    })*/
                  const body = {
                    accountName: accountName,
                    pin: JSON.parse(pin),
                  };
                  const token = genUsrToken(body);
                  console.log(token);

                  const accounts = {
                    classicAddress: wallet.classicAddress,
                    address: wallet.classicAddress,
                    privateKey: privateKey,
                    name: accountName,
                    walletType: "Xrp",
                    wallets: [],
                  };
                  let wallets = [];
                  wallets.push(accounts);
                  const allWallets = [
                    {
                      classicAddress: wallet.classicAddress,
                      address: wallet.classicAddress,
                      privateKey: privateKey,
                      name: accountName,
                      walletType: "Xrp",
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
                      privateKey,
                      wallet.classicAddress
                    )
                  );
                  dispatch(AddToAllWallets(wallets, accountName));
                  dispatch(getBalance(wallet.address));
                  dispatch(setToken(token));
                  //dispatch(setProvider('https://data-seed-prebsc-1-s1.binance.org:8545'))
                  dispatch(setWalletType("Xrp"));
                  setLoading(false);

                  props.navigation.navigate("HomeScreen");
                } catch (e) {
                  console.log(e);
                  setLoading(false);
                  return alert("error", e);
                }
              }
            }, 1);
          }}
        >
          <Text style={{ color: "white" }}>Import</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default ImportXrp;

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
    justifyContent: "space-around",
    width: wp(75),
    marginTop: hp(3),
    marginBottom: hp(3),
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
  input: {
    height: hp("5%"),
    marginBottom: hp("2"),
    color: "black",
    marginTop: hp("2"),
    width: wp("90"),
    paddingRight: wp("7"),
    backgroundColor: "white",
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
  tabBtns: {
    borderBottomWidth: 1,
    width: "26%",
    alignItems: "center",
    padding: 3,
  },
  labelInputContainer: {
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
    paddingVertical: hp(1.2),
    borderColor: "#DADADA",
  },
  label: {
    position: "absolute",
    zIndex: 100,
    backgroundColor: "white",
    paddingHorizontal: 5,
    left: 12,
    color: "#4CA6EA",
    top: -12,
  },
  inputView: {
    borderWidth: 1,
    width: wp(90),
    alignSelf: "center",
    padding: 10,
    marginTop: hp(3),
    borderRadius: hp(1),
    borderColor: "#DADADA",
  },
  input: { paddingVertical: hp(4) },
  paste: { textAlign: "right", color: "#4CA6EA" },
  btn: {
    backgroundColor: "#4CA6EA",
    paddingVertical: hp(1.6),
    width: wp(90),
    alignSelf: "center",
    borderRadius: hp(1),
    alignItems: "center",
  },
});
