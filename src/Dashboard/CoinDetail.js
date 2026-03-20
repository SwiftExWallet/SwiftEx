import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
  Dimensions,
} from "react-native";
import { useSelector } from "react-redux";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { LineChart } from "react-native-gifted-charts";
import { useNavigation } from "@react-navigation/native";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import Icon from "../icon";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const CoinDetails = (props) => {
  const navigation = useNavigation();
  const [load, setload] = useState(false);
  const [chartData, setchartData] = useState([]);
  const [timeFrame, setTimeFrame] = useState("1d");
  const [pressed, setPressed] = useState(1);
  const [lineColor, setlineColor] = useState("#4CAF50");
  const [points_data, setpoints_data] = useState();
  const [points_data_time, setpoints_data_time] = useState();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [Data, setData] = useState([]);
  const [chartError, setChartError] = useState(false);
  const prvValue = useRef(null);

  const state = useSelector((state) => state);
  const isDark = state.THEME.THEME;
  const image = props?.route?.params?.data?.image;
  const coinData = props?.route?.params?.data;

  const timeFrames = [
    { label: "1H", value: "1h", index: 0 },
    { label: "1D", value: "1d", index: 1 },
    { label: "1w", value: "1w", index: 2 },
    { label: "1m", value: "1M", index: 3 },
  ];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        await getChart(coinData?.symbol.toUpperCase(), "1d");
      } catch (error) {
        console.log("Error:", error);
      }
    };
    fetch();
  }, []);

  useEffect(() => {
    const time_fetch = async () => {
      try {
        await getChart(coinData?.symbol.toUpperCase(), timeFrame);
      } catch (error) {
        console.log("Error:", error);
      }
    };
    time_fetch();
  }, [timeFrame]);

  useEffect(() => {
    const fetch_color = async () => {
      try {
        if (Data && Data.length > 1) {
          const last_Value = Data[Data.length - 1].value;
          const second_LastValue = Data[Data.length - 2].value;
          const line_Color = last_Value > second_LastValue ? "#40BF6A" : "#FF6B6B";
          setlineColor(line_Color);
        }
      } catch (error) {
        console.log("Error:", error);
      }
    };
    fetch_color();
  }, [Data]);

  async function getChart(name, timeFrame) {
    setload(false);
    setChartError(false);
    const intervals = {
      "1h": "1h",
      "1d": "1d",
      "1w": "1w",
      "1M": "1M",
    };

    if (name === "USDT") name = "USDC";

    const interval = intervals[timeFrame] || "1d";

    try {
      const resp = await fetch(
        `https://api.binance.com/api/v1/klines?symbol=${name}USDT&interval=${interval}&limit=150`,
        { method: "GET" }
      );
      
      if (!resp.ok) {
        throw new Error('Failed to fetch chart data');
      }
      
      const data = await resp.json();

      if (!data || data.length === 0) {
        throw new Error('No chart data available');
      }

      const transformedData = data.map((item) => ({
        x: new Date(item[0]),
        y: parseFloat(item[4]),
      }));

      const ptData = transformedData.map((item) => ({
        value: item.y,
        date: new Date(item.x).toLocaleTimeString(),
      }));

      const pt_Data = data.map((item) => ({
        value: parseFloat(item[4]),
      }));

      setData(ptData);
      setchartData(pt_Data);
      setpoints_data(ptData[ptData?.length - 1]?.value);
      setpoints_data_time(ptData[ptData?.length - 1]?.date);

      setTimeout(() => {
        setload(true);
      }, 500);
    } catch (err) {
      console.log("Chart Error:", err);
      setChartError(true);
      setload(true);
      setpoints_data(coinData?.currentPrice);
      setpoints_data_time(new Date().toLocaleTimeString());
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF"}]}>
      <Wallet_screen_header title="Coin-Detail" onLeftIconPress={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} style={[styles.scrollView,{backgroundColor:isDark?"#242426":"#F4F4F8"}]}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Main Card */}
          <View style={[styles.mainCard, { backgroundColor: isDark ? "#242426" : "#F4F4F8" }]}>
            {/* Coin Header */}
            <View style={styles.coinHeader}>
              <Image source={{ uri: image }} style={styles.coinIcon} />
              <Text style={[styles.coinName, { color: isDark ? "#FFF" : "#272729" }]}>
                {coinData?.symbol?.toUpperCase()}
              </Text>
            </View>

            {/* Price */}
            <Text style={[styles.mainPrice, { color: isDark ? "#FFF" : "#272729" }]}>
              {points_data?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || coinData?.currentPrice?.toLocaleString()}
            </Text>

            {/* Price Change */}
            <View style={styles.priceChangeContainer}>
              <Icon name="trending-up" type="feather" size={16} color="#4CAF50" />
              <Text style={styles.priceChangeAmount}>
                ${Math.abs(coinData?.priceChange24h || 294.38).toFixed(2)}
              </Text>
              <Text style={styles.priceChangePercent}>
                (+{coinData?.priceChangePercentage24h?.toFixed(1) || "1.6"}%)
              </Text>
            </View>

            {/* Chart */}
            <View style={styles.chartContainer}>
              {!load ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator color="#4052D6" size="large" />
                </View>
              ) : chartError ? (
                <View style={styles.errorContainer}>
                  <Text style={[styles.errorText, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
                    Chart unavailable
                  </Text>
                </View>
              ) : (
                    <LineChart
                      data={chartData}
                      adjustToWidth
                      width={SCREEN_WIDTH - wp(8)}
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
                          const val = items?.[0]?.value;
                          if (prvValue.current !== val) {
                            prvValue.current = val;
                            setTimeout(() => setpoints_data(val), 0);
                          } 
                          return null;
                        },
                      }}
                    />
              )}
            </View>

            {/* Timeframe Buttons */}
            <View style={[styles.timeframeContainer,{backgroundColor:isDark?"#1B1B1C":"#FFFFFF"}]}>
              {timeFrames.map((tf) => (
                <TouchableOpacity
                  key={tf.index}
                  style={[
                    styles.timeframeButton,
                    pressed === tf.index && [
                      {backgroundColor:
                          isDark ? "#242426" : "#F4F4F8"}
                    ],
                  ]}
                  onPress={() => {
                    setPressed(tf.index);
                    setTimeFrame(tf.value);
                  }}
                >
                  <Text
                    style={[
                      styles.timeframeText,
                      {
                        color: pressed === tf.index
                        ? isDark ? "#FFF" : "#272729"
                        : isDark ? "#666" : "#999",
                      },
                    ]}
                  >
                    {tf.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Info Cards Grid */}
          <View style={styles.infoGrid}>
            <View style={[styles.infoCard, { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
              Price change 24H
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              {props?.route?.params?.data?.priceChangePercentage24h}%
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
                Last price (USD)
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              ${props?.route?.params?.data?.currentPrice}
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
              24H high
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              ${props?.route?.params?.data?.high24h}
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: isDark ? "#1B1B1C" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
              24H Low
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              ${props?.route?.params?.data?.low24h}
              </Text>
            </View>
          </View>

          <View style={{ height: hp(4) }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: wp(5),
    paddingTop: hp(6),
    paddingBottom: hp(2),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  settingsButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  mainCard: {
    marginTop: hp(0.5),
    paddingTop: wp(4),
    paddingHorizontal: wp(4),
    paddingBottom: wp(3),
  },
  coinHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: hp(0.2),
    marginLeft: wp(-1),
  },
  coinIcon: {
    width: 28,
    height: 28,
    marginRight: wp(2),
    borderRadius: 14,
  },
  coinName: {
    fontSize: 15,
    fontWeight: "600",
  },
  mainPrice: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: hp(0.5),
  },
  priceChangeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: hp(2),
  },
  priceChangeAmount: {
    color: "#4CAF50",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: wp(1),
  },
  priceChangePercent: {
    color: "#4CAF50",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: wp(1),
  },
  todayLabel: {
    fontSize: 15,
    marginLeft: wp(1.5),
  },
  chartContainer: {
    height: hp(28),
    marginBottom: hp(1.5),
    marginHorizontal: -wp(2),
  },
  chart: {
    height: hp(28),
    width: wp(90),
  },
  loaderContainer: {
    height: hp(28),
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    height: hp(28),
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
  },
  timeframeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: hp(2),
    paddingVertical: hp(0.2),
    paddingHorizontal:wp(2),
    borderRadius:10,
    marginBottom:hp(2)
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: hp(1),
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  timeframeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  aboutCard: {
    marginHorizontal: wp(1),
    padding: wp(2),
  },
  aboutTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: hp(1),
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: hp(1),
  },
  showMoreButton: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "500",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginHorizontal: wp(4),
    marginTop: hp(2),
  },
  infoCard: {
    width: wp(43.5),
    padding: wp(4),
    borderRadius: 16,
    marginBottom: hp(1.5),
  },
  infoLabel: {
    fontSize: 13,
    marginBottom: hp(0.8),
  },
  infoValue: {
    fontSize: 17,
    fontWeight: "700",
  },
});