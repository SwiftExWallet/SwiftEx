import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [tokenInfoList, setTokenInfoList] = useState([]);
  const [showCustomInfo,setshowCustomInfo]=useState(false);
  const { mergeWithApiTokens } = useAssetManager(`${wallet?.address}_${state?.STELLAR_PUBLICK_KEY}`);
  const activeRequestWalletRef = useRef(null);

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
        const storedData = await AsyncStorage.getItem('myDataKey');
        const parsedData = storedData ? JSON.parse(storedData) : [];
        let matchedData = parsedData.find((item) => item.Ether_address === wallet?.address);
        if (!matchedData) {
          const preser_backup = await AsyncStorage.getItem('wallet_backup');
          matchedData = parsedData.find((item) => item.Ether_address === preser_backup);
        }
        const dydxKeyToUse = matchedData?.dydxAddress || state.DYDX_ADDRESS_KEY;

        if (wallet && wallet.address && state && state.STELLAR_PUBLICK_KEY) {
          const walletInfo = await GetWalletTokens(wallet?.address, state.STELLAR_PUBLICK_KEY, dydxKeyToUse);
          if (isMounted && Array.isArray(walletInfo?.tokens)) {
            const userCustomTokens = await getCustomTokens();
            const margeArray = [...walletInfo.tokens, avilableSoonAsset, ...(userCustomTokens.status ? userCustomTokens.data : [])];
            setTokenInfoList(margeArray);
            setLoading(false);
          }
        }
      } catch (error) {
        console.log("walletInfo-error", error);
        CustomInfoProvider.show("info", "Portfolio currently unavailable, please try again");
        if (isMounted) setLoading(false);
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
    setLoading(true);
    setTokenInfoList(TemporaryTokens);

    dispatch({
      type: PORTFOLIO_CONFIG,
      payload: {
        isTotalInUSDVisible: true,
        totalInUSD: 0.0,
        totalStellarInUSD: 0.0,
      }
    });

    const requestForWallet = wallet?.address;
    activeRequestWalletRef.current = requestForWallet;

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

          const stellarKeyToUse = matchedData ? matchedData.publicKey : state.STELLAR_PUBLICK_KEY;
          const dydxKeyToUse = matchedData?.dydxAddress || state.DYDX_ADDRESS_KEY;
          const walletInfo = await GetWalletTokens(wallet?.address, stellarKeyToUse, dydxKeyToUse);

          if (activeRequestWalletRef.current !== requestForWallet) return;

          if (Array.isArray(walletInfo?.tokens)) {
            const userCustomTokens = await getCustomTokens();
            const margeArray = [...walletInfo.tokens, ...(userCustomTokens.status ? userCustomTokens.data : []), avilableSoonAsset];
            await mergeWithApiTokens(margeArray);
            setTokenInfoList(margeArray);
            setLoading(false);
            dispatch({
              type: PORTFOLIO_CONFIG,
              payload: {
                isTotalInUSDVisible: true,
                totalInUSD: walletInfo.totalValueUSD,
                totalStellarInUSD: walletInfo.totalSTRUSD,
              }
            });
          }
        } catch (error) {
          console.error("walletInfo_error", error);
          CustomInfoProvider.show("info", "Portfolio currently unavailable, please try again");
          if (activeRequestWalletRef.current === requestForWallet) setLoading(false);
        }
      } else {
        setLoading(false);
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
          DYDX_PUBLIC_KEY: matchedData.dydxPublicKey,
          DYDX_ADDRESS_KEY: matchedData.dydxAddress,
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
      const balanceUSD = (balanceValue * priceValue).toFixed(2);
      const isDark = state.THEME.THEME !== false;

      return (
        <TouchableOpacity
          style={[styles.coinCard, { backgroundColor: theme.cardBg }]}
          onPress={() => {
            item.chain === "BTC"
              ? setshowCustomInfo(true)
              : navigation.navigate('Asset_info', { asset_type: item })
          }}
          key={index.toString()}
        >
          <View style={styles.coinContent}>
            <View style={[styles.coinIcon, { backgroundColor: isDark ? '#1C1E2B' : '#F0F0F0' }]}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.coinImage} />
              ) : item.symbol?.toLowerCase() === "usdc" || item.symbol?.toLowerCase() === "usdt" ? (
                <Image
                  source={{ uri: item.symbol?.toLowerCase() === "usdc" ? CHAINS["ARB"].bridgeSupportTokens[1].logoURI : CHAINS["ARB"].bridgeSupportTokens[0].logoURI }}
                  style={styles.coinImage}
                />
              ) : (
                <LinearGradient
                  colors={['#3b82f6', '#8b5cf6']}
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
                <View style={[styles.badgeContainer, { backgroundColor: isDark ? '#2C2E3A' : '#E5E5E5' }]}>
                  <Text style={[styles.badgeText, { color: theme.inactiveTx }]}>
                    {item.chain}
                  </Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <Text style={[styles.coinPrice, { color: theme.inactiveTx }]}>
                  {item.chain === "BTC" ? "Coming soon" : "$" + priceValue.toLocaleString()}
                </Text>
                {item.change && (
                  <Text style={styles.percentageText}>▴ {item.change}%</Text>
                )}
              </View>
            </View>

            <View style={styles.rightSection}>
              <View style={styles.balanceSection}>
                <Text style={[styles.balanceAmount, { color: theme.headingTx }]}>
                  {state && state.isTotalInUSDVisible ? balanceValue.toFixed(3) : "X.XXX"}
                </Text>
                <Text style={[styles.balanceUsd, { color: theme.inactiveTx }]}>
                  {state && state.isTotalInUSDVisible ? "$" + balanceUSD : "$X.XX"}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                type="material"
                size={30}
                color={isDark ? "gray" : "#CCC"}
              />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [navigation, state.THEME.THEME, state.isTotalInUSDVisible, state.activeWalletPortFolio, theme],
  );

  return (
    <View style={[styles.watchlistCon, { backgroundColor: theme.bg }]}>
      <InfoComponent visible={showCustomInfo} type='' message='Direct BTC wallet support is not yet available. You can still access BTC through on-chain swaps via SDEX.' onClose={() => { setshowCustomInfo(false) }} />
        {/* {loading ? (
        <View style={styles.waitCon}>
          <ActivityIndicator color="#5B6FED" size="large" />
          <Text style={[styles.waitConTxt, { color: theme.inactiveTx }]}>Hang tight — loading your portfolio..</Text>
        </View>
        ) : ( */}
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
            contentContainerStyle={{ paddingBottom: hp(10) }}
          />
        </>
        {/* )} */}
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
  coinCard: {
    marginBottom: 8,
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 16,
    marginHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  coinContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  coinIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  coinImage: {
    width: 40,
    height: 40,
    borderRadius: 15,
  },
  gradientIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLetter: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  coinInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  tokenHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  coinName: {
    fontSize: 17,
    fontWeight: "700",
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinPrice: {
    fontSize: 14,
  },
  percentageText: {
    fontSize: 14,
    color: "#4ADE80",
    marginLeft: 6,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceSection: {
    alignItems: "flex-end",
    marginRight: 1,
  },
  balanceAmount: {
    fontSize: 17,
    fontWeight: "700",
  },
  balanceUsd: {
    fontSize: 14,
    marginTop: 2,
  },
  watchlistCon: {
    flex: 1,
    width: "100%",
  },
  waitCon: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20
  },
  waitConTxt: {
    fontSize: 18,
    fontWeight: "400",
    marginTop: hp(1),
  },
  authBtnCon: {
    paddingHorizontal: 1,
    marginTop: 10,
    alignItems: 'center'
  },
  flatlistContainer: {
    flexDirection: "row",
    marginVertical: hp(2),
    width: wp(90),
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "center",
  },
  accountContainer: {
    justifyContent: "flex-end",
    margin: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  },
  AccountmodalContainer: {
    paddingVertical: hp(3),
    paddingHorizontal: wp(2),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    alignItems: "center",
    backgroundColor: '#0B0B0F'
  },
  AccounbtnContainer: {
    width: wp(90),
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#5B65E1"
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
    color: "#fff",
    textAlign: 'center'
  },
  AccounbtnSkipContainer: {
    marginTop: 10
  },
  topHeaderCon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: hp(1),
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: hp(0.5)
  },
  topHeaderTxt: {
    width: wp(25),
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
  img: {
    height: hp(5),
    width: wp(10),
    borderWidth: 1,
    borderRadius: hp(3)
  },
  avilableSoonBtnCon: {
    backgroundColor: "#FF9800",
    borderRadius: 10,
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  avilableSoonBtnTxt: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center"
  },
});