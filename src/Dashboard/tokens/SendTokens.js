import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  Platform,
  PermissionsAndroid,
  Linking,
  Keyboard
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";
import {
  getBalance,
  getEthBalance,
  getMaticBalance,
} from "../../components/Redux/actions/auth";
import { SendCrypto } from "./sendFunctions";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { checkAddressValidity } from "../../utilities/web3utilities";
import { isFloat, isInteger, Paste } from "../../utilities/utilities";
import { alert } from "../reusables/Toasts";
import Icon from "../../icon";
import { Wallet_screen_header } from "../reusables/ExchangeHeader";
import ErrorComponet from "../../utilities/ErrorComponet";
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import QRScannerComponent from "../Modals/QRScannerComponent";
import LinearGradient from "react-native-linear-gradient";
var ethers = require("ethers");
const xrpl = require("xrpl");
//'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1644979850'
const SendTokens = (props) => {
  const cameraRef = useRef(null);
  const device = useCameraDevice('back');
  const [qrData, setQrData] = useState('');
  const EthBalance = useSelector((state) => state.EthBalance);
  const MaticBalance = useSelector((state) => state.MaticBalance);
  const type = useSelector((state) => state.walletType);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [Loading, setLoading] = useState(false);
  const [LoadingBal, setLoadingBal] = useState(false);
  const [balance, setBalance] = useState();
  const [walletType, setWallettype] = useState("");
  const [disable, setDisable] = useState(true);
  const [message, setMessage] = useState("");
  const state = useSelector((state) => state);
  const dispatch = useDispatch();
  const isFocused=useIsFocused();
  const [show,setshow]=useState(false);
  const [lastScannedData, setLastScannedData] = useState(null);
  const [ErroVisible,setErroVisible]=useState(false);
  const navigation = useNavigation();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const requestPermission = async () => {
      const status = await Camera.requestCameraPermission();
      handleCameraStatus(status);
    };
    requestPermission();
  }, []);
  const onBarCodeRead = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      for (const code of codes) {
        setLastScannedData(code.value);
        setErroVisible(false)
        alert("success", "QR Code Decoded successfully..");
        setAddress("");
        setAddress(code.value);
        setModalVisible(false);
        if (!checkAddressValidity(code.value)) {
          setModalVisible(false);
          setErroVisible(false)
          setAddress("");
          setErroVisible(true)
        }
      }
    },
  });


  const handleCameraStatus = (status) => {
    if (status === "NOT_AUTHORIZED") {
      setModalVisible(false);
     CustomInfoProvider.show(
        "Camera Permissions Required.",
        "Please enable camera permissions in settings to scan QR code.",
        [
          { text: "Close", style: "cancel" },
          { text: "Open", onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const Balance = async (Type) => {
    try {
      const wallet = await AsyncStorageLib.getItem("wallet");
      const address = (await state.wallet.address)
        ? await state.wallet.address
        : JSON.parse(wallet).address;
      console.log(state.wallet.address);
      if (!state.wallet.address) {
        setBalance(0);

        alert("error", "please select a wallet first");
      } else {
        if (Type) {
          if (Type == "Ethereum") {
            setLoadingBal(true)
            // setBalance(EthBalance._z?EthBalance._z:EthBalance);
            await dispatch(
              getEthBalance(
                state.wallet.address ? state.wallet.address : address
              )
            ).then((res) => {
              console.log(res.EthBalance);
              setBalance(res.EthBalance);
              setLoadingBal(false)
            }).catch((error) => {
              console.log(error);
              setLoadingBal(false)
            });
          } else if (Type == "Matic") {
            console.log(MaticBalance);
            await dispatch(
              getMaticBalance(
                state.wallet.address ? state.wallet.address : address
              )
            ).then(async (res) => {
              let bal = await AsyncStorageLib.getItem("MaticBalance");
              console.log(bal);
              console.log(res.MaticBalance);
              setBalance(bal);
            });
          }  else if (Type === "BNB") {
            setLoadingBal(true)
            await dispatch(getBalance(state.wallet.address))
              .then(async (response) => {
                console.log(response);
                const res = await response;
                if (res.status == "success") {
                  console.log(res);
                  setBalance(res.walletBalance);
                  console.log("success");
                  setLoadingBal(false)
                }
              })
              .catch((error) => {
                console.log(error);
                setLoadingBal(false)
              });
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    setLoadingBal(false);
    const new_data=async()=>{
      try {
          setErroVisible(false)
          console.log(props?.route?.params?.token);
          const Type = await AsyncStorageLib.getItem("walletType");
          setWallettype(JSON.parse(Type));
    
          await Balance(props?.route?.params?.token).catch((e) => {
            console.log(e);
          });
        } catch (e) {
          console.log(e);
        }
    }

    setshow(true);
    new_data()
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();
    setshow(false);
  }, [isFocused]);

  useEffect(() => {
    const data_fetch=async()=>{
      try {
        let inputValidation;
    let inputValidation1;
    let valid
    let xrpInvalid
    console.log(props?.route?.params?.token)
    valid = checkAddressValidity(address);
    inputValidation = isFloat(amount);
    inputValidation1 = isInteger(amount);
    console.log(inputValidation, inputValidation1);
    if (
      amount &&
      balance &&
      address &&
      Number(amount)>0 &&
      !xrpInvalid &&
      Number(amount) <= Number(balance) &&
      valid &&
      (inputValidation || inputValidation1)
    ) {
      setDisable(false);
    } else {
      setDisable(true);
    }

    if (address) {
      if (!valid) {
        setMessage("Please enter a valid address");
        setAddress("")
      } else {
        setMessage("");
      }
    }
      } catch (error) {
        console.log("[",error)
      }
    }
    data_fetch()
  }, [amount, address]);
  useEffect(() => {
     const data=async()=>{
      try {
        let inputValidation;
        let inputValidation1;
        if (amount) {
          inputValidation = isFloat(amount);
          inputValidation1 = isInteger(amount);
             console.log(amount,balance,JSON.stringify(balance)<JSON.stringify(amount))
          if (Number(balance)<Number(amount)) {
            setMessage("Low Balance");
          } else if (!inputValidation && !inputValidation1) {
            setMessage("Please enter a valid amount");
          } else {
            setMessage("");
          }
        }
      } catch (error) {
        console.log("*",error)
      }
     }
     data()
  }, [amount]);
  const [isModalVisible, setModalVisible] = useState(false);
  const toggleModal = () => {
    checkPermission();
};
const checkPermission = async () => {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (result===true) {
        setModalVisible(!isModalVisible);
    } else {
      const requestResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (requestResult === PermissionsAndroid.RESULTS.GRANTED) {
        setModalVisible(!isModalVisible);
      } else {
        alert("error","Permissions not allowed");
      }
    }
  } else {
    // iOS permission is handled through Info.plist
    setModalVisible(!isModalVisible);
  }
};
  async function a()
  {
    
  }

    // Reset lastScannedData when modal is closed
    useEffect(() => {
      if (!isModalVisible) {
        setLastScannedData(null);
      }
    }, [isModalVisible]);
  return (
<>
    <Wallet_screen_header title="Send" onLeftIconPress={() => navigation.goBack()} />
      <View style={[style.Body,{ backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C"}]}>
    <ErrorComponet
          isVisible={ErroVisible}
          onClose={() => setErroVisible(false)}
          message="The scanned QR code contains an invalid public key. Please make sure you're scanning the correct QR code and try again."
        />
        <View style={[style.card, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}>
         <View style={{
          flexDirection:"row",
          justifyContent:"space-between",
          alignItems:"center",
          marginBottom:4
         }}>
         <Text style={[style.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
            Recipient Address
          </Text>
          <TouchableOpacity onPress={() => {
              Paste(setAddress)
            }} style={[style.pasteButton]}>
            <Icon name="content-copy" type={"materialCommunity"} size={20} color={'#5B65E1'} />
              <Text style={style.pasteText}>PASTE</Text>
            </TouchableOpacity>
         </View>
          <View style={[style.inputContainer, {
            backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C",
          }]}>
            <TextInput
              value={address}
              onChangeText={(input) => {
                if (input && address) {
                  setDisable(false);
                } else {
                  setDisable(true);
                }
                console.log(input);
                setAddress(input);
              }}
              placeholder="Recipient Address"
              placeholderTextColor={"gray"}
              style={[style.input, { color: state.THEME.THEME === false ? "black" : "#fff" }]}
            ></TextInput>
             <View style={style.inputActions}>
            <TouchableOpacity onPress={() => {
              toggleModal()
            }} style={[style.iconButton,{ backgroundColor:state.THEME.THEME?"#242426":"#F4F4F8",}]}>
              <Icon name="qr-code-scanner" type={"material"} size={20} color={state.THEME.THEME?"#fff":"#272729"} />
            </TouchableOpacity>
          </View>
          </View>
            <View style={{borderBottomColor:"gray", borderWidth:0.5,marginVertical:15}}/>
            <View style={style.balanceHeader}>
              <Text style={[style.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
                Available Balance
              </Text>
              {LoadingBal && <ActivityIndicator color="#4A90E2" size="small" />}
            </View>
            <View style={style.balanceDisplay}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[style.balanceAmount, { color: state.THEME.THEME === false ? "#212529" : "#FFFFFF" }]}>
                  {balance ? balance : show === false ? "0.00" : ""}
                </Text>
              </ScrollView>
              <Text style={[style.currency, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
                {props?.route?.params?.tokenSymbol || 'Native'}
              </Text>
            </View>
          </View>




        <View>
        <View style={[style.card, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}>
          <Text style={[style.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
            Amount
          </Text>
          <View style={[style.inputContainer, {
            backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C",
          }]}>
          <TextInput
            value={amount}
            keyboardType="numeric"
            returnKeyType="done"
            onChangeText={(input) => {
              const replaceComma = input.replace(',', '.');
              const filteredValue = replaceComma.replace(/[^0-9.]/g, '');
              if (filteredValue && address) {
                setDisable(false);
              } else {
                setDisable(true);
              }
              console.log(filteredValue);
              setAmount(filteredValue);
            }}
            placeholder="Amount"
            placeholderTextColor={"gray"}
            style={[style.input,{color:state.THEME.THEME===false?"black":"#fff"}]}
          ></TextInput>
          <Pressable
           
            onPress={() => {
              console.log("pressed", amount, balance);
              setAmount(balance);
            }}
            style={[style.maxButton]}
          >
            <Text  onPress={()=>{console.log("pressed", amount, balance);
              setAmount(balance)}} style={style.maxButtonText}>MAX</Text>
          </Pressable>
        </View>
        </View>
        </View>

        <Text style={style.msgText}>{message}</Text>
  
       <View style={style.bottomContainer}>
          <TouchableOpacity
            disabled={disable||LoadingBal||Loading}
            style={[style.sendButton, { opacity: disable||LoadingBal ? 0.5 : 1 }]}
            onPress={async () => {
              setLoading(true)
              Keyboard.dismiss();
              let privateKey;
              const myAddress = await state.wallet.address;
              const token = props.route.params.token;
              const wallet = await AsyncStorageLib.getItem("Wallet");
              // if(address== myAddress)
              // {
              //   setLoading(false);
              //   return alert('error','address cannot be same as your address')
              // }
              if (amount && balance && Number(amount) > Number(balance)) {
                setLoading(false);
                return alert(
                  "error",
                  "You don't have enough balance to do this transaction "
                );
              }
                // privateKey = (await state.wallet.privateKey)
                //   ? await state.wallet.privateKey
                //   : JSON.parse(wallet).privateKey;

              if (
                walletType &&
                token &&
                myAddress &&
                amount &&
                address
              ) {
                await SendCrypto(
                  address,
                  amount,
                  "",
                  balance,
                  setLoading,
                  walletType,
                  setDisable,
                  myAddress,
                  token,
                  navigation
                );
              }
            }}
          >
            <LinearGradient
              colors={disable ? ['#6C757D', '#6C757D'] : ['#5B65E1', '#5B65E1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={style.gradientButton}
            >
              {Loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (<View style={style.buttonContent}>
                <Text style={style.sendButtonText}>Send Transaction</Text>
                <Icon name="arrow-forward" type="ionicon" size={20} color="#FFFFFF" />
              </View>)}
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={toggleModal}
      >
          <Camera
            ref={cameraRef}
            style={style.preview}
            device={device}
            isActive={true}
            audio={false}
            codeScanner={onBarCodeRead}
            captureAudio={false}>
           <QRScannerComponent setModalVisible={setModalVisible}/>
          </Camera>
      </Modal>
          </View>
</>
  );
};

export default SendTokens;

const style = StyleSheet.create({
  Body: {
    paddingHorizontal: wp(4),
    paddingTop: hp(2),
    height:hp(90)
  },
  pasteText: { color: "#5B65E1", marginHorizontal: wp(2),fontSize:16,fontWeight:"500" },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  msgText: { color: "red", textAlign: "center" },
  btnView: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  preview: {
    flex:1
  },
  pasteButton: {
    paddingHorizontal: wp(1),
    paddingVertical: hp(1),
    borderRadius: 8,
    flexDirection:"row"
  },
  card: {
    borderRadius: 16,
    padding: wp(3),
    marginBottom: hp(1.5)
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: hp(1.5),
    letterSpacing: 0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: wp(2),
    paddingVertical: hp(1),
  },
  maxButton: {
    paddingHorizontal: wp(4),
    paddingVertical: hp(1),
    borderRadius: 8,
    marginLeft: wp(2),
    backgroundColor:"#5B65E1"
  },
  maxButtonText: {
    color: '#E6E8EB',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: wp(2),
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  currency: {
    fontSize: 16,
    fontWeight: '600',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
  },
  iconButton: {
    padding: wp(2),
    borderRadius:10
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: wp(4),
    paddingVertical: hp(2.5),
    backgroundColor: 'transparent',
    marginBottom:hp(2.3)
  },
  sendButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  gradientButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height:hp(6)
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});