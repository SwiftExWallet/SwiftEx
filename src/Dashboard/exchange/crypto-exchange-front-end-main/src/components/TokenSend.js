import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  TextInput,
  ScrollView,
  ActivityIndicator,
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
import { useSelector } from "react-redux";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { isInteger } from "lodash";
import { isFloat } from "validator";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";
import { useToast } from "native-base";
import { Wallet_screen_header } from "../../../../reusables/ExchangeHeader";
import ErrorComponet from "../../../../../utilities/ErrorComponet";
import { Paste } from "../../../../../utilities/utilities";
import Icon from "../../../../../icon";
import { alert, ShowErrotoast, Showsuccesstoast } from "../../../../reusables/Toasts";
import { isAddress } from "ethers/lib/utils";
import { ethers } from "ethers";
import { PGET, PPOST, proxyRequest } from "../api";
import { getTokenBalancesUsingAddress } from "../utils/getWalletInfo/EtherWalletService";
import CustomInfoProvider from "./CustomInfoProvider";
import QRScannerComponent from "../../../../Modals/QRScannerComponent";
import TokenTxDetails from "./TokenTxDetails";
import LinearGradient from "react-native-linear-gradient";
import ShortTermStorage from "../../../../../utilities/ShortTermStorage";
import AccessNativeStorage from "../../../../Wallets/AccessNativeStorage";
const TokenSend = ({ route }) => {
  const toast = useToast();
  const FOCUSED = useIsFocused()
  const [show, setshow] = useState(false);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState();
  const [Loading, setLoading] = useState(false);
  const [balance, setBalance] = useState();
  const [disable, setdisable] = useState(false);
  const [Message, setMessage] = useState("");
  const [Payment_loading, setPayment_loading] = useState(false);
  const cameraRef = useRef(null);
  const device = useCameraDevice('back');
  const state = useSelector((state) => state);
  const navigation = useNavigation();
  const [isModalVisible, setModalVisible] = useState(false);
  const [lastScannedData, setLastScannedData] = useState(null);
  const [ErroVisible, setErroVisible] = useState(false);
  const [showTxInfo,setShowTxInfo]=useState(false);

  useEffect(() => {
    const requestPermission = async () => {
      const status = await Camera.requestCameraPermission();
      handleCameraStatus(status);
    };
    requestPermission();
  }, []);


  const sendBNBToken = async (tokenAddress,tokenDecimals) => {
    try {
      const BNBERC20ABI = [
        "function transfer(address to, uint256 value) public returns (bool)"
      ];
      // Load wallet with private key
      const wallet = state?.wallet?.address;
      // Load ERC-20 contract
      const tokenInterface = new ethers.utils.Interface(BNBERC20ABI);
      const formattedAmount = ethers.utils.parseUnits(amount, tokenDecimals);
      const data = tokenInterface.encodeFunctionData("transfer", [address, formattedAmount]);
      const unsignedTx = {
        to: tokenAddress,
        data: data,
        from: wallet
      };
      const { res, err } = await proxyRequest(
        "/v1/bsc/transaction/prepare",
        PPOST,
        {
          unsignedTx: unsignedTx,
          walletAddress: wallet
        }
      );
      if (err) {
        CustomInfoProvider.show("error", err.message || "Transaction failed try again.");
        return;
      }
      if (!res) {
        CustomInfoProvider.show("error", "Transaction failed try again.");
        return;
      }
      const upgradedTx = {
        to: res.unsignedTx?.to || tokenAddress,
        data: res.unsignedTx?.data || data,
        gasLimit: ethers.BigNumber.from(res.gasLimit),
        gasPrice: ethers.BigNumber.from(res.gasPrice),
        nonce: res.nonce,
        chainId: parseInt(res.chainId) || 56,
        value: res.value ? ethers.BigNumber.from(res.value) : ethers.BigNumber.from(0),
      };

      const { TransactionSigner } = NativeModules;
      const tx = {
        chainId: parseInt(res.chainId) || 56,
        nonce: ethers.utils.hexlify(res.nonce),
        gasPrice: ethers.utils.hexlify(
          ethers.BigNumber.from(res.gasPrice)
        ),
        gasLimit: ethers.utils.hexlify(
          ethers.BigNumber.from(res.gasLimit)
        ),
        to: res.unsignedTx?.to || tokenAddress,
        value: ethers.utils.hexlify(
          res.value ? ethers.BigNumber.from(res.value) : 0
        ),
        data: (res.unsignedTx?.data || data).startsWith("0x")
          ? (res.unsignedTx?.data || data)
          : "0x" + (res.unsignedTx?.data || data),
      };
      const signedTx = await TransactionSigner.signTransaction(
        "bsc",
        address,
        JSON.stringify(tx),
        tx.chainId
      );
      let rawTx = signedTx.signedTx;
      
      if (rawTx.startsWith("0x0x")) {
        rawTx = rawTx.replace(/^0x/, "");
      }

      const respoExe = await proxyRequest(
        "/v1/bsc/transaction/broadcast",
        PPOST,
        { signedTx: rawTx }
      );
      console.log("Broadcast response:", respoExe);
      if (respoExe?.err) {
        CustomInfoProvider.show("error", respoExe.err.message || "Transaction failed try again.");
        return;
      }
      if (respoExe?.res?.txHash) {
        CustomInfoProvider.show("success", "Transaction successful!");
        await ShortTermStorage.saveTx(state && state.wallet && state.wallet.address,{chain: "BSC",typeTx: "Token Send",status: "Pending",hash: respoExe?.res?.txHash});
        navigation.navigate("Transactions");
      } else {
             CustomInfoProvider.show("error", "Transaction failed try again.");
      }
    } catch (error) {
      console.error("Transaction Error:", error);
      CustomInfoProvider.show("error", "Transaction failed try again.");
    } finally {
      setAddress();
      setAmount();
      setdisable(false);
      setPayment_loading(false);
    }
  };
  // send Ether tokens
  const sendEthTokens = async (tokenAddress,tokenDecimals) => {
    try {
      const usdtAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function transfer(address to, uint256 amount) returns (bool)"
      ];
        // Load wallet with private key
        const wallet = state?.wallet?.address;
        // Load ERC-20 contract
        const tokenInterface = new ethers.utils.Interface(usdtAbi);
        const formattedAmount = ethers.utils.parseUnits(amount, tokenDecimals);
        const data = tokenInterface.encodeFunctionData("transfer", [address, formattedAmount]);
      const preInfo = await proxyRequest(`/v1/eth/wallet-address/${wallet}/info`, PGET);
      if (preInfo.err) {
        alert("error", preInfo.err.message||"Something went wrong...")
      }
      const { TransactionSigner } = NativeModules;
      const gasPriceBN = ethers.BigNumber.from(preInfo.res.gasFeeData.gasPrice);
      const tx = {
        nonce: ethers.utils.hexlify(preInfo.res.transactionCount),
        gasPrice: ethers.utils.hexlify(gasPriceBN),
        gasLimit: ethers.utils.hexlify(100000),
        to: tokenAddress,
        value: "0x0",
        data: data,
      };
      
      const signedTx = await TransactionSigner.signTransaction(
        "eth",
        wallet,
        JSON.stringify(tx),
        1
      );
      let rawTx = signedTx.signedTx;
      if (rawTx.startsWith("0x0x")) {
        rawTx = rawTx.replace(/^0x/, "");
      }
      const respoExe = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, { signedTx: rawTx });
      if (respoExe?.res?.txHash) {
        alert("success", `Transaction successful!`);
        await ShortTermStorage.saveTx(state && state.wallet && state.wallet.address,{chain: "ETH",typeTx: "Token Send",status: "Pending",hash: respoExe?.res?.txHash});
        navigation.navigate("Transactions");
      }else{
        CustomInfoProvider.show("Error", respoExe.err.message||"Transaction failed. Check logs.");
      }
    } catch (error) {
      console.error("Transaction Error:", error);
     CustomInfoProvider.show("Error", "Transaction failed. Check logs.");
    } finally {
      setAddress();
      setAmount();
      setdisable(false);
      setPayment_loading(false);
    }
  };


  const toggleModal = () => {
    checkPermission();
  };

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
        if (!validateTokenAddress(code.value)) {
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
  };
  useEffect(() => {
    const insilize = async () => {
      try {
        setShowTxInfo(false);
        setErroVisible(false)
        setAddress()
        setAmount()
        setdisable(false)
        setLoading(true)
        setMessage();
        setPayment_loading(false);
        if (route?.params?.tokenType === "Ethereum") {
          const newToken = await fetchTokenInfo(route?.params?.tokenAddress);
          setBalance(newToken?.balance);
          setLoading(false);
        }
        else {
          const newToken = await fetchBNBTokenInfo(route?.params?.tokenAddress);
          setBalance(newToken?.balance);
          setLoading(false);
        }
      } catch (error) {
        console.log("-TokenEffect---", error)
        setBalance(0.00);
        setLoading(false);
      }
    }
    insilize()
  }, [FOCUSED])
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
        console.log("Token Send Error=", error)
      }
    }
    new_data()
  }, [amount]);

  // Fetch token details
  const fetchTokenInfo = async (address) => {
    try {
      if (address && state?.wallet?.address) {
        const fetchedTokens = await getTokenBalancesUsingAddress(address, state?.wallet?.address, "ETH")
        console.log("walleetREspo--", fetchedTokens)
        if (fetchedTokens.status) {
          return fetchedTokens.tokenInfo[0]
        }
      }
    } catch (error) {
      console.error(`Error fetching token info for ${address}:`, error);
      throw new Error('Invalid token address or failed to fetch data');
    }
  };

  // Fetch BNB token details
  const fetchBNBTokenInfo = async (address) => {
    try {
      if (address && state?.wallet?.address) {
        const fetchedTokens = await getTokenBalancesUsingAddress(address, state?.wallet?.address, "BSC")
        console.log("walleetREspo--", fetchedTokens)
        if (fetchedTokens.status) {
          return fetchedTokens.tokenInfo[0]
        }
      }
    } catch (error) {
      console.error(`Error fetching token info for ${address}:`, error);
      throw new Error('Invalid token address or failed to fetch data');
    }
  };

  const handleUsernameChange = (text) => {
    // Remove whitespace from the username
    const formattedUsername = text.replace(/\s/g, '');
    setAddress(formattedUsername);
  };
  function validateTokenAddress(address) {
    try {
      if (!address || address.length !== 42) {
        setAddress('');
        alert("error", 'Please enter a valid token contract address.');
        return false;
      }
      if (!isAddress(address)) {
        setAddress('');
        alert("error", "Invalid Token address.");
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  const checkPermission = async () => {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (result === true) {
        setModalVisible(!isModalVisible);
      } else {
        const requestResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (requestResult === PermissionsAndroid.RESULTS.GRANTED) {
          setModalVisible(!isModalVisible);
        } else {
          ShowErrotoast(toast, "Permissions not allowed");
        }
      }
    } else {
      // iOS permission is handled through Info.plist
      setModalVisible(!isModalVisible);
    }
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
      
      <View style={[styles.container, { backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C" }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* Recipient Address Card */}
          <View style={[styles.card, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}>
          <View style={{
          flexDirection:"row",
          justifyContent:"space-between",
          alignItems:"center",
          marginBottom:4
         }}>
         <Text style={[styles.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
            Recipient Address
          </Text>
          <TouchableOpacity onPress={() => {
              Paste(setAddress)
            }} style={[styles.pasteButton]}>
            <Icon name="content-copy" type={"materialCommunity"} size={20} color={'#5B65E1'} />
              <Text style={styles.pasteText}>PASTE</Text>
            </TouchableOpacity>
         </View>
            <View style={[styles.inputContainer, { 
              backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C",
            }]}>
              <TextInput
                value={address}
                onChangeText={(input) => {
                  console.log(input);
                  handleUsernameChange(input);
                }}
                placeholder="Enter recipient address"
                placeholderTextColor={state.THEME.THEME === false ? "#ADB5BD" : "#6C757D"}
                style={[styles.input, { color: state.THEME.THEME === false ? "#212529" : "#FFFFFF" }]}
              />
              <View style={styles.inputActions}>
              <TouchableOpacity onPress={() => {
              toggleModal()
            }} style={[styles.iconButton,{ backgroundColor:state.THEME.THEME?"#242426":"#F4F4F8",}]}>
              <Icon name="qr-code-scanner" type={"material"} size={20} color={state.THEME.THEME?"#fff":"#272729"} />
            </TouchableOpacity>
              </View>
            </View>
              <View style={{borderBottomColor:"gray", borderWidth:0.5,marginVertical:15}}/>
            <View style={styles.balanceHeader}>
              <Text style={[styles.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
                Available Balance
              </Text>
              {Loading && <ActivityIndicator color="#4A90E2" size="small" />}
            </View>
            <View style={styles.balanceDisplay}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.balanceAmount, { color: state.THEME.THEME === false ? "#212529" : "#FFFFFF" }]}>
                  {balance ? balance : show === false ? "0.00" : ""}
                </Text>
              </ScrollView>
              <Text style={[styles.currency, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
                {route?.params?.tokenSymbol || 'TOKEN'}
              </Text>
            </View>
          </View>

          {/* Amount Card */}
          <View style={[styles.card, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}>
            <Text style={[styles.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
              Amount
            </Text>
            <View style={[styles.inputContainer, { 
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
                placeholder="0.00"
                placeholderTextColor={state.THEME.THEME === false ? "#ADB5BD" : "#6C757D"}
                style={[styles.input, { color: state.THEME.THEME === false ? "#212529" : "#FFFFFF" }]}
              />
              <TouchableOpacity
                onPress={() => {
                  if (!balance || parseFloat(balance) === 0) {
                    ShowErrotoast(toast, "Invalid Amount");
                  } else {
                    setAmount(balance);
                  }
                }}
                style={[styles.maxButton]}
              >
                <Text style={styles.maxButtonText}>MAX</Text>
              </TouchableOpacity>
            </View>
            {Message ? (
              <Text style={styles.errorMessage}>{Message}</Text>
            ) : null}
          </View>

        </ScrollView>

        {/* Send Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            disabled={disable}
            style={[styles.sendButton, { opacity: disable ? 0.5 : 1 }]}
            onPress={() => {
              Keyboard.dismiss();
              setPayment_loading(true);
              if (!amount || parseFloat(amount) === 0) {
                ShowErrotoast(toast, "Invalid Amount");
                setPayment_loading(false);
                setAmount('');
              } else {
                if (!address || !amount) {
                  ShowErrotoast(toast, "Recipient Address and Amount Required");
                  setPayment_loading(false);
                } else {
                  setdisable(true);
                  if (validateTokenAddress(address)) {
                    setShowTxInfo(true);
                  } else {
                    console.log('Invalid token address');
                    ShowErrotoast(toast, "Invalid recipient address");
                    setAddress();
                    setdisable(false);
                    setPayment_loading(false);
                  }
                }
              }
            }}
          >
            <LinearGradient
              colors={disable ? ['#6C757D', '#6C757D'] : ['#4052D6', '#4052D6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientButton}
            >
              {Payment_loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.sendButtonText}>Send Transaction</Text>
                  <Icon name="arrow-forward" type="ionicon" size={20} color="#FFFFFF" />
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* QR Scanner Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={toggleModal}
      >
        <View style={styles.modalContainer}>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            isActive={true}
            audio={false}
            codeScanner={onBarCodeRead}
            captureAudio={false}
          >
            <QRScannerComponent setModalVisible={setModalVisible} />
          </Camera>
        </View>
      </Modal>

      {/* Transaction Details Modal */}
      <TokenTxDetails
        visible={showTxInfo}
        onClose={() => { 
          setShowTxInfo(false);
          setPayment_loading(false);
        }}
        params={{
          walletAddress: state?.wallet?.address,
          tokenAddress: route?.params?.tokenAddress,
          recipientAddress: address,
          amount: amount,
          network: route?.params?.tokenType === "Binance" ? "bsc" : "ethereum"
        }}
        theme={state.THEME.THEME === false ? "light" : "dark"}
        onNextStep={() => {
          setShowTxInfo(false);
          if (route?.params?.tokenType === "Binance") {
            sendBNBToken(route?.params?.tokenAddress, route?.params?.tokenDecimals);
          }
          if (route?.params?.tokenType === "Ethereum") {
            sendEthTokens(route?.params?.tokenAddress, route?.params?.tokenDecimals);
          }
        }}
      />
    </>
  );
};

export default TokenSend;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: hp(100),
  },
  scrollContent: {
    paddingHorizontal: wp(4),
    paddingTop: hp(2),
    paddingBottom: hp(12),
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
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: wp(2),
    paddingVertical: hp(1),
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
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
  pasteButton: {
    paddingHorizontal: wp(1),
    paddingVertical: hp(1),
    borderRadius: 8,
    flexDirection:"row"
  },
  pasteText: {
    color: "#5B65E1",
    marginHorizontal: wp(2),
    fontSize:16,
    fontWeight:"500"
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
  maxButton: {
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.4),
    borderRadius: 8,
    marginLeft: wp(2),
    backgroundColor:"#4052D6"
  },
  maxButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorMessage: {
    color: '#DC3545',
    fontSize: 12,
    marginTop: hp(1),
    fontWeight: '500',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: wp(4),
    paddingVertical: hp(2.5),
    backgroundColor: 'transparent',
  },
  sendButton: {
    borderRadius: 16,
    overflow: 'hidden',
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: hp(6),
    paddingHorizontal: wp(4),
    paddingBottom: hp(2),
  },
  closeButton: {
    padding: wp(2),
  },
  cameraTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: wp(4),
  },
  scannerFrame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerCorner: {
    width: wp(70),
    height: wp(70),
    borderWidth: 3,
    borderColor: '#4A90E2',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: hp(4),
    paddingHorizontal: wp(8),
  },
});