import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, Image, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, TouchableWithoutFeedback, FlatList, Platform } from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../icon";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { PORTFOLIO_CONFIG, RAPID_STELLAR, SET_ASSET_DATA, WALLET_ACTIVATION_SHOW } from "../components/Redux/actions/type";
import { enableBiometrics } from "../biometrics/biometric";
import { STELLAR_URL } from "./constants";
import LinearGradient from "react-native-linear-gradient";
import * as StellarSdk from '@stellar/stellar-sdk';
import Modal from "react-native-modal";
import { colors } from '../Screens/ThemeColorsConfig';
import { CHAINS, GetWalletTokens, TemporaryTokens } from '../utilities/TokenUtils';
import CustomInfoProvider from './exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import InfoComponent from './exchange/crypto-exchange-front-end-main/src/components/InfoComponent';
import { useAssetManager } from '../utilities/TokenManageHook';

function InvestmentChart() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const state = useSelector((state) => state);
  const wallet = useSelector((state) => state.wallet);
  const dispatch = useDispatch();
  const [pull, setPull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [tokenInfoList, setTokenInfoList] = useState([]);
  const [showCustomInfo,setshowCustomInfo]=useState(false);
  const { mergeWithApiTokens } = useAssetManager(`${wallet?.address}_${state?.STELLAR_PUBLICK_KEY}`);
  const avilableSoonAsset={
    chain: 'BTC',
    name: 'Bitcoin',
    symbol: 'BTC',
    balance: 0.000,
    balanceUSD: 0.00000,
    decimals: 7,
    contractAddress: 'Native',
    price: 0.0000,
    imageUrl: "https://tokens.pancakeswap.finance/images/0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c.png"
  };

  useEffect(() => {
    let isMounted = true;
    async function checkBiometric() {
      try {
        const res = await AsyncStorage.getItem("AppStatusChecks");
        const response = JSON.parse(res);
        if (response.isRestricted || response.maintenance === "true") {
          navigation.navigate("AppCheck", { info: response.isRestricted ? 0 : 1 });
        }
        const biometric = await AsyncStorage.getItem('Biometric');
        if (isMounted) {
          if (biometric !== 'SET') {
            setShowAuthModal(true);
          }
        }
      } catch (error) {
        console.log('Biometric check error', error);
      }
    }
    const initService = async () => {
      await fetchDataDispatch();
      try {
        if (wallet && wallet.address && state && state.STELLAR_PUBLICK_KEY) {
        const walletInfo = await GetWalletTokens(wallet?.address,state.STELLAR_PUBLICK_KEY,state.DYDX_ADDRESS_KEY);
        if (walletInfo.tokens.length > 1) {
          const userCustomTokens=await getCustomTokens()
          const margeArray=[...walletInfo.tokens,avilableSoonAsset,...(userCustomTokens.status ? userCustomTokens.data : [])]
          setTokenInfoList(margeArray);
          setLoading(false);
        }
      }
      } catch (error) {
        console.log("walletInfo-error", error);
        CustomInfoProvider.show("info", "Portfolio currently unavailable, please try again");
      }
    }
    initService();
    checkBiometric();
    return () => { isMounted = false; };
  }, []);

  const getCustomTokens = async () => {
    try {
      const data = await AsyncStorage.getItem(`user-custom-tokens-${wallet?.address}`);
      if (data) {
        const allParsedToken = JSON.parse(data);
        return {
          status: true,
          data: allParsedToken
        };
      } else {
        return {
          status: false,
          data: []
        };
      }
    } catch (error) {
      console.log('getCustomTokens error get all data', error);
      return {
        status: false,
        data: []
      };
    }
  }

  useEffect(() => {
    dispatch({
      type: PORTFOLIO_CONFIG,
      payload: {
        isTotalInUSDVisible: true,
        totalInUSD: 0.0
      }
    }); 
    setTokenInfoList(TemporaryTokens);
    const initService = async () => {
      await fetchDataDispatch();
      if (wallet?.address && state?.STELLAR_PUBLICK_KEY) {
        try {
          const storedData = await AsyncStorage.getItem('myDataKey');
          const parsedData = JSON.parse(storedData);
          let matchedData = parsedData.find((item) => item.Ether_address === wallet.address);
          if (!matchedData) {
            const preser_backup = await AsyncStorage.getItem('wallet_backup');
            matchedData = parsedData.find((item) => item.Ether_address === preser_backup);
          }
          const walletInfo = await GetWalletTokens(wallet?.address,matchedData?matchedData?.publicKey:state?.STELLAR_PUBLICK_KEY,state.DYDX_ADDRESS_KEY);
          if (walletInfo.tokens.length > 1) {
            const userCustomTokens=await getCustomTokens()
            const margeArray=[...walletInfo.tokens,...(userCustomTokens.status ? userCustomTokens.data : []),avilableSoonAsset]
            await mergeWithApiTokens(margeArray)
            setTokenInfoList(margeArray);
            setLoading(false);
            dispatch({
              type: PORTFOLIO_CONFIG,
              payload: {
                isTotalInUSDVisible: true,
                totalInUSD: walletInfo.totalValueUSD
              }
            });
          }
        } catch (error) {
          console.error("walletInfo_error", error);
          CustomInfoProvider.show("info", "Portfolio currently unavailable, please try again");
        }
      }
    }
    initService();
  }, [state.STELLAR_PUBLICK_KEY, wallet.address, wallet.name, pull]);

  const dispatchStellarData = useCallback(
    (matchedData, account, isActive) => {
      dispatch({
        type: SET_ASSET_DATA,
        payload: account.balances,
      });
      dispatch({
        type: RAPID_STELLAR,
        payload: {
          ETH_KEY: matchedData.Ether_address,
          STELLAR_PUBLICK_KEY: matchedData.publicKey,
          STELLAR_SECRET_KEY: matchedData.secretKey,
          STELLAR_ADDRESS_STATUS: isActive,
          DYDX_PUBLIC_KEY:matchedData.dydxPublicKey,
          DYDX_ADDRESS_KEY:matchedData.dydxAddress,
        },
      });
      dispatch({
        type: WALLET_ACTIVATION_SHOW,
        payload: {
          walletActivationShow: true
        }
      });
    }, [dispatch]);

  const loadStellarAccount = useCallback(
    async (matchedData) => {
      try {
        StellarSdk.Networks.PUBLIC;
        const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
        const account = await server.loadAccount(matchedData.publicKey);
        dispatchStellarData(matchedData, account, true);
        console.log('Dispatched success');
      } catch (error) {
        console.log('Error loading account:', error);
        dispatchStellarData(matchedData, { balances: [] }, false);
        console.log('Error: Stellar account needs activation');
      }
    }, [dispatchStellarData]);

  const fetchDataDispatch = useCallback(async () => {
    try {
      const user = await AsyncStorage.getItem("user");
      const storedData = await AsyncStorage.getItem('myDataKey');
      if (!storedData) {
        console.log('No data found for key stellar keys to dispatch');
        return;
      }
      const parsedData = JSON.parse(storedData);
      let matchedData = parsedData.find((item) => item.Ether_address === wallet.address);

      if (!matchedData) {
        const preser_backup = await AsyncStorage.getItem('wallet_backup');
        matchedData = parsedData.find((item) => item.Ether_address === preser_backup);
      }

      if (matchedData) {
        await loadStellarAccount(matchedData);
      } else {
        console.log('No matching wallet data found');
      }
    } catch (error) {
      console.log('Error retrieving data:', error);
    } finally {
      setPull(false);
    }
  }, [wallet.address, loadStellarAccount]);

  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const renderTokens = useCallback(
    ({ item, index }) => {
      const balanceValue = parseFloat(item.balance) || 0;
      const priceValue = parseFloat(item.price) || 0;
      const balanceUSD = (balanceValue * priceValue).toFixed(5);
      return (
        <TouchableOpacity
          style={[styles.coinCard, { backgroundColor: theme.cardBg }]}
          onPress={() => {item.chain==="BTC"?setshowCustomInfo(true):navigation.navigate('Asset_info', { asset_type: item })}}
          key={index.toString()}
        >
          <View style={styles.coinContent}>
            <View style={[styles.coinIcon, { backgroundColor: '#F7931A1A' }]}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.coinImage} />
              ) : (
                item.symbol?.toLowerCase()==="usdc"?
                <Image source={{ uri: CHAINS["ARB"].bridgeSupportTokens[1].logoURI }} style={styles.coinImage} />:item.symbol?.toLowerCase()==="usdt"?<Image source={{ uri: CHAINS["ARB"].bridgeSupportTokens[0].logoURI }} style={styles.coinImage} />:
                <LinearGradient
                  colors={['#3b82f6', '#8b5cf6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientIcon}
                >
                  <Text style={styles.iconLetter}>{item.name?.charAt(0)}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.coinInfo}>
              <View style={styles.tokenHeader}>
                <Text style={[styles.coinName, { color: theme.headingTx }]}>
                  {item.symbol?.toUpperCase()}
                </Text>
                <Text style={[styles.networkBadge, { color: theme.inactiveTx }]}>({item.chain})</Text>
              </View>
              <Text style={[styles.coinPrice, { color: theme.inactiveTx }]}>{item.chain==="BTC"?"Direct wallet support coming soon.":"$"+priceValue}</Text>
            </View>
            <View style={styles.balanceSection}>
              <Text style={[styles.balanceAmount, { color: theme.headingTx }]}>
                {state&&state.isTotalInUSDVisible?balanceValue.toFixed(3):"X.XXX"}
              </Text>
              <Text style={[styles.balanceUsd, { color: theme.inactiveTx }]}>
                {state&&state.isTotalInUSDVisible?"$"+balanceUSD:"$X.XXXXX"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [navigation, state.THEME.THEME, state.isTotalInUSDVisible,state.activeWalletPortFolio],
  );

  return (
    <View style={[styles.watchlistCon, { backgroundColor: theme.bg }]}>
      <InfoComponent visible={showCustomInfo} type='' message='Direct BTC wallet support is not yet available. You can still access BTC through on-chain swaps via SDEX.' onClose={()=>{setshowCustomInfo(false)}} />
        {loading ? (
        <View style={styles.waitCon}>
          <ActivityIndicator color="#5B6FED" size="large" />
          <Text style={[styles.waitConTxt,{color:theme.inactiveTx}]}>Hang tight — loading your portfolio..</Text>
        </View>
        ) : (
          <>
          <FlatList
              data={(state && state.activeWalletPortFolio && state.activeWalletPortFolio.tokens || state && state.activeWalletPortFolio)?.filter(data => (data.active && data.contractAddress === "Native") || (data.contractAddress !== "Native" && data.active && parseFloat(data.balance) > 0)) ?? tokenInfoList}
            renderItem={renderTokens}
            keyExtractor={(item, index) => index.toString()}
            initialNumToRender={39}
            maxToRenderPerBatch={39}
            windowSize={10}
            refreshControl={
              <RefreshControl
                refreshing={pull}
                tintColor="#4CA6EA"
                onRefresh={() => {
                  setPull(true);
                  fetchDataDispatch();
                }}
              />
            }
            // contentContainerStyle={{ paddingBottom: hp(33) }}
          />
        </>
        )}
        <Modal
          animationType="slide"
          isVisible={showAuthModal}
          onRequestClose={() => setShowAuthModal(false)}
          useNativeDriver
          useNativeDriverForBackdrop
          hideModalContentWhileAnimating
          onBackdropPress={() => setShowAuthModal(false)}
          onBackButtonPress={() => setShowAuthModal(false)}
          style={styles.accountContainer}
        >
          <TouchableWithoutFeedback onPress={() => setShowAuthModal(false)}>
            <View style={[styles.AccountmodalContainer, { backgroundColor: theme.cardBg }]}>
              <Icon name="alert-circle-outline" type="materialCommunity" size={60} color="orange" />
              <Text style={[styles.AccounheadingContainer, { color: theme.headingTx }]}>
                Activate {Platform.OS === 'android' ? 'Biometric Authentication' : 'Face ID Authentication'}
              </Text>
              <Text
                style={[
                  styles.AccounheadingContainer,
                  { fontSize: 15, color: theme.headingTx, textAlign: 'center', marginTop: 3 },
                ]}
              >
                Keep your crypto safe without slowing down.
                {'\n'}
                Quick access with fingerprint or Face ID.
              </Text>
              <View style={styles.authBtnCon}>
                <TouchableOpacity
                  style={styles.AccounbtnContainer}
                  onPress={() => {
                    setShowAuthModal(false);
                    enableBiometrics();
                  }}
                >
                  <Text style={styles.Accounbtntext}>Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.AccounbtnSkipContainer} onPress={() => setShowAuthModal(false)}>
                  <Text style={[styles.Accounbtntext, { color: 'gray' }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
    </View>
  );
}

export default React.memo(InvestmentChart);


const styles = StyleSheet.create({
  waitCon:{
    justifyContent:"center",
    alignItems:"center",
    marginTop: 10
  },
  waitConTxt:{
    fontSize: 18.5,
    fontWeight: "300",
    marginTop: hp(1),
  },
  authBtnCon: {
    paddingHorizontal: 1,
    marginTop: 10,
    alignItems: 'center'
  },
  flatlistContainer: {
    flexDirection: "row",
    marginVertical: hp(3),
    width: "80%",
    justifyContent: "space-between",
    alignItems: "center",
    width: wp(90),
    alignSelf: "center",
    marginBottom: 0,
  },
  img: {
    height: hp(5),
    width: wp(10),
    borderWidth: 1,
    borderRadius: hp(3)
  },
  accountContainer: {
    justifyContent: "flex-end",
    margin: 0,
    backgroundColor: "rgba(0, 0, 0, 0.2)"
  },
  Accounbtntext: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff"
  },
  AccounheadingContainer: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 10,
    color: "#fff"
  },
  watchlistCon: {
    backgroundColor: "rgba(244, 244, 244, 1)",
    width: "100%",
    height: "100%",
    paddingHorizontal: 0,
  },
  coinCard: {
    marginBottom: 5,
    padding: 10,
    paddingHorizontal: 17
  },
  coinContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  coinIcon: {
    width: 59,
    height: 59,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  coinImage: {
    width: 45,
    height: 45,
    borderRadius: 20,
  },
  gradientIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLetter: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  coinInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  coinName: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 4,
  },
  coinPrice: {
    fontSize: 15,
    color: "#888",
    marginRight: 8,
  },
  tokenHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  networkBadge: {
    fontSize: 10,
    color: "#888",
    marginLeft: 6,
  },
  balanceSection: {
    alignItems: "flex-end",
    marginRight: 18,
    minWidth: 80,
  },
  balanceAmount: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 2,
  },
  tradeButton: {
    backgroundColor: "#5B6FED",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
  },
  tradeButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  avilableSoonBtnTxt:{
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign:"center"
  },
  avilableSoonBtnCon: {
    backgroundColor: "#FF9800",
    borderRadius: 10,
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  AccountmodalContainer: {
    paddingVertical: hp(3),
    paddingHorizontal: wp(2),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    alignItems: "center",
  },
  AccounbtnContainer: {
    width: wp(90),
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#5B65E1"
  },
  AccounbtnSkipContainer: {
    marginTop: 5
  },
  topHeaderCon: {
    flexDirection: "row",
    alignItems:"center",
    justifyContent:"space-evenly",
    paddingVertical:hp(0.6),
    borderTopLeftRadius:20,
    borderTopRightRadius:20,
    marginBottom:hp(0.2)
  },
  topHeaderTxt:{
    width: wp(20),
    textAlign:"center",
    fontSize:16,
    fontWeight:"500",
    paddingVertical:hp(0.5)
  },

});