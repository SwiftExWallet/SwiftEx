import { useIsFocused, useNavigation } from "@react-navigation/native";
import { ActivityIndicator, Alert, Image, Keyboard, Linking, Modal, NativeModules, PermissionsAndroid, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { REACT_APP_LOCAL_TOKEN } from "../../ExchangeConstants";
import { useEffect, useRef, useState } from "react";
import Icon from "../../../../../../icon";
import darkBlue from "../../../../../../../assets/darkBlue.png";
import Bridge from "../../../../../../../assets/Bridge.png";
import QRCode from "react-native-qrcode-svg";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { useSelector } from "react-redux";
import { Camera, useCameraDevice, useCodeScanner, useCameraPermission } from "react-native-vision-camera";
import { Exchange_screen_header } from "../../../../../reusables/ExchangeHeader";
import { alert } from "../../../../../reusables/Toasts";
import { STELLAR_URL } from "../../../../../constants";
import { Paste, SaveTransaction } from "../../../../../../utilities/utilities";
import Snackbar from "react-native-snackbar";
import ErrorComponet from "../../../../../../utilities/ErrorComponet";
import { GetStellarAvilabelBalance, GetStellarUSDCAvilabelBalance, stellarWalletStatus } from "../../../../../../utilities/StellarUtils";
import WalletActivationComponent from "../../utils/WalletActivationComponent";
import * as StellarSdk from '@stellar/stellar-sdk';
import CustomInfoProvider from "../../components/CustomInfoProvider";
import QRScannerComponent from "../../../../../Modals/QRScannerComponent";
import TokenQrCode from "../../../../../Modals/TokensQrCode";
import { colors } from "../../../../../../Screens/ThemeColorsConfig";
StellarSdk.Networks.PUBLIC

const send_recive = ({route}) => {
  const { hasPermission, requestPermission } = useCameraPermission()
    const {bala,asset_name,assetIssuer}=route.params;
    console.log("----------------usdtAsse-----------------",bala,asset_name,assetIssuer)
    const usdtAsset = asset_name==="native"?StellarSdk.Asset.native():new StellarSdk.Asset(asset_name, assetIssuer);
  const cameraRef = useRef(null);
    const device = useCameraDevice('back');
    const state = useSelector((state) => state);
    const FOCUSED = useIsFocused();
    const navigation = useNavigation();
    const [receiveQrOpen, setreceiveQrOpen] = useState(false);
    const [mode_selected, setmode_selected] = useState("SED");
    const [recepi_address, setrecepi_address] = useState("");
    const [recepi_memo, setrecepi_memo] = useState("");
    const [recepi_amount, setrecepi_amount] = useState("");
    const [lastScannedData, setLastScannedData] = useState(null);
    const [Payment_loading,setPayment_loading]=useState(false);
    const [qrvalue, setqrvalue] = useState("");
    const [isModalVisible, setModalVisible] = useState(false);
    const [ErroVisible,setErroVisible]=useState(false);
    const [resStellarbal, setresStellarbal] = useState("");
    const [Loading, setLoading] = useState(false);
    const [ACTIVATION_MODAL_PROD, setACTIVATION_MODAL_PROD] = useState(false);

  const onBarCodeRead = useCodeScanner({
      codeTypes: ['qr'],
      onCodeScanned: (codes) => {
        for (const code of codes) {
          setLastScannedData(code.value);
          setErroVisible(false)
          alert("success", "QR Code Decoded successfully..");
          setrecepi_address("");
          setrecepi_address(code.value);
          setModalVisible(false);
          if (!validateStellarAddress(code.value)) {
            setModalVisible(false);
            setErroVisible(false)
            setrecepi_address("");
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
    // No need to explicitly toggle modal visibility on "READY"
    // Let `toggleModal` or user actions handle visibility
  };
  const toggleModal = async() => {
  if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
  
        if (!result) {
          const requestResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA
          );
  
          if (
            requestResult === PermissionsAndroid.RESULTS.DENIED ||
            requestResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ) {
            CustomInfoProvider.show("warning", "Permission Denied", "Camera permission requird for scaning QR Code.");
          }
        }
        setModalVisible(true);
      }else{
        if(!hasPermission){
          requestPermission()
        }else{
          setModalVisible(true);
        }
      }
  };

  const get_data = async () => {
    setLoading(true);
    setqrvalue(state?.STELLAR_PUBLICK_KEY)
    if (asset_name === "native") {
      GetStellarAvilabelBalance(state?.STELLAR_PUBLICK_KEY).then((result) => {
        setresStellarbal(result?.availableBalance)
        setLoading(false);
      }).catch(error => {
        console.log('Error loading account:', error);
        setLoading(false);
      });
    }
    if (asset_name !== "native") {
      const result = await GetStellarUSDCAvilabelBalance(state?.STELLAR_PUBLICK_KEY, asset_name, assetIssuer)
      if (result.error) {
        setresStellarbal("0.0")
        setLoading(false);
        if (Platform.OS === "ios") {
          Alert.alert(
            "warning",
            result.error,
            [
              { text: "Close", style: "cancel" },
              { text: "Trust", onPress: () => navigation.navigate("Assets_manage", { openAssetModal: true }) },
            ]
          );
        }
        if (Platform.OS === "android") {
          CustomInfoProvider.show(
            "warning",
            result.error,
            [
              { text: "Close", style: "cancel" },
              { text: "Trust", onPress: () => {CustomInfoProvider.hide(),setTimeout(()=>{
                navigation.navigate("Assets_manage", { openAssetModal: true })
              },1000)} },
            ]
          );
        }
      } else {
        setresStellarbal(result?.availableBalance)
        setLoading(false);
      }
    }
  }
    function validateStellarAddress(address) {
      if (address.length !== 56 || address[0] !== 'G') {
          return false;
      }
      try {
          StellarSdk.StrKey.decodeEd25519PublicKey(address);
          return true;
      } catch (e) {
          return false;
      }
  }
  async function send_XLM(sourcePublicKey, destinationPublic, amount) {
    Keyboard.dismiss();
    try {
    const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
      // Load the source account
      const sourceAccount = await server.loadAccount(sourcePublicKey);
  
      // Create the transaction
    let destinationAccount;
    let isActivated = true;
    let isXLMNative = asset_name === "native";
  
    try {
      destinationAccount = await server.loadAccount(destinationPublic);
    } catch (accountError) {
      if (accountError.response?.data?.title === "ResourceMissingError") {
        isActivated = false;
        console.log("Destination account not activated");
      } else {
        isActivated = false;
      }
    }

      let transaction;
      
      if (!isActivated && isXLMNative) {
        if(parseFloat(amount)<parseFloat(1))
        {
          CustomInfoProvider.show("warning","Opps!","Recipient account not activated. Minimum 1 XLM required to activate account.");
          setPayment_loading(false);
          return;
        }
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
          .addMemo(StellarSdk.Memo.text(recepi_memo))
          .setTimeout(30)
          .build();
          
      } else if (isActivated) {
        if (isXLMNative) {
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
            .addMemo(StellarSdk.Memo.text(recepi_memo))
            .setTimeout(30)
            .build();
            
        } else {
          const customAsset = new StellarSdk.Asset(asset_name, assetIssuer);
          const destAccountData = await server.loadAccount(destinationPublic);
          const hasTrustline = destAccountData.balances.some(balance => 
            balance.asset_code === asset_name && 
            balance.asset_issuer === assetIssuer
          );
          
          if (!hasTrustline) {
            CustomInfoProvider.show("warning","Opps!",`Recipient needs to trust ${asset_name}.`);
            setPayment_loading(false);
            return;
          }

          transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: await server.fetchBaseFee(),
            networkPassphrase: StellarSdk.Networks.PUBLIC,
          })
            .addOperation(
              StellarSdk.Operation.payment({
                destination: destinationPublic,
                asset: customAsset,
                amount: amount,
              })
            )
            .addMemo(StellarSdk.Memo.text(recepi_memo))
            .setTimeout(30)
            .build();
        }
        
      } else {
        CustomInfoProvider.show("warning","Opps!",`Cannot send ${asset_name} asset to unactivated account. Send XLM first to activate.`);
        setPayment_loading(false);
        return;
      }
      const txXDR = transaction.toXDR();
      const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
      const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
      transaction.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
  
      // Submit the transaction
      const transactionResult = await server.submitTransaction(transaction);
      console.log('Transaction successful!', transactionResult);
      Snackbar.show({
        text: "Transaction successful!",
        duration: Snackbar.LENGTH_LONG,
        backgroundColor:'green', 
      });
      setrecepi_address('');
      setrecepi_amount('');
      setrecepi_memo('');
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
        navigation.navigate("Transactions",{txType:"STR"});
      } catch (e) {
        console.log(e);
      }
    } catch (error) {
      console.error('Error sending XLM:', error);
      Snackbar.show({
        text: "Transaction Failed",
        duration: Snackbar.LENGTH_LONG,
        backgroundColor:'red', 
      });
      setrecepi_address('');
      setrecepi_amount('');
      setrecepi_memo('');
      setPayment_loading(false);
    }
  }


  const Send_Asseet = async () => {
    Keyboard.dismiss()
    setPayment_loading(true);
    try {
      if (!recepi_address || !recepi_amount) {
        Snackbar.show({
          text: "Recipient Address and Amount Required.",
          duration: Snackbar.LENGTH_LONG,
          backgroundColor:'red', 
      });
        setPayment_loading(false);
      }else {
        if (validateStellarAddress(recepi_address)) {
          Snackbar.show({
            text: "Valid Stellar address",
            duration: Snackbar.LENGTH_LONG,
            backgroundColor:'green', 
        });
          if(parseFloat(recepi_amount)>(asset_name==="native"?resStellarbal:resStellarbal))
          {
            Snackbar.show({
              text: "Insuficint balance",
              duration: Snackbar.LENGTH_LONG,
              backgroundColor:'red', 
          });
            setPayment_loading(false);
          }
          else{
           if(parseFloat(recepi_amount)===0)
           {
             Snackbar.show({
               text: "Invalid amount",
               duration: Snackbar.LENGTH_LONG,
               backgroundColor: 'red',
             });
            setPayment_loading(false);
           }else{
            send_XLM(state.STELLAR_PUBLICK_KEY, recepi_address, recepi_amount)
           }
          }
        } else {
          Snackbar.show({
            text: "Invalid Stellar address",
            duration: Snackbar.LENGTH_LONG,
            backgroundColor:'red', 
        });
          setrecepi_address('');
          setrecepi_amount('');
          setrecepi_memo('');
          setPayment_loading(false);
        }
      }
    } catch (error) {
      console.log("---Send_Asset---", error)
      setPayment_loading(false);
    }
  }

    useEffect(() => {
        setreceiveQrOpen(false)
        setACTIVATION_MODAL_PROD(false)
        setLoading(false)
        setErroVisible(false)
        setPayment_loading(false)
        get_data()
        setmode_selected("SED");
        const inti = async () => {
          const walletStatus = await stellarWalletStatus(state?.STELLAR_PUBLICK_KEY);
          setACTIVATION_MODAL_PROD(walletStatus)
        }
        inti()
    }, [FOCUSED])

    useEffect(()=>{
      get_data()
    },[ACTIVATION_MODAL_PROD])

  // Reset lastScannedData when modal is closed
  useEffect(() => {
    if (!isModalVisible) {
      setLastScannedData(null);
    }
  }, [isModalVisible]);

  const ActivateModal = () => {
    setACTIVATION_MODAL_PROD(false);
  };

  const theme = state.THEME.THEME ? colors.dark : colors.light;
    return (
        <>
     <Exchange_screen_header title="Transaction" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />
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
         appTheme={true}
         shouldNavigateBack={true}
      />
            <View style={[styles.main_con,{backgroundColor:theme.bg}]}>
                <View style={styles.mode_con}>
                    <TouchableOpacity style={[styles.mode_sele, { backgroundColor: mode_selected === "SED" ? "#5B65E1" : theme.cardBg }]} onPress={() => { setmode_selected("SED") }}>
                        <Text style={[styles.mode_text,{color: mode_selected === "SED"?"#fff":theme.headingTx}]}>Send</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.mode_sele, { backgroundColor: mode_selected === "RVC" ? "#5B65E1" : theme.cardBg }]} onPress={() => { setmode_selected("RVC"),setreceiveQrOpen(true) }}>
                        <Text style={[styles.mode_text,{color: mode_selected === "RVC"?"#fff":theme.headingTx}]}>Receive</Text>
                    </TouchableOpacity>
                </View>
          <View style={[styles.card,{backgroundColor:theme.cardBg}]}>
            <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:5}}>
            <Text style={[styles.mode_text, { textAlign: "left", marginLeft: 16, fontSize: 16, color: theme.inactiveTx }]}>Recipient Address</Text>
            <TouchableOpacity style={{flexDirection:"row",alignItems:"center"}}  onPress={() => {Paste(setrecepi_address)}}>
            <Icon name={"content-copy"} type={"materialCommunity"} size={18} color={"#5B65E1"}/>
            <Text style={[styles.mode_text, { textAlign: "left", marginRight: 16,marginLeft:5, fontSize: 16, color: "#5B65E1" }]}>PASTE</Text>
            </TouchableOpacity>
            </View>
            <View style={[styles.text_input, { flexDirection: "row", alignItems: "center", backgroundColor: theme.bg }]}>
              <TextInput placeholder="Recipient stellar address" placeholderTextColor={"gray"} value={recepi_address} style={{ height: "100%", width: "88%", fontSize: 19, color: theme.headingTx }} onChangeText={(value) => { setrecepi_address(value) }} />
              <TouchableOpacity onPress={() => { toggleModal(); }}>
                <Icon
                  name={"qrcode-scan"}
                  type={"materialCommunity"}
                  size={28}
                  color={"#5B65E1"}
                />
              </TouchableOpacity>
            </View>
            <Text style={[styles.mode_text, { textAlign: "left", marginLeft: 16, fontSize: 16, marginTop: 10, color: theme.inactiveTx }]}>Available: {asset_name === "native" || asset_name !== "native" ? resStellarbal === null || resStellarbal === undefined ||Loading ? <ActivityIndicator /> : resStellarbal === "Error" ? 0.00 : resStellarbal : resStellarbal === "Error" ? 0.00 : resStellarbal}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.cardBg,marginTop:2 }]}>
            <Text style={[styles.mode_text, { textAlign: "left", marginLeft: 16, fontSize: 16, color: theme.inactiveTx }]}>Amount</Text>
            <View style={[styles.text_input, { flexDirection: "row", alignItems: "center", backgroundColor: theme.bg }]}>
              <TextInput placeholder="Enter amount" placeholderTextColor={"gray"} value={recepi_amount} returnKeyType="done" keyboardType="decimal-pad" style={{ height: "100%", width: "88%", fontSize: 19, color: theme.headingTx }} onChangeText={(value) => { 
                const replaceComma = value.replace(',', '.');
                const numericText = replaceComma.replace(/[^0-9.]/g, '');
                setrecepi_amount(numericText)
              }} />
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.cardBg,marginTop:2 }]}>

              <Text style={[styles.mode_text, { textAlign: "left", marginLeft: 16, fontSize: 16,color:theme.inactiveTx }]}>Transaction Memo</Text>
              <View style={[styles.text_input, { flexDirection: "row", alignItems: "center", backgroundColor: theme.bg }]}>
              <TextInput placeholder="Enter transaction memo" placeholderTextColor={"gray"} value={recepi_memo} style={{ height: "100%", width: "88%", fontSize: 19, color: theme.headingTx }} onChangeText={(value) => { setrecepi_memo(value) }} />
              </View>
                </View>
              <TouchableOpacity disabled={Payment_loading} style={[styles.mode_sele, { height: 60,width:wp(91), backgroundColor: Payment_loading  ? "#011434" : "#5B65E1", marginTop: 20, alignSelf: "center" }]} onPress={() => {Send_Asseet()}}>
              {Payment_loading?<ActivityIndicator color={"green"}/>:<Text style={styles.mode_text}>Send</Text>}
              </TouchableOpacity>
           <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={toggleModal}
      >
        <Camera
          ref={cameraRef}
          style={styles.preview}
          device={device}
          isActive={true}
          audio={false}
          codeScanner={onBarCodeRead}
          captureAudio={false}/>
             <QRScannerComponent setModalVisible={setModalVisible}/>
    </Modal>
            </View>
        <TokenQrCode
          modalVisible={receiveQrOpen}
          setModalVisible={()=>{setreceiveQrOpen(false),setmode_selected("SED")}}
          iconType={asset_name}
          qrvalue={state?.STELLAR_PUBLICK_KEY}
          isDark={state.THEME.THEME}
        />
        </>
    )
}
const styles = StyleSheet.create({
    main_con: {
        height: "100%",
        paddingHorizontal:5
    },
    QR_con: {
        alignSelf: "center",
        marginTop: hp(10),
        backgroundColor: "#fff",
        height: 390,
        width: 300,
        borderRadius: 10
    },
    addressTxt: {
        marginTop: hp(3),
        width: wp(65),
        alignSelf: "center",
        color: "black",
        padding:10,
        fontWeight: "600"
    },
    mode_con: {
        height: 60,
        width: "100%",
        flexDirection: "row",
        alignSelf: "center",
        justifyContent: "space-around",
        marginTop: 10
    },
    text_input: {
        alignSelf: "center",
        color: "#fff",
        width: "95%",
        fontSize: 20,
        borderRadius: 15,
        paddingLeft: 10,
        marginTop: 10,
        paddingVertical:hp(1.5)
    },
    mode_text: {
        color: "#fff",
        textAlign: "center",
        fontSize: 21,
        fontWeight: "bold",
    },
    mode_sele: {
        height: "90%",
        width: "45%",
        borderRadius: 15,
        justifyContent: "center"
    },
    headerContainer1_TOP: {
        backgroundColor: "#4CA6EA",
        justifyContent: "space-between",
        alignItems: "center",
        alignSelf: "center",
        flexDirection: "row",
        width: wp(100),
        paddingHorizontal: wp(0.3),
    },
    logoImg_TOP: {
        height: hp("8"),
        width: wp("12"),
        marginLeft: wp(22),
    },
    text_TOP: {
        color: "white",
        fontSize: 19,
        fontWeight: "bold",
        alignSelf: "center",
        marginStart: wp(34)
    },
    text1_ios_TOP: {
        // alignSelf:"center",
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        paddingTop:hp(3),
        marginStart: wp(29)
    },
    modalContainer_option_top: {
        // flex: 1,
        alignSelf: "flex-end",
        alignItems: 'center',
        // backgroundColor: 'rgba(0, 0, 0, 0.3)',
        width: "100%",
        height: "60%",
    },
    modalContainer_option_sub: {
        alignSelf: "flex-end",
        backgroundColor: 'rgba(33, 43, 83, 1)',
        padding: 10,
        borderRadius: 10,
        width: "65%",
        height: "70%"
    },
    modalContainer_option_view: {
        flexDirection: "row",
        marginTop: 25,
        alignItems: "center",
    },
    modalContainer_option_text: {
        fontSize: 20,
        fontWeight: "bold",
        color: "gray",
        marginStart: 5
    },
    QR_scan_con:{
        width:wp(80),
        height:hp(40),
        borderRadius:5,
        justifyContent:"center",
        alignItems:"center"
      },
      preview: {
         ...StyleSheet.absoluteFillObject,
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
        height: 60,
      },
      backIcon: {
        marginRight:wp(28),
      },
      title: {
        fontSize: 18,
        fontWeight: 'bold',
        color:"#fff"
      },
      card: {
        borderRadius: 16,
        paddingVertical:hp(1.9),
        paddingHorizontal:hp(0.1),
        marginVertical: hp(1.5),
        marginHorizontal:wp(2)
      },
})
export default send_recive;