import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useSelector } from "react-redux";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { SaveTransaction } from "../utilities/utilities";
import { useNavigation } from "@react-navigation/native";
import "react-native-get-random-values";
import "@ethersproject/shims";
import TransactionPinModal from "./Modals/transactionPinModal";
import { useBiometricsForSendTransaction } from "../biometrics/biometric";
import { useToast } from "native-base";
import { alert, ShowToast } from "./reusables/Toasts";
import { CommonActions } from "@react-navigation/native";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { PPOST, proxyRequest } from "./exchange/crypto-exchange-front-end-main/src/api";
import ShortTermStorage from "../utilities/ShortTermStorage";
import { colors } from "../Screens/ThemeColorsConfig";
import { ethers } from "ethers";

const ConfirmTransaction = (props) => {
  const state = useSelector((state) => state);
  const [Cost, setCost] = useState();
  const [disable, setDisable] = useState(false);
  const [Loading, setLoading] = useState(false);
  const [walletType, setWalletType] = useState("");
  const [pinViewVisible, setPinViewVisible] = useState(false);
  const navigation = useNavigation();
  const toast = useToast();

  const Navigate = () => {
    navigation.dispatch((state) => {
      const routes = state.routes.filter((r) => r.name !== "Confirm Tx");
      return CommonActions.reset({
        ...state,
        routes,
        index: routes.length - 1,
      });
    });
  };
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  async function sendTx() {
    let type = props.route.params.info.type;
    let rawTransaction = props.route.params.info.rawTransaction;
    setLoading(true);
    setDisable(true);
    if (type === "Eth") {
       const { res, err } = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, {signedTx:rawTransaction});
         if(err)
         {
          alert("error",err.message||"Something went wrong...")
          console.log(err);
          setLoading(false);
          setDisable(false);
         }

      if (res.txHash) {
        try {
          await ShortTermStorage.syncTx({
            txHash: res?.txHash,
            walletAddress: state && state.wallet && state.wallet.address,
            provider: "EVMTX",
            fromChain: "ETH",
            fromToken: "ETH",
            toChain: "ETH",
            toToken: "ETH",
            amountIn: props?.route?.params?.info?.amount,
            amountOut: props?.route?.params?.info?.amount,
            txType: "Native Transfer"
          });
          setLoading(false);
          setDisable(false);
          Navigate();
          navigation.navigate("Transactions");
        } catch (e) {
          setLoading(false);
          setDisable(false);
          console.log(e);

          alert("error", e);
        }
      }
    } else if (type === "BSC") {
      const { res, err } = await proxyRequest("/v1/bsc/transaction/broadcast", PPOST, { signedTx: rawTransaction });
      if (err) {
        setDisable(false);
        setLoading(false);
        console.log(err);
        alert("error", err.message || "Something went wrong...")
      }

      if (res.txHash) {
        try {
          await ShortTermStorage.syncTx({
            txHash: res?.txHash,
            walletAddress: state && state.wallet && state.wallet.address,
            provider: "EVMTX",
            fromChain: "BSC",
            fromToken: "BSC",
            toChain: "BSC",
            toToken: "BSC",
            amountIn: props?.route?.params?.info?.amount,
            amountOut: props?.route?.params?.info?.amount,
            txType: "Native Transfer"
          });
          setLoading(false);
          setDisable(false);
          Navigate();
          navigation.navigate("Transactions");
        } catch (e) {
          setDisable(false);
          setLoading(false);
          console.log(e);
          alert("error", e);
        }
      }
    }
  }

  return (
    <>
    <Wallet_screen_header title="Confirm Transaction" onLeftIconPress={() => navigation.goBack()} />

      <View style={[style.mainContainer, { backgroundColor:theme.bg }]}>
        <View style={{ borderColor:theme.inactiveTx, borderWidth: 1, marginHorizontal: 10, borderRadius: 10,marginTop:40,backgroundColor:theme.cardBg }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor:theme.inactiveTx, width: wp(90), alignSelf: "center", paddingBottom: hp(1) }}>
            <Text style={[style.fromTxt, { color: theme.headingTx}]}>From</Text>
            <Text style={style.fromAdd} numberOfLines={1}>
              {props?.route?.params?.info?.addressFrom}
            </Text>
          </View>

          <View style={{ borderBottomWidth: 1, borderBottomColor:theme.inactiveTx, width: wp(90), alignSelf: "center" }}>
            <Text style={[style.fromTxt, { color: theme.headingTx }]}>To</Text>
            <Text style={style.toAdd} numberOfLines={1}>
              {props?.route?.params?.info?.addressTo}
            </Text>
          </View>

         <View style={{backgroundColor:theme.bg,width:wp(90),alignSelf:"center",padding:5,margin:13,borderRadius:10}}>
          <View style={style.networkTxt}>
            <Text style={{ color: theme.headingTx }}>Amount</Text>

            <Text style={[style.dollarTxt,{color:theme.inactiveTx}]}>
              {props?.route?.params?.info?.amount}
            </Text>
          </View>
         <View style={style.networkTxt}>
            <Text style={{ color: theme.headingTx }}>Network fee</Text>
            <Text style={[style.dollarTxt,{color:theme.inactiveTx}]}>
              <Text style={[style.dollarTxt,{color:theme.inactiveTx}]}>
              {ethers.utils.formatEther(ethers.BigNumber.from(props?.route?.params?.info?.fee?.toHexString()))}
            </Text>
            </Text>
          </View>

          <View style={style.networkTxt}>
            <Text style={{ color: theme.headingTx }}>Max Total</Text>
            <Text style={[style.dollarTxt,{color:theme.inactiveTx}]}>
              {props?.route?.params?.info?.finalAmount}
            </Text>
          </View>

         </View>

        </View>


      <TouchableOpacity
        style={style.doneBtn}
        disabled={disable ? true : false}
        onPress={async () => {
          const biometric = await AsyncStorageLib.getItem("Biometric");
          if (biometric === "SET") {
            try {
              useBiometricsForSendTransaction(sendTx);
              return;
            } catch (e) {
              console.log(e);
              setDisable(false);
            }
          }
          setPinViewVisible(true);
          setLoading(true);
        }}
      >
        <Text style={{ color: "white",fontSize:16 }}>{Loading?<ActivityIndicator size={'small'} color={'white'}/>: 'Send'}</Text>
      </TouchableOpacity>

      <TransactionPinModal
        setPinViewVisible={setPinViewVisible}
        pinViewVisible={pinViewVisible}
        type={props?.route?.params?.info?.type}
        rawTransaction={props?.route?.params?.info?.rawTransaction}
        walletType={walletType}
        SaveTransaction={SaveTransaction}
        setLoading={setLoading}
        setDisable={setDisable}
      />
    </View>
    </>
  );
};

