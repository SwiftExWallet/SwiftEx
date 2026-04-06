import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  ActivityIndicator,
  Alert,
    FlatList,
    Image,
    Keyboard,
  KeyboardAvoidingView, 
  Linking, 
  Modal, 
  Platform, 
  ScrollView,
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  TouchableWithoutFeedback, 
  View,
  useWindowDimensions
} from "react-native";
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import InfoCustomAlert from "../components/InfoCustomAlert";
import { useNavigation } from "@react-navigation/native";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import Icon from "../../../../../icon";
import { authRequest, GET, getToken, POST } from "../api";
import DeviceInfo from "react-native-device-info";
import { useSelector } from "react-redux";
import { debounce } from "lodash";
import AlchemyFiatTokens from "../../../../../utilities/AlchemyFiatSupprort.json";
import AlchemyFiatSellTokens from "../../../../../utilities/AlchemyFiatSellSupprort.json";
import AlchemyCryptoTokens from "../../../../../utilities/AlchemyCryptoSupprort.json";
import AsyncStorage from "@react-native-async-storage/async-storage";
import authApi from "../authApi";
import { REACT_APP_HOST } from "../ExchangeConstants";
import apiHelper from "../apiHelper";
import CustomInfoProvider from "./CustomInfoProvider";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { colors } from "../../../../../Screens/ThemeColorsConfig";


