import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Button,
  ActivityIndicator,
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

const ImportPolygon = (props) => {
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

      if (accountName && (mnemonic || privateKey || json) && valid) {
        setDisable(false);
      } else {
        setDisable(true);
      }
    } else {
      setMessage("");
    }
  }, [mnemonic, privateKey, json]);

  return (
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim }}
    >
      <View style={style.Body}>
        <View style={style.Button}>
          <TouchableOpacity
            style={
              label == "privateKey"
                ? { ...style.tabBtns, borderColor: "#4CA6EA" }
                : style.tabBtns
            }
            onPress={() => {
              setOptionVisible(false);
              setLabel("privateKey");
              if (text) {
                setPrivateKey(text);
              }
            }}
          >
            <Text style={{ color: label == "privateKey" ? "#4CA6EA" : "grey" }}>
              PrivateKey
            </Text>
          </TouchableOpacity>

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
              label == "JSON"
                ? { ...style.tabBtns, borderColor: "#4CA6EA" }
                : style.tabBtns
            }
            onPress={() => {
              setLabel("JSON");
              setOptionVisible(true);
              if (text) {
                setJson(text);
              }
            }}
          >
            <Text style={{ color: label == "JSON" ? "#4CA6EA" : "grey" }}>
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
              setAccountName(text);
            }}
            style={{ width: wp("78%") }}
            placeholder={accountName?accountName: "Wallet 1"}
            placeholderTextColor={"gray"}
          />
        </View>

        <View style={style.inputView}>
        <TouchableOpacity onPress={async ()=>{
           // setText('abc')
           
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
                    <Text>Phrase</Text>
          <TextInput
            style={style.input}
            value={text}
            onChangeText={(text) => {
              if (label === "privateKey") {
                setPrivateKey(text);
                setText(text);
              } else if (label === "mnemonic") {
                setMnemonic(text);
                setText(text);
              } else if (label === "JSON") {
                setJson(text);
                setText(text);
              } else {
                return alert(`please input ${label} to proceed `);
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

        <TextInput
          style={style.jsonInput}
          value={jsonKey}
          onChangeText={(text) => {
            setJsonKey(text);
          }}
          placeholderTextColor="gray"
          autoCapitalize={"none"}
          placeholder="JSON password"
        />

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
            setTimeout(() => {
              if (label === "mnemonic") {
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

                  const accountFromMnemonic = new ethers.Wallet.fromMnemonic(
                    trimmedPhrase
                  );
                  const Keys = accountFromMnemonic._signingKey();
                  const privateKey = Keys.privateKey;
                  const wallet = {
                    address: accountFromMnemonic.address,
                    privateKey: privateKey,
                  };
                  /* const response = saveUserDetails(wallet.address).then((response)=>{
                      if(response.code===400){
                        return alert(response.message)
                      }
                      else if(response.code===401){
                        return alert(response.message)
                      }
                    }).catch((e)=>{
                      setLoading(false)
                      console.log(e)
                      alert(e)
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
                    privateKey: wallet.privateKey,
                    name: accountName,
                    mnemonic: trimmedPhrase,
                    walletType: "Matic",
                    wallets: [],
                  };
                  let wallets = [];
                  wallets.push(accounts);
                  const allWallets = [
                    {
                      address: wallet.address,
                      privateKey: wallet.privateKey,
                      mnemonic: trimmedPhrase,
                      name: accountName,
                      walletType: "Matic",
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
                      wallet.privateKey,
                      trimmedPhrase
                    )
                  );
                  dispatch(AddToAllWallets(wallets, accountName));
                  dispatch(getBalance(wallet.address));
                  dispatch(setToken(token));
                  //dispatch(setProvider('https://data-seed-prebsc-1-s1.binance.org:8545'))
                  dispatch(setWalletType("Matic"));

                  setLoading(false);
                  props.navigation.navigate("HomeScreen");
                } catch (e) {
                  console.log(e);
                  setLoading(false);
                  alert("error", e);
                }
              } else if (label === "privateKey") {
                try {
                  const check = ethers.utils.isHexString(privateKey, 32);
                  if (!check) {
                    setLoading(false);
                    return alert(
                      "error",
                      "Incorrect PrivateKey. Please provide a valid privatekey"
                    );
                  }
                  const walletPrivateKey = new ethers.Wallet(privateKey);
                  console.log(walletPrivateKey);
                  const Keys = walletPrivateKey._signingKey();
                  const privatekey = Keys.privateKey;
                  const wallet = {
                    address: walletPrivateKey.address,
                    privateKey: privatekey,
                  };
                  /* const response = saveUserDetails(wallet.address).then((response)=>{
                      if(response.code===400){
                        return alert(response.message)
                      }
                      else if(response.code===401){
                        return alert(response.message)
                      }
                    }).catch((e)=>{
                      console.log(e)
                      setLoading(false)
                      alert(e)

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
                    privateKey: wallet.privateKey,
                    name: accountName,
                    walletType: "Matic",
                    wallets: [],
                  };
                  let wallets = [];
                  wallets.push(accounts);
                  const allWallets = [
                    {
                      address: wallet.address,
                      privateKey: wallet.privateKey,
                      name: accountName,
                      walletType: "Matic",
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
                      wallet.privateKey
                    )
                  );
                  dispatch(AddToAllWallets(wallets, accountName));
                  dispatch(getBalance(wallet.address));
                  dispatch(setToken(token));
                  //dispatch(setProvider('https://data-seed-prebsc-1-s1.binance.org:8545'))
                  dispatch(setWalletType("Matic"));

                  setLoading(false);
                  props.navigation.navigate("HomeScreen");
                } catch (e) {
                  console.log(e);
                  setLoading(false);
                  alert("error", e);
                }
              } else {
                ethers.Wallet.fromEncryptedJson(json, jsonKey)
                  .then((wallet) => {
                    console.log("Address: " + wallet.address);
                    const Wallet = {
                      address: wallet.address,
                      privateKey: wallet.privateKey,
                    };
                    /*const response = saveUserDetails(wallet.address).then((response)=>{
      if(response.code===400){
        return alert(response.message)
      }
      else if(response.code===401){
        return alert(response.message)
      }
    }).catch((e)=>{
      console.log(e)
      setLoading(false)
      alert(e)

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
                      privateKey: wallet.privateKey,
                      name: accountName,
                      walletType: "Matic",
                      wallets: [],
                    };
                    let wallets = [];
                    wallets.push(accounts);
                    const allWallets = [
                      {
                        address: wallet.address,
                        privateKey: wallet.privateKey,
                        name: accountName,
                        walletType: "Matic",
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
                        wallet.privateKey
                      )
                    );
                    dispatch(AddToAllWallets(wallets, accountName));
                    dispatch(getBalance(wallet.address));
                    dispatch(setToken(token));
                    //dispatch(setProvider('https://data-seed-prebsc-1-s1.binance.org:8545'))
                    dispatch(setWalletType("Matic"));

                    setLoading(false);
                    props.navigation.navigate("HomeScreen");
                  })
                  .catch((e) => {
                    console.log(e);
                    setLoading(false);
                    return alert("error", e);
                  });
                setLoading(false);
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

export default ImportPolygon;

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
  jsonInput: {
    borderWidth: StyleSheet.hairlineWidth * 1,
    marginTop: hp(3),
    width: wp(90),
    borderRadius: hp(1),
    paddingVertical: hp(1.6),
    alignSelf: "center",
    paddingHorizontal: wp(2),
  },
});
