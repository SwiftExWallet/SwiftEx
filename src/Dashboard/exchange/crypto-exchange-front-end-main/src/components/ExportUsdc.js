import { Modal, View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, TextInput, Image, Platform, Keyboard, Alert, BackHandler, TouchableWithoutFeedback, ScrollView } from 'react-native';
import Icon from "../../../../../icon";
import { FlatList } from 'native-base';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import WalletActivationComponent from '../utils/WalletActivationComponent';
import { Exchange_screen_header } from '../../../../reusables/ExchangeHeader';
import { useCallback, useEffect, useState } from 'react';
import { GetStellarAvilabelBalance, GetStellarUSDCAvilabelBalance, stellarWalletStatus } from '../../../../../utilities/StellarUtils';
import { alert } from '../../../../reusables/Toasts';
import { getChainTokenData, swapPepare } from '../../../../../utilities/AllbridgeUtil';
import { Keypair } from '@stellar/stellar-sdk';
import Snackbar from 'react-native-snackbar';
import { debounce } from 'lodash';
import AllbridgeTxTrack from './AllbridgeTxTrack';
import CustomInfoProvider from './CustomInfoProvider';
import { convertMultiple } from '../utils/UsdPriceHandler';
import { colors } from '../../../../../Screens/ThemeColorsConfig';
import { CHAINS } from '../../../../../utilities/TokenUtils'