const KycComponent = ({ route }) => {
    const state=useSelector((state)=>state)
    const navigation = useNavigation();
    const [visibleAlert, setVisibleAlert] = useState(false);
    const [VisibleAlertLoading, setVisibleAlertLoading] = useState(false);
    const [infoHeading, setinfoHeading] = useState("Oops! You're in Guest Mode");
    const [infoSubHeading, setinfoSubHeading] = useState("Looks like you're in Guest Mode. Log in to unlock this feature and enjoy the full experience!");
    const [infoBtnHeading, setinfoBtnHeading] = useState("Login");
    const [infoBtnAction, setinfoBtnAction] = useState(true);
    const [btnLoading, setbtnLoading] = useState(false);
    const [qoutesLoading, setqoutesLoading] = useState(false);
    const [amountSend, setamountSend] = useState(0.00);
    const { width, height } = useWindowDimensions();
    const [operationType,setoperationType]=useState("BUY");
    const [operationError,setoperationError]=useState(null);
    const [QoutesRes,setQoutesRes]=useState(null);
    const [tokenModalVisible,setTokenModalVisible]=useState(false);
    const [tokenModalType,settokenModalType]=useState(0);
    const [selectedfiat,setSelectedfiat]=useState(null);
    const [selectedCrypto,setSelectedCrypto]=useState(null);
    const [payWayaCode,setPayWayaCode]=useState("10001");
    const [FindResult, setFindResult] = useState('');
    useEffect(() => {
      setFindResult('');
      setPayWayaCode("10001")
      setinfoHeading("Oops! You're in Guest Mode");
      setinfoSubHeading("Looks like you're in Guest Mode. Log in to unlock this feature and enjoy the full experience!");
      setinfoBtnHeading("Login");
      setinfoBtnAction(true)
      setbtnLoading(false)
      setVisibleAlert(false);
      setVisibleAlertLoading(false)
      setamountSend(route?.params?.cryptoRequest==="XLM"?"1374":0.00);
      setoperationType("BUY");
      setoperationError(null);
      setqoutesLoading(false);
      settokenModalType(0);
    }, []);

  const visibleClose = async() => {
    if (infoBtnAction) {
      setVisibleAlert(false);
      navigation.navigate("exchangeLogin",{diractPath:"rampScreen"})
    }
    if (infoBtnAction===false) {
      await proccedKyc()
    }
    if (infoBtnAction===null) {
      setVisibleAlert(false);
    }
  };

  const proccedKyc = async () => {
    try {
      setVisibleAlertLoading(true);
      const payload = {
        "businessSubType": "BUY"
      }
      const { res, err } = await authRequest("/users/alchemyUserRegister", POST, payload);
      const respo = JSON.parse(res.res)
      if(res.status===false)
      {
        setVisibleAlertLoading(false);
        setVisibleAlert(false);
       CustomInfoProvider.show("Oops!","Somthing went wrong.");
      }
      if(res.status&&respo.success)
      {
       setVisibleAlertLoading(false);
       setVisibleAlert(false);
       Linking.openURL(respo.model)
      }
    } catch (error) {
      setVisibleAlertLoading(false);
      setVisibleAlert(false);
      console.log("proccedKyc Error", error)
    }
  }

    // Calculate dynamic widths based on screen size
    const getContainerWidth = () => {
      return Math.min(380, width - 30);
    };

    const getPairButtonWidth = () => {
      return (getContainerWidth() - 20) / 2;
    };

  const handleUser = async () => {
      try {
        setbtnLoading(true)
        await checkUserKyc();
      } catch (error) {
        console.log("error--",error)
       CustomInfoProvider.show("info", "Somthing went wrong");
        setbtnLoading(false);
      }
  }

  const fetchQoutes =async (amount,actionType,cryptoSelection,fiatSelection) => {
    const payload = {
      "crypto": cryptoSelection?.crypto||"USDT",
      "network": cryptoSelection?.network||"ETH",
      "fiat": fiatSelection?.currency||"USD",
      "amount": amount,
      "side": actionType
  }

     const result = await apiHelper.post(REACT_APP_HOST + "/v1/alchemy/fetch-quotes", payload);
     console.log("------result",result)
     const respo = JSON.parse(result.data.data);   
     if (result.success&&respo.data!==null) {
      setQoutesRes(respo.data)
      setqoutesLoading(false);
    }
    else{
      console.log("alchemyQuotes Error---",respo)
      setqoutesLoading(false);
      setamountSend("");
     CustomInfoProvider.show("info","!Opps",respo?.returnMsg==="The amount needs to be a positive integer"?"Please enter a whole number. Decimal values are not allowed.":respo?.returnMsg||"Something went wrong..");
    }

  };

  // wait and get Qoutes
  const waitAndQoutesFetch = useCallback(debounce((valpayAmount,valoperationType,valselectedCrypto,valselectedfiat) => {
    if (!valpayAmount || valpayAmount === "0" || parseFloat(valpayAmount) === 0) {
      setamountSend("");
      setoperationError("Invalid amount");
      if (valselectedCrypto === null || valselectedfiat === null) {
        setamountSend("");
        setoperationError("fiat & crypto both selection requird.");
      }
    }
    else {
      if (valselectedCrypto === null || valselectedfiat === null) {
        setamountSend("");
        setoperationError("fiat & crypto both selection requird.");
      } else {
        setQoutesRes(null);
        setqoutesLoading(true);
        setoperationError(null);
        fetchQoutes(valpayAmount,valoperationType,valselectedCrypto,valselectedfiat)
      }
    }
  }, 1000), []);

  const handleChange = (text) => {
    const replaceComma = text.replace(',', '.');
    const payAmount=replaceComma
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*?)\..*/g, '$1');
    setamountSend(payAmount)
    waitAndQoutesFetch(payAmount,operationType,selectedCrypto,selectedfiat)
  };
  
  const checkUserKyc=async()=>{
    try {
      // const { res, err } = await authRequest("/users/alchemyKycStatus", POST);
      // const respo = JSON.parse(res.res)
      // console.log(respo)
      // if (err) {
      //  CustomInfoProvider.show("info", "Somthing went wrong");
      //   setbtnLoading(false);
      // }
      // if (!respo.success && respo.code === "2003" && respo.error||res.status && respo?.model?.kycStatus === 0) {
      //   setinfoHeading("Oops! Kyc requird");
      //   setinfoSubHeading("This feature is currently unavailable as your KYC is incomplete. Please finish the verification process to gain full access.");
      //   setinfoBtnHeading("Procced Now");
      //   setinfoBtnAction(false)
      //   setVisibleAlert(true)
      //   setbtnLoading(false);
      // }
      // if (res.status && respo?.model?.kycStatus !== 0) {
        // setinfoHeading("You're all set!");
        // setinfoSubHeading("Your KYC is complete enjoy full access to all features!");
        // setinfoBtnHeading("Got it!");
        // setinfoBtnAction(null)
        // setVisibleAlert(true)
        // setbtnLoading(false);
        if (operationType === "BUY") {
          await proccedBuy()
        }
        else{
          await proccedSell()
        }
      // }
    } catch (error) {
      console.log("userKycError", error)
      setbtnLoading(false);
    }  
  }

  const proccedBuy = async () => {
    try {
      const payload = {
        "amount": amountSend.toString(),
        "fiatCurrency": selectedfiat?.currency,
        "cryptoCurrency": selectedCrypto?.crypto,
        "address": selectedCrypto?.network==="XLM"?state&&state.STELLAR_PUBLICK_KEY:state?.ETH_KEY,
        "network": selectedCrypto?.network,
        "payWayCode": selectedfiat?.payWayCode,
        "memo": "test1"
      }

      const result = await apiHelper.post(REACT_APP_HOST + "/v1/alchemy/create-buy-order", payload);
      console.log(result,"payload",payload)
      if (result.success&&result.data.success) {
        setbtnLoading(false);
        Linking.openURL(result.data.success)
      } else {
        setbtnLoading(false);
       CustomInfoProvider.show("Oops!", "Somthing went wrong.");
      }
    } catch (error) {
      setbtnLoading(false);
      console.log("proccedKyc Error", error)
     CustomInfoProvider.show("Oops!", "Somthing went wrong.");
    }
  }

  const proccedSell = async () => {
    try {
      const payload = {
        "cryptoAmount": amountSend,
        "fiat": selectedfiat?.currency,
        "crypto": selectedCrypto?.crypto,
        "network": selectedCrypto?.network,
        "country": selectedfiat?.country
      }
      const result = await apiHelper.post(REACT_APP_HOST + "/v1/alchemy/create-sell-order", payload);
      console.log("res--",result.data.success)
      if(result.success&&result.data.success)
      {
        setbtnLoading(false);
        Linking.openURL(result.data.success)
        
      }
      else{
        setbtnLoading(false);
       CustomInfoProvider.show("Oops!","Somthing went wrong.");
      }
    } catch (error) {
      setbtnLoading(false);
      console.log("proccedSell Error", error)
     CustomInfoProvider.show("Oops!","Somthing went wrong.");
    }
  }

  useEffect(()=>{
    setamountSend(route?.params?.cryptoRequest==="XLM"?"1374":0.00);
    setSelectedCrypto(route?.params?.cryptoRequest==="XLM"?{
        "crypto": "XLM",
        "network": "XLM",
        "buyEnable": 1,
        "sellEnable": 0,
        "minPurchaseAmount": 15.00,
        "maxPurchaseAmount": 2000.00,
        "address": null,
        "icon": "https://static.alchemypay.org/alchemypay/crypto-images/XLM.png",
        "minSellAmount": null,
        "maxSellAmount": null
    }:{
      "crypto": "USDC",
        "network": "XLM",
        "buyEnable": 1,
        "sellEnable": 0,
        "minPurchaseAmount": 15.00,
        "maxPurchaseAmount": 2000.00,
        "address": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        "icon": "https://static.alchemypay.org/alchemypay/crypto-images/USDC.png",
        "minSellAmount": null,
        "maxSellAmount": null
  });
    setSelectedfiat({
      "country": "IN",
      "currency": "INR",
      "payWayCode": "90001",
      "payWayName": "UPI",
      "fixedFee": 0.000000,
      "feeRate": 0.055000,
      "payMin": 1000.000000,
      "payMax": 50000.000000,
      "countryName": "India"
  });
    setbtnLoading(false);
    setVisibleAlert(false);
    setVisibleAlertLoading(false)
    setoperationError(null);
    setqoutesLoading(false);
    setQoutesRes(null);
    setamountSend(route?.params?.cryptoRequest==="XLM"?"1374":0.00);
    if (route?.params?.cryptoRequest==="XLM") {
      waitAndQoutesFetch("1374", operationType, {
        "crypto": "XLM",
        "network": "XLM",
        "buyEnable": 1,
        "sellEnable": 0,
        "minPurchaseAmount": 15.00,
        "maxPurchaseAmount": 2000.00,
        "address": null,
        "icon": "https://static.alchemypay.org/alchemypay/crypto-images/XLM.png",
        "minSellAmount": null,
        "maxSellAmount": null
      }, {
        "country": "IN",
        "currency": "INR",
        "payWayCode": "90001",
        "payWayName": "UPI",
        "fixedFee": 0.000000,
        "feeRate": 0.055000,
        "payMin": 1000.000000,
        "payMax": 50000.000000,
        "countryName": "India"
      })
    }

    if(route?.params?.cryptoRequestChain){
      const requestChain=route.params.cryptoRequestChain==="BNB"?"BSC":route.params.cryptoRequestChain;
      const find=AlchemyCryptoTokens.filter(find=> find.network===requestChain && find.crypto===route.params.cryptoRequest)
      console.log(JSON.stringify(find))
      setSelectedCrypto(find[0]);
    }
  },[operationType])

  useEffect(()=>{
    setamountSend(route?.params?.cryptoRequest==="XLM"?"1374":0.00);
    setbtnLoading(false);
    setVisibleAlert(false);
    setVisibleAlertLoading(false);
    setoperationError(null);
    setqoutesLoading(false);
    setQoutesRes(null);
  },[selectedCrypto,selectedfiat])

  const renderTokenItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.tokenItem,{backgroundColor:theme.cardBg}]} 
      onPress={() =>{tokenModalType===0?[setSelectedfiat(item),setTokenModalVisible(false)]:[setSelectedCrypto(item),setTokenModalVisible(false)],setFindResult("")}}
    >
      <Image
        source={{ uri: item.icon?item.icon:`https://flagcdn.com/24x18/${item?.country?.toLowerCase()}.png` }}
        style={styles.tokenIcon}
      />
      <View style={styles.tokenInfo}>
        <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>{tokenModalType===0?item.payWayName:item.crypto}</Text>
        <Text style={[styles.tokenName,{color:theme.inactiveTx}]}>{tokenModalType===0?`${item.countryName} (${item.currency})`:item.network}</Text>
      </View>
      <View>
        <Text style={[styles.tokenName,{color:theme.inactiveTx}]}>Max Buy</Text>
        <Text style={[styles.tokenName,{color:theme.inactiveTx}]}>{tokenModalType === 0 ? item.payMax : item.maxPurchaseAmount}</Text>
      </View>
    </TouchableOpacity>
  );

  const listManager = useMemo(() => {
    if (tokenModalType === 0) {
      return operationType === "BUY" ? AlchemyFiatTokens : AlchemyFiatSellTokens;
    } else {
      return AlchemyCryptoTokens;
    }
  }, [tokenModalType, operationType]);

  const listManagerData = useMemo(() => {
    const query = FindResult?.toLowerCase();
    return listManager.filter(token =>{
      if (tokenModalType === 0) {
        return (
          token.currency?.toLowerCase().includes(query) ||
          token.country?.toLowerCase().includes(query)
        );
      } else {
        return (
          token.crypto?.toLowerCase().includes(query) ||
          token.network?.toLowerCase().includes(query)
        );
      }
    }
    );
  }, [FindResult, listManager]);


  const theme = state.THEME.THEME ? colors.dark : colors.light;

    return (
      <View style={[styles.mainCom,{backgroundColor:theme.bg}]}>
        <TouchableWithoutFeedback onPress={()=>{Keyboard.dismiss()}}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
        >
          <Exchange_screen_header 
            title={"Fiat Access"} 
            onLeftIconPress={() => navigation.goBack()} 
            onRightIconPress={() => console.log('Pressed')} 
          />
          
          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            {visibleAlert && (
              <InfoCustomAlert 
                heading={infoHeading}
                subHeading={infoSubHeading}
                btnText={infoBtnHeading}
                onclose={visibleClose}
                onskip={()=>{setVisibleAlert(false)}}
                loading={VisibleAlertLoading}
              />
            )}

            {/* Pair container */}
            <View style={[styles.pariViewCon, { width: "100%",paddingHorizontal:6,backgroundColor:theme.cardBg }]}>
              <TouchableOpacity 
                style={[
                  styles.pairNameCon, 
                  { backgroundColor: operationType==="BUY"?"#4052D6":theme.cardBg, width: getPairButtonWidth() }
                ]}
                onPress={()=>{setoperationType("BUY")}}
              >
                <Text style={[styles.pairNameText,{color:operationType==="BUY"?"#fff":theme.headingTx}]}>Buy</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.pairNameCon, { backgroundColor: operationType==="SELL"?"#4052D6":theme.cardBg,width: getPairButtonWidth() }]}
                onPress={()=>{setoperationType("SELL")}}
              >
                <Text style={[styles.pairNameText,{color:operationType==="SELL"?"#fff":theme.headingTx}]}>Sell</Text>
              </TouchableOpacity>
            </View>

              {/* First Amount Container */}
              <View style={[styles.amountInfoCon,{backgroundColor:theme.cardBg}]}>
                <View style={styles.amountInfoHeader}>
                  <Text style={styles.amountInfoText}>You Pay</Text>
                  <View style={styles.amountInputCon}>
                    <View style={[styles.amountSubCon, { width: getContainerWidth() * 0.4 ,borderColor:theme.smallCardBorderColor}]}>
                      <TextInput
                        placeholder="0.00"
                        placeholderTextColor="gray"
                        value={amountSend}
                        style={[styles.amountInput,{color:theme.headingTx}]}
                        onChangeText={(text) => { handleChange(text) }}
                        returnKeyType="done"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                </View>
                {operationType === "BUY" ? 
                <TouchableOpacity style={[styles.amountFlagCon,{backgroundColor:theme.bg}]} onPress={() => { settokenModalType(0), setTokenModalVisible(true) }}>
                  <View style={styles.currencySelector}>
                    <View style={styles.downBoxCon}>
                      {/* <Icon name="currency-usd" type="materialCommunity" color={theme.headingTx} size={25} /> */}
                      <Image source={{ uri: `https://flagcdn.com/24x18/${selectedfiat?.country?.toLowerCase()}.png` }} style={styles.tokenIcon} /> 
                    </View>
                    <Text style={[styles.currencyText,{color:theme.headingTx}]}>{selectedfiat?.currency || "Fiat"}</Text>
                  </View>
                  <View style={[styles.downBoxCon]}>
                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                  </View>
                </TouchableOpacity> 
                : 
                <TouchableOpacity style={[styles.amountFlagCon,{backgroundColor:theme.bg}]} onPress={() => { settokenModalType(1), setTokenModalVisible(true) }}>
                  <View style={styles.currencySelector}>
                    <View style={styles.downBoxCon}>
                      {selectedCrypto?.icon ? <Image source={{ uri: selectedCrypto?.icon }} style={styles.tokenIcon} /> : <Icon name="ethereum" type="materialCommunity" color={theme.headingTx} size={25} />}
                    </View>
                    <View style={{ flexDirection: "column" }}>
                      <Text style={[styles.currencyText,{color:theme.headingTx}]}>{selectedCrypto?.crypto || "Crypto"}</Text>
                      {selectedCrypto?.network && <Text style={styles.currencySubText}>{selectedCrypto?.network}</Text>}
                    </View>
                  </View>
                  <View style={[styles.downBoxCon]}>
                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                  </View>
                </TouchableOpacity>}
              </View>
              {operationError!==null&&<Text style={styles.errorText}>{operationError}</Text>}


            {/* Second Amount Container */}
            <View style={[styles.amountInfoCon,{backgroundColor:theme.cardBg,borderBottomLeftRadius:0,borderBottomRightRadius:0}]}>
            <View style={styles.amountInfoHeader}>
                  <Text style={styles.amountInfoText}>You Get</Text>
                  <View style={styles.amountInputCon}>
                    <View style={[styles.amountSubCon, { width: getContainerWidth() * 0.4, borderColor:theme.smallCardBorderColor }]}>
                      <TextInput
                        editable={false}
                        placeholder="0.0"
                        placeholderTextColor="gray"
                        value={operationType === "BUY" ? QoutesRes?.cryptoQuantity : QoutesRes?.fiatQuantity}
                        style={[styles.amountInput, { color: "gray" }]}
                      />
                    </View>
                  </View>
                </View>
                {operationType === "SELL" ? 
                <TouchableOpacity style={[styles.amountFlagCon,{backgroundColor:theme.bg}]}  onPress={() => { settokenModalType(0), setTokenModalVisible(true) }}>
                  <View style={styles.currencySelector}>
                    <View style={styles.downBoxCon}>
                      <Image source={{ uri: `https://flagcdn.com/24x18/${selectedfiat?.country?.toLowerCase()}.png` }} style={styles.tokenIcon} /> 
                    </View>
                    <Text style={[styles.currencyText,{color:theme.headingTx}]}>{selectedfiat?.currency || "Fiat"}</Text>
                  </View>
                  <View style={[styles.downBoxCon]}>
                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                  </View>
                </TouchableOpacity> 
                :
                  <TouchableOpacity style={[styles.amountFlagCon,{backgroundColor:theme.bg}]} onPress={() => { settokenModalType(1), setTokenModalVisible(true) }}>
                    <View style={styles.currencySelector}>
                      <View style={styles.downBoxCon}>
                        {selectedCrypto?.icon ? <Image source={{ uri: selectedCrypto?.icon }} style={styles.tokenIcon} /> : <Icon name="ethereum" type="materialCommunity" color={theme.headingTx} size={25} />}
                      </View>
                      <View style={{ flexDirection: "column" }}>
                        <Text style={[styles.currencyText,{color:theme.headingTx}]}>{selectedCrypto?.crypto || "Crypto"}</Text>
                        {selectedCrypto?.network && <Text style={styles.currencySubText}>{selectedCrypto?.network}</Text>}
                      </View>
                    </View>
                    <View style={[styles.downBoxCon]}>
                      <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                    </View>
                  </TouchableOpacity>}
              </View>

              {/* Info Container */}
                {qoutesLoading&&QoutesRes===null?
              <View style={[styles.infoCon,{paddingVertical:19,alignItems:"center",borderColor:theme.inactiveTx}]}>
                  <ActivityIndicator color={"#5B65E1"} size={"large"}/>
                  <Text style={[styles.addressText,{fontSize:16,color:theme.inactiveTx}]}>Fetching Qoutes Details....</Text>
                </View>:
                  QoutesRes!==null&&
                  <View style={[styles.providerCon,{backgroundColor:theme.cardBg,borderColor:theme.inactiveTx}]}>
                    <View style={styles.providerSubCon}>
                      <Text style={{fontSize:16,fontWeight:"400",color:theme.inactiveTx}}>Provider:</Text>
                      <View style={{flexDirection:"row",alignItems:"center"}}>
                      <Image source={require('../../../../../../assets/AlcamyPay.jpg')} style={styles.image} resizeMode="cover" />
                      <Text style={{fontSize:16,fontWeight:"600",color:theme.headingTx}}>Alchemy Pay</Text>
                      </View>
                    </View>
                   <View style={[styles.infoCon,{backgroundColor:theme.cardBg,borderColor:theme.inactiveTx}]}>
                  <Text style={[styles.amountInfoText,{color:theme.headingTx,marginBottom:hp(1)}]}>Transaction summary</Text>
                  <View style={styles.infoRow}>
                  {operationType==="BUY"?
                  <>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>Your Order </Text>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>{amountSend} {QoutesRes?.fiat||"USD"} for {operationType==="BUY"?QoutesRes?.cryptoQuantity:QoutesRes?.fiatQuantity||0.0} {QoutesRes?.crypto|| selectedCrypto?.crypto}</Text>
                  </>
                  :
                  <>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>Your Order </Text>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>{QoutesRes?.fiatQuantity||0.0} {QoutesRes?.fiat||"USD"} for {amountSend} {selectedCrypto?.crypto}</Text>
                  </>}
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>Processing fee</Text>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>{QoutesRes?.rampFee||0.0} {QoutesRes?.fiat||"USD"}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>Estimation rate </Text>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>1 {QoutesRes?.crypto||selectedCrypto?.crypto} = {QoutesRes?.cryptoPrice||0.0} {QoutesRes?.fiat||"USD"}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>Network fee</Text>
                  <Text style={[styles.infoText,{color:theme.headingTx}]}>{QoutesRes?.cryptoNetworkFee||0.0} {QoutesRes?.crypto||selectedCrypto?.crypto}</Text>
                </View>
                </View>
                 </View>}

            {/* Buy Button */}
            <TouchableOpacity 
              style={[styles.buyBtn, { width: "100%",backgroundColor:btnLoading||qoutesLoading||parseFloat(amountSend)===0||!amountSend||selectedCrypto===null||selectedfiat===null?"gray":"#5B65E1" }]}
              disabled={btnLoading||qoutesLoading||parseFloat(amountSend)===0||!amountSend||selectedCrypto===null||selectedfiat===null}
              onPress={() => {handleUser()}}
            >
              {btnLoading?<ActivityIndicator size={"small"} color={"#fff"}/>:<Text style={styles.buyBtnText}>{operationType==="BUY"?"Buy Crypto":"Sell Crypto"}</Text>}
            </TouchableOpacity>
            <Text style={{fontSize:16,color:theme.inactiveTx,alignSelf:"center",marginTop:hp(2)}}>Powered by Alchemy Pay</Text>
          </ScrollView>
            <Modal
              animationType="slide"
              transparent={true}
              visible={tokenModalVisible}
              onRequestClose={() => setTokenModalVisible(false)}
            >
              <View style={styles.modalContainer}>
                <View style={[styles.modalContent,{backgroundColor:theme.bg}]}>
                  <View style={styles.modalHandle} />

                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle,{color:theme.headingTx}]}>Select a {tokenModalType===0?"fiat":"crypto"}</Text>
                    <TouchableOpacity onPress={() => setTokenModalVisible(false)}>
                      <MaterialIcons name="close" size={24} color={theme.headingTx} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    placeholder={`Search ${tokenModalType===0?"fiat":"crypto"}...`}
                    placeholderTextColor={"gray"}
                    value={FindResult}
                    onChangeText={setFindResult}
                    style={[styles.searchCon,{color:theme.headingTx}]}
                  />
                  <FlatList
                    data={listManagerData}
                    renderItem={renderTokenItem}
                    keyExtractor={item => item.id}
                    showsVerticalScrollIndicator={false}
                  />
                </View>
              </View>
            </Modal>
        </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </View>
    );
};

