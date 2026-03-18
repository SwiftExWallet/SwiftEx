import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Dimensions,
} from "react-native";
import Icon from "../icon";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useNavigation } from "@react-navigation/native";
import RecieveAddress from "./Modals/ReceiveAddress";
import { REACT_APP_LOCAL_TOKEN } from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { GET, authRequest } from "./exchange/crypto-exchange-front-end-main/src/api";
import { alert } from "./reusables/Toasts";
import { LineChart } from "react-native-gifted-charts";
import { useSelector } from "react-redux";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import Stellar_image from "../../assets/Stellar_(XLM).png";
import brridge_new from "../../assets/brridge_new.png";
import TokenQrCode from "./Modals/TokensQrCode";
import InfoComponent from "./exchange/crypto-exchange-front-end-main/src/components/InfoComponent";

const Asset_info = ({ route }) => {
  const { width: SCREEN_WIDTH } = Dimensions.get("window");
  const state = useSelector((state) => state);
  const isDark = state.THEME.THEME;
  const { asset_type } = route.params;
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  
  const [visible, setVisible] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrName, setQrName] = useState("");
  const [iconType, setIconType] = useState("");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1w");

  const [token, setToken] = useState("");
  const [assetData, setAssetData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [lineColor, setLineColor] = useState("green");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [priceTime, setPriceTime] = useState("");
  const [infoVisible,setinfoVisible]=useState("");
  const [infotype,setinfotype]=useState("");
  const [infomessage,setinfomessage]=useState("");

  const assetSymbol = useMemo(
    () => asset_type?.symbol?.toUpperCase() || asset_type?.symbol,
    [asset_type]
  );

  const assetImage = useMemo(() => {
    if (assetSymbol === "XLM") return Stellar_image;
    return { uri: asset_type?.img || asset_type?.imageUrl };
  }, [assetSymbol, asset_type]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      const storedToken = await AsyncStorageLib.getItem(REACT_APP_LOCAL_TOKEN);
      setToken(storedToken);
      
      setChartLoading(true);
      setLoading(true);

      await Promise.all([
        fetchAssetData(assetSymbol),
        fetchChartData(assetSymbol, selectedTimeframe),
      ]);
    } catch (error) {
      console.error("Initialization error:", error);
      alert("error", "Failed to load asset data");
    }
  };

  const fetchAssetData = async (symbol) => {
    try {
      if (symbol === "XLM") {
        await fetchXLMData();
      } else {
        await fetchBinanceData(symbol);
      }
    } catch (error) {
      console.error("Asset data fetch error:", error);
      setLoading(false);
    }
  };

  const fetchXLMData = async () => {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/coins/stellar"
      );
      const result = await response.json();

      setAssetData({
        current_price: result.market_data.current_price.usd,
        high_24h: result.market_data.high_24h.usd,
        low_24h: result.market_data.low_24h.usd,
        market_cap: result.market_data.market_cap.usd,
        total_volume: result.market_data.total_volume.usd,
        total_supply: result.market_data.total_supply,
        price_change_percentage_24h:
          result.market_data.price_change_percentage_24h,
      });
      
      setCurrentPrice(result.market_data.current_price.usd);
      setPriceChange(result.market_data.price_change_percentage_24h);
      setLoading(false);
    } catch (error) {
      console.log("XLM data error:", error);
      setLoading(false);
    }
  };

  const fetchBinanceData = async (symbol) => {
    try {
      const normalizedSymbol = symbol === "USDT" ? "USDC" : symbol;
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/tradingDay?symbol=${normalizedSymbol}USDT`
      );
      const data = await response.json();

      setAssetData({
        current_price: parseFloat(data.lastPrice),
        high_24h: parseFloat(data.highPrice),
        low_24h: parseFloat(data.lowPrice),
        market_cap: "N/A",
        total_volume: parseFloat(data.volume),
        total_supply: "N/A",
        price_change_percentage_24h: parseFloat(data.priceChangePercent),
      });

      setCurrentPrice(parseFloat(data.lastPrice));
      setPriceChange(parseFloat(data.priceChangePercent));
      setLoading(false);
    } catch (error) {
      console.error("Binance data error:", error);
      setLoading(false);
    }
  };

  const getIntervalForTimeframe = (timeframe) => {
    const intervals = {
      "1h": { interval: "1m", limit: 60 },
      "1d": { interval: "5m", limit: 288 },
      "1w": { interval: "1h", limit: 168 },
      "1m": { interval: "1d", limit: 30 },
    };
    return intervals[timeframe] || intervals["1w"];
  };

  const fetchChartData = async (symbol, timeframe) => {
    setChartLoading(true);
    setChartError(false);

    try {
      const normalizedSymbol = symbol === "USDT" ? "USDC" : symbol;
      const { interval, limit } = getIntervalForTimeframe(timeframe);
      
      const response = await fetch(
        `https://api.binance.com/api/v1/klines?symbol=${normalizedSymbol}USDT&interval=${interval}&limit=${limit}`
      );

      if (!response.ok) throw new Error("Failed to fetch chart");

      const data = await response.json();
      
      if (!data || data.length === 0) throw new Error("No chart data");

      const formattedData = data.map((item) => ({
        value: parseFloat(item[4]),
      }));

      setChartData(formattedData);
      
      const lastPrice = formattedData[formattedData.length - 1];
      setCurrentPrice(lastPrice.y);
      setPriceTime("Today");

      const firstPrice = formattedData[0].y;
      const lastPriceValue = lastPrice.y;
      const change = ((lastPriceValue - firstPrice) / firstPrice) * 100;
      setPriceChange(change);
      setLineColor(lastPriceValue >= firstPrice ? "#40BF6A" : "#FF6B6B");

      setChartLoading(false);
    } catch (error) {
      console.error("Chart fetch error:", error);
      setChartError(true);
      setChartLoading(false);
      
      if (assetData?.current_price) {
        setCurrentPrice(assetData.current_price);
        setPriceChange(assetData.price_change_percentage_24h || 0);
        setPriceTime("Today");
      }
    }
  };

  const handleTimeframeChange = (timeframe) => {
    setSelectedTimeframe(timeframe);
    fetchChartData(assetSymbol, timeframe);
  };

  const handleSend = useCallback(() => {
    if(asset_type.chain === "Stellar"){
      if (asset_type.symbol === "XLM") {
        navigation.navigate("SendXLM");
      }
      if (asset_type.symbol === "USDC") {
        navigation.navigate("send_recive", { bala: asset_type.balance, assetIssuer:asset_type?.contractAddress, asset_name: asset_type.symbol });
      }
    } else if (asset_type.symbol==="BNB"||asset_type.symbol==="ETH") {
      navigation.navigate("Send", {
        token: asset_type?.symbol === "ETH" ? "Ethereum" : asset_type?.symbol,
      });
    } else if (asset_type?.symbol!=="BNB"||asset_type?.symbol!=="ETH") {
      navigation.navigate("TokenSend", {
        tokenAddress: asset_type?.contractAddress,
        tokenType: asset_type?.chain === "ETH" ? "Ethereum" : "Binance",
        tokenDecimals: asset_type?.decimals,
        tokenSymbol: asset_type?.symbol || asset_type?.name
      });
    }
  }, [asset_type, navigation]);

  const handleRequest = useCallback(() => {
    if (asset_type.chain === "Stellar") {
      setQrValue(state?.STELLAR_PUBLICK_KEY);
      setQrName(asset_type?.name);
      setQrVisible(true);
    } else if (asset_type?.symbol || asset_type.symbol) {
      setQrValue(state?.wallet?.address);
      setQrName(asset_type?.name);
      setQrVisible(true);
    }
  }, [asset_type, state]);

  const handleBuy = useCallback(() => {
      navigation.navigate("payout");
  }, [token, navigation]);

  const handleSwap = useCallback(() => {
 navigation.navigate("newOffer_modal", {
                purchesReq:0,
                tradeAssetType:
                  assetSymbol === "BSC"
                    ? "ETH"
                    : ["ETH"].includes(assetSymbol)
                      ? assetSymbol
                      : assetSymbol?.toUpperCase(), tradeAssetIssuer: ["ETH", "BTC", "BSC"].includes(assetSymbol) ? "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC" : null
              })
  }, [token, assetSymbol, navigation]);

  const handleHistory = useCallback(() => {
    navigation.navigate("Transactions");
  }, []);

  const ActionButton = ({ icon,iconProvider, label, onPress, disabled, customInfo, customInfoTxt }) => (
    <TouchableOpacity
      disabled={disabled || (chartLoading && loading)}
      style={styles.actionButton}
      onPress={onPress}
    >
      {customInfo&&<TouchableOpacity style={{
        zIndex:20,
        position:"absolute",
        top:-10,
        right:-5
      }} onPress={()=>{
        setinfomessage(customInfoTxt);
        setinfotype("");
        setinfoVisible(true)
      }}>
        <Icon
          type={"materialCommunity"}
          name={"information-outline"}
          size={23}
          color={chartLoading && loading ? "gray" : isDark ? "#FFF" : "#000"}
        />
      </TouchableOpacity>}
      <View
        style={[
          styles.actionIcon,
          { backgroundColor: isDark ? "#242426" : "#F4F4F8" },
        ]}
      >
        <Icon
          type={iconProvider}
          name={icon}
          size={23}
          color={chartLoading && loading ? "gray" : isDark ? "#FFF" : "#000"}
        />
      </View>
      <Text
        style={[
          styles.actionLabel,
          { color: isDark ? "#E6E8EB":"#272729" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const TimeframeButton = ({ label, value }) => (
    <TouchableOpacity
      style={[
        styles.timeframeButton,
        {
          backgroundColor:
            selectedTimeframe === value
              ? isDark ? "#242426" : "#F4F4F8"
              : "transparent",
        },
      ]}
      onPress={() => handleTimeframeChange(value)}
    >
      <Text
        style={[
          styles.timeframeText,
          {
            color:
              selectedTimeframe === value
                ? isDark ? "#FFF" : "#272729"
                : isDark ? "#666" : "#999",
            fontWeight: selectedTimeframe === value ? "600" : "400",
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <Wallet_screen_header
        title={assetSymbol}
        onLeftIconPress={() => navigation.goBack()}
      />
      <InfoComponent
        visible={infoVisible}
        type={infotype}
        message={infomessage}
        onClose={() => setinfoVisible(false)}
      />
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF" },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim }}>
          <View style={[styles.chartContainer,{backgroundColor:isDark?"#242426":"#F4F4F8"}]}>
            <View style={styles.headerSection}>
              <View style={styles.assetHeader}>
                <Image source={assetImage} style={styles.assetIcon} />
                <Text
                  style={[
                    styles.assetSymbol,
                    { color: isDark ? "#FFF" : "#000" },
                  ]}
                >
                  {assetSymbol}
                </Text>
              </View>

                <Text
                  style={[
                    styles.currentPrice,
                    { color: isDark ? "#FFF" : "#000" },
                  ]}
                >
                  {currentPrice?.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </Text>
                <View style={styles.priceChangeRow}>
                  <Icon
                    name={priceChange >= 0 ? "trending-up" : "trending-down"}
                    type="feather"
                    size={16}
                    color={priceChange >= 0 ? "#4ADE80" : "#FF6B6B"}
                  />
                  <Text
                    style={[
                      styles.priceChangeText,
                      { color: priceChange >= 0 ? "#4ADE80" : "#FF6B6B" },
                    ]}
                  >
                    ${Math.abs(priceChange * currentPrice / 100).toFixed(2)} ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)
                  </Text>
                  <Text
                    style={[
                      styles.priceTime,
                      { color: isDark ? "#666" : "#999" },
                    ]}
                  >
                    {priceTime}
                  </Text>
                </View>

              {chartLoading ? (
                <View style={styles.chartLoader}>
                  <ActivityIndicator
                    color={"#4052D6"}
                    size="large"
                  />
                </View>
              ) : chartError ? (
                <View style={styles.chartError}>
                  <Icon
                    name="alert-circle"
                    type="feather"
                    size={40}
                    color={isDark ? "#666" : "#999"}
                  />
                  <Text
                    style={[
                      styles.errorText,
                      { color: isDark ? "#666" : "#999" },
                    ]}
                  >
                    Unable to load chart
                  </Text>
                </View>
                ) : (
                  <LineChart
                    data={chartData}
                    adjustToWidth
                    width={wp(86)}
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
                    pointerConfig={{
                      pointerStripHeight: hp(26),
                      pointerStripColor: isDark
                        ? "rgba(255,255,255,0.15)"
                        : "rgba(0,0,0,0.12)",
                      pointerStripWidth: 1,
                      pointerColor: lineColor,
                      radius: 5,
                      pointerLabelWidth: 110,
                      pointerLabelHeight: 95,
                      activatePointersOnLongPress: false,
                      autoAdjustPointerLabelPosition: true,
                      pointerLabelComponent: (items) => {
                        setCurrentPrice(items?.[0]?.value);
                        return null;
                      },
                    }}
                  />

                )}
              </View>

              <View style={[styles.timeframeContainer,{backgroundColor:isDark?"#1B1B1C":"#FFFFFF"}]}>
                <TimeframeButton label="1H" value="1h" />
                <TimeframeButton label="1D" value="1d" />
                <TimeframeButton label="1W" value="1w" />
                <TimeframeButton label="1M" value="1m" />
              </View>
            </View>

            <View
              style={[
                styles.actionsContainer,
                { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF" },
              ]}
            >
              <ActionButton
                icon="paper-plane-outline"
                iconProvider={"ionicon"}
                label="Send"
                onPress={handleSend}
              />
              <ActionButton
                icon="vertical-align-bottom"
                iconProvider={"material"}
                label="Receive"
                onPress={handleRequest}
              />
              <ActionButton
                icon="swap-vert"
                iconProvider={"material"}
                label={`Swap${"\n"}(SDEX)`}
                onPress={handleSwap}
                customInfo={true}
                customInfoTxt={"This swap runs on Stellar’s on-chain SDEX. A small network fee (typically a fraction of a cent) is paid to the Stellar network per swap."}
              />
              <ActionButton
                icon="credit-card"
                iconProvider={"material"}
                label="Buy"
                onPress={handleBuy}
              />
              <ActionButton
                icon="bridge"
                iconProvider={"materialCommunity"}
                label="Bridge"
                onPress={()=>{
                  if (asset_type.chain === "Stellar") {
                    navigation.navigate("ExportUSDC", { Asset_type: "ETH" })
                  } else {
                    navigation.navigate("BridgeAssets", {
                      Asset_type: assetSymbol === "XLM" ? "ETH" : assetSymbol,
                    })
                  }
                }}
              />
            </View>

            {loading ? (
              <View style={[styles.statsLoader,{backgroundColor: isDark ? "#242426" : "#F4F4F8"}]}>
                <ActivityIndicator
                  color={"#4052D6"}
                  size="large"
                />
              </View>
            ): assetData && (
              <>
              <View style={[styles.aboutSection,{ backgroundColor: isDark ? "#242426" : "#F4F4F8" },]}>
              <Text
                style={[
                  styles.aboutTitle,
                  { color: isDark ? "#FFF" : "#000" },
                ]}
              >
                About
              </Text>

                <View style={styles.statRow}>
                  <View style={[styles.statItem,{backgroundColor:isDark?"#1B1B1C":"#FFFFFF"}]}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? "#E6E8EB" : "#232428" },
                      ]}
                    >
                      Last price
                    </Text>
                    <Text
                      style={[
                        styles.statValue,
                        { color: isDark ? "#E6E8EB" : "#282828" },
                      ]}
                    >
                      {assetData.total_supply !== "N/A"
                        ? `${assetData.total_supply?.toLocaleString()} ${assetSymbol}`
                        : "N/A"}
                    </Text>
                  </View>
                  <View style={[styles.statItem,{backgroundColor:isDark?"#1B1B1C":"#FFFFFF"}]}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? "#E6E8EB" : "#232428" },
                      ]}
                    >
                      Last price (USD)
                    </Text>
                    <Text
                      style={[
                        styles.statValue,
                        { color: isDark ? "#E6E8EB" : "#282828" },
                      ]}
                    >
                      ${assetData.current_price?.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.statRow}>
                  <View style={[styles.statItem,{backgroundColor:isDark?"#1B1B1C":"#FFFFFF"}]}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? "#E6E8EB" : "#232428" },
                      ]}
                    >
                      24h High
                    </Text>
                    <Text
                      style={[
                        styles.statValue,
                        { color: isDark ? "#E6E8EB" : "#282828" },
                      ]}
                    >
                      ${assetData.high_24h?.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.statItem,{backgroundColor:isDark?"#1B1B1C":"#FFFFFF"}]}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? "#E6E8EB" : "#232428" },
                      ]}
                    >
                      24h Low
                    </Text>
                    <Text
                      style={[
                        styles.statValue,
                        { color: isDark ? "#E6E8EB" : "#282828" },
                      ]}
                    >
                      ${assetData.low_24h?.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
              </>
            )}

            <View style={{ height: hp(3) }} />
          </Animated.View>
        </ScrollView>

        <RecieveAddress
          modalVisible={visible}
          setModalVisible={setVisible}
          iconType={iconType}
        />
        <TokenQrCode
          modalVisible={qrVisible}
          setModalVisible={setQrVisible}
          iconType={qrName}
          qrvalue={qrValue}
          isDark={isDark}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingTop: hp(2),
  },
  assetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: hp(0.2),
    marginLeft: wp(-1),
  },
  assetIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: wp(1),
  },
  assetSymbol: {
    fontSize: 20,
    fontWeight: "600",
  },
  priceContainer: {
    marginBottom: hp(0),
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: hp(0.5),
  },
  priceChangeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceChangeText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: wp(1),
  },
  priceTime: {
    fontSize: 14,
    marginLeft: wp(2),
  },
  chartContainer: {
    paddingHorizontal: wp(5),
    marginTop: hp(1),
  },
  chart: {
    height: hp(28),
    width: wp(90),
  },
  chartLoader: {
    height: hp(28),
    justifyContent: "center",
    alignItems: "center",
  },
  chartError: {
    height: hp(28),
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    marginTop: hp(1),
  },
  timeframeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: hp(2),
    paddingVertical: hp(0.5),
    borderRadius:10,
    marginBottom:hp(2)
  },
  timeframeButton: {
    paddingHorizontal: wp(6.5),
    paddingVertical: hp(1),
    borderRadius: 10,
  },
  timeframeText: {
    fontSize: 14,
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: wp(5),
    paddingVertical: hp(1.5),
  },
  actionButton: {
    alignItems: "center",
  },
  actionIcon: {
    width: wp(13),
    height: wp(13),
    borderRadius: wp(8),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: hp(0.8),
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "400",
    textAlign:"center"
  },
  aboutSection: {
    paddingHorizontal: wp(5),
    marginTop: hp(1),
    paddingTop:hp(2)
  },
  aboutTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: hp(1),
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: hp(2),
  },
  showMoreText: {
    fontSize: 14,
    color: "#2F7DFF",
    fontWeight: "500",
  },
  statsSection: {
    paddingHorizontal: wp(5),
    marginTop: hp(2),
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: hp(2),
  },
  statItem: {
    width:wp(43),
    padding:10,
    borderRadius:10,
  },
  statLabel: {
    fontSize: 14,
    marginBottom: hp(0.5),
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  statsLoader: {
    paddingVertical: hp(3),
    alignItems: "center",
  },
});
export default Asset_info;