export default ConfirmTransaction;

const style = StyleSheet.create({
  Body: {
    backgroundColor: "white",
    height: hp(100),
    width: wp(100),
    textAlign: "center",
  },
  mainContainer: { backgroundColor: "white", height: hp(100) },
  input: {
    height: hp("5%"),
    marginBottom: hp("2"),
    color: "#fff",
    marginTop: hp("2"),
    width: wp("70"),
    paddingRight: wp("7"),
    backgroundColor: "white",
    borderColor: "white",
  },
  BttView: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginTop: hp(2),
    borderBottomWidth: 0.3,
    paddingVertical: hp(1),
    width: wp(90),
  },
  downloadBtn: {
    // backgroundColor: "red",
    borderRadius: hp(3),
    width: wp(10),
    borderWidth: 0.3,
    height: hp(5),
    alignItems: "center",
    justifyContent: "center",
  },
  fromTxt: {
    color: "black",
    fontWeight: "500",
    marginHorizontal: wp(1),
    marginTop: hp(2),
    fontSize: 15,
  },
  fromAdd: {
    marginHorizontal: wp(1),
    color: "gray",
    marginTop: hp(1),
  },
  toAdd: {
    marginHorizontal: wp(1),
    color: "gray",
    borderBottomWidth: 0.3,
    paddingVertical: 9,
  },
  networkTxt: {
    flexDirection: "row",
    justifyContent: "space-between",
    width:wp(85),
    alignItems: "center",
    alignSelf: "center",
    marginTop: hp(1),
    paddingHorizontal:wp(1)
  },
  dollarTxt: { fontSize: 12 },
  doneBtn: {
    backgroundColor: "#4052D6",
    alignItems: "center",
    alignSelf: "center",
    width: wp(95),
    marginTop: hp(5),
    paddingVertical: hp(1.8),
    borderRadius: hp(2),
  },
});