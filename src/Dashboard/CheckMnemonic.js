import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { TextInput, Checkbox } from "react-native-paper";
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
  setWalletType,
} from "../components/Redux/actions/auth";
import DialogInput from "react-native-dialog-input";
import { EthRouterV2, urls } from "./constants";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { ethers } from "ethers";
import { genrateAuthToken, genUsrToken } from "./Auth/jwtHandler";
import { alert } from "./reusables/Toasts";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
import Snackbar from "react-native-snackbar";
import * as StellarSdk from '@stellar/stellar-sdk';
const storeData = async (publicKey,secretKey,Ether_address) => {
  try {
    let userTransactions = [];
    const transactions = await AsyncStorageLib.getItem('myDataKey');
    if (transactions) {
      userTransactions = JSON.parse(transactions);
      if (!Array.isArray(userTransactions)) {
        userTransactions = [];
      }
    }
    const newTransaction = {
      Ether_address,
      publicKey,
      secretKey
    };
    userTransactions.push(newTransaction);
    await AsyncStorageLib.setItem('myDataKey', JSON.stringify(userTransactions));
    // return userTransactions;
  } catch (error) {
    console.error('Error saving payout:', error);
    throw error;
  }
};

const getData = async () => {
  try {
    const storedData = await AsyncStorageLib.getItem('myDataKey');

    if (storedData !== null) {
      const parsedData = JSON.parse(storedData);

      const publicKey = parsedData.key1;
      const secretKey = parsedData.key2;

    } else {
    }
  } catch (error) {
    console.error('Error retrieving data:', error);
  }
};