const styles = StyleSheet.create({
  mainCom: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  typeSelection: {
    marginVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1F2937",
    alignItems: "center",
    height: 58,
    width:"100%",
    alignSelf: "center",
    borderRadius: 16,
    paddingHorizontal: 1.5,
  },
  pariViewCon: {
    marginTop: 20,
    marginBottom:6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 62,
    alignSelf: "center",
    borderRadius: 16,
    paddingHorizontal: 4,
  },
  pairNameCon: {
    height: 47,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2937",
  },
  pairNameText: {
    fontSize: 16,
    fontWeight:"500"
  },
  amountInfoCon: {
    borderRadius: 16,
    paddingHorizontal: wp(4),
    paddingVertical:hp(1),
    alignSelf: "center",
    flexDirection:"row",
    justifyContent:"space-between",
    width: "100%", 
    marginTop:hp(1.5)
  },
  amountInfoHeader: {
    flexDirection: "column",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  amountInfoText: {
    fontSize: 16,
    color: "gray",
    fontWeight:"500"
  },
  amountInputCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountSubCon: {
    borderBottomWidth: 1,
    marginTop:hp(2)
  },
  amountInput: {
    fontSize: 20,
    fontWeight: "500",
    color: "#fff",
    padding: 0,
  },
  amountFlagCon: {
    maxWidth:wp(55),
    height:hp(6),
    width:wp(35),
    paddingHorizontal:wp(2),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginLeft: 5,
    borderRadius:15,
    bottom:hp(-2)
  },
  currencySelector: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyText: {
    fontSize: 16,
    color: "#fff",
    fontWeight:"500",
    marginLeft: 8,
  },
  currencySubText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 16,
    color: "red",
    fontWeight:"600",
    marginLeft: 1,
  },
  downBoxCon: {
    alignItems: "center",
    justifyContent: "center",
  },
  infoCon: {
    marginVertical: -4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFFFFF33",
    padding: 14,
  },
  providerCon: {
    marginVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFFFFF33",
  },
  providerSubCon:{
    flexDirection:"row",
    paddingHorizontal: 14,
    justifyContent:"space-between",
    alignItems:"center",
    paddingVertical:hp(1.6)
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent:"space-between",
    marginBottom: hp(1),
  },
  infoText: {
    fontSize: 13,
    color: "#fff",
  },
  walletAddress: {
    flexDirection:"row",
    marginBottom: 15,
    padding: 14,
    borderTopLeftRadius:0,
    borderTopRightRadius:0,
    borderRadius: 16,
    borderTopColor:"gray",
    borderTopWidth:0.3,
    justifyContent:"space-between",
    alignItems:"center"
  },
  sectionTitle: {
    fontSize: 16,
    color: "#FFFFFF",
    // marginBottom: 10,
    // marginLeft:"2%"
  },
  addressContainer: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFFFFF33",
  },
  addressText: {
    fontSize: 16,
    color: "#fff",
  },
  paymentSection: {
    marginTop: 15,
  },
  paymentOptions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  paymentMethod: {
    width: 105,
    height: 62,
    justifyContent: "center",
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: 0.5,
    borderRadius: 20,
    padding: 5,
  },
  paymentText: {
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 5,
  },
  buyBtn: {
    backgroundColor: "#2164C1",
    height: hp(6.9),
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 30,
  },
  buyBtnText: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '70%',
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#666',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom:2,
    paddingHorizontal:wp(2),
    borderRadius:10
  },
  tokenIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tokenSymbol: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tokenName: {
    fontSize: 14,
    color: '#999',
  },
  searchCon:{
    color:"#fff",
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 15,
  },
  image: {
    width: wp(13),
    height: hp(5),
    alignSelf: "center",
    borderRadius:10,
    marginRight:9
  },
});

export default KycComponent;