import { Paste, SaveTransaction } from "../../utilities/utilities";
import React, { useRef, useEffect, useState } from "react";
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    Platform,
    Image,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Button,
    Keyboard,
    Alert,
    Modal,
    PermissionsAndroid,
    Linking,
    NativeModules
} from "react-native";
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";

import { useDispatch, useSelector } from "react-redux";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import Icon from "../../icon";
import darkBlue from "../../../assets/darkBlue.png"
import { delay, isInteger } from "lodash";
import { ShowErrotoast, Showsuccesstoast, alert } from "../reusables/Toasts";
import { isFloat } from "validator";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";
import { REACT_APP_LOCAL_TOKEN } from "../exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import { useToast } from "native-base";
import { STELLAR_URL } from "../constants";
import { Wallet_screen_header } from "../reusables/ExchangeHeader";
import ErrorComponet from "../../utilities/ErrorComponet";
import { GetStellarAvilabelBalance, stellarWalletStatus } from "../../utilities/StellarUtils";
import StellarAccountReserve from "../exchange/crypto-exchange-front-end-main/src/utils/StellarReserveComponent";
import WalletActivationComponent from "../exchange/crypto-exchange-front-end-main/src/utils/WalletActivationComponent";
// const StellarSdK = require('stellar-base');
import * as StellarSdk from '@stellar/stellar-sdk';
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import QRScannerComponent from "../Modals/QRScannerComponent";
import LinearGradient from "react-native-linear-gradient";
StellarSdk.Networks.PUBLIC
const SendXLM = (props) => {
    const toast=useToast();
    const FOCUSED = useIsFocused()
    const [show, setshow] = useState(false);
    const [address, setAddress] = useState("");
    const [amount, setAmount] = useState();
    const [Loading, setLoading] = useState(false);
    const [balance, setBalance] = useState();
    const [reservedBalance, setreservedBalance] = useState();
    const [steller_key, setsteller_key] = useState();
    const [steller_key_private, setsteller_key_private] = useState();
    const [disable, setdisable] = useState(false);
    const [ACTIVATION_MODAL, setACTIVATION_MODAL] = useState(false);
    const [ACTIVATION_MODAL_PROD, setACTIVATION_MODAL_PROD] = useState(false);
    const [Message, setMessage] = useState("");
    const [Payment_loading,setPayment_loading]=useState(false);
    const cameraRef = useRef(null);
    const device = useCameraDevice('back');
    const [qrData, setQrData] = useState('');
    const state = useSelector((state) => state);
    const navigation = useNavigation();
    const [isModalVisible, setModalVisible] = useState(false);
    const [token, settoken] = useState("");
    const [lastScannedData, setLastScannedData] = useState(null);
    const [ErroVisible,setErroVisible]=useState(false);
    const [reservedError, setreservedError] = useState(false);
    const toggleModal = () => {
        checkPermission();
    };

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
          if (!validateStellarAddress(code.value)) {
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
            { text: "Open", onPress: () => Linking?.openSettings() },
          ]
        );
      }
      // No need to explicitly toggle modal visibility on "READY"
      // Let `toggleModal` or user actions handle visibility
    };
    useEffect(() => {
    const insilize=async()=>{
      try {
        setreservedError(false)
        setErroVisible(false)
        const token_1 = await AsyncStorageLib.getItem(REACT_APP_LOCAL_TOKEN);
        settoken(token_1)
        setACTIVATION_MODAL(false)
        setACTIVATION_MODAL_PROD(false)
          setAddress()
          setAmount()
          setdisable(false)
          getData()
          setLoading(true)
          setMessage();
          setPayment_loading(false);
      } catch (error) {
        console.log("----",error)
      }
    }
    insilize()
    }, [])
    useEffect(() => {
      const insilize1=async()=>{
        try {
            getData()
            setMessage();
        } catch (error) {
          console.log("----",error)
        }
      }
      insilize1()
      }, [])
    
  useEffect(() => {
    const new_data = async () => {
      try {
        let inputValidation;
        let inputValidation1;
        if (amount) {
          inputValidation = isFloat(amount);
          inputValidation1 = isInteger(amount);
          console.log(amount, balance, JSON.stringify(balance) < JSON.stringify(amount))
          if (Number(balance) < Number(amount)) {
            setMessage("Low Balance");
            setdisable(true)
          } else if (!inputValidation && !inputValidation1) {
            setMessage("Please enter a valid amount");
            setdisable(true)
          } else {
            setdisable(false)
            setMessage("");
          }
        }
      } catch (error) {
        console.log("=", error)
      }
    }
    new_data()
  }, [amount]);
    const getData = async () => {
        try {
          setsteller_key(state.STELLAR_PUBLICK_KEY)
          setsteller_key_private(state.STELLAR_SECRET_KEY)
            get_stellar(state.STELLAR_PUBLICK_KEY);
            // const data = await AsyncStorageLib.getItem('myDataKey');
            // if (data) {
            //     const parsedData = JSON.parse(data);
            //     const matchedData = parsedData.filter(item => item.Ether_address === state.wallet.address);
            //     const publicKey = matchedData[0].publicKey;
            //     setsteller_key(publicKey)
            //     get_stellar(publicKey);
            //     const secretKey_Key = matchedData[0].secretKey;
            //     setsteller_key_private(secretKey_Key)
            // } else {
            //     console.log('No data found for key steller keys');
            // }
        } catch (error) {
            console.error('Error getting data for key steller keys:', error);
        }
    }

    const get_stellar = async (steller_key) => {
      StellarSdk.Networks.PUBLIC
      const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
        server.loadAccount(steller_key)
            .then(account => {
                account.balances.forEach(balance => {
                    if (balance.asset_type === "native") {
                      GetStellarAvilabelBalance(steller_key).then((result) => {
                        setBalance(result?.availableBalance)
                        setreservedBalance(result?.totalReserved)
                        setLoading(false);
                        }).catch(error => {
                          console.log('Error loading account:', error);
                          setLoading(false);
                      });
                        // console.log(`${balance.asset_code}: ${balance.balance}`);
                        // setBalance(balance.balance)
                    }
                });
                // setLoading(false)
            })
            .catch(error => {
                console.log('Error loading account:', error);
                setLoading(false);
                setdisable(true);
                setMessage("Activation required for Stellar Account")
                if(STELLAR_URL.USERTYPE!=="PROD"){
                  setACTIVATION_MODAL(true)
                }
                else{
                  const walletStatus=stellarWalletStatus(state?.STELLAR_PUBLICK_KEY);
                  setACTIVATION_MODAL_PROD(walletStatus);
                }
            });
    }
    const ActivateModal = () => {
      setACTIVATION_MODAL_PROD(false);
      // navigation.goBack()
    };
    const handleUsernameChange = (text) => {
        // Remove whitespace from the username
        const formattedUsername = text.replace(/\s/g, '');
        setAddress(formattedUsername);
    };
    function validateStellarAddress(address) {
        // Check if the address is 56 characters long and starts with 'G'
        if (address.length !== 56 || address[0] !== 'G') {
            return false;
        }
        try {
            // Use StellarSdk to verify if it's a valid Stellar address
            StellarSdk.StrKey.decodeEd25519PublicKey(address);
            return true;
        } catch (e) {
            return false;
        }
    }

        async function send_XLM(sourcePublic, destinationPublic, amount) {
            Keyboard.dismiss();
            try {
              Showsuccesstoast(toast,"Sending Payment");
              const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
              StellarSdk.Networks.PUBLIC;
              const sourceAccount = await server.loadAccount(sourcePublic);
              const isDestinationActive = await stellarWalletStatus(destinationPublic);
              let transaction;
              if (!isDestinationActive) {
                transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                  fee: await server.fetchBaseFee(),
                  networkPassphrase: StellarSdk.Networks.PUBLIC,
                })
                  .addOperation(
                    StellarSdk.Operation.payment({
                      destination: destinationPublic,
                      asset: StellarSdk.Asset.native(),
                      amount: amount,
                    })
                  )
                  .setTimeout(30)
                  .build();
              } else {
                transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                  fee: await server.fetchBaseFee(),
                  networkPassphrase: StellarSdk.Networks.PUBLIC,
                })
                  .addOperation(
                    StellarSdk.Operation.createAccount({
                      destination: destinationPublic,
                      startingBalance: amount,
                    })
                  )
                  .setTimeout(30)
                  .build();
              }
          
              const txXDR = transaction.toXDR();
              const res = await NativeModules.StellarSigner.signTransaction(txXDR);
              const signatureBuffer = Buffer.from(res.signature, 'base64');
              transaction.addSignature(res.publicKey, signatureBuffer.toString('base64'));
              const transactionResult = await server.submitTransaction(transaction);
              console.log('Transaction successful!', transactionResult);
              Showsuccesstoast(toast,"Transaction successful!");
              setdisable(false);
              setPayment_loading(false);
              try {
                const user_current = await state.user;
                const type = "Send";
                const chainType = "XLM";
                const walletType=await state.walletType;
                const saveTransaction = await SaveTransaction(
                  type,
                  transactionResult.hash,
                  user_current,
                  chainType,
                  walletType,
                  chainType
                );
                console.log(saveTransaction);
                await get_stellar(steller_key);
                setAmount('')
                setAddress('')
                navigation.navigate("Transactions",{txType:"STR"});
              } catch (e) {
                console.log(e);
                setAmount('')
                setAddress('')
              }
            } catch (error) {
              setAmount('')
              setAddress('')
              console.error('Error sending XLM:', error);
              ShowErrotoast(toast,"Transaction Failed");
              setdisable(false);
              setPayment_loading(false);
            }
          }
        
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
                    ShowErrotoast(toast,"Permissions not allowed");
                  }
                }
              } else {
                // iOS permission is handled through Info.plist
                setModalVisible(!isModalVisible);
              }
            };
            
            const CHECK_LOGIN=async()=>{
              token ?[setACTIVATION_MODAL(false),navigation.navigate("Settings")]:[setACTIVATION_MODAL(false),navigation.navigate("exchangeLogin")]
            }
            const handleCloseModal = () => {
              setreservedError(false);
            };