const CheckMnemonic = (props) => {
  const navi=useNavigation();
  const wallet_Men = props.route.params.wallet.mnemonic.split(' ');

  const genrate_keypair = (ether_add,publicKey,secretKey) => {
    storeData(publicKey, secretKey,ether_add);
  }
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [visible, setVisible] = useState(false);
  const [Wallet, setWallet] = useState();
  const [Mnemonic, SetMnemonic] = useState([]);
  const [data, setData] = useState();
  const dispatch = useDispatch();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const Spin = new Animated.Value(0);
  const SpinValue = Spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

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
    const wallet = props?.route?.params?.wallet;
  }, [fadeAnim, Spin]);
  

  function func(a, b) {
    return 0.5 - Math.random();
  }

 const [showVerification, setShowVerification] = useState(false);
 const [answers, setAnswers] = useState(Array(4).fill(null));
 const [shuffledQuestions, setShuffledQuestions] = useState([]);
 const questions = [
   { question: "Word #1", options: [wallet_Men[0], wallet_Men[1],wallet_Men[2]], correct: wallet_Men[0] },
   { question: "Word #4", options: [wallet_Men[3], wallet_Men[4],wallet_Men[5]], correct: wallet_Men[3] },
   { question: "Word #7", options: [wallet_Men[6], wallet_Men[7],wallet_Men[8]], correct: wallet_Men[6] },
   { question: "Word #10", options: [wallet_Men[9], wallet_Men[10],wallet_Men[11]], correct: wallet_Men[9] },
 ];
 useEffect(() => {
   shuffleQuestions();
 }, []);

 const shuffleArray = (array) => {
   for (let i = array.length - 1; i > 0; i--) {
     const j = Math.floor(Math.random() * (i + 1));
     [array[i], array[j]] = [array[j], array[i]];
   }
   return array;
 };

 const shuffleQuestions = () => {
   const newShuffledQuestions = questions.map(q => ({
     ...q,
     options: shuffleArray([...q.options])
   }));
   setShuffledQuestions(newShuffledQuestions);
 };

 const handleAnswer = (index, option) => {
   const newAnswers = [...answers];
   newAnswers[index] = option;
   setAnswers(newAnswers);
 };





  return (
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim }}
    >
    <Wallet_screen_header title="Check Mnemonic" onLeftIconPress={() => navi.goBack()} />
      <View style={style.Body}>
        <Text style={style.verifyText}>Verify Secret Phrase</Text>
        <Text style={style.wordText}>
        Please top on the correct answer of the below seed phrases.
        </Text>

        <View style={{ marginTop: hp(2) }}>
        {shuffledQuestions.map((q, index) => (
            <View key={index} style={{ marginVertical: 5 }}>
              <Text style={{marginLeft:wp(3),color:"black"}}>{q.question}</Text>
             <View style={{flexDirection:"row"}}>
             {q.options.map((option, optIndex) => (
                <TouchableOpacity
                  key={optIndex}
                  style={{
                    backgroundColor: answers[index] === option ? 'lightblue' : 'white',
                    borderRadius:6,
                    borderColor:"#4CA6EA",
                    borderWidth:0.6,
                    marginHorizontal:wp(1.5),
                    width:wp(26),
                    height:hp(5),
                    alignItems:"center",
                    justifyContent:"center",
                    marginTop:hp(1)
                  }}
                  onPress={() => handleAnswer(index, option)}
                >
                  <Text style={{color:"black"}}>{option}</Text>
                </TouchableOpacity>
              ))}
             </View>
            </View>
          ))}
        </View>
        
        {loading ? 
          <View style={[style.ButtonView,{backgroundColor:"white"}]}>
          <ActivityIndicator size="large" color="green" />
          </View>
          :        
        <TouchableOpacity
          style={style.ButtonView}
          onPress={async () => {
            const isCorrect = answers.every((answer, index) => answer === shuffledQuestions[index].correct);
                if (isCorrect) {
            setLoading(true);
            try {
              const pin = await AsyncStorageLib.getItem("pin");

                const body = {
                  accountName: props.route.params.wallet.accountName,
                  pin: JSON.parse(pin),
                };
                const token = genUsrToken(body);

                const accounts = {
                  address: props.route.params.wallet.address,
                  privateKey: props.route.params.wallet.privateKey,
                  mnemonic: props.route.params.wallet.mnemonic,
                  name: props.route.params.wallet.accountName,
                  walletType: "Multi-coin",
                  xrp: {
                    address: props.route.params.wallet.xrp.address,
                    privateKey: props.route.params.wallet.xrp.privateKey,
                  },
                  stellarWallet: {
                    publicKey: props.route.params.wallet.stellarWallet.publicKey,
                    secretKey: props.route.params.wallet.stellarWallet.secretKey
                  },
                  wallets: [],
                };
                let wallets = [];
                wallets.push(accounts);
                const allWallets = [
                  {
                    address: props.route.params.wallet.address,
                    privateKey: props.route.params.wallet.privateKey,
                    name: props.route.params.wallet.accountName,
                    mnemonic: props.route.params.wallet.mnemonic,
                    xrp: {
                      address: props.route.params.wallet.xrp.address,
                      privateKey: props.route.params.wallet.xrp.privateKey,
                    },
                    stellarWallet: {
                      publicKey: props.route.params.wallet.stellarWallet.publicKey,
                      secretKey: props.route.params.wallet.stellarWallet.secretKey
                    },
                    walletType: "Multi-coin",
                  },
                ];

                AsyncStorageLib.setItem(
                  "wallet",
                  JSON.stringify(allWallets[0])
                );
                AsyncStorageLib.setItem(
                  `${props.route.params.wallet.accountName}-wallets`,
                  JSON.stringify(allWallets)
                );
                AsyncStorageLib.setItem(
                  "user",
                  props.route.params.wallet.accountName
                );
                AsyncStorageLib.setItem(
                  "currentWallet",
                  props.route.params.wallet.accountName
                );
                AsyncStorageLib.setItem(
                  `${props.route.params.wallet.accountName}-token`,
                  token
                );

                dispatch(setUser(props.route.params.wallet.accountName));
                dispatch(
                  setCurrentWallet(
                    props.route.params.wallet.address,
                    props.route.params.wallet.accountName,
                    props.route.params.wallet.privateKey,
                    props.route.params.wallet.mnemonic,
                    props.route.params.wallet.xrp.address
                      ? props.route.params.wallet.xrp.address
                      : "",
                    props.route.params.wallet.xrp.privateKey
                      ? props.route.params.wallet.xrp.privateKey
                      : "",
                    (walletType = "Multi-coin")
                  )
                );
                dispatch(
                  AddToAllWallets(
                    wallets,
                    props.route.params.wallet.accountName
                  )
                );
                dispatch(getBalance(props.route.params.wallet.address));
                dispatch(setWalletType("Multi-coin"));
                dispatch(setToken(token));
                // add NEW ACCOUNT DATA FOR NEW STELLAR ACCOUNT
                genrate_keypair(props.route.params.wallet.address,props.route.params.wallet.stellarWallet.publicKey,props.route.params.wallet.stellarWallet.secretKey)
                props.navigation.navigate("HomeScreen");
                alert("success", "Mnemonic validated successfully!");
                getData();      
            } catch (e) {
            }
          }
          else {
                  const hasNull = answers.some((answer) => answer === null);
                  if (hasNull) {
                    Snackbar.show({
                      text: 'Please provide all answers before submitting.',
                      duration: Snackbar.LENGTH_SHORT,
                      backgroundColor: 'red',
                    });
                    setAnswers(Array(4).fill(null));
                    shuffleQuestions();
                  }
                  else{

                    Snackbar.show({
                      text: 'Incorrect Answers, please try again',
                      duration: Snackbar.LENGTH_SHORT,
                      backgroundColor:'red',
                    });
                    setAnswers(Array(4).fill(null));
                    shuffleQuestions();
                  }
          }
          }}
        >
          <Text style={{ color: "white",fontSize:15 }}>Done</Text>
        </TouchableOpacity>
        }
      </View>
    </Animated.View>
  );
};

