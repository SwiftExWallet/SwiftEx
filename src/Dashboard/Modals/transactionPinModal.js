import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  Image,
  TouchableOpacity,
  Alert,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
// import title_icon from "../../../assets/title_icon.png";
import darkBlue from "../../../assets/darkBlue.png";
import ReactNativePinView from "react-native-pin-view";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import { Platform } from "react-native";
import {
  setPlatform,
  setWalletType,
} from "../../components/Redux/actions/auth";
import Modal from "react-native-modal";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { decodeUserToken } from "../Auth/jwtHandler";
import { SendLoadingComponent } from "../../utilities/loadingComponent";
import { CommonActions } from "@react-navigation/native";
import { useToast } from "native-base";
import { alert, ShowToast } from "../reusables/Toasts";
import { getAllBalances } from "../../utilities/web3utilities";
import { PPOST, proxyRequest } from "../exchange/crypto-exchange-front-end-main/src/api";
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import ShortTermStorage from "../../utilities/ShortTermStorage";
import { CheckPasscode } from "../../biometrics/utils";

const TransactionPinModal = ({
  pinViewVisible,
  setPinViewVisible,
  provider,
  type,
  rawTransaction,
  walletType,
  SaveTransaction,
  setLoading,
  setDisable,
}) => {
  const state = useSelector((state) => state);
  const [pin, setPin] = useState();
  const [status, setStatus] = useState("pinset");
  const [showRemoveButton, setShowRemoveButton] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [showCompletedButton, setShowCompletedButton] = useState(false);
  const [loader, setLoader] = useState(false);
  const pinView = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dispatch = useDispatch();
  const toast = useToast();
  const Navigate = () => {
    navigation.dispatch((state) => {
      // Remove the home route from the stack
      const routes = state.routes.filter((r) => r.name !== "Confirm Tx");

      return CommonActions.reset({
        ...state,
        routes,
        index: routes.length - 1,
      });
    });
  };
  const navigation = useNavigation();

  const Spin = new Animated.Value(0);
  const SpinValue = Spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  useEffect( () => {
    const check_fist=async()=>{
      try {
        const Check = await AsyncStorage.getItem(`pin`);
        console.log(Check);
        if (Check) {
          setStatus("pinset");
        }
        console.log(Platform.OS);
        if (Platform.OS === "ios") {
          const platform = "ios";
          dispatch(setPlatform(platform)).then((response) => {
            console.log(response);
          });
        }
      } catch (error) {
        console.log("***-",error)
      }
    }
    check_fist()

    const check_second=async()=>{
      try {
        if (enteredPin.length > 0) {
          setShowRemoveButton(true);
        } else {
          setShowRemoveButton(false);
        }
        if (enteredPin.length === 6) {
          setShowCompletedButton(true);
        } else {
          setShowCompletedButton(false);
        }
      } catch (error) {
        console.log("-=-",error)
      }
    }
    check_second()
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();

    Animated.timing(Spin, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, enteredPin]);

  useEffect(()=>{
    const check_pin_len=async()=>{
     try {
      if (enteredPin.length===6) {
        const validPin=await CheckPasscode(enteredPin);
        setPinViewVisible(false);
        // setLoader(true);
        if (validPin) {
          const emailid = await state.user;
          const token = await state.token;
  
          if (type === "Eth") {

            const { res, err } = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, {signedTx:rawTransaction});
            if (err) {
              console.log(err);
              setLoading(false);
             CustomInfoProvider.show("Error", err.message||"Something went wrong");
            }
  
            if (res.txHash) {
              try {
                await ShortTermStorage.saveTx(state && state.wallet && state.wallet.address,{chain: "ETH",typeTx: "Send",status: "Pending",hash: res?.txHash});
                ShowToast(toast, "Transaction Successful");
  
                setLoading(false);
                setLoader(false);
                setDisable(false);
                setPinViewVisible(false);
                getAllBalances(state,dispatch)
                Navigate();
                navigation.navigate("Transactions");
              } catch (e) {
                setLoading(false);
                setDisable(false);
                setLoader(false);
                setPinViewVisible(false);
                console.log(e);
  
                alert("error", e);
              }
            }
          } else if (type === "Matic") {
            let alchemy = provider;
            let txx = await alchemy.core.sendTransaction(
              rawTransaction
            );
            console.log("Sent transaction", txx.hash);
            if (txx.hash) {
              try {
                const type = "Send";
                const chainType = "Matic";
  
                const saveTransaction = await SaveTransaction(
                  type,
                  txx.hash,
                  emailid,
                  token,
                  walletType
                );
  
                console.log(saveTransaction);
                ShowToast(toast, "Transaction Successful");
  
                setLoading(false);
                setLoader(false);
                setDisable(false);
                setPinViewVisible(false);
                getAllBalances(state,dispatch)
                Navigate();
                navigation.navigate("Transactions");
              } catch (e) {
                setDisable(false);
                setLoader(false);
                setPinViewVisible(false);
                setLoading(false);
                console.log(e);
                alert("error", e);
              }
            }
          } else if (type === "BSC") {
            const { res, err } = await proxyRequest("/v1/bsc/transaction/broadcast", PPOST, {signedTx:rawTransaction});
            if(err)
            {
              setDisable(false);
              setPinViewVisible(false);
              setLoader(false);
              setLoading(false);
              console.log(err);
              alert("error",err.message||"Something went wrong...")
            }
      
         if (res.txHash) {
              try {
                ShowToast(toast, "Transaction Successful");
                await ShortTermStorage.saveTx(state && state.wallet && state.wallet.address,{chain: "BSC",typeTx: "Send",status: "Pending",hash: res?.txHash});
                setLoading(false);
                setLoader(false);
                setDisable(false);
                setPinViewVisible(false);
                getAllBalances(state,dispatch)
                Navigate();
                navigation.navigate("Transactions");
              } catch (e) {
                setDisable(false);
                setPinViewVisible(false);
                setLoader(false);
                setLoading(false);
                console.log(e);
                alert("error", e);
              }
            }
          } else {
            try {
              const client = provider;
              const signed = rawTransaction;
              const tx = await client.submitAndWait(signed.tx_blob);
              const type = "Send";
              const chainType = "Xrp";
  
              const saveTransaction = await SaveTransaction(
                type,
                signed.hash,
                emailid,
                token,
                walletType,
                chainType
              );
  
              console.log(saveTransaction);
              ShowToast(toast, "Transaction Successful");
  
              setLoading(false);
              setDisable(false);
              console.log(tx);
              setLoader(false);
              setPinViewVisible(false);
              getAllBalances(state,dispatch)
              Navigate();
              navigation.navigate("Transactions");
            } catch (e) {
              setLoader(false);
              setLoading(false);
              setDisable(false);
              setPinViewVisible(false);
              console.log(e);
              alert("error", "please try again");
            }
          }
        } else {
          setPinViewVisible(false);
          setLoading(false);
          setLoader(false);
          setDisable(false);
          pinView.current.clearAll();
          alert("error", "Incorrect pin try again.");
        }
      }
     } catch (error) {
      console.log("-=80",error)
     }
    }
    check_pin_len()
  },[enteredPin])
  return (
    <Modal
      animationIn="fadeInUpBig"
      animationOut="fadeOutDownBig"
      animationInTiming={500}
      animationOutTiming={650}
      isVisible={pinViewVisible}
      useNativeDriver={true}
      statusBarTranslucent={true}
      onBackdropPress={() => {
        setPinViewVisible(false);
        setLoading(false);
        setDisable(false);
      }}
      onBackButtonPress={() => {
        setPinViewVisible(false);
        setLoading(false);
        setDisable(false);
      }}
    >
      <Animated.View // Special animatable View
        style={{ opacity: fadeAnim }}
      >
        <View style={style.Body}>
          <Animated.Image
            style={{
              width: wp("12"),
              height: hp("12"),
              padding: 30,
              marginTop: hp(16),
              transform: [{ rotate: SpinValue }],
            }}
            source={darkBlue}
          />
          <Text style={style.welcomeText}> Hi,</Text>
          <Text style={style.welcomeText1}>
            {" "}
            {status == "verify"
              ? "Please Re-enter your pin"
              : status === "pinset"
              ? "Please enter your pin"
              : "Please create a pin"}
          </Text>
          <View style={{ marginTop: hp(5) }}>
            {loader ? <SendLoadingComponent /> : <View></View>}
            <ReactNativePinView
             inputSize={23}
             ref={pinView}
             pinLength={6}
             buttonSize={60}
             // customLeftButtonViewStyle={{backgroundColor:'gray'}}
             onValueChange={(value) => setEnteredPin(value)}
             buttonAreaStyle={{
               marginTop: 24,
             }}
             inputAreaStyle={{
               marginBottom: 24,
             }}
             inputViewEmptyStyle={{
               backgroundColor: "transparent",
               borderWidth: 1,
               borderColor: "#fff",
             }}
             inputViewFilledStyle={{
               backgroundColor: "#fff",
             }}
             // buttonViewStyle={{
             //   borderWidth: 1,
             //   borderColor: "#FFF",
             // }}
             buttonTextStyle={{
               color: "#fff",
             }}
              onButtonPress={async (key) => {
                if (key === "custom_left") {
                  pinView.current.clear();
                }
                // if (key === "custom_right") {
                //   const Pin = await AsyncStorage.getItem("pin");
                //   setPinViewVisible(false);
                //   setLoader(true);
                //   if (JSON.parse(Pin) === enteredPin) {
                //     const emailid = await state.user;
                //     const token = await state.token;

                //     if (type === "Eth") {
                //       let txx = await provider.core
                //         .sendTransaction(rawTransaction)
                //         .catch((e) => {
                //           console.log(e);
                //           setLoading(false);
                //           alert("error","insufficient funds...");
                //         });
                //       const tx = txx.wait();
                //       console.log("Sent transaction", await tx);

                //       if (txx.hash) {
                //         try {
                //           const type = "Send";
                //           const chainType = "Eth";
                //           const saveTransaction = await SaveTransaction(
                //             type,
                //             txx.hash,
                //             emailid,
                //             token,
                //             walletType,
                //             chainType
                //           );

                //           console.log(saveTransaction);
                //           ShowToast(toast, "Transaction Successful");

                //           setLoading(false);
                //           setLoader(false);
                //           setDisable(false);
                //           setPinViewVisible(false);
                //           getAllBalances(state,dispatch)
                //           Navigate();
                //           navigation.navigate("Transactions");
                //         } catch (e) {
                //           setLoading(false);
                //           setDisable(false);
                //           setLoader(false);
                //           setPinViewVisible(false);
                //           console.log(e);

                //           alert("error", e);
                //         }
                //       }
                //     } else if (type === "Matic") {
                //       let alchemy = provider;
                //       let txx = await alchemy.core.sendTransaction(
                //         rawTransaction
                //       );
                //       console.log("Sent transaction", txx.hash);
                //       if (txx.hash) {
                //         try {
                //           const type = "Send";
                //           const chainType = "Matic";

                //           const saveTransaction = await SaveTransaction(
                //             type,
                //             txx.hash,
                //             emailid,
                //             token,
                //             walletType
                //           );

                //           console.log(saveTransaction);
                //           ShowToast(toast, "Transaction Successful");

                //           setLoading(false);
                //           setLoader(false);
                //           setDisable(false);
                //           setPinViewVisible(false);
                //           getAllBalances(state,dispatch)
                //           Navigate();
                //           navigation.navigate("Transactions");
                //         } catch (e) {
                //           setDisable(false);
                //           setLoader(false);
                //           setPinViewVisible(false);
                //           setLoading(false);
                //           console.log(e);
                //           alert("error", e);
                //         }
                //       }
                //     } else if (type === "BSC") {
                //       const txx = await provider
                //         .sendTransaction(rawTransaction)
                //         .catch((e) => {
                //           return alert(e);
                //         }); //SendTransaction(signer, token)
                //       if (txx.hash) {
                //         try {
                //           const type = "Send";
                //           const chainType = "BSC";

                //           const saveTransaction = await SaveTransaction(
                //             type,
                //             txx.hash,
                //             emailid,
                //             token,
                //             walletType,
                //             chainType
                //           );

                //           console.log(saveTransaction);
                //           ShowToast(toast, "Transaction Successful");

                //           setLoading(false);
                //           setLoader(false);
                //           setDisable(false);
                //           setPinViewVisible(false);
                //           getAllBalances(state,dispatch)
                //           Navigate();
                //           navigation.navigate("Transactions");
                //         } catch (e) {
                //           setDisable(false);
                //           setPinViewVisible(false);
                //           setLoader(false);
                //           setLoading(false);
                //           console.log(e);
                //           alert("error", e);
                //         }
                //       }
                //     } else {
                //       try {
                //         const client = provider;
                //         const signed = rawTransaction;
                //         const tx = await client.submitAndWait(signed.tx_blob);
                //         const type = "Send";
                //         const chainType = "Xrp";

                //         const saveTransaction = await SaveTransaction(
                //           type,
                //           signed.hash,
                //           emailid,
                //           token,
                //           walletType,
                //           chainType
                //         );

                //         console.log(saveTransaction);
                //         ShowToast(toast, "Transaction Successful");

                //         setLoading(false);
                //         setDisable(false);
                //         console.log(tx);
                //         setLoader(false);
                //         setPinViewVisible(false);
                //         getAllBalances(state,dispatch)
                //         Navigate();
                //         navigation.navigate("Transactions");
                //       } catch (e) {
                //         setLoader(false);
                //         setLoading(false);
                //         setDisable(false);
                //         setPinViewVisible(false);
                //         console.log(e);
                //         alert("error", "please try again");
                //       }
                //     }
                //   } else {
                //     setPinViewVisible(false);
                //     setLoading(false);
                //     setLoader(false);
                //     setDisable(false);
                //     pinView.current.clearAll();
                //     alert("error", "Incorrect pin try again.");
                //   }
                // }
              }}
              customLeftButton={
                showRemoveButton ? (
                  <Icon name={"backspace"} size={36} color={"gray"} />
                ) : undefined
              }
              customRightButton={
                showCompletedButton ? (
                  <Icon name={"chevron-forward-circle"} size={36} color={"#FFF"} />
                ) : undefined
              }
              buttonTextByKey={{
                one: '1',
                two: '2',
                three: '3',
                four: '4',
                five: '5',
                six: '6',
                seven: '7',
                eight: '8',
                nine: '9',
                zero: '0',
              }}
            />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

export default TransactionPinModal;

const style = StyleSheet.create({
  Body: {
    backgroundColor: "#131E3A",
    height: hp(110),
    width: wp(100),
    alignItems: "center",
    borderRadius: hp(2),
    textAlign: "center",
    alignSelf: "center",
  },
  welcomeText: {
    fontSize: 19,
    fontWeight: "200",
    color: "white",
    marginTop: hp(2),
  },
  welcomeText1: {
    fontSize: 19,
    fontWeight: "200",
    color: "white",
    marginTop: hp(1),
  },
  welcomeText2: {
    fontSize: 20,
    fontWeight: "200",
    color: "white",
    marginTop: hp(10),
  },
  Button: {
    marginTop: hp(20),
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
});