// Reset lastScannedData when modal is closed
useEffect(() => {
  if (!isModalVisible) {
    setLastScannedData(null);
  }
}, [isModalVisible]);
    return (
        <>
          <Wallet_screen_header title="Send" onLeftIconPress={() => navigation.goBack()} />
        <ErrorComponet
          isVisible={ErroVisible}
          onClose={() => setErroVisible(false)}
          message="The scanned QR code contains an invalid public key. Please make sure you're scanning the correct QR code and try again."
        />
         <WalletActivationComponent 
       isVisible={ACTIVATION_MODAL_PROD}
       onClose={() => {ActivateModal()}}
       onActivate={()=>{setACTIVATION_MODAL_PROD(false)}}
       navigation={navigation}
       appTheme={state.THEME.THEME}
       shouldNavigateBack={true}
      />
         <StellarAccountReserve
                isVisible={reservedError}
                onClose={handleCloseModal}
                title="Reserved"
              />
            <View style={[style.Body,{ backgroundColor: state.THEME.THEME===false?"#FFFFFF":"#1B1B1C"}]}>
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
                  console.log(input);
                  handleUsernameChange(input);
                }}
                placeholder="Recipient Address"
                placeholderTextColor={"gray"}
                style={[style.input, { color: state.THEME.THEME === false ? "black" : "#fff" }]}
              />
             <View style={style.inputActions}>
            <TouchableOpacity onPress={() => {
              toggleModal()
            }} style={[style.iconButton,{ backgroundColor:state.THEME.THEME?"#242426":"#F4F4F8",}]}>
              <Icon name="qr-code-scanner" type={"material"} size={20} color={state.THEME.THEME?"#fff":"#272729"} />
            </TouchableOpacity>
          </View>
          </View>
            <View style={{borderBottomColor:"gray", borderWidth:0.5,marginVertical:15}}/>
            <View style={style.balanceDisplay}>
              <Text style={[style.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
                Available Balance
              </Text>
             <View style={{alignSelf:"flex-end",justifyContent:"center",alignContent:"center"}}>
             <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[style.balanceAmount, { color: state.THEME.THEME === false ? "#212529" : "#FFFFFF" }]}>
                  {balance ? balance : show === false ? "0.00" : ""}
                </Text>
              <Text style={[style.balanceAmount, { color: state.THEME.THEME === false ? "#212529" : "#FFFFFF" }]}> XLM</Text>
              </ScrollView>
             </View>
            </View>
            <TouchableOpacity style={style.extraInfoCon} onPress={() => {setreservedError(!reservedError)}}>
            <Icon
              name={"information-outline"}
              type={"materialCommunity"}
              color={"#5E5C5C"}
              size={21}
            />
            <Text style={[{ color: state.THEME.THEME === false ? "black" : "#fff" }]}> {!reservedBalance?"":reservedBalance+" XLM are reserved"}</Text>
          </TouchableOpacity>
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
                            setAmount(filteredValue);
                        }}
                        placeholder="Amount"
                        placeholderTextColor={"gray"}
                        style={[style.input,{color:state.THEME.THEME===false?"black":"#fff"}]}
                    ></TextInput>
          <TouchableOpacity
           
            onPress={() => {
              console.log("pressed", amount, balance);
              setAmount(balance?.toString());
            }}
            style={[style.maxButton]}
          >
            <Text  onPress={()=>{console.log("pressed", amount, balance);
              setAmount(balance?.toString())}} style={style.maxButtonText}>MAX</Text>
          </TouchableOpacity>
        </View>
        </View>
        </View>
          
                <Text style={style.msgText}>{Message}</Text>
                <View style={style.bottomContainer}>
          <TouchableOpacity
            style={[style.sendButton,{backgroundColor:disable?"gray":"#3574B6"}]}
            disabled={disable||Payment_loading}
            onPress={() => {
              Keyboard.dismiss()
              setPayment_loading(true);
              if(!amount||parseFloat(amount)===0||!address)
              {
                ShowErrotoast(toast,"Recipient Address and Amount Required");
                setPayment_loading(false);
                setAmount('')
              }else{
                if(!address||!amount)
             {
               ShowErrotoast(toast,"Recipient Address and Amount Required")
               setPayment_loading(false);
             }
             else{
              setdisable(true)
             if (validateStellarAddress(address)) {
                 Showsuccesstoast(toast,"Valid Stellar address");
                 send_XLM(steller_key, address, amount)
             } else {
                 console.log('Invalid Stellar address');
                 ShowErrotoast(toast,"Invalid Stellar address");
                 setAddress();
                 setdisable(false);
               setPayment_loading(false);
             }
             }
              }
          }}
          >
            <LinearGradient
              colors={disable ? ['#6C757D', '#6C757D'] : ['#5B65E1', '#5B65E1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={style.gradientButton}
            >
              {Payment_loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (<View style={style.buttonContent}>
                <Text style={style.sendButtonText}>Send Transaction</Text>
                <Icon name="arrow-forward" type="ionicon" size={20} color="#FFFFFF" />
              </View>)}
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
            captureAudio={false}
          >
            <QRScannerComponent setModalVisible={setModalVisible}/>
          </Camera>
      </Modal>
        <Modal
          animationType="fade"
          transparent={true}
          visible={ACTIVATION_MODAL}
          >
          <View style={style.AccountmodalContainer}>
            <View style={style.AccounsubContainer}>
              <Icon
                name={"alert-circle-outline"}
                type={"materialCommunity"}
                size={60}
                color={"orange"}
              />
              <Text style={style.AccounheadingContainer}>{token ?" ":"Login to "}Activate Stellar Wallet</Text>
              <View style={{ flexDirection: "row",justifyContent:"space-around",width:wp(90),marginTop:hp(3),alignItems:"center" }}>
                <TouchableOpacity style={style.AccounbtnContainer} onPress={() => {setACTIVATION_MODAL(false),navigation.goBack()}}>
                   <Text style={style.Accounbtntext}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={style.AccounbtnContainer} onPress={()=>{CHECK_LOGIN()}}>
                   <Text style={style.Accounbtntext}>{token?"Activate ":"Login " }and Fund</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        </>

    );
};

