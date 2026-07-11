import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  BackHandler,
  FlatList,
  Image,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSelector } from "react-redux";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from "../../../../../icon";
import { alert } from "../../../../reusables/Toasts";
import { LineChart } from "react-native-gifted-charts";
import Clipboard from "@react-native-clipboard/clipboard";
import SELECT_WALLET_EXC from "../../../../Modals/SELECT_WALLET_EXC";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import { Charts_Loadings, Exchange_single_loading } from "../../../../reusables/Exchange_loading";
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import CandleStickChart from "./stellar/CommanCandleStickChart";
import PnlOverView from "../../../../reusables/PnlOverView";


export const HomeView = () => {
  const prvValue = useRef(null);
  const [openChartApi, setOpenChartApi] = useState(false);
  const [visibleSelectWallet, setVisibleSelectWallet] = useState(false);
  const [chartIndex, setChartIndex] = useState(0);
  const [stellarKey, setStellarKey] = useState(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [apiData, setApiData] = useState([]);
  const [walletType, setWalletType] = useState(null);
  const [apiDataLoading, setApiDataLoading] = useState(false);
  const [lineColor, setLineColor] = useState("#44bd32");
  const [pointsData, setPointsData] = useState(0);
  const [pointsDataTime, setPointsDataTime] = useState("");
  const state = useSelector((state) => state);
  const navigation = useNavigation();
  const animation = useRef(new Animated.Value(0)).current;
  const focusedScreen = useIsFocused();

  const CHART_API = [
    { id: 0, name: "XLM", name_0: "USDC", url: "https://horizon.stellar.lobstr.co/trade_aggregations?base_asset_type=native&counter_asset_type=credit_alphanum4&counter_asset_code=USDC&counter_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&start_time=1722320811000&resolution=60000&offset=0&limit=30&order=desc", img_0: 'https://s2.coinmarketcap.com/static/img/coins/64x64/512.png', img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" },
    { id: 1, name: "ETH", name_0: "USDC", url: "https://horizon.stellar.lobstr.co/trade_aggregations?base_asset_type=credit_alphanum4&base_asset_code=ETH&base_asset_issuer=GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC&counter_asset_type=credit_alphanum4&counter_asset_code=USDC&counter_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&start_time=1722320811000&resolution=60000&offset=0&limit=30&order=desc", img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png", img_0: "https://tokens.pancakeswap.finance/images/0x2170Ed0880ac9A755fd29B2688956BD959F933F8.png" },
    { id: 2, name: "XLM", name_0: "EURC", url: "https://horizon.stellar.lobstr.co/trade_aggregations?base_asset_type=native&counter_asset_type=credit_alphanum4&counter_asset_code=EURC&counter_asset_issuer=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2&start_time=1722322255000&resolution=60000&offset=0&limit=30&order=desc", img: "https://assets.coingecko.com/coins/images/26045/thumb/euro-coin.png?1655394420", img_0: 'https://s2.coinmarketcap.com/static/img/coins/64x64/512.png' },
    { id: 3, name: "USDC", name_0: "EURC", url: "https://horizon.stellar.org/trade_aggregations?base_asset_type=credit_alphanum4&base_asset_code=USDC&base_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&counter_asset_type=credit_alphanum4&counter_asset_code=EURC&counter_asset_issuer=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2&start_time=1722229906000&resolution=900000&offset=0&limit=30&order=desc", img: "https://assets.coingecko.com/coins/images/26045/thumb/euro-coin.png?1655394420", img_0: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" },
  ]

  const PAIRS = [
    {
      id: 1,
      name: "XLM/USDC",
      base_value: "USDC",
      counter_value: "native",
      visible_0: "XLM",
      visible_1: "USDC",
      visible0Issuer: "native",
      visible1Issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    },
    {
      id: 2,
      name: "ETH/USDC",
      base_value: "USDC",
      counter_value: "ETH",
      visible_0: "ETH",
      visible_1: "USDC",
      visible0Issuer: "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC",
      visible1Issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    },
    {
      id: 3,
      name: "XLM/EURC",
      base_value: "EURC",
      counter_value: "native",
      visible_0: "XLM",
      visible_1: "EURC",
      visible0Issuer: "native",
      visible1Issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2"
    },
    {
      id: 4,
      name: "USDC/EURC",
      base_value: "EURC",
      counter_value: "USDC",
      visible_0: "USDC",
      visible_1: "EURC",
      visible0Issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      visible1Issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2"
    },
  ]

  const quickActions = [
    { name: `Trade\nAssets`, icon: "candlestick-chart", iconProvider: "material" },
    { name: `Deposit\nUSDC`, icon: "add", iconProvider: "material" },
    { name: `Withdraw\nUSDC`, icon: "currency-exchange", iconProvider: "material" },
  ]
  const quickTradeActions = [
    { name: `Manage\nAssets`, icon: "token", iconProvider: "material" },
    { name: `Fiat\nAccess`, icon: "attach-money", iconProvider: "material" },
    { name: `Pending\nTrades`, icon: "timeline-clock-outline", iconProvider: "materialCommunity" },
    { name: `Transaction\nHistory`, icon: "restore", iconProvider: "material" },
  ]
  useEffect(() => {
    Animated.loop(
      Animated.timing(animation, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    ).start();
  }, [animation]);

  const getData = useCallback(() => {
    setLoadingKey(true);
    try {
      setStellarKey(state.STELLAR_PUBLICK_KEY || null);
    } catch (error) {
      console.log("Error getting stellar key:", error);
    } finally {
      setLoadingKey(false);
    }
  }, [state.STELLAR_PUBLICK_KEY]);

  useEffect(() => {
    if (focusedScreen) getData();
  }, [focusedScreen, getData]);

  const fetchData = useCallback(async () => {
    try {
      setApiDataLoading(true);
      const response = await fetch(CHART_API[chartIndex].url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const json = await response.json();
      const records = json._embedded?.records || [];

      setApiData(records);

      if (records.length > 1) {
        setPointsData(records[0]?.close || 0);
        setPointsDataTime(
          new Date(parseInt(records[0]?.timestamp, 10)).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );

        const lastClose = parseFloat(records[0]?.close);
        const secondLastClose = parseFloat(records[1]?.close);
        setLineColor(lastClose > secondLastClose ? "green" : "red");
      } else {
        setLineColor("#44bd32");
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
    } finally {
      setApiDataLoading(false);
    }
  }, [chartIndex]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    AsyncStorageLib.getItem("walletType").then((type) => {
      try {
        setWalletType(JSON.parse(type));
      } catch {
        setWalletType(null);
      }
    });
  }, [focusedScreen]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigation.navigate("Home");
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);

      return () => subscription.remove();
    }, [navigation])
  );

  const copyToClipboard = (data) => {
    if (!data) return;
    Clipboard.setString(data);
    alert("success", "Copied");
  };

  const renderAssetPairItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => {
        setChartIndex(item.id);
        setOpenChartApi(false);
      }}
      style={[styles.chooseItemContainer, { borderRadius: 5, height: hp(6), justifyContent: "space-around",backgroundColor:theme.cardBg }]}
    >
      <Image source={{ uri: item.img_0 }} style={{ width: wp(9), height: hp(4) }} />
      <Text style={[styles.chooseItemText,{color:theme.headingTx}]}>{item.name}</Text>
      <Icon name={"arrow-right"} type={"materialCommunity"} size={19} color={theme.headingTx} />
      <Image source={{ uri: item.img }} style={{ width: wp(9), height: hp(4), marginLeft: wp(0) }} />
      <Text style={[styles.chooseItemText,{color:theme.headingTx}]}>{item.name_0}</Text>
    </TouchableOpacity>
  );

  const rawCloses = apiData
    ?.slice()
    ?.reverse()
    ?.map((item) => parseFloat(item?.close));

  const minChartValue = rawCloses?.length ? Math.min(...rawCloses) : 0;
  const maxChartValue = rawCloses?.length ? Math.max(...rawCloses) : 0;
  const chartRangeValue = maxChartValue - minChartValue || 1;
  const chartData = rawCloses?.map((val) => ({
    value: 10 + ((val - minChartValue) / chartRangeValue) * 80,
    originalValue: val,
  }));



  const theme = state.THEME.THEME ? colors.dark : colors.light;

  const manageAssetNav = (itemIndex) => {
    switch (itemIndex) {
      case 0:
        navigation.navigate("newOffer_modal")
        break;
      case 1:
        navigation.navigate("classic", { Asset_type: "ETH" })
        break;
      case 2:
        navigation.navigate("ExportUSDC", { Asset_type: "ETH" })
        break;
    }
  }

  const manageTradeNav = (itemIndex) => {
    switch (itemIndex) {
      case 0:
        navigation.navigate("Assets_manage")
        break;
      case 1:
        navigation.navigate("payout")
        break;
      case 2:
        navigation.navigate("StellarOffers")
        break;
      case 3:
        navigation.navigate("StellarTransactions")
        break;
    }
  }

  return (
    <>
      <Exchange_screen_header
        title="Stellar SDEX"
        onLeftIconPress={() => navigation.navigate("Home")}
        onRightIconPress={() => {
          console.log("Right icon pressed");
        }}
      />

      <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={{ backgroundColor: theme.bg }}>
        <View style={[styles.quickActionWrapper, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}>
         <View style={{
          flexDirection:"row",
          justifyContent:"space-between",
          alignItems:"center",
         }}>
           <Text style={[styles.headingTx, { color: theme.headingTx }]}>Start Trade</Text>
             <View style={{ flexDirection: "row",alignItems:"center" }}>
                <Image source={{uri:CHART_API[0].img_0}} width={29} height={29} />
                <Text style={[styles.infoText, { color: theme.headingTx }]}>Avg. Network Fee</Text>
                <Text style={[styles.infoText, { color: theme.headingTx }]}>~ 0.00001  </Text>
              </View>
         </View>
          <View style={[styles.quickActionRow]}>
            {quickActions.map((item, index) => {
              return (
                <View style={{ alignItems: "center" }} key={index}>
                  <TouchableOpacity style={[styles.iconCon, { backgroundColor: theme.smallCardBg, borderColor: theme.smallCardBorderColor }]} onPress={() => { manageAssetNav(index) }}>
                    <Icon name={item.icon} type={item.iconProvider} color="rgba(129, 108, 255, 0.97)" size={27} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 13, color: theme.headingTx, textAlign: "center" }}>{item.name}</Text>
                </View>
              )
            })}
            <View style={[styles.infoCon,{}]}>
              <View style={{ flexDirection: "row",paddingHorizontal:wp(1),alignItems:"center" }}>
                <View>
                  <Text style={[styles.infoText, { color: theme.headingTx }]}>USDC Balance:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: wp(16.9),alignSelf:"center" }}>
                  <Text style={[styles.infoText,{ color: theme.cardSubTx }]}>
                    {state?.STELLAR_ADDRESS_STATUS === false
                      ? "0.00"
                      : state?.assetData
                        ?.filter((b) => b.asset_code === "USDC")
                        .find((b, _, arr) => parseFloat(b.balance) > 0 && (b === arr[0] || parseFloat(arr[0].balance) <= 0))
                        ?.balance || "0.00"}
                  </Text>
                </ScrollView>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.bottmLine} />
          <View style={[styles.accountDetils]}>
            <View style={styles.walletContainer}>
              <Text style={[styles.textColor, { color: theme.headingTx }]}>Active Stellar Wallet</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {loadingKey && !stellarKey ? (
                <View style={{ width: wp(70) }}>
                  <Exchange_single_loading />
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: wp(80), paddingVertical: 1, borderRadius: 5 }}>
                  <Text style={[styles.textColor, { color: theme.inactiveTx }]}>{stellarKey}</Text>
                </ScrollView>
              )}
              <TouchableOpacity onPress={() => copyToClipboard(stellarKey)} accessibilityLabel="Copy Stellar Public Key">
                <Icon name="content-copy" type="materialCommunity" color="#4052D6" size={24} style={{ marginLeft: wp(1) }} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {navigation.navigate("WalletNetworkSelection",{selectionType:"importForSetupedApp",backScreenName:"ExchangeHome"})}} accessibilityLabel="Import Wallet" style={styles.copyCon}>
                <Text style={[styles.copyTx]}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {/* {(walletType !== "Ethereum" && walletType !== "Multi-coin") && (
          <Text style={styles.whiteColor}>
            Only Ethereum and Multi-coin based wallets are supported.
          </Text>
        )} */}

        <View style={[styles.quickActionWrapper, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}>
          <Text style={[styles.headingTx, { color: theme.headingTx }]}>Manage Assets</Text>
          <View style={[styles.quickActionRow, { alignSelf: "flex-start" }]}>
            {quickTradeActions.map((item, index) => {
              return (
                <TouchableOpacity style={{ alignItems: "center", marginRight: wp(8) }} key={index} onPress={() => { manageTradeNav(index) }}>
                  <View style={[styles.iconCon, { backgroundColor: theme.smallCardBg, borderColor: theme.smallCardBorderColor }]}>
                    <Icon name={item.icon} type={item.iconProvider} color="rgba(129, 108, 255, 0.97)" size={27} />
                  </View>
                  <Text style={{ fontSize: 13, color: theme.headingTx, textAlign: "center" }}>{item.name}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
        <PnlOverView stellarKey={stellarKey} refresh={apiDataLoading} activeTheme={state.THEME.THEME}/>
        <View style={[styles.quickActionWrapper, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}>
          <View style={styles.chartTopCon}>
            <View>
              <Text style={[styles.priceText, { color: theme.headingTx }]}>${pointsData || 0.0}</Text>
              <Text style={[styles.priceTime, { color: theme.headingTx }]}>{pointsDataTime || "--:--:--"}</Text>
            </View>
            <TouchableOpacity
              style={[styles.tradeButton, { backgroundColor: theme.bg }]}
              onPress={() => setOpenChartApi(true)}
              accessibilityLabel="Change asset pair for trade"
            >
              <Text style={[styles.tradeButtonText, { color: theme.cardSubTx }]}>
                {CHART_API[chartIndex].name} 
                <Icon name={"arrow-right"} type={"materialCommunity"} size={14} color={theme.headingTx}/>
                {CHART_API[chartIndex].name_0}
              </Text>
              <Icon name={"expand-more"} type={"material"} color={theme.cardSubTx} size={24} />
            </TouchableOpacity>
          </View>

          {apiDataLoading ? (
            <ActivityIndicator color={"#4052D6"} size={"large"} />
          ) : (
              <LineChart
                data={chartData}
                adjustToWidth
                width={wp(89)}
                height={hp(28)}
                color={lineColor}
                thickness={2}
                curved
                areaChart
                startFillColor={lineColor}
                startOpacity={0.3}
                endFillColor={lineColor}
                endOpacity={0}
                hideDataPoints
                hideYAxisText
                hideXAxisText
                hideAxesAndRules
                initialSpacing={0}
                endSpacing={0}
                maxValue={100}
                pointerConfig={{
                  pointerStripHeight: hp(26),
                  pointerStripColor: "rgba(255,255,255,0.15)",
                  pointerStripWidth: 1,
                  pointerColor: lineColor,
                  radius: 5,
                  pointerLabelWidth: 110,
                  pointerLabelHeight: 95,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items) => {
                    const val = items?.[0]?.originalValue;
                    if (prvValue.current !== val) {
                      prvValue.current = val;
                      setTimeout(() => setPointsData(val), 0);
                    }
                    return null;
                  },
                }}
              />
          )}
        </View>
        {/* <CandleStickChart visible={apiDataLoading} activeTheme={state.THEME.THEME} pair={PAIRS[chartIndex]}/> */}
        <View style={styles.tradeButtonWrapper}>
          <Modal animationType="slide" transparent visible={openChartApi} onRequestClose={() => setOpenChartApi(false)}>
            <TouchableOpacity style={styles.chooseModalContainer} onPress={() => setOpenChartApi(false)}>
              <View style={[styles.chooseModalContent,{backgroundColor:theme.bg}]}>
                <Text style={[styles.chooseModalTitle,{color:theme.headingTx}]}>Select Assets Pair</Text>
                <FlatList data={CHART_API} renderItem={renderAssetPairItem} keyExtractor={(item) => item.id.toString()} />
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      </ScrollView>
      <SELECT_WALLET_EXC
        visible={visibleSelectWallet}
        setVisible={()=>{setVisibleSelectWallet(false)}}
        setModalVisible={()=>{setVisibleSelectWallet(false)}}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  quickActionWrapper: {
    paddingVertical: hp(1.3),
    borderRadius: 20,
    marginTop: hp(1),
    marginHorizontal: wp(2.5),
    borderWidth: 1
  },
  quickActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: hp(1),
    paddingHorizontal: wp(5),
  },
  accountDetils: {
    justifyContent: "space-between",
    marginTop: hp(1.5),
    paddingHorizontal: wp(5),
  },
  walletContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: hp(-1)
  },
  textColor: {
    color: "#fff",
    marginVertical: hp(0.3)
  },
  copyCon: {
    backgroundColor: "#4052D6",
    borderRadius: 10,
    padding: 6,
    paddingHorizontal: 8,
    marginLeft: 5
  },
  copyTx: {
    fontSize: 16,
    fontWeight: "300",
    color: "#fff"
  },
  whiteColor: {
    color: "#fff",
    marginVertical: hp(2),
    width: wp(80),
    alignSelf: "center",
    textAlign: "center"
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#2b3c57",
    borderRadius: 10,
    padding: 10,
    marginVertical: hp(0.5),
    justifyContent: "space-between",
    alignItems: "center",
  },
  anchorStatusIcon: {
    justifyContent: "center"
  },
  priceText: {
    fontSize: 19,
    fontWeight: "600"
  },
  priceTime: {
    fontSize: 14
  },
  tradeButtonWrapper: {
    paddingVertical: hp(1)
  },
  tradeButton: {
    backgroundColor: "rgba(33, 43, 83, 1)",
    paddingVertical: hp(0.8),
    paddingHorizontal: wp(3),
    maxWidth: wp(50),
    alignItems: "center",
    borderRadius: hp(1.6),
    flexDirection: "row",
    justifyContent:"center"
  },
  tradeButtonText: {
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500"
  },

  chooseModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  chooseModalContent: {
    backgroundColor: "rgba(33, 43, 83, 1)",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: "100%",
    maxHeight: "80%",
    borderTopColor: "rgba(72, 93, 202, 1)",
    borderWidth: 2,
  },
  chooseModalTitle: {
    fontSize: 21,
    color: "#fff",
    fontWeight: "bold",
    marginBottom: hp(1)
  },
  chooseItemContainer: {
    marginVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: hp(0.5),
  },
  chooseItemText: {
    fontSize: 19,
    color: "#fff",
    marginLeft: wp(-10)
  },
  headingTx: {
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: wp(5),
  },
  iconCon: {
    padding: wp(3.5),
    borderRadius: 30,
    borderWidth: 0.5
  },
  bottmLine: {
    borderBlockEndColor: "gray",
    borderBottomWidth: 0.9,
    marginTop: hp(2),
  },
  chartTopCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: wp(4)
  },
  infoCon:{
    paddingVertical:hp(1.2),
    width:wp(34),
    justifyContent:"center",
    alignItems:"flex-start",
    borderRadius:15,
    paddingHorizontal:3,
    marginRight:hp(-1)
  },
  infoText:{
    fontSize: 13.5,
    fontWeight:"500",
    textAlign: "left",
    marginLeft:4
  }
});