export default CheckMnemonic;

const style = StyleSheet.create({
  Body: {
    backgroundColor: "white",
    width: wp(100),
    height:hp(100),
    alignSelf:"center",
    textAlign: "center",
    paddingLeft:wp(5)
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
    marginTop: hp(10),
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
    marginTop: hp(5),
    borderWidth: 1,
    borderColor: "grey",
    width: wp(85),
    alignSelf: "center",

    paddingVertical: hp(6),
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
  verifyText: {
    color: "black",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "left",
    marginTop: hp(3),
    marginHorizontal: wp(2),
  },
  wordText: {
    color: "black",
    textAlign: "left",
    marginTop: hp(2),
    width: wp(88),
    marginHorizontal: wp(2),
  },
  ButtonView: {
    backgroundColor: "#4CA6EA",
    width: wp(90),
    alignItems: "center",
    padding: 15,
    borderRadius: 50,
    marginTop: hp(5),
  },
  pressable: {
    borderColor: "#D7D7D7",
    borderWidth: 0.5,
    backgroundColor: "#F2F2F2",
    width: wp(30),
    justifyContent: "center",
    paddingVertical: hp(2),
    paddingHorizontal: 3,
    position: "relative",
  },
  pressText: {
    alignSelf: "flex-end",
    paddingRight: 5,
    top: 0,
    position: "absolute",
  },
  itemText: {
    textAlign: "left",
    marginVertical: 6,
    marginHorizontal: wp(1.5),
  },
  backupText: {
    fontWeight: "bold",
    fontSize: 17,
    color: "black",
    marginLeft: 20,
    marginTop: hp(3),
    marginBottom: hp(2),
  },
  dotView: {
    flexDirection: "row",
    alignItems: "center",
    width: wp(90),
    marginLeft: 18,
    marginTop: hp(4),
  },
  dotView1: {
    flexDirection: "row",
    alignItems: "center",
    width: wp(90),
    marginLeft: 18,
    marginTop: hp(2),
  },
  accountText: { color: "black", marginHorizontal: wp(9), marginTop: hp(4) },
  nextButton: {
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "gray",
    marginTop: hp(4),
    width: wp(60),
    padding: 10,
    borderRadius: 10,
  },
});