const ExportUSDC = () => {
  const Focused = useIsFocused();
  const navigation = useNavigation();
  const state = useSelector((state) => state);
  const [stellarWalletActivated, setstellarWalletActivated] = useState(false);
  const [basicProccesing, setbasicProccesing] = useState(false);
  const [walletBalance, setwalletBalance] = useState('0.00');
  const [selectedReciveNetworkDetils,setselectedReciveNetworkDetils]=useState(Object.values(CHAINS)[0]);
  const [selectedReciveAssetDetils,setselectedReciveAssetDetils]=useState(Object.values(CHAINS)[0].bridgeSupportTokens[0]);
  const [chooseReciveAsset,setchooseReciveAsset]=useState(null);
  const [chooseReciveNetwork,setchooseReciveNetwork]=useState(null);
  const [amount,setamount] = useState('0.00');
  const [getInfo,setgetInfo]=useState(false);
  const [resQuotes,setresQuotes]=useState(null);
  const [btnLoading,setbtnLoading]=useState(false);
  const [XLMAvlBal,setXLMAvlBal]=useState("0");
  const [payFeeType,setPayFeeType]=useState("native");
  const [showTx,setshowTx]=useState(false);
  const [showTxHash,setshowTxHash]=useState([]);
  const [viewInUSD, setViewInUSD] = useState(false);
  const manageFeeViewer = () => setViewInUSD(prev => !prev);
  const [selectedNetworkDetils, setselectedNetworkDetils] = useState(CHAINS["STR"]);
  const [selectedAssetDetils, setselectedAssetDetils] = useState({
    name: "USDC",
    image: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
    type:"sendAsset",
    symbol:"USDC"
  });

  useEffect(() => {
    setshowTx(false);
    setshowTxHash([]);
    setstellarWalletActivated(false);
    setbasicProccesing(true);
    fetchStellarWalletdetails();
    setwalletBalance("0.00");
    setamount("");
    setchooseReciveAsset(null);
    setchooseReciveNetwork(null);
    setgetInfo(false);
    setresQuotes(null);
    setbtnLoading(false);
    setXLMAvlBal("0.0");
    setPayFeeType("native")
  }, [Focused])

  useEffect(() => {
    const replaceComma = amount.replace(',', '.');
    const numericText = replaceComma.replace(/[^0-9.]/g, '');
    if (parseFloat(numericText) === 0 || !numericText) {
      return;
    }
    getQuote(selectedReciveNetworkDetils.chainName, selectedNetworkDetils.chainName, selectedAssetDetils.symbol, amount);
  }, [chooseReciveAsset,chooseReciveNetwork])

  const fetchStellarWalletdetails = async () => {
    try {
      const walletStatus=await stellarWalletStatus(state?.STELLAR_PUBLICK_KEY)
      if (walletStatus) {
        setstellarWalletActivated(true);
        setbasicProccesing(false);
      }
      const fetchedUSDCBala = await GetStellarUSDCAvilabelBalance(state && state.STELLAR_PUBLICK_KEY, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
      if (!fetchedUSDCBala.status) {
        setwalletBalance(fetchedUSDCBala?.availableBalance);
        setbasicProccesing(false);
      }
      else {
        setbasicProccesing(false);
      }
      const fetchedXLMBal = await GetStellarAvilabelBalance(state && state.STELLAR_PUBLICK_KEY);
      if(fetchedXLMBal.availableBalance)
      {
        setXLMAvlBal(fetchedXLMBal.availableBalance);
      }else{
        setXLMAvlBal("0");
      }
    } catch (error) {
      console.log("Error fetching balance:", error);
    }
  }


  const handleWalletActivationComponent = () => {
    setstellarWalletActivated(false)
    // navigation.goBack()
  };

  const handleValueUpdater = (data,type) => {
    switch (type) {
      case "reciveNetwork":
        setselectedReciveNetworkDetils(data)
        setselectedReciveAssetDetils(CHAINS[data.symbol].bridgeSupportTokens[0])
        setchooseReciveNetwork(false)
        break;
      case "reciveAsset":
        setselectedReciveAssetDetils(data)
        setchooseReciveAsset(false)
        break;
      default:
        alert("error","Something went wrong.")
        break;
    }
  }

    const ChooseRenderItem = ( {item,type} ) => {
      return(
        <TouchableOpacity onPress={() => {handleValueUpdater(item.item,type)}} style={styles.chooseItemContainer}>
        <Image style={styles.chooseItemImage} source={{ uri: item.item.image||item.item.imageUrl||item.item.logoURI }} />
        <Text style={[styles.chooseItemText,{color:theme.headingTx}]}>{item.item.name}</Text>
      </TouchableOpacity>
      )
    };

  const handleInputChange = async (value) => {
    const replaceComma = value.replace(',', '.');
    const numericText = replaceComma.replace(/[^0-9.]/g, '');
    setamount(numericText)
    if (parseFloat(numericText) === 0 || !numericText) {
      return;
    }
    setgetInfo(true)
    getQuote(selectedNetworkDetils.chainName, selectedReciveNetworkDetils.chainName, selectedAssetDetils.symbol, selectedReciveAssetDetils.symbol,numericText);
  }

  const getQuote = useCallback(
    debounce(async (sourceChain,destChain,sourceToken,destToken,value) => {
      const qoutesRep = await getChainTokenData(sourceChain,destChain,sourceToken,destToken,value);
      if (qoutesRep.success) {
        // Keyboard.dismiss();
        // setgetInfo(false);
        const respo = await convertMultiple([
          {
            token:
              qoutesRep.info.fee.native.symbol === "Native"
                ? "XLM"
                : qoutesRep.info.fee.native.symbol,
            amount: qoutesRep.info.fee.native.amount,
          },
          {
            token: qoutesRep.info.fee.stablecoin.symbol,
            amount: qoutesRep.info.fee.stablecoin.amount,
          },
        ]);
        const mergedQuotes = { ...qoutesRep.info };
        for (const item of respo) {
          if (item.success) {
            const nativeToken =
              qoutesRep.info.fee.native.symbol === "Native"
                ? "XLM"
                : qoutesRep.info.fee.native.symbol;
            const stableToken = qoutesRep.info.fee.stablecoin.symbol;

            if (item.token === nativeToken) {
              mergedQuotes.fee.native = { ...mergedQuotes.fee.native, ...item };
            } else if (item.token === stableToken) {
              mergedQuotes.fee.stablecoin = { ...mergedQuotes.fee.stablecoin, ...item };
            }
          }
        }
        setresQuotes(mergedQuotes);
        Keyboard.dismiss();
        setgetInfo(false);
      } else {
        Keyboard.dismiss();
        alert("error", qoutesRep.error)
        setresQuotes(null);
        setgetInfo(false);
      }
    }, 1000),
    []
  );

  const swapExecute = async () => {
    try {
      setbtnLoading(true);
      Keyboard.dismiss();
      const stellarWallet = {
        publicKey: state && state.STELLAR_PUBLICK_KEY,
        secretKey: state && state.STELLAR_SECRET_KEY
      };
      const result = await swapPepare(
        selectedNetworkDetils.chainName,
        selectedReciveNetworkDetils.chainName,
        selectedAssetDetils.symbol,
        selectedReciveAssetDetils.symbol,
        amount,
        state && state.wallet && state.wallet.address,
        stellarWallet,
        payFeeType
      );
      console.log("swap-result----", result)
      if (result.success) {
        setshowTxHash([{ chain: "SRB", hash: showTxHash }]);
        // setshowTx(true);
        Snackbar.show({
          text: "USDC Exported successfully.",
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'green',
        });
        navigation.navigate("StellarTransactions")
        console.log("USDC Exported:-", result);
        setbtnLoading(false);
      } else {
        setshowTx(false);
        Snackbar.show({
          text: result.error||"USDC Exported Faild.",
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'red',
        });
        console.log("USDC Exported Faild:-", result);
        setbtnLoading(false);
      }
    } catch (error) {
      setshowTx(false);
      setbtnLoading(false);
      console.log("error in allbridge swap execute:", error)
      Snackbar.show({
        text: "USDC Exported Faild.",
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
      });
      console.log("USDC Exported Faild:-", result);
    }
  }
console.log("resQuotes-",resQuotes)
  const feeData = payFeeType === "native"
    ? resQuotes?.fee?.native
    : resQuotes?.fee?.stablecoin;


  
    const theme = state.THEME.THEME ? colors.dark : colors.light;

    const numericAmount = parseFloat(amount) || 0;
    const numericWalletBalance = parseFloat(walletBalance) || 0;
    const xlmFee = parseFloat(resQuotes?.fee?.native?.amount || 0);
    const stableFee = parseFloat(resQuotes?.fee?.stablecoin?.amount || 0);
    const noAmount = !amount || isNaN(Number(amount));
    const insufficientFunds = numericAmount > numericWalletBalance;
    const insufficientXLMFee = payFeeType === "native" && resQuotes && xlmFee > parseFloat(XLMAvlBal || 0);
    const insufficientStableFee = payFeeType === "stable" && resQuotes && stableFee > numericWalletBalance;
    const isProcessing = basicProccesing || btnLoading || getInfo;
    const isDisabled =
      noAmount ||
      isProcessing ||
      insufficientFunds ||
      insufficientXLMFee ||
      insufficientStableFee;
    const buttonColor = isDisabled ? 'gray' : '#4052D6';
    let buttonLabel = 'Confirm Transaction';
    if (insufficientXLMFee || insufficientStableFee) {
      buttonLabel = `Insufficient ${payFeeType === 'stable' ? 'USDC' : 'XLM'
        } to cover the fee`;
    } else if (insufficientFunds) {
      buttonLabel = 'Insufficient Funds';
    }
  return (
    <View style={[styles.container,{backgroundColor:theme.bg}]}>
      <Exchange_screen_header title="Bridge" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />
      <WalletActivationComponent
        isVisible={stellarWalletActivated}
        onClose={() => { handleWalletActivationComponent() }}
        onActivate={() => { setstellarWalletActivated(false) }}
        navigation={navigation}
        appTheme={true}
        shouldNavigateBack={true}
      />
      <ScrollView style={[styles.scrollCon,{backgroundColor:theme.bg}]}>
        <View style={[styles.card,{backgroundColor:theme.cardBg,flexDirection:"column"}]}>
        {/* Select network */}
        <View style={[styles.modalOpen,{backgroundColor:theme.bg}]}>
          <View style={{ flexDirection: "row" }}>
            <Image source={{ uri: selectedNetworkDetils.imageUrl }} style={styles.iconCon} />
            <View>
              <Text style={[styles.networkSubHeading,{color:theme.inactiveTx}]}>Network</Text>
              <Text style={[styles.networkHeading,{color:theme.headingTx}]}>{selectedNetworkDetils.name}</Text>
            </View>
          </View>
          {/* <Icon name={"chevron-down"} type={"materialCommunity"} color={theme.headingTx} size={30} /> */}
            <View style={{width:wp(26),alignItems:"flex-end"}}>
              <View style={{flexDirection:"row",alignItems:"center"}}>
                  {basicProccesing ? <ActivityIndicator color={"green"} /> :
                  <View style={{ width: wp(13) }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                     <Text style={{ color: theme.headingTx, fontSize: 14 }}>{XLMAvlBal==="Error"?"0.00":XLMAvlBal}</Text>
                  </ScrollView>
                  </View>
                  }
                <Text style={[ { color: theme.inactiveTx }]}> XLM</Text>
              </View>
              <View style={{flexDirection:"row",alignItems:"center"}}>
                  {basicProccesing ? <ActivityIndicator color={"green"} /> :
                  <View style={{ width: wp(14) }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                     <Text style={{ color: theme.headingTx, fontSize: 14 }}>{!walletBalance?"0.00":walletBalance}</Text>
                  </ScrollView>
                  </View>
                  }
                <Text style={[ { color: theme.inactiveTx }]}> USDC</Text>
              </View>
            </View>
        </View>
        </View>

        {/* perfect stellar usdc balance componet */}
        <View style={[styles.card,{backgroundColor:theme.cardBg,flexDirection:"column",borderBottomLeftRadius:0,borderBottomRightRadius:0}]}>
        <View style={[styles.rowBtnCon, { paddingVertical: hp(-0.5),backgroundColor:theme.cardBg }]}>
            <Text style={[styles.subInputText,{color:theme.inactiveTx,marginTop: hp(0)}]}>USDC Amount</Text>
            </View>
         <View style={[styles.modalOpen, { paddingVertical: hp(0.5),backgroundColor:theme.bg }]}>
            <TextInput maxLength={50} placeholder='Enter USDC Amount' placeholderTextColor={"gray"} keyboardType="numeric" value={amount} style={[styles.textInputForCrossChain,{fontSize: 18, color: theme.headingTx}]} onChangeText={(value) => { handleInputChange(value) }} returnKeyType="done" />
        </View>
        </View>

        {/* stellar address componet */}
        <View style={[styles.card,{backgroundColor:theme.cardBg,flexDirection:"column",borderTopLeftRadius:0,borderTopRightRadius:0,marginTop:-4,borderTopColor:theme.smallCardBorderColor,borderTopWidth:1}]}>
         <View style={styles.accountDetailsCon}>
         <Text style={[styles.subInputText, { color:theme.inactiveTx }]}>Active Wallet :</Text>
          <View style={{ width: "60%" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "99%" }}>
              <Text style={{ fontSize: 14, color: theme.headingTx }}>{state && state.STELLAR_PUBLICK_KEY}</Text>
            </ScrollView>
          </View>
         </View>


        </View>

        <View style={[styles.card,{backgroundColor:theme.cardBg,flexDirection:"column"}]}>
          <View style={{ flexDirection: "row", paddingLeft: wp(3) }}>
            <Icon name={"fire"} type={"materialCommunity"} size={25} color={"#4052D6"} />
            <Text style={[styles.subInputText, { fontSize: 16,color:theme.headingTx }]}> Relayer Fee</Text>
          </View>
            <View style={{flexDirection:"row"}}>
            <TouchableOpacity style={[styles.feePayCon,{backgroundColor:payFeeType==="native"?"#4052D6":theme.bg}]} onPress={()=>{setPayFeeType("native")}}>
              <Icon name={"fire"} type={"materialCommunity"} size={25} color={payFeeType==="native"?"#fff":"#4052D6"} />
              <Text style={[styles.feePayTx,{color: payFeeType==="native"?"#fff":theme.headingTx}]}>Native (XLM)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.feePayCon,{backgroundColor:payFeeType==="stable"?"#4052D6":theme.bg}]} onPress={()=>{setPayFeeType("stable")}}>
              <Icon name={"fire"} type={"materialCommunity"} size={25} color={payFeeType==="stable"?"#fff":"#4052D6"} />
              <Text style={[styles.feePayTx,{color: payFeeType==="stable"?"#fff":theme.headingTx}]}>Stable-Coin </Text>
            </TouchableOpacity>
            </View>
        </View>

        <View style={[styles.card,{backgroundColor:theme.cardBg,flexDirection:"column"}]}>
        <Text style={[styles.headingText,{color:theme.headingTx}]}>Export USDC to Wallet</Text>
        <View style={[styles.exportBottomCon]}>
          {/* Select recive network */}
        <TouchableOpacity style={[styles.exportCon,{backgroundColor:theme.bg}]} onPress={() => { setchooseReciveNetwork(true); }}>
          <View style={{ flexDirection: "row" }}>
            <Image source={{ uri: selectedReciveNetworkDetils.imageUrl }} style={styles.iconCon} />
            <View>
              <Text style={[styles.networkSubHeading,{color:theme.inactiveTx}]}>Network</Text>
              <Text style={[styles.networkHeading,{color:theme.headingTx}]}>{selectedReciveNetworkDetils.name}</Text>
            </View>
          </View>
          <Icon name={"chevron-down"} type={"materialCommunity"} color={theme.headingTx} size={30} />
        </TouchableOpacity>

        {/* Select recive network */}
        <TouchableOpacity style={[styles.exportCon,{backgroundColor:theme.bg}]} onPress={() => { setchooseReciveAsset(true); }}>
          <View style={{ flexDirection: "row" }}>
            <Image source={{ uri: selectedReciveAssetDetils.logoURI }} style={styles.iconCon} />
            <View>
              <Text style={[styles.networkSubHeading,{color:theme.inactiveTx}]}>Asset</Text>
              <Text style={[styles.networkHeading,{color:theme.headingTx}]}>{selectedReciveAssetDetils.name?.slice(0,8)}..</Text>
            </View>
          </View>
          <Icon name={"chevron-down"} type={"materialCommunity"} color={theme.headingTx} size={30} />
        </TouchableOpacity>
        </View>
        </View>

        {getInfo && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.loadingText}>Getting best quote...</Text>
          </View>
        )}

        {resQuotes !== null && <View style={[styles.modalQoutesCon,{backgroundColor:theme.cardBg}]}>
          <Text style={[styles.quoteTitle,{color:theme.headingTx}]}>Quote Details</Text>
          <View style={[styles.quoteDetailsContainer]}>
            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Provider</Text>
              <Text style={[styles.quoteValue,{color:theme.headingTx}]}>Allbridge</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Conversion Rate</Text>
              <Text style={[styles.quoteValue,{color:theme.headingTx}]}>
                1 {selectedAssetDetils.symbol} = {resQuotes.conversionRate} {selectedReciveAssetDetils.symbol}
              </Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Slippage</Text>
              <Text style={[styles.quoteValue,{color:theme.headingTx}]}>
                {resQuotes.slippageTolerance}%
              </Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Minimum Received</Text>
              <View style={{ width: wp(25), flexDirection: 'row' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={[styles.quoteValue,{color:theme.headingTx}]}>{resQuotes.minimumAmountOut}</Text>
                </ScrollView>
                <Text style={[styles.quoteValue,{color:theme.headingTx}]}>{selectedReciveAssetDetils.symbol}</Text>
              </View>
            </View>
          </View>

          <View style={styles.quoteRow}>
            <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Network Fee</Text>
            <TouchableOpacity onPress={manageFeeViewer}>
              <Text style={[styles.quoteValue,{color:theme.headingTx}]}>
                {`${feeData?.amount} ${feeData?.symbol}`}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quoteRow}>
            <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Network Fee (USD)</Text>
            <TouchableOpacity onPress={manageFeeViewer}>
              <Text style={[styles.quoteValue,{color:theme.headingTx}]}>
                {feeData?.formattedUSD || `$${Number(feeData?.usdValue || 0).toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quoteRow}>
            <Text style={[styles.quoteLabel,{color:theme.inactiveTx}]}>Estimated time</Text>
            <Text style={[styles.quoteValue,{color:theme.headingTx}]}>
              ~ {resQuotes?.completionTime}
            </Text>
          </View>

          <View style={[styles.quoteTextCon,{borderColor:theme.inactiveTx}]}>
            <Text style={[styles.quoteText,{color:theme.headingTx}]}>≈</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[styles.quoteText,{color:theme.headingTx}]}> {feeData?.symbol==="Native"?resQuotes.minimumAmountOut:Math.max(0,parseFloat(resQuotes.minimumAmountOut || "0")-parseFloat(resQuotes?.fee?.stablecoin?.amount || "0"))}</Text>
            </ScrollView>
            <Text style={[styles.quoteText,{color:theme.headingTx}]}>{selectedReciveAssetDetils.symbol}</Text>
          </View>
        </View>}

        <TouchableOpacity
          style={[styles.confirmButton, { backgroundColor: buttonColor }]}
          disabled={isDisabled}
          onPress={swapExecute}
        >
          {isProcessing ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.confirmButtonText}>{buttonLabel}</Text>
          )}
        </TouchableOpacity>


        {/* perfect recive network selection */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={chooseReciveNetwork}
        >
          <TouchableOpacity style={styles.chooseModalContainer} onPress={() => setchooseReciveNetwork(false)}>
            <View style={[styles.chooseModalContent,{backgroundColor:theme.cardBg}]}>
              <Text style={{ fontSize: 20, fontWeight: "bold", marginVertical: hp(1), color: theme.headingTx }}>Choose Network</Text>
              <FlatList
                data={Object.values(CHAINS).filter(item=>item.bridgeEnable===true)}
                renderItem={(t)=>{return <ChooseRenderItem item={t} type={"reciveNetwork"}/>}}
                keyExtractor={(item,index) => index}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        {/* perfect recive Asset selection */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={chooseReciveAsset}
        >
          <TouchableOpacity style={styles.chooseModalContainer} onPress={() => setchooseReciveAsset(false)}>
            <View style={[styles.chooseModalContent,{backgroundColor:theme.cardBg}]}>
              <Text style={{ fontSize: 20, fontWeight: "bold", marginVertical: hp(1), color: theme.headingTx }}>Choose Asset</Text>
              <FlatList
                data={CHAINS[selectedReciveNetworkDetils.symbol].bridgeSupportTokens}
                renderItem={(t)=>{ return <ChooseRenderItem item={t} type={"reciveAsset"}/>}}
                keyExtractor={(item,index) => index}
              />
            </View>
          </TouchableOpacity>
        </Modal>
        </ScrollView>
      <View style={styles.allBridgeTxCon}>
        <AllbridgeTxTrack txs={showTxHash} isDarkMode={state?.THEME?.THEME} showTx={showTx} closeTx={()=>{setshowTx(false)}} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#011434",
    width: wp(100),
    height: hp(100)
  },
  scrollCon: {
    paddingHorizontal:wp(3.5)
  },
  headingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight:"400",
    textAlign: "left",
    paddingLeft: wp(5)
  },
  subInputText: {
    color: "#94A3B8",
    fontSize: 15,
  },
  feePayTx: {
    fontSize: 16,
    fontWeight:"600"
  },
  maxBtn: {
    color: "#FFF",
    fontSize: 16,
  },
  maxCon: {
    backgroundColor: "#4052D6",
    borderRadius: 10,
    paddingVertical:5,
    paddingHorizontal: wp(5),
  },
  modalOpen: {
    width: '93%',
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    alignSelf: "center",
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(3)
  },
  exportBottomCon: {
    width: '100%',
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    alignSelf: "center",
    marginTop:12,
    paddingVertical: hp(0),
    paddingHorizontal: wp(3.9)
  },
  exportCon: {
    width: wp(41),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0D2041",
    borderRadius: 10,
    alignSelf: "center",
    paddingVertical: hp(1.4),
    paddingHorizontal: wp(3)
  },
  rowBtnCon: {
    width: '93%',
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    alignSelf: "center",
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(2)
  },
  modalQoutesCon: {
    width: '100%',
    flexDirection: "column",
    justifyContent: "space-between",
    backgroundColor: "#0D2041",
    marginTop: hp(1),
    borderRadius: 10,
    alignSelf: "center",
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(3.6)
  },
  chooseModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: 'center',
  },
  chooseModalContent: {
    backgroundColor: 'rgba(33, 43, 83, 1)',
    padding: 20,
    borderRadius: 10,
    width: wp(99),
    maxHeight: '80%',
  },
  chooseItemContainer: {
    marginVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.9,
    borderBlockEndColor: '#fff',
    marginBottom: hp(0.5),
    paddingBottom: hp(2)
  },
  chooseItemImage: {
    width: 39,
    height: 39,
    resizeMode: 'contain',
    marginVertical: 3,
  },
  chooseItemText: {
    marginLeft: 10,
    fontSize: 24,
    color: '#fff',
  },
  iconCon: {
    height: 39,
    width: 39,
    marginRight: 3
  },
  iconAssetCon: {
    height: 21,
    width: 21,
    bottom:-20,
    zIndex:20,
    left:-18
  },
  networkHeading: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: wp(1.3),
    marginTop: hp(-0.1)
  },
  networkSubHeading: {
    color: "#94A3B8",
    fontSize: 13,
    marginLeft: wp(1.3)
  },
  quoteTextCon: {
    flexDirection: "row",
    padding: 9,
    borderWidth:1,
    borderRadius: 8,
  },
  quoteText: {
    fontSize: 20,
    color: '#fff',
    borderRadius: 8,
    fontWeight:"600"
  },
  quoteDetailsContainer: {
    paddingHorizontal: 1,
    borderRadius: 8,
  },
  quoteTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#fff',
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quoteLabel: {
    fontSize: 14,
    color: 'silver',
    fontWeight:"500"
  },
  quoteValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  loadingText: {
    marginTop: 8,
    color: 'silver',
  },
  confirmButton: {
    width: wp(93),
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    marginTop: 10,
    alignSelf: "center",
    height:hp(6.4),
    marginBottom: hp(10),
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight:"bold"
  },
  feePayCon:{
   flexDirection: "row",
   marginLeft:10,
   paddingVertical:hp(1),
   paddingHorizontal:wp(2),
   borderRadius:10,
   maxWidth:wp(38),
   alignItems:"center",
   justifyContent:"center",
   marginTop:8
  },
  allBridgeTxCon:{
    zIndex:20,
    position:"absolute",
    width:"100%",
    maxHeight:"50%",
    bottom:25
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#2b3c57",
    borderRadius: 10,
    paddingVertical:hp(1.9),
    marginVertical: hp(0.5),
    justifyContent: "space-between",
  },
  accountDetailsCon:{
    flexDirection:"row",
    justifyContent:"space-between",
    paddingHorizontal:wp(4.5)
  },
  textInputForCrossChain:{
    width:"100%",
    paddingHorizontal: wp(2),
    paddingVertical:  Platform.OS=="android"?hp(1):hp(2),
  },
});
export default ExportUSDC;