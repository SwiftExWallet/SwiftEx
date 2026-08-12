import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  Modal,
  ActivityIndicator,
  StatusBar,
  Platform,
} from "react-native";
import { useSelector } from "react-redux";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from "../../../../../icon";
import { LineChart } from "react-native-gifted-charts";
import LinearGradient from "react-native-linear-gradient";
import Svg,
{
  Polyline,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Path
} from "react-native-svg";
import { STELLAR_URL } from "../../../../constants";
import PnlOverView from "../../../../reusables/PnlOverView";
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import Clipboard from "@react-native-clipboard/clipboard";
import { alert } from "../../../../reusables/Toasts";

const ACCENT = "#635BFF";
const GREEN = "#4ADE80";
const RED = "#F87171";

const Sparkline = ({ data, width = 120, height = 40, color = GREEN }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4)}`).join(" ");
  const areaD = `M0,${height} L${pts.split(" ").map(p => p).join(" L")} L${width},${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </SvgGrad>
      </Defs>
      <Path d={areaD} fill="url(#sparkFill)" />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const HomeView = () => {
  const prvValue = useRef(null);
  const [openChartApi, setOpenChartApi] = useState(false);
  const [chartIndex, setChartIndex] = useState(0);
  const [stellarKey, setStellarKey] = useState(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [apiData, setApiData] = useState([]);
  const [apiDataLoading, setApiDataLoading] = useState(false);
  const [lineColor, setLineColor] = useState(GREEN);
  const [pointsData, setPointsData] = useState(0);
  const [pointsDataTime, setPointsDataTime] = useState("");
  const [pnl, setPnl] = useState(null);
  const [ordersCount, setOrdersCount] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedTimeline, setSelectedTimeline] = useState("1week");
  const state = useSelector((s) => s);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const st = useMemo(() => getStyles(theme), [theme]);
  const navigation = useNavigation();
  const focused = useIsFocused();

  const TIMELINES = [
    { label: '1 Week', value: '1week' },
    { label: '1 Month', value: '1month' },
    { label: '2 Month', value: '2month' },
    { label: '3 Month', value: '3month' },
  ];
  const CHART_API = [
    { id: 0, name: "XLM", name_0: "USDC", url: "https://horizon.stellar.lobstr.co/trade_aggregations?base_asset_type=native&counter_asset_type=credit_alphanum4&counter_asset_code=USDC&counter_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&start_time=1722320811000&resolution=60000&offset=0&limit=30&order=desc", img_0: 'https://s2.coinmarketcap.com/static/img/coins/64x64/512.png', img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" },
    { id: 1, name: "ETH", name_0: "USDC", url: "https://horizon.stellar.lobstr.co/trade_aggregations?base_asset_type=credit_alphanum4&base_asset_code=ETH&base_asset_issuer=GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC&counter_asset_type=credit_alphanum4&counter_asset_code=USDC&counter_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&start_time=1722320811000&resolution=60000&offset=0&limit=30&order=desc", img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png", img_0: "https://tokens.pancakeswap.finance/images/0x2170Ed0880ac9A755fd29B2688956BD959F933F8.png" },
    { id: 2, name: "XLM", name_0: "EURC", url: "https://horizon.stellar.lobstr.co/trade_aggregations?base_asset_type=native&counter_asset_type=credit_alphanum4&counter_asset_code=EURC&counter_asset_issuer=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2&start_time=1722322255000&resolution=60000&offset=0&limit=30&order=desc", img: "https://assets.coingecko.com/coins/images/26045/thumb/euro-coin.png?1655394420", img_0: 'https://s2.coinmarketcap.com/static/img/coins/64x64/512.png' },
    { id: 3, name: "USDC", name_0: "EURC", url: "https://horizon.stellar.org/trade_aggregations?base_asset_type=credit_alphanum4&base_asset_code=USDC&base_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&counter_asset_type=credit_alphanum4&counter_asset_code=EURC&counter_asset_issuer=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2&start_time=1722229906000&resolution=900000&offset=0&limit=30&order=desc", img: "https://assets.coingecko.com/coins/images/26045/thumb/euro-coin.png?1655394420", img_0: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" },
  ]

  const tools = [
    { name: "Manage Assets", sub: "View and manage your assets", icon: "grid", provider: "feather", color: "#A855F7" },
    { name: "Fiat Access", sub: "Buy USDC and other assets", icon: "attach-money", provider: "material", color: "#22C55E" },
    { name: "Pending Trades", sub: "View all your pending trades", icon: "timeline-clock-outline", provider: "materialCommunity", color: "#6366F1" },
    { name: "Transaction History", sub: "View all your transactions", icon: "history", provider: "material", color: "#6366F1" },
    { name: "Import Wallet", sub: "Import your existing stellar wallet", icon: "download", provider: "feather", color: "#3B82F6" },
  ];

  const PnlOverViewConfig = [
    { label: `USDC Spent`, val: `$${pnl?.usdcSpent || "0"}`, icon: 'cloud-upload-outline', color: '#6366f1' },
    { label: `USDC Received`, val: `$${pnl?.usdcReceived || "0"}`, icon: 'cloud-download-outline', color: '#8b5cf6' },
    { label: `Total Trades`, val: `${pnl?.tradeCount || "0"}`, icon: 'swap-horizontal-outline', color: '#ec4899' },
    { label: `Total Positions`, val: `${pnl?.positionCount || "0"}`, icon: 'folder-open-outline', color: '#f59e0b' },
    { label: `Net USDC Flow`, val: `${pnl?.netUSDCFlow || "0"}`, icon: 'git-compare-outline', color: '#06b6d4' },
    { label: `Total Realized`, val: `${pnl?.totalRealized || "0"}`, icon: 'cash-outline', color: '#10b981' },
    { label: `Total Unrealized`, val: `${pnl?.totalUnrealized || "0"}`, icon: 'trending-up-outline', color: '#3b82f6' },
  ]

  const getData = useCallback(() => {
    setLoadingKey(true);
    try { setStellarKey(state.STELLAR_PUBLICK_KEY || null); } catch (e) { }
    finally { setLoadingKey(false); }
  }, [state.STELLAR_PUBLICK_KEY]);

  useEffect(() => { if (focused) getData(); }, [focused, getData]);

  const fetchChart = useCallback(async () => {
    try {
      setApiDataLoading(true);
      const res = await fetch(CHART_API[chartIndex].url);
      const json = await res.json();
      const records = json._embedded?.records || [];
      setApiData(records);
      if (records.length > 1) {
        setPointsData(records[0]?.close || 0);
        setPointsDataTime(new Date(parseInt(records[0]?.timestamp, 10)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setLineColor(parseFloat(records[0]?.close) > parseFloat(records[1]?.close) ? GREEN : RED);
      }
    } catch (e) { } finally { setApiDataLoading(false); }
  }, [chartIndex]);
  useEffect(() => { fetchChart(); }, [fetchChart]);

  const fetchOrders = useCallback(async () => {
    if (!stellarKey) return;
    setOrdersLoading(true);
    try {
      const res = await fetch(`${STELLAR_URL.URL}/accounts/${stellarKey}/offers?limit=200&order=desc`);
      const json = await res.json();
      setOrdersCount((json._embedded?.records || []).length);
    } catch (e) { } finally { setOrdersLoading(false); }
  }, [stellarKey]);
  useEffect(() => { if (focused) fetchOrders(); }, [focused, fetchOrders]);
  const nav = (i) => { [() => navigation.navigate("newOffer_modal"), () => navigation.navigate("classic", { Asset_type: "ETH" }), () => navigation.navigate("ExportUSDC", { Asset_type: "ETH" })][i]?.(); };
  const toolNav = (i) => { [() => navigation.navigate("Assets_manage"), () => navigation.navigate("payout"), () => navigation.navigate("StellarOffers"), () => navigation.navigate("StellarTransactions"), () => navigation.navigate("WalletNetworkSelection", { selectionType: "importForSetupedApp", backScreenName: "ExchangeHome" }),][i]?.(); };

  const usdcBal = state?.assetData?.find(b => b.asset_code === "USDC")?.balance || "0.00";
  const portfolioVal = state?.totalStellarInUSD || "0.00";
  const rawCloses = apiData?.slice()?.reverse()?.map((r) => parseFloat(r?.close));
  const minChartValue = rawCloses?.length ? Math.min(...rawCloses) : 0;
  const maxChartValue = rawCloses?.length ? Math.max(...rawCloses) : 0;
  const chartRangeValue = maxChartValue - minChartValue || 1;
  const chartData = rawCloses?.map((val) => ({
    value: 10 + ((val - minChartValue) / chartRangeValue) * 80,
    originalValue: val,
  }));

  const renderAssetPairItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => {
        setChartIndex(item.id);
        setOpenChartApi(false);
      }}
      style={st.chooseItemContainer}
    >
      <Image source={{ uri: item.img_0 }} style={{ width: wp(9), height: hp(4) }} />
      <Text style={st.chooseItemText}>{item.name}</Text>
      <Icon name={"arrow-right"} type={"materialCommunity"} size={19} color={theme.headingTx} />
      <Image source={{ uri: item.img }} style={{ width: wp(9), height: hp(4), marginLeft: wp(0) }} />
      <Text style={st.chooseItemText}>{item.name_0}</Text>
    </TouchableOpacity>
  );

  const renderStatCard = useCallback(({ item: s }) => (
    <View style={st.statCard}>
      <View style={[st.statIconBg, { backgroundColor: s.color + '20' }]}>
        <Icon name={s.icon} type="ionicon" size={14} color={s.color} />
      </View>
      <Text style={st.statLbl} numberOfLines={1}>{s?.label}</Text>
      <Text style={[st.statVal, { color: s.color }]} numberOfLines={1}>{s?.val}</Text>
      <View style={[st.statBar, { backgroundColor: s.color }]} />
    </View>
  ), [pnl]);

  const copyToClipboard = (data) => {
    if (!data) return;
    Clipboard.setString(data);
    alert("success", "Copied");
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: hp(10) }}>

        <LinearGradient
          colors={state.THEME.THEME?['#2E2E5D', '#12121A', '#0B0B0F']: ['#e7e6e2ff', '#F7F6FC', '#ECEBF7']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={Platform.OS==="android"?st.portfolioCard:st.portfolioCardIos}
        >
          <View style={st.portfolioInfo}>
            <View style={st.row}>
              <Text style={[st.label,{color:theme.headingTx}]}>Balance</Text>
              <Icon name="eye-outline" type="ionicon" size={14} color={theme.cardSubTx} style={{ marginLeft: 6 }} />
            </View>
            <Text style={[st.balance,{color:theme.headingTx}]}>${portfolioVal}</Text>
            <View style={st.row}>
              <Text style={[st.percentage,{color:theme.inactiveTx}]}><Text style={st.subLabel}>Stellar DEX</Text></Text>
            </View>

            <View style={[st.walletSelector, { borderColor: theme.cardSubTx }]}>
              {loadingKey && !stellarKey ? (
                <ActivityIndicator size="small" color={theme.buttonColor} />
              ) : (
                <View style={st.walletKeyRow}>
                  <Text style={[st.textColor, { color: theme.inactiveTx }]}>Active Wallet: </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={st.walletKeyScroll}
                  >
                    <Text style={[st.textColor, { color: theme.inactiveTx }]}>
                      {stellarKey}
                    </Text>
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity
                onPress={() => copyToClipboard(stellarKey)}
                style={st.copyBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon
                  name="content-copy"
                  type="materialCommunity"
                  color={theme.buttonColor}
                  size={24}
                  style={{ marginLeft: wp(1) }}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[st.feeBadge,{borderColor:theme.inactiveTx}]}>
            <Text style={[st.feeText,{color:theme.inactiveTx}]}>Avg. Network Fee</Text>
            <Text style={[st.feeValue,{color:theme.headingTx}]}>~ 0.00001 XLM</Text>
          </View>

          <View style={st.abstractCircle} />

          <View style={Platform.OS==="android"?st.actRow:st.actRowIOS}>
            <TouchableOpacity style={[Platform.OS==="android"?st.actSmall:st.actSmallIOS, { backgroundColor: ACCENT }]} onPress={() => nav(0)}>
              <Icon name="candlestick-chart" type="material" size={Platform.OS==="android"?22:18} color="#FFF" />
              <View style={{ marginLeft: 10 }}>
                <Text style={st.actTitle}>Trade</Text>
                <Text style={st.actSub}>Trade Assets</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[Platform.OS==="android"?st.actSmall:st.actSmallIOS,{backgroundColor:theme.bg}]} onPress={() => nav(1)}>
              <Icon name="arrow-down-circle" type="feather" size={Platform.OS==="android"?20:18} color={theme.headingTx} />
              <View style={{ marginLeft: 10 }}>
                <Text style={[st.actTitle,{color:theme.headingTx}]}>Deposit</Text>
                <Text style={[st.actSub,{color:theme.inactiveTx}]}>USDC</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[Platform.OS==="android"?st.actSmall:st.actSmallIOS,{backgroundColor:theme.bg}]} onPress={() => nav(2)}>
              <Icon name="arrow-up-circle" type="feather" size={Platform.OS==="android"?20:18} color={theme.headingTx} />
              <View style={{ marginLeft: 10 }}>
                <Text style={[st.actTitle,{color:theme.headingTx}]}>Withdraw</Text>
                <Text style={[st.actSub,{color:theme.inactiveTx}]}>USDC</Text>
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <FlatList
          horizontal
          data={PnlOverViewConfig}
          keyExtractor={(item) => item.label}
          renderItem={renderStatCard}
          style={st.statsRow}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          contentContainerStyle={{ paddingEnd: hp(3) }}
        />

        <View style={st.sec}>
          <View style={st.pnlHead}>
            <View>
              <Text style={[st.secTitle,{fontSize:20}]}>PnL Overview</Text>
            <Text style={st.freshnessTag}>Freshness: ~15 mins</Text>
            </View>
            <PnlOverView stellarKey={stellarKey} onSummaryUpdate={setPnl} selectedTimeline={selectedTimeline} />
          </View>

          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1 }}>
              <Text style={st.pnlLabel}>Total PnL</Text>
              <Text style={[st.pnlBigVal, { color: pnl?.totalPnL < 0 ? RED : GREEN }]}>
                {pnl?.totalPnL < 0 ? "-" : "+"}${Math.abs(pnl?.totalPnL || 0).toFixed(3)}
              </Text>
              <View style={{ marginTop: 10 }}>
                <Sparkline data={rawCloses?.length > 2 ? rawCloses : [10, 25, 12, 35, 20, 50]} color={pnl?.totalPnL < 0 ? RED : GREEN} width={wp(35)} />
              </View>
            </View>
            <View style={st.pnlGrid}>
              <GridItem st={st} label="Win Rate" val={`${pnl?.winRate || 0}%`} sub="▲ 5.2%" subCol={GREEN} />
              <GridItem st={st} label="Total Trades" val={pnl?.tradeCount || 0} sub="▲ 2" subCol={GREEN} />
              <GridItem st={st} label="Net Flow" val={`-$${Math.abs(pnl?.netUSDCFlow || 0).toFixed(3)}`} sub="▼ 1.1%" subCol={RED} isNeg />
              <GridItem st={st} label="Positions" val={pnl?.positionCount || 0} sub="— 0%" subCol={theme.cardSubTx} />
            </View>
          </View>

          <View style={st.timelineContainer}>
            {TIMELINES.map((item) => {
              const isActive = selectedTimeline === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => setSelectedTimeline(item.value)}
                  style={[st.timelineBtn, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }, isActive && st.timelineBtnActive]}
                >
                  <Text style={[st.timelineText, { color: theme.inactiveTx }, isActive && st.timelineTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={st.sec}>
          <Text style={[st.secTitle, { marginBottom: 10 }]}>More Options</Text>
          {tools.map((t, i) => (
            <TouchableOpacity key={i} style={[st.toolRow, i === tools.length - 1 && { borderBottomWidth: 0 }]} onPress={() => toolNav(i)}>
              <View style={[st.toolDot, { backgroundColor: t.color + '15' }]}>
                <Icon name={t.icon} type={t.provider} size={18} color={t.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={st.toolName}>{t.name}</Text>
                <Text style={st.toolSub}>{t.sub}</Text>
              </View>
              <Icon name="chevron-right" type="feather" size={18} color={theme.cardSubTx} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={st.chartSec}>
          <View style={st.chartTopCon}>
            <View>
              <Text style={st.priceText}>${pointsData || 0.0}</Text>
              <Text style={st.priceTime}>{pointsDataTime || "--:--:--"}</Text>
            </View>
            <TouchableOpacity
              style={st.tradeButton}
              onPress={() => setOpenChartApi(true)}
              accessibilityLabel="Change asset pair for trade"
            >
              <Text style={st.tradeButtonText}>
                {CHART_API[chartIndex]?.name}
                {" "}
                <Icon name={"arrow-right"} type={"materialCommunity"} size={14} color={theme.headingTx} />
                {" "}
                {CHART_API[chartIndex].name_0}
              </Text>
              <Icon name={"expand-more"} type={"material"} color={theme.cardSubTx} size={24} />
            </TouchableOpacity>
          </View>

          {apiDataLoading ? (
            <ActivityIndicator color={ACCENT} size={"large"} style={{ marginVertical: hp(4) }} />
          ) : (
            <LineChart
              data={chartData}
              adjustToWidth
              width={wp(82)}
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

        <Modal animationType="slide" transparent visible={openChartApi} onRequestClose={() => setOpenChartApi(false)}>
          <TouchableOpacity style={st.chooseModalContainer} onPress={() => setOpenChartApi(false)}>
            <View style={st.chooseModalContent}>
              <Text style={st.chooseModalTitle}>Select Assets Pair</Text>
              <FlatList data={CHART_API} renderItem={renderAssetPairItem} keyExtractor={(item) => item.id.toString()} />
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
    </View>
  );
};

const GridItem = ({ st, label, val, sub, subCol, isNeg }) => (
  <View style={st.gridCell}>
    <Text style={st.gridLbl}>{label}</Text>
    <Text style={[st.gridVal, isNeg && { color: RED }]}>{val}</Text>
    <Text style={[st.gridSub, { color: subCol }]}>{sub}</Text>
  </View>
);

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: hp(1.4),
    width: wp(85)
  },
  actRowIOS: {
    flexDirection: "row",
    gap: 10,
    marginTop: hp(1.4),
    width: wp(84)
  },
  actTitle: {
    color: "#FFF",
    fontSize: Platform.OS==="android"?15:12,
    fontWeight: "bold"
  },
  actSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: Platform.OS==="android"?10:9
  },
  actSmall: {
    flex: 1,
    backgroundColor: colors.dark.cardBg,
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: "row"
  },
  actSmallIOS: {
    flex: 1,
    backgroundColor: colors.dark.cardBg,
    borderRadius: 18,
    paddingVertical:hp(1.3),
    paddingHorizontal:wp(2.3),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: "row"
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: -4,
    gap: 8
  },
  statCard: {
    width: wp(25),
    flex: 1,
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 10,
    marginRight: wp(0.2)
  },
  statIconBg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8
  },
  statLbl: {
    color: theme.cardSubTx,
    fontSize: 11,
    marginBottom: 2
  },
  statVal: {
    color: theme.headingTx,
    fontSize: 13,
    fontWeight: "bold"
  },
  statBar: {
    height: 3,
    width: 18,
    borderRadius: 2,
    marginTop: 10
  },
  sec: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: theme.cardBg,
    borderRadius: 24,
    padding: 20
  },
  secTitle: {
    color: theme.headingTx,
    fontSize: 19,
    fontWeight: "bold"
  },
  pnlHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15
  },
  dropChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  dropChipTx: {
    color: theme.cardSubTx,
    fontSize: 12,
    marginRight: 4
  },
  pnlLabel: {
    color: theme.cardSubTx,
    fontSize: 12
  },
  pnlBigVal: {
    fontSize: 26,
    fontWeight: "bold",
    marginTop: 4
  },
  pnlGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderLeftWidth: 1,
    borderLeftColor: theme.smallCardBorderColor,
    paddingLeft: 10
  },
  gridCell: {
    width: '50%',
    padding: 6
  },
  gridLbl: {
    color: theme.cardSubTx,
    fontSize: 10
  },
  gridVal: {
    color: theme.headingTx,
    fontSize: 15,
    fontWeight: "bold",
    marginTop: 2
  },
  gridSub: {
    fontSize: 10,
    marginTop: 2
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.smallCardBorderColor
  },
  toolDot: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center"
  },
  toolName: {
    color: theme.headingTx,
    fontSize: 14,
    fontWeight: "600"
  },
  toolSub: {
    color: theme.cardSubTx,
    fontSize: 11,
    marginTop: 2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: hp(3),
    marginHorizontal: 16
  },

  logoCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoInner: {
    width: 14,
    height: 2,
    backgroundColor: '#FFF',
    transform: [{ rotate: '-45deg' }]
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconButton: {
    marginLeft: 15,
    position: 'relative'
  },
  emojiIcon: { fontSize: 18 },
  notificationDot: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7C3AED',
    borderWidth: 1.5,
    borderColor: theme.bg
  },
  profileCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center'
  },
  portfolioCard: {
    padding: 20,
    width:wp(93),
    height: 255,
    borderRadius: 24,
    marginBottom:  20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 16
  },
  portfolioCardIos: {
    width: wp(100),
    height: 270,
    paddingVertical: 20,
    paddingHorizontal: 15,
    borderRadius: 24,
    marginBottom: 1,
    overflow: 'hidden',
    marginTop: hp(4),
  },
  label: {
    color: '#94A3B8',
    fontSize: 13
  },
  balance: {
    color: '#FFF',
    fontSize: 34,
    fontWeight: 'bold',
    marginVertical: 5
  },
  percentage: {
    color: '#10B981',
    fontSize: 15,
    fontWeight: '600'
  },
  subLabel: {
    color: '#94A3B8',
    fontWeight: 'normal'
  },
  walletSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 15,
    alignSelf: 'flex-start',
    borderWidth:0.9,
    maxWidth: wp(85),
  },
  walletKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexGrow: 0,
  },
  walletKeyScroll: {
    width: wp(53),
    flexGrow: 0,
  },
  copyBtn: {
    flexShrink: 0,
    zIndex: 10,
  },
  walletText: {
    color: '#FFF',
    marginRight: 6,
    fontSize: 11
  },
  feeBadge: {
    position: 'absolute',
    right: Platform.OS==="android"?20:50,
    top: 20,
    padding: 8,
    borderRadius: 12,
    borderWidth: 0.8,
  },
  feeText: {
    color: '#94A3B8',
    fontSize: 9
  },
  feeValue: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold'
  },
  abstractCircle: {
    position: 'absolute',
    right: -40,
    bottom: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  chartSec: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: theme.cardBg,
    borderRadius: 24,
    padding: 16
  },
  chartTopCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 10
  },
  priceText: {
    fontSize: 19,
    fontWeight: "600",
    color: theme.headingTx
  },
  priceTime: {
    fontSize: 12,
    color: theme.cardSubTx
  },
  tradeButton: {
    backgroundColor: theme.bg,
    paddingVertical: hp(0.8),
    paddingHorizontal: wp(3),
    maxWidth: wp(50),
    alignItems: "center",
    borderRadius: hp(1.6),
    flexDirection: "row",
    justifyContent: "center",
  },
  tradeButtonText: {
    fontSize: 13,
    color: theme.headingTx,
    fontWeight: "500"
  },
  chooseModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  chooseModalContent: {
    backgroundColor: theme.cardBg,
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: "100%",
    maxHeight: "80%",
    borderTopColor: theme.smallCardBorderColor,
    borderWidth: 1,
  },
  chooseModalTitle: {
    fontSize: 20,
    color: theme.headingTx,
    fontWeight: "bold",
    marginBottom: hp(1.5)
  },
  chooseItemContainer: {
    marginVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: hp(1),
    borderRadius: 12,
    backgroundColor: theme.bg,
  },
  chooseItemText: {
    fontSize: 16,
    color: theme.headingTx,
    fontWeight: "600"
  },
  timelineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 1,
    gap: 9
  },
  timelineBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1
  },
  timelineBtnActive: {
    backgroundColor: 'rgba(86, 88,233,0.2) ',
    borderColor: '#4052D6'
  },
  timelineText: {
    fontSize: 12,
    fontWeight: '500'
  },
  timelineTextActive: {
    color: '#4052D6',
    fontWeight: '700'
  },
  freshnessTag: {
    color: theme.inactiveTx,
    fontSize: 13,
    fontWeight: "400"
  }
});