export default SendXLM;

const style = StyleSheet.create({
    Body: {
      paddingHorizontal: wp(4),
      paddingTop: hp(2),
      height:hp(90)
    },
    Text: {
        fontSize: 18,
        color: "black",
    },
    welcomeText2: {
        fontSize: 15,
        fontWeight: "200",
        color: "white",
        marginTop: hp(1),
    },
    Button: {
        marginTop: hp(10),
    },

    Text: {
        marginTop: hp(5),
        fontSize: 15,
        fontWeight: "200",
        color: "white",
    },
    textInput2: {
        borderWidth: 1,
        borderColor: "grey",
        width: wp(90),
        margin: 10,
        borderRadius: 10,
        shadowColor: "#000",
        height: wp(8),
        shadowOffset: {
            width: 0,
            height: 12,
        },
        shadowOpacity: 0.58,
        shadowRadius: 16.0,

        elevation: 24,
    },
    inputView: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        width: wp(93),
        alignSelf: "center",
        borderColor: "#C1BDBD",
        marginTop: hp(3),
        paddingVertical: hp(1.5),
        borderRadius: hp(1),
    },
    pasteText: { color: "blue", marginHorizontal: wp(3) },
    balance: { marginLeft: wp(1), marginTop: hp(2) },
    balance_heading: { marginLeft: wp(5), marginTop: hp(2) },
    input: {
        width: wp(70),
        alignSelf: "center",
        paddingHorizontal: wp(4),
    },
    msgText: { color: "red", textAlign: "center" },
    QR_con:{
        width:wp(80),
        height:hp(40),
        borderRadius:5,
        justifyContent:"center",
        alignItems:"center"
      },
      preview: {
        flex:1
      },
      rectangleContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      },
      rectangle: {
        height: 250,
        width: 250,
        borderWidth: 2,
        borderColor: 'white',
        borderRadius: 10,
      },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
        height: hp(10),
      },
      backIcon: {
        marginRight:wp(28),
      },
      title: {
        fontSize: 18,
        fontWeight: 'bold',
        color:"#fff"
      },
      AccountmodalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      },
      AccounsubContainer:{
        backgroundColor:"#131E3A",
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
        width: "98%",
        height: "29%",
        justifyContent: "center"
      },
      AccounbtnContainer:{
        width:wp(39),
        height:hp(5),
        backgroundColor:"rgba(33, 43, 83, 1)",
        alignItems:"center",
        justifyContent:"center",
        borderRadius:10,
        borderColor:"#4CA6EA",
        borderWidth:1
      },
      Accounbtntext:{
        fontSize: 16,
        fontWeight: "bold",
        color: "#fff"
      },
      AccounheadingContainer:{
        fontSize: 20,
        fontWeight: "bold",
        marginTop: 10,
        color: "#fff"
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
    justifyContent:"space-between",
    maxHeight:hp(4)
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '700',
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
    bottom:10,
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
    height: hp(6),
    alignItems: 'center',
    justifyContent: 'center',
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
  extraInfoCon: {
    flexDirection:"row",
    alignItems:"center",
  },
});