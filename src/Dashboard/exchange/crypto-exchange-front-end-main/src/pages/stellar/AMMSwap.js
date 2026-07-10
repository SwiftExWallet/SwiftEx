import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from "react-native-vector-icons/Ionicons";
import stellarTokens from "./Tokens.json";
import { debounce } from 'lodash';
import { useSelector } from 'react-redux';
import { GetStellarAvilabelBalance, GetStellarUSDCAvilabelBalance } from '../../../../../../utilities/StellarUtils';
import { AMMSWAPTESTNET } from './AMMSwapTestNetUtil';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { STELLAR_URL } from '../../../../../constants';
import * as StellarSdk from '@stellar/stellar-sdk';
import CustomInfoProvider from '../../components/CustomInfoProvider';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { colors } from '../../../../../../Screens/ThemeColorsConfig';
import { GetAquariusSwapQuote, ExecuteAquariusSwap } from '../../../../../../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/stellar/AquariusUtil';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AMMSwap = ({FROM_TOKEN=null,TO_TOKEN=null}) => {
  const state=useSelector((state)=>state);
  const [assetTrustRequired,setassetTrustRequired]=useState([]);
  const [fromToken, setFromToken] = useState({
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    contract: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    name: "USD Coin",
    org: "Centre Consortium LLC dba Centre Consortium",
    domain: "centre.io",
    icon: "https://stellar.myfilebase.com/ipfs/QmNcfZxs8e9uVyhEa3xoPWCsj3ZogGirtixMEC9Km4Fjm2",
    decimals: 7,
    balance: '1,245.32',
  });
  
  const [toToken, setToToken] = useState({
    code: "BTC",
    issuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM",
    contract: "CAO7DDJNGMOYQPRYDY5JVZ5YEK4UQBSMGLAEWRCUOTRMDSBMGWSAATDZ",
    name: "BTC",
    org: "Ultra Capital LLC dba Ultra Capital",
    domain: "ultracapital.xyz",
    icon: "https://stellar.myfilebase.com/ipfs/QmUjsGiNcUFTbiKoMZyBtgkSwfndBXSbRKFpGrYKvHC1fX",
    decimals: 7
  },);
  const slippageScale = [
    { value: "0.1", key: "0.1%" },
    { value: "0.5", key: "0.5%" },
    { value: "1", key: "1%" },
    { value: "1.5", key: "1.5%" },
    { value: "2", key: "2%" },
    { value: "2.5", key: "2.5%" },
  ];
  const navigation=useNavigation();
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fromBal, setFromBal] = useState(0.00);
  const [toBal, setToBal] = useState(0.00);
  const [exchangeRes, setexchangeRes] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenBurn, settokenBurn] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [tokenTypeSelection, settokenTypeSelection] = useState(0);
  const [messageError,setmessageError]=useState(null);
  const [showReverse,setshowReverse]=useState(false);
  const isFocused=useIsFocused();
  const [findToken, setfindToken] = useState('');
  const [activeProvider, setActiveProvider] = useState("SDEX");
  const [isOptionsVisible, setIsOptionsVisible] = useState(false);
  const [isAquaSwapUse, setIsAquaSwapUse] = useState(true);
  const [optionalSlippage, setOptionalSlippage] = useState(slippageScale[2].key);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("isAquaSwapUse");
        if (saved !== null) {
          setIsAquaSwapUse(saved === 'true');
        }
      } catch (e) {
        console.error('Error loading isAquaSwapUse preference:', e);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem("isAquaSwapUse", String(isAquaSwapUse)).catch((e) => {
      console.error('Error saving isAquaSwapUse preference:', e);
    });
  }, [isAquaSwapUse]);
  
  
  useEffect(()=>{
    setassetTrustRequired([]);
  },[isFocused,fromToken,toToken])

  useEffect(()=>{
    if (FROM_TOKEN && TO_TOKEN) {
      setFromToken(FROM_TOKEN);
      setToToken(TO_TOKEN);
    }
  },[isFocused])

  useEffect(()=>{
    settokenBurn(false)
    setshowReverse(false)
    setFromAmount('');
    setToAmount('');
    setFromBal(0.00);
    setToBal(0.00);
    setexchangeRes(null);
    setIsLoading(false);
    setTokenModalVisible(false);
    settokenTypeSelection(0);
    setmessageError(null);
    handleInitBal(fromToken?.code,toToken?.code,fromToken?.issuer,toToken?.issuer)
  },[])

  const handleInitBal=async(asset,asset1,assetIssuer,asset1Issuer)=>{
    const res= await BridgeUSDCValidation(asset==="XLM"?"native":asset,assetIssuer);
    if(res!=null)
    {
      setFromBal(parseFloat(res?.balance));
    }else{
      setFromBal(0.00);
    }
    const res1= await BridgeUSDCValidation(asset1==="XLM"?"native":asset1,asset1Issuer);
    if(res1!=null)
      {
        setToBal(parseFloat(res1?.balance));
      }else{
        setToBal(0.00);
      }
  }

  useEffect(()=>{
    handleInitBal(fromToken?.code,toToken?.code,fromToken?.issuer,toToken?.issuer)
    if(isValidNumber(fromAmount) && fromAmount !== "null"){
      handleInputChange(fromAmount)
    }
  },[fromToken,toToken])

  useEffect(()=>{
    if (isValidNumber(fromAmount) && fromAmount !== "null") {
      setIsLoading(true)
      handleQoutesFeatch(fromToken.code, fromToken.issuer, toToken.code, toToken.issuer, fromAmount);
    }
  },[isAquaSwapUse, optionalSlippage])
  

  function isAssetData(state) {
    return state?.assetData !== undefined && state?.assetData !== null;
}
  const BridgeUSDCValidation=async(assetCode,assetCodeIssuer)=>{
    const avlRes=isAssetData(state?.assetData);
    if(!avlRes)
    {
      if (assetCode === "native") {
        const res = await GetStellarAvilabelBalance(state?.STELLAR_PUBLICK_KEY)
        if (res?.availableBalance === "Error") {
          return null
        }
        else {
          return { "balance": res?.availableBalance }
        }
      } if (assetCode !== "native") {
        const nonNativeBal = await GetStellarUSDCAvilabelBalance(state?.STELLAR_PUBLICK_KEY, assetCode, assetCodeIssuer);
        if (nonNativeBal.status === false&&nonNativeBal.error) {
          const addRequest={
            tokenSymbole:nonNativeBal.tokenSymbole,
            tokenIssuer:nonNativeBal.tokenIssuer,
            userPublicKey:nonNativeBal.userPublicKey
          }
          setassetTrustRequired(lastAssets => {
            const assetExist = lastAssets.some(
              asset =>
                asset.tokenSymbole === addRequest.tokenSymbole &&
                asset.tokenIssuer === addRequest.tokenIssuer &&
                asset.userPublicKey === addRequest.userPublicKey
            );
            if (assetExist) {
              return lastAssets;
            } else {
              return [...lastAssets, addRequest];
            }
          });
          return { "balance": "0.00" }
        }
        if (nonNativeBal.availableBalance) {
          return { "balance": nonNativeBal?.availableBalance }
        }
      }
      
    }
    
  }

  const isValidNumber = (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num !== 0;
  };
  const handleInputChange = (text) => {
    const replaceComma = text?.toString()?.replace(',', '.');
    const numericText = replaceComma.replace(/[^0-9.]/g, '');
    setmessageError(null);
    setFromAmount(numericText);
    const amount = parseFloat(numericText);
    const isValidAmount = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(numericText);
    if (numericText && isValidAmount && amount > 0) {
      fetchQuote(fromToken.code,fromToken.issuer,toToken.code,toToken.issuer,numericText);
    }
  };
  // Handle input change and calculate the output amount
  const handleQoutesFeatchRef = useRef();
  useEffect(() => {
    handleQoutesFeatchRef.current = handleQoutesFeatch;
  });

  const fetchQuote = useCallback(
    debounce((fromTokenCode,fromTokenIssuer,toTokenCode,toTokenIssuer,value) => {
      setIsLoading(true)
      handleQoutesFeatchRef.current(fromTokenCode,fromTokenIssuer,toTokenCode,toTokenIssuer,value)
    }, 400),
    []
  );

  const toStellarAsset = (code, issuer) => {
    if (code === "XLM" || code === "native") return StellarSdk.Asset.native();
    return new StellarSdk.Asset(code, issuer);
  };

  const buildAquariusExchangeRes = (aquariusQuote, sourceAmount, fromCode, fromIssuer, toCode, toIssuer) => {
    const rate = parseFloat(aquariusQuote.exchangeRate);
    const destinationAmount = rate * parseFloat(sourceAmount);
    return {
      status: true,
      network: "SDEX (Aquarius)",
      source: {
        code: fromCode,
        issuer: fromIssuer,
        amount: parseFloat(sourceAmount).toFixed(7),
      },
      destination: {
        code: toCode,
        issuer: toIssuer,
        amount: destinationAmount.toFixed(7),
      },
      exchangeRate: {
        rate: `1 ${fromCode} = ${rate.toFixed(7)} ${toCode}`,
        inverse: `1 ${toCode} = ${(1 / rate).toFixed(7)} ${fromCode}`,
      },
      swapDetails: {
        slippageTolerance: aquariusQuote.slippageTolerance,
        minReceived: aquariusQuote.minimumReceived,
      },
    };
  };

  const handleQoutesFeatch=async(fromName,fromAdd,toName,toAdd,amount) => {
      const res=await getSwapQuote(fromName,fromAdd,toName,toAdd,amount)

      let aquariusRes = null;
      if (isAquaSwapUse) {
        try {
          const assetIn = toStellarAsset(fromName, fromAdd);
          const assetOut = toStellarAsset(toName, toAdd);
          const aquariusQuote = await GetAquariusSwapQuote({
            assetIn,
            assetOut,
            amount,
            slippageBps: Math.round(parseFloat(optionalSlippage) * 100),
          });
          aquariusRes = buildAquariusExchangeRes(aquariusQuote, amount, fromName, fromAdd, toName, toAdd);
        } catch (err) {
          console.error("error in aquarius quote:", err?.message || err);
          aquariusRes = null;
        }
      }

      const sdexAmount = res?.status === true ? parseFloat(res?.destination?.amount) : null;
      const aquariusAmount = aquariusRes?.status === true ? parseFloat(aquariusRes?.destination?.amount) : null;

      if (aquariusAmount !== null && (sdexAmount === null || aquariusAmount > sdexAmount)) {
        setshowReverse(false)
        setexchangeRes(aquariusRes)
        setToAmount(aquariusRes?.destination?.amount);
        setActiveProvider("Aquarius");
        setIsLoading(false)
      } else if (sdexAmount !== null) {
        setshowReverse(false)
        setexchangeRes(res)
        setToAmount(res?.destination?.amount);
        setActiveProvider("SDEX");
        setIsLoading(false)
      }
      else{
        setexchangeRes(null);
        setToAmount('');
        setIsLoading(false)
        CustomInfoProvider.show("Info","!Opps",res?.error||"Unable to fetch quotes");
      }
  }
  function URLBuilder(
    sourceAssetCode,
    sourceAssetIssuer,
    destinationAssetCode,
    destinationAssetIssuer,
    sourceAmount
  ) {
    console.log(sourceAssetCode,
      sourceAssetIssuer,
      destinationAssetCode,
      destinationAssetIssuer,
      sourceAmount)
    const baseUrl = STELLAR_URL.URL+"/paths/strict-send";
    const isSourceXLM = sourceAssetCode === "XLM";
    const isDestinationXLM = destinationAssetCode === "XLM";
    const query = [];
    if (isSourceXLM) {
      query.push(`source_asset_type=native`);
    } else {
      query.push(`source_asset_type=credit_alphanum4`);
      query.push(`source_asset_code=${encodeURIComponent(sourceAssetCode)}`);
      query.push(`source_asset_issuer=${encodeURIComponent(sourceAssetIssuer)}`);
    }
    query.push(`source_amount=${encodeURIComponent(sourceAmount)}`);
    let destinationAsset;
    if (isDestinationXLM) {
      destinationAsset = "native";
    } else {
      destinationAsset = `${destinationAssetCode}:${destinationAssetIssuer}`;
    }
  
    query.push(`destination_assets=${encodeURIComponent(destinationAsset)}`);
  
    const fullUrl = `${baseUrl}?${query.join("&")}`;
  
    return fullUrl
  }
  
  async function getSwapQuote(
    sourceAssetCode,
    sourceAssetIssuer,
    destinationAssetCode,
    destinationAssetIssuer,
    sourceAmount,
    slippageTolerance = 0.05
  ) {
    try {
      const url =URLBuilder(sourceAssetCode,sourceAssetIssuer,destinationAssetCode,destinationAssetIssuer,sourceAmount)
      console.log("** LOG **", url);
      
      const response = await fetch(url);
      const json = await response.json();
  
      const records = json._embedded?.records;
      if (!records || records.length === 0) {
        return { status: false, error: "No swap paths found for this amount. Try increasing the amount." };
      }
  
      // Pick best path (first one usually highest return)
      const bestPath = records[0];
      const destinationAmount = parseFloat(bestPath.destination_amount);
      const exchangeRate = destinationAmount / parseFloat(sourceAmount);
      const minReceived = destinationAmount * (1 - slippageTolerance);
  
      // Format path info (if any)
      const path = bestPath.path.map(asset => {
        return asset.asset_type === "native"
          ? "XLM"
          : `${asset.asset_code}:${asset.asset_issuer}`;
      });
  
      return {
        status: true,
        network: "Stellar",
        requestUrl: url,
        source: {
          code: sourceAssetCode,
          issuer: sourceAssetIssuer,
          amount: parseFloat(sourceAmount).toFixed(7),
        },
        destination: {
          code: destinationAssetCode,
          issuer: destinationAssetIssuer,
          amount: destinationAmount.toFixed(7),
        },
        exchangeRate: {
          rate: `1 ${sourceAssetCode} = ${exchangeRate.toFixed(7)} ${destinationAssetCode}`,
          inverse:`1 ${destinationAssetCode} = ${(1 / exchangeRate).toFixed(7)} ${sourceAssetCode}`,
        },
        path,
        swapDetails: {
          slippageTolerance: `${(slippageTolerance * 100).toFixed(0)}%`,
          minReceived: minReceived.toFixed(7),
        },
      };
  
    } catch (error) {
      console.log("Swap quote error:", error);
      return {
        status: false,
        error: error.message || "Unknown error",
      };
    }
  }
  
  
  
  



  // Swap tokens function
  const swapTokens = () => {
    setmessageError(null);
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setToAmount('');
  };
  
  const handleTokenSelection=(item)=>{
   try {
    if(tokenTypeSelection===0)
    {
      if(toToken.code!==item.code)
      {
        setFromToken(item);
        setTokenModalVisible(false);
        setToAmount('');
        setexchangeRes(null);
        setIsLoading(false);
      }
      else{
       CustomInfoProvider.show("Info","!Opps","The From and To asset tokens cannot be the same.")
      }
      setTokenModalVisible(false);
    }
    if (tokenTypeSelection === 1) {
      if (fromToken.code !== item.code) {
        setToToken(item);
        setTokenModalVisible(false);
        setToAmount('');
        setexchangeRes(null);
        setIsLoading(false);
      } else {
       CustomInfoProvider.show("Info","!Opps","The From and To asset tokens cannot be the same.")
      }
      setTokenModalVisible(false);
    }
   } catch (error) {
    console.debug("errr0==",error)
   }
  }

  
  const renderTokenItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.tokenItem,{backgroundColor:theme.cardBg}]} 
      onPress={() =>{handleTokenSelection(item)}}
    >
      <Image 
        source={{ uri: item.icon }}
        style={styles.tokenIcon}
      />
      <View style={styles.tokenInfo}>
        <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>{item.code}</Text>
        <Text style={[styles.tokenName,{color:theme.inactiveTx}]}>{item.name}</Text>
      </View>
    </TouchableOpacity>
  );

  const handleSwap=async()=>{
    settokenBurn(true)

    if (activeProvider === "Aquarius") {
      const assetIn = toStellarAsset(fromToken.code, fromToken.issuer);
      const assetOut = toStellarAsset(toToken.code, toToken.issuer);

      const respo = await ExecuteAquariusSwap({
        assetIn,
        assetOut,
        amount: fromAmount,
        publicKey: state?.STELLAR_PUBLICK_KEY,
      });

      if (respo.status === true) {
        CustomInfoProvider.show("success", "Transaction successful!");
        settokenBurn(false)
        setTimeout(() => {
          navigation.navigate("Transactions", { txType: "STR" });
        }, 2000)
      } else {
        settokenBurn(false)
        console.log("error in aquarius execute", respo.error)
        CustomInfoProvider.show("error", "!Opps", respo.error || "Transaction Failed.");
      }
      return;
    }

    const respo=await AMMSWAPTESTNET(fromToken.code,fromToken.issuer,toToken.code,toToken.issuer,state?.STELLAR_PUBLICK_KEY,fromAmount,assetTrustRequired)
    if(respo.status===true)
    {
      CustomInfoProvider.show("success","Transaction successful!");
      console.log("--Success--,",respo.tx)
      settokenBurn(false)
      setTimeout(()=>{
        navigation.navigate("Transactions",{txType:"STR"});
      },2000)
    }
    else{
      settokenBurn(false)
      console.log("--Error--",respo.error)
      CustomInfoProvider.show("error","!Opps",respo.error.result_codes==="op_under_dest_min"?"Swap cannot be completed because the amount is too small.":"Transaction Failed.");
    }
  }


  const theme = state.THEME.THEME ? colors.dark : colors.light;

  const getFilteredTokens = () => {
    if (!findToken.trim()) {
      return stellarTokens?.assets || [];
    }

    return stellarTokens?.assets?.filter(token => {
      const query = findToken.toLowerCase();
      const code = token.asset_code?.toLowerCase() || '';
      const issuer = token.asset_issuer?.toLowerCase() || '';
      const name = token.name?.toLowerCase() || '';

      return code.includes(query) ||
        issuer.includes(query) ||
        name.includes(query);
    }) || [];
  };
  
  return (
    <View style={styles.container}>
        <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : null}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        style={{ flex: 1, backgroundColor: theme.bg }}
      >
        <ScrollView contentContainerStyle={styles.scrollView}>
          <View style={styles.headerCon}>
            <View style={[styles.activeProviderContainer, { backgroundColor: theme.cardBg }]}>
              <Text style={[styles.cardLabel, { color: theme.inactiveTx }]}>
                Swap handled by{' '}
                <Text style={[styles.cardLabel, styles.providerName, { color: theme.headingTx }]}>
                  {activeProvider}
                </Text>
              </Text>
            </View>
            <TouchableOpacity style={[styles.optionContainer, { backgroundColor: theme.cardBg }]} onPress={() => { setIsOptionsVisible(true) }}>
              <Ionicons name="options-sharp" size={25} color={theme.headingTx} />
            </TouchableOpacity>
          </View>
          {/* From Token Input */}
          <View style={[styles.card,{backgroundColor:theme.cardBg}]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel,{color:theme.inactiveTx}]}>You Pay</Text>
              {messageError===null?<TouchableOpacity style={styles.maxButton} onPress={()=>{handleInputChange(fromBal)}}>
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>:<Text style={[styles.maxButtonText,{color:messageError==="Transaction successful!"?"green":"red"}]}>{messageError}</Text>}
            </View>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.amountInput,{borderBottomColor:theme.smallCardBorderColor,color:theme.headingTx}]}
                returnKeyType="done"
                placeholder="0.00"
                placeholderTextColor="#8A8A8A"
                keyboardType="decimal-pad"
                value={fromAmount}
                onChangeText={(value)=>{handleInputChange(value)}}
              />
              <TouchableOpacity style={[styles.tokenSelector,{backgroundColor:theme.bg}]} onPress={()=>{settokenTypeSelection(0),setTokenModalVisible(true),setfindToken("")}}>
                <Image
                  source={{ uri: fromToken.icon }}
                  style={styles.tokenLogo}
                />
                <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>{fromToken.code}</Text>
                <View style={styles.seprator}/>
                <Ionicons name="chevron-down" size={20} color={theme.headingTx} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.balanceText,{color:theme.inactiveTx}]}>
                Balance: {isNaN(fromBal) || fromBal === null || fromBal === undefined ? '0.00' : fromBal} {fromToken.code}
              </Text>
          </View>

          {/* Swap Button */}
          <TouchableOpacity style={[styles.swapButton,{backgroundColor:theme.bg}]} onPress={swapTokens}>
              <Ionicons name="swap-vertical" size={24} color="#4052D6" />
          </TouchableOpacity>
          {/* To Token Input */}
          <View style={[[styles.card,{backgroundColor:theme.cardBg}],{marginTop:15}]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel,{color:theme.inactiveTx}]}>You Get (Estimated)</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.amountInput,{borderBottomColor:theme.smallCardBorderColor,color:theme.headingTx}]}
                placeholder="0.00"
                placeholderTextColor="#8A8A8A"
                keyboardType="decimal-pad"
                value={toAmount}
                editable={false}
              />
              <TouchableOpacity style={[styles.tokenSelector,{backgroundColor:theme.bg}]} onPress={()=>{settokenTypeSelection(1),setTokenModalVisible(true),setfindToken("")}}>
                <Image
                  source={{ uri: toToken.icon }}
                  style={styles.tokenLogo}
                />
                <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>{toToken.code}</Text>
                <View style={styles.seprator}/>
                <Ionicons name="chevron-down" size={20} color={theme.headingTx} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.balanceText,{color:theme.inactiveTx}]}>
                Balance: {isNaN(toBal) || toBal === null || toBal === undefined ? '0.00' : toBal} {toToken.code}
              </Text>
          </View>
          
          {/* Swap Details */}
          {exchangeRes !== null ? <View style={[styles.detailsCard,{backgroundColor:theme.cardBg,borderColor:theme.smallCardBorderColor}]}>
          <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>Swap Details</Text>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel,{color:theme.headingTx}]}>Network</Text>
              <Text style={[styles.detailValue,{color:theme.headingTx}]}>{exchangeRes?.network}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel,{color:theme.headingTx}]}>Exchange Rate</Text>
              <View style={{flexDirection:"row",alignContent:"center"}}>
              <Text style={[styles.detailValue,{color:theme.headingTx}]}>{showReverse?exchangeRes?.exchangeRate?.inverse:exchangeRes?.exchangeRate?.rate} </Text>
              <TouchableOpacity onPress={()=>{setshowReverse(showReverse?false:true)}}>
                <Ionicons name="swap-horizontal" size={19} color={theme.headingTx} />
              </TouchableOpacity>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel,{color:theme.headingTx}]}>Slippage Tolerance</Text>
              <Text style={[styles.detailValue, { color: theme.headingTx }]}>{`${exchangeRes?.network === "Stellar"? exchangeRes?.swapDetails?.slippageTolerance ?? "0.5": optionalSlippage}`}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel,{color:theme.headingTx}]}>Minimum Received</Text>
              <Text style={[styles.detailValue,{color:theme.headingTx}]}>{exchangeRes?.swapDetails?.minReceived}</Text>
            </View>
          </View> : null}
          
          {/* Swap Button */}
          <TouchableOpacity
            style={[
              styles.swapActionButton,
              (!fromAmount || parseFloat(fromAmount) <= 0||parseFloat(fromBal)===0||parseFloat(fromAmount)>parseFloat(fromBal)) && styles.disabledButton,
            ]}
            disabled={!fromAmount || parseFloat(fromAmount) <= 0 || isLoading || tokenBurn || parseFloat(fromBal)===0||parseFloat(fromAmount)>parseFloat(fromBal)}
            onPress={()=>{handleSwap()}}
          >
              {isLoading||tokenBurn ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.swapActionButtonText}>{parseFloat(fromBal)===0||parseFloat(fromAmount)>parseFloat(fromBal)?"Insufficient balance":assetTrustRequired.length>0?`Trust ${assetTrustRequired[0].tokenSymbole} and Swap`:"Swap Tokens"}</Text>
              )}
          </TouchableOpacity>

          <Modal
        animationType="slide"
        transparent={true}
        visible={tokenModalVisible}
        onRequestClose={() => setTokenModalVisible(false)}
      >
        <TouchableOpacity
              style={styles.modalContainer}
              activeOpacity={1}
              onPress={() => setTokenModalVisible(false)}
            >
          <View style={[styles.modalContent,{backgroundColor:theme.bg}]}>
            <View style={styles.modalHandle} />
            
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle,{color:theme.headingTx}]}>Select a token</Text>
              <TouchableOpacity onPress={() => setTokenModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.headingTx} />
              </TouchableOpacity>
              </View>
                <View style={[styles.findContainer, { borderColor: theme.inactiveTx }]}>
                  <Ionicons
                    name="search"
                    size={20}
                    color={theme.headingTx}
                    style={styles.findIcon}
                  />
                  <TextInput
                    style={[styles.findInput, { color: theme.headingTx }]}
                    placeholder="Search tokens..."
                    placeholderTextColor={theme.inactiveTx}
                    value={findToken}
                    onChangeText={setfindToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>      
            <FlatList
              data={getFilteredTokens()}
              renderItem={renderTokenItem}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                    findToken.trim() ? (
                      <View style={styles.emptyContainer}>
                        <Ionicons
                          name="warning"
                          size={48}
                          color={theme.headingTx}
                        />
                        <Text style={[styles.emptyText, {
                          color: theme.headingTx
                        }]}>
                          No tokens found for "{findToken}"
                        </Text>
                      </View>
                    ) : null
                }
            />
          </View>
        </TouchableOpacity>
      </Modal>

          <Modal
            animationType="slide"
            transparent={true}
            visible={isOptionsVisible}
            onRequestClose={() => setIsOptionsVisible(false)}
          >
            <TouchableOpacity
              style={styles.modalContainer}
              activeOpacity={1}
              onPress={() => setIsOptionsVisible(false)}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => {}}
                style={[styles.modalContent, { backgroundColor: theme.bg, height: '60%', }]}
              >
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.headingTx, fontSize: 19 }]}>Swap settings</Text>
                  <TouchableOpacity style={[styles.optionContainer, { backgroundColor: theme.cardBg }]} onPress={() => setIsOptionsVisible(false)}>
                    <MaterialIcons name="close" size={24} color={theme.headingTx} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardLabel, { color: theme.inactiveTx }]}>Liquidity source</Text>
                <View style={[styles.infoCon, { backgroundColor: theme.cardBg }]}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Image source={{ uri: "https://aqua.network/assets/img/aqua-logo.png" }} width={41} height={40} />
                    <View style={{ marginLeft: wp(2) }}>
                      <Text style={[styles.cardLabel, { color: theme.inactiveTx }]}>Aquarius AMM</Text>
                      <Text style={[styles.cardLabel, { color: theme.inactiveTx,fontSize:12 }]}>Use Aquarius if better rate available</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsAquaSwapUse(prev => !prev)}
                    style={[styles.toggleCon, { backgroundColor: isAquaSwapUse ? 'green' : 'gray' }]}
                  >
                    <View style={[styles.toggleView, { alignSelf: isAquaSwapUse ? 'flex-end' : 'flex-start' }]} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardLabel, { color: theme.inactiveTx }]}>Slippage tolerance</Text>
                <View style={{flexDirection:"row",marginVertical:hp(1.5)}}>
                  {slippageScale.map((item, index) => {
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.slippageCon, { backgroundColor: theme.cardBg,borderWidth:optionalSlippage===item.key?2:0 }]}
                      onPress={() => {setOptionalSlippage(item?.key)}}
                    >
                      <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>{item?.key}</Text>
                    </TouchableOpacity>
                  )
                })}
                </View>
                <Text style={[styles.cardLabel, { color: theme.inactiveTx, fontWeight: "400" }]}>Your swap will fail if the exchange rate moves against you by more than your selected slippage tolerance before the transaction is confirmed. Increasing the slippage tolerance can improve the chances of success, but you may receive a less favorable exchange rate.</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width:"100%",
    height:"100%",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    padding: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  card: {
    borderRadius: 20,
    padding: 10,
    marginBottom: 16,
    marginHorizontal:wp(1.5)
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight:"500"
  },
  balanceText: {
    color: '#BBBBBB',
    fontSize: 14,
    alignSelf:"flex-end"
  },
  inputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  tokenSelector: {
    width:wp(32),
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 15,
  },
  tokenLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  tokenSymbol: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    textAlign: "left",
    paddingVertical: 8,
    paddingHorizontal: 1,
    borderBottomWidth:1,
    width:wp(50)
  },
  maxButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#4052D6',
    paddingHorizontal: 19,
    paddingVertical: 8,
    borderRadius: 8,
  },
  maxButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  swapButton: {
    alignSelf: 'center',
    marginVertical: -24,
    zIndex: 1,
    position:"relative",
    borderRadius: 20,
    width: 50,
    height: 50,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor:"#4052D6",
    borderWidth:1
  },
  detailsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
    marginHorizontal:wp(2.5),
    borderWidth:1
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  detailLabel: {
    color: '#BBBBBB',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  swapActionButton: {
    backgroundColor:"#4052D6",
    borderRadius: 16,
    marginBottom: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapActionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
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
    marginBottom:5,
    paddingHorizontal:10,
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
  tokenBalance: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  seprator:{
    marginHorizontal:wp(1),
    height:hp(3)
  },
  findContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  findIcon: {
    marginRight: 8,
  },
  findInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  headerCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: hp(1),
    marginHorizontal: wp(1.5)
  },
  optionContainer: {
    borderRadius: 30,
    padding: 10,
  },
  activeProviderContainer: {
    alignItems: "center",
    width: wp(60),
    borderRadius: 15,
    padding: 10,
    justifyContent: "center"
  },
  infoCon: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 10,
    marginVertical:hp(1.3),
    alignItems:"center",
    justifyContent:"space-between"
  },
  toggleCon: {
    padding: 2,
    justifyContent: 'center',
    width: 44,
    height: 26,
    borderRadius: 13,
  },
  toggleView: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  slippageCon: {
    alignItems: 'center',
    justifyContent:"center",
    height:hp(4),
    width:wp(14),
    borderRadius:10,
    marginRight:wp(2),
    borderColor:"#4052D6"
  },
});

export default AMMSwap;