import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  NativeModules,
  Platform,
  Keyboard,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import title_icon from "../../../assets/title_icon.png";
import { useDispatch, useSelector } from "react-redux";
import { AddToAllWallets, setCurrentWallet } from "../../components/Redux/actions/auth";
import { urls } from "../constants";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { ethers } from "ethers";
import Modal from "react-native-modal";
import ModalHeader from "../reusables/ModalHeader";
import { alert } from "../reusables/Toasts";
import { Paste } from "../../utilities/utilities";
import Clipboard from "@react-native-clipboard/clipboard";
import Icon from "../../icon";
import { recoverMultiChainWallet } from "../../utilities/WalletManager";
import apiHelper from "../exchange/crypto-exchange-front-end-main/src/apiHelper";
import { REACT_APP_HOST } from "../exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import AccessNativeStorage from "../Wallets/AccessNativeStorage";
import { checkWalletExistOrNot } from "../Wallets/WalletManagement";
import { dydxAddressDrive } from "../../dydx/dydxAddressDrive";
const { EthereumWallet } = NativeModules;

const xrpl = require("xrpl");

const ImportMultiCoinWalletModal = ({
  props,
  setWalletVisible,
  Visible,
  setModalVisible,
  onCrossPress
}) => {
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState();
  const [mnemonic, setMnemonic] = useState("");
  const [visible, setVisible] = useState(false);
  const [disable, setDisable] = useState(true);
  const [message, setMessage] = useState("");
  const state = useSelector((state) => state);

  const navigation = useNavigation();

  const dispatch = useDispatch();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const Spin = new Animated.Value(0);

  const closeModal = () => {
    setWalletVisible(false);
  };
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
    if (!accountName) {
      setDisable(true)
    }
    if (accountName && mnemonic) {
      let valid
      const phrase = mnemonic.trimStart();
      const trimmedPhrase = phrase.trimEnd();
      valid = ethers.utils.isValidMnemonic(trimmedPhrase);
      if (!valid) {
        setMessage('Please enter a valid mnemonic')
      }
      else {
        setMessage('')
      }

      if (accountName && mnemonic && valid) {
        setDisable(false);
      } else {
        setDisable(true);
      }
    } else {
      setMessage("");
    }
  }, [mnemonic, accountName])

  const handleUsernameChange = (text) => {
    const formattedUsername = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '');
    setAccountName(formattedUsername);
  };
  
  return (
    <Modal
    isVisible={Visible}
    onBackdropPress={() => setWalletVisible(false)}
    onBackButtonPress={() => setWalletVisible(false)}
    animationIn="slideInUp"
    animationOut="slideOutDown"
    useNativeDriver
    hideModalContentWhileAnimating
    style={style.modal}
    avoidKeyboard={true}
    >
      <Animated.View style={[style.overlay]}>
        <View style={[style.Body, { backgroundColor: state.THEME.THEME ? "#242426" : "#F4F4F8" }]}>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 30
          }}>
            <View style={{
              paddingHorizontal: 10,
              alignItems: "flex-start"
            }}>
              <Text style={[style.coinText, { color: state.THEME.THEME ? "#fff" : "black" }]}>Multi-Chain Wallet</Text>
              <Text style={[style.coinSubText, { color: state.THEME.THEME ? "#AAAAAA" : "black" }]}>Import your wallet using your secret recovery phrase.</Text>
            </View>
            <Icon type={'entypo'} name='circle-with-cross' color={state.THEME.THEME ? "#fff" : "black" } size={26} style={[style.crossIcon]} onPress={onCrossPress} />
          </View>
          <View style={style.infoCard}>
            <Icon type={'entypo'} name='info-with-circle' color={"#ECB742"} size={20} />
            <Text style={[style.coinSubText, { color: "#ECB742", marginLeft: 5 }]}>Never share this phrase. Enter it here only to recover your wallet.</Text>
          </View>
          <View style={[style.card, { backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C" }]}>
              <Text style={[style.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>Wallet Name</Text>
              <View style={[style.inputContainer, {
                backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426",
              }]}>
              <TextInput
                value={accountName}
                maxLength={20}
                onChangeText={(text) => { handleUsernameChange(text) }}
                style={[style.textInputForCrossChain,{  color: state.THEME.THEME === false ?"black":"#fff" }]}
                placeholder={accountName ? accountName : "Wallet 1"}
                placeholderTextColor={"gray"}
              />
            </View>
          </View>


          <View style={[style.card, { backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C" }]}>
           <View style={{flexDirection:"row",justifyContent:"space-between"}}>
           <Text style={[style.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>Phrase</Text>
            <TouchableOpacity
              onPress={async () => {
                Paste(setMnemonic);
              }}
              style={{flexDirection:"row"}}
            >
              <Icon type={'material'} name='content-copy' color={"#5B65E1"} size={19} />
              <Text style={style.paste}> PASTE</Text>
            </TouchableOpacity>
           </View>
            <View style={[style.inputContainer, {
              backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426",
            }]}>
              <TextInput
                placeholder={"Please enter your mnemonic phrase here"}
                style={[style.textInputForCrossChain,{ color: state.THEME.THEME === false ?"black":"#fff" }]}
                value={mnemonic}
                onChangeText={(text) => {
                  setMnemonic(text);
                }}
                placeholderTextColor={"gray"}
              />
            </View>
          </View>
          <View
            style={{ display: "flex", alignContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: "red" }}>{message}</Text>
          </View>

          <TouchableOpacity
            style={style.btn}
            disabled={loading||disable || !accountName || !/\S/.test(accountName) ? true : false}
            onPress={async () => {
              Keyboard.dismiss()
              const checkWalletName=await checkWalletExistOrNot(accountName);
              if(checkWalletName){
                return false;
              }
              if (!accountName) {
                return alert("error", "Please enter an wallet name to proceed");
              }
              setLoading(true);
              try {
                const user = await AsyncStorageLib.getItem("user");
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
                const dydxAddress=await dydxAddressDrive(accountFromMnemonic.ethereum.privateKey)
                const wallet = {
                  address: accountFromMnemonic.ethereum.address,
                  xrp: {
                    address: "000000000",
                  },
                  stellarWallet: {
                    publicKey: accountFromMnemonic.stellar.publicKey,
                  },
                  dydx:{
                    dydxAddress:dydxAddress.dydxAddress,
                    dydxPublicKey:dydxAddress.publicKey,
                  }
                };

                let wallets = [];
                const data = await AsyncStorageLib.getItem(`${user}-wallets`)
                  .then((response) => {
                    console.log(response);
                    JSON.parse(response).map((item) => {
                      wallets.push(item);
                    });
                  })
                  .catch((e) => {
                    setWalletVisible(false);
                    setVisible(false);
                    setModalVisible(false);
                    console.log(e);
                  });

                const allWallets = [
                  {
                    address: wallet.address,
                    name: accountName,
                    xrp: {
                      address: "000000000",
                    },
                    stellarWallet: {
                      publicKey: wallet.stellarWallet.publicKey
                    },
                    dydx: {
                      dydxAddress: wallet.dydx.dydxAddress,
                      dydxPublicKey: wallet.dydx.dydxPublicKey,
                    },
                    walletType: "Multi-coin",
                    wallets: wallets,
                  },
                ];
                const resultApi = await apiHelper.post(REACT_APP_HOST + '/v1/wallet', {
                  "addresses": {
                      "eth": wallet.address,
                      "xlm": wallet.stellarWallet.publicKey,
                      "bnb": wallet.address,
                      "multi": wallet.address
                  },
                  "isPrimary": true
                });
                console.log("result---result", resultApi)

                if (resultApi.success) {
                  alert("success", "wallet synced!");
                } else {
                  alert("error", "unable to sync wallet.");
                  console.log('Error:', resultApi.error, 'Status:', resultApi.status);
                }

                dispatch(AddToAllWallets(allWallets, user)).then(async(response) => {
                  if (response) {
                    if (response.status === "Already Exists") {
                      alert("error", "Account with same name already exists");
                      setLoading(false);
                      return;
                    } else if (response.status === "success") {
                      dispatch(
                        setCurrentWallet(
                          wallet.address,
                          accountName
                        )
                      )
                      const walletResponse = await AccessNativeStorage.saveWallet({
                        name: accountName,
                        address: accountFromMnemonic.ethereum.address,
                        privatekey: accountFromMnemonic.ethereum.privateKey,
                        stellarPublicKey: accountFromMnemonic.stellar.publicKey,
                        stellarPrivateKey: accountFromMnemonic.stellar.secretKey,
                        mnemonic: trimmedPhrase,
                        walletType: "Multi-coin",
                        dydxAddress:dydxAddress.dydxAddress,
                        dydxPublicKey:dydxAddress.publicKey,
                        dydxMnemonic:dydxAddress.mnemonic,
                        dydxPrivateKey:dydxAddress.privateKey,
                        dydxWalletConnectSignature: dydxAddress.walletConnectSignature,
                      })
                      if (walletResponse.success) {
                        setTimeout(() => {
                          setLoading(false);
                          setWalletVisible(false);
                          setVisible(false);
                          setModalVisible(false);
                          AsyncStorageLib.setItem("currentWallet", accountName);
                          navigation.navigate("AllWallets");
                        }, 0);
                      }
                    } else {
                      alert("error", "failed please try again");
                      return;
                    }
                  }
                });

                let result = [];
              } catch (e) {
                console.log("--====000---", e)
                alert("error", e);
                setLoading(false);
                setWalletVisible(false);
                setVisible(false);
                setModalVisible(false);
              }

              setWalletVisible(false);
              setVisible(false);
              setModalVisible(false);
              setLoading(false);
            }}
          >
            
            {loading ? (
            <ActivityIndicator size="small" color="white" />
          ): (<Text style={{ color: "white",fontSize:16 }}>Import</Text>)}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

export default ImportMultiCoinWalletModal;

const style = StyleSheet.create({
  modal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  overlay: {
    justifyContent: "flex-end",
  },
  Body: {
    width: wp(100),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    alignSelf: "center",
    paddingHorizontal: 15,
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
    marginTop: hp(0),
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
  input: {
    height: hp("5%"),
    marginBottom: hp("2"),
    color: "black",
    marginTop: hp("2"),
    width: wp("90"),
    paddingRight: wp("7"),
    backgroundColor: "white",
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
  text: {
    marginHorizontal: wp(6),
    marginTop: hp(5),
    color: "gray",
  },
  btn: {
    backgroundColor: "#5B65E1",
    paddingVertical: hp(1.6),
    width: wp(95),
    alignSelf: "center",
    borderRadius: hp(1),
    alignItems: "center",
    justifyContent:"center",
    marginBottom:15
  },
  paste: {
    fontSize:15,
    fontWeight:"500",
    color: "#5B65E1"
   },
  coinText: {
    fontSize: 16,
    fontWeight: "500",
  },
  coinSubText: {
    fontSize: 13,
    fontWeight: "400",
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
  crossIcon: {
    marginTop:hp(-4),
    padding: 3,
  },
  infoCard: {
    marginVertical: 15,
    backgroundColor: "#FEF6D8",
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center"
  },
  card: {
    borderRadius: 16,
    padding: wp(3),
    marginBottom: hp(1.5)
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: hp(1.5),
    letterSpacing: 0.3,
    paddingVertical:1.5
  },
  inputContainer: {
    alignItems: "flex-start",
    borderRadius: 12,
    paddingHorizontal: wp(2),
    paddingVertical: hp(1),
  },
  textInputForCrossChain:{
    width:"100%",
    paddingHorizontal: wp(2),
    paddingVertical:  Platform.OS=="android"?hp(1):hp(2),
  },
});
