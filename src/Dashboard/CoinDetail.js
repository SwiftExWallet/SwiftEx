import React, { useEffect, useState } from "react";
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
  PanResponder,
} from "react-native";
import { useSelector } from "react-redux";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Path as SvgPath,
  Circle,
  Text as SvgText,
  Rect,
} from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import Icon from "../icon";
import { colors } from "../Screens/ThemeColorsConfig";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CoinSparkline = React.memo(
  ({
    data = [],
    width,
    height = 220,
    color = "#40BF6A",
    isDark = false,
    onPriceChange,
    onDragEnd,
  }) => {
    const [activeIndex, setActiveIndex] =
      React.useState(null);

    const topPad = 14;
    const bottomPad = 25;
    const leftPad = 4;
    const rightPad = 56;

    if (!data || data.length < 2) {
      return null;
    }

    const chartWidth =
      width - leftPad - rightPad;

    const chartHeight =
      height - topPad - bottomPad;

    /* =====================================
       VALUES
    ===================================== */

    const values = data.map(
      item => Number(item.value) || 0
    );

    const max = Math.max(...values);
    const min = Math.min(...values);

    const range =
      max - min ||
      Math.max(
        Math.abs(max) * 0.02,
        0.000001
      );

    const scaleMax =
      max + range * 0.12;

    const scaleMin =
      min - range * 0.12;

    /* =====================================
       SCALE
    ===================================== */

    const toX = index =>
      leftPad +
      (index / (data.length - 1)) *
        chartWidth;

    const toY = value =>
      topPad +
      (1 -
        (value - scaleMin) /
          (scaleMax - scaleMin)) *
        chartHeight;

    /* =====================================
       POINTS
    ===================================== */

    const points = data.map(
      (item, index) => ({
        x: toX(index),

        y: toY(
          Number(item.value) || 0
        ),

        value:
          Number(item.value) || 0,

        timestamp:
          item.timestamp,
      })
    );

    /* =====================================
       SMOOTH CURVE
    ===================================== */

    const createSmoothPath = pts => {
      if (!pts.length) {
        return "";
      }

      let path =
        `M ${pts[0].x.toFixed(2)} ` +
        `${pts[0].y.toFixed(2)}`;

      for (
        let i = 0;
        i < pts.length - 1;
        i++
      ) {
        const p0 =
          pts[Math.max(i - 1, 0)];

        const p1 = pts[i];
        const p2 = pts[i + 1];

        const p3 =
          pts[
            Math.min(
              i + 2,
              pts.length - 1
            )
          ];

        const cp1x =
          p1.x +
          (p2.x - p0.x) / 6;

        const cp1y =
          p1.y +
          (p2.y - p0.y) / 6;

        const cp2x =
          p2.x -
          (p3.x - p1.x) / 6;

        const cp2y =
          p2.y -
          (p3.y - p1.y) / 6;

        path +=
          ` C ` +
          `${cp1x.toFixed(2)} ` +
          `${cp1y.toFixed(2)} ` +
          `${cp2x.toFixed(2)} ` +
          `${cp2y.toFixed(2)} ` +
          `${p2.x.toFixed(2)} ` +
          `${p2.y.toFixed(2)}`;
      }

      return path;
    };

    const linePath =
      createSmoothPath(points);

    /* =====================================
       AREA PATH
    ===================================== */

    const bottomY =
      topPad + chartHeight;

    const areaPath =
      `${linePath} ` +
      `L ${
        points[points.length - 1].x
      } ${bottomY} ` +
      `L ${leftPad} ${bottomY} Z`;

    /* =====================================
       Y LABELS
    ===================================== */

    const yValues = [
      scaleMax,
      (scaleMax + scaleMin) / 2,
      scaleMin,
    ];

    /* =====================================
       X LABELS
    ===================================== */

    const xIndexes = [
      0,

      Math.floor(
        (data.length - 1) / 2
      ),

      data.length - 1,
    ];

    /* =====================================
       PRICE FORMAT
    ===================================== */

    const formatPrice = value => {
      if (!Number.isFinite(value)) {
        return "$0";
      }

      if (Math.abs(value) >= 1000) {
        return `$${value.toLocaleString(
          "en-US",
          {
            maximumFractionDigits: 0,
          }
        )}`;
      }

      if (Math.abs(value) >= 1) {
        return `$${value.toFixed(2)}`;
      }

      if (Math.abs(value) >= 0.01) {
        return `$${value.toFixed(3)}`;
      }

      return `$${value.toFixed(5)}`;
    };

    /* =====================================
       DATE
    ===================================== */

    const formatBottomDate = timestamp => {
      if (!timestamp) {
        return "";
      }

      const date =
        new Date(Number(timestamp));

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return "";
      }

      return date.toLocaleDateString(
        "en-US",
        {
          day: "numeric",
          month: "short",
        }
      );
    };

    const formatTooltipDate =
      timestamp => {
        if (!timestamp) {
          return "";
        }

        const date =
          new Date(Number(timestamp));

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return "";
        }

        return date.toLocaleString(
          "en-US",
          {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }
        );
      };

    /* =====================================
       NORMAL DOTS
    ===================================== */

    let dotIndexes = [];

    if (data.length <= 12) {
      dotIndexes =
        data.map(
          (_, index) => index
        );
    } else {
      dotIndexes = [
        0,

        Math.floor(
          (data.length - 1) * 0.14
        ),

        Math.floor(
          (data.length - 1) * 0.29
        ),

        Math.floor(
          (data.length - 1) * 0.43
        ),

        Math.floor(
          (data.length - 1) * 0.57
        ),

        Math.floor(
          (data.length - 1) * 0.71
        ),

        Math.floor(
          (data.length - 1) * 0.86
        ),

        data.length - 1,
      ];
    }

    dotIndexes = [
      ...new Set(dotIndexes),
    ];

    /* =====================================
       DRAG
    ===================================== */

    const handleTouch = x => {
      const boundedX =
        Math.max(
          leftPad,
          Math.min(
            x,
            leftPad + chartWidth
          )
        );

      const percentage =
        (boundedX - leftPad) /
        chartWidth;

      let index =
        Math.round(
          percentage *
            (data.length - 1)
        );

      index =
        Math.max(
          0,
          Math.min(
            index,
            data.length - 1
          )
        );

      setActiveIndex(index);

      onPriceChange?.(
        data[index]?.value,
        data[index]?.timestamp
      );
    };

    const panResponder =
      React.useMemo(
        () =>
          PanResponder.create({
            onStartShouldSetPanResponder:
              () => true,

            onMoveShouldSetPanResponder:
              () => true,

            onPanResponderGrant:
              event => {
                handleTouch(
                  event.nativeEvent
                    .locationX
                );
              },

            onPanResponderMove:
              event => {
                handleTouch(
                  event.nativeEvent
                    .locationX
                );
              },

            onPanResponderRelease:
              () => {
                setActiveIndex(null);

                onDragEnd?.();
              },

            onPanResponderTerminate:
              () => {
                setActiveIndex(null);

                onDragEnd?.();
              },
          }),
        [data, chartWidth]
      );

    const activePoint =
      activeIndex !== null
        ? points[activeIndex]
        : null;

    /* =====================================
       TOOLTIP POSITION
    ===================================== */

    const tooltipWidth = 125;
    const tooltipHeight = 50;

    let tooltipX =
      activePoint
        ? activePoint.x -
          tooltipWidth / 2
        : 0;

    if (tooltipX < 4) {
      tooltipX = 4;
    }

    if (
      tooltipX +
        tooltipWidth >
      width - 4
    ) {
      tooltipX =
        width -
        tooltipWidth -
        4;
    }

    let tooltipY =
      activePoint
        ? activePoint.y -
          tooltipHeight -
          13
        : 0;

    if (tooltipY < 2) {
      tooltipY =
        activePoint
          ? activePoint.y + 14
          : 2;
    }

    /* =====================================
       RENDER
    ===================================== */

    return (
      <View
        {...panResponder.panHandlers}
        style={{
          width,
          height,
        }}
      >
        <Svg
          width={width}
          height={height}
        >
          <Defs>
            <SvgLinearGradient
              id="coinChartGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop
                offset="0%"
                stopColor={color}
                stopOpacity="0.28"
              />

              <Stop
                offset="65%"
                stopColor={color}
                stopOpacity="0.06"
              />

              <Stop
                offset="100%"
                stopColor={color}
                stopOpacity="0"
              />
            </SvgLinearGradient>
          </Defs>

          {/* Gradient */}

          <SvgPath
            d={areaPath}
            fill="url(#coinChartGradient)"
          />

          {/* Middle dotted line */}

          <SvgPath
            d={
              `M ${leftPad} ` +
              `${toY(yValues[1])} ` +
              `L ${
                leftPad + chartWidth
              } ` +
              `${toY(yValues[1])}`
            }
            fill="none"
            stroke="#8D91FF"
            strokeWidth={1.2}
            strokeDasharray="4 5"
            opacity={0.75}
          />

          {/* Main curve */}

          <SvgPath
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Normal points */}

          {dotIndexes.map(index => {
            const point =
              points[index];

            if (!point) {
              return null;
            }

            return (
              <Circle
                key={`dot-${index}`}
                cx={point.x}
                cy={point.y}
                r={4}
                fill={color}
                stroke={
                  isDark
                    ? "#0B0D12"
                    : "#111827"
                }
                strokeWidth={1.7}
              />
            );
          })}

          {/* Drag vertical line */}

          {activePoint && (
            <SvgPath
              d={
                `M ${activePoint.x} ` +
                `${topPad} ` +
                `L ${activePoint.x} ` +
                `${bottomY}`
              }
              fill="none"
              stroke={
                isDark
                  ? "#9CA3AF"
                  : "#747986"
              }
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Selected point */}

          {activePoint && (
            <>
              <Circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={9}
                fill={color}
                opacity={0.18}
              />

              <Circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={5}
                fill={color}
                stroke={
                  isDark
                    ? "#FFFFFF"
                    : "#111827"
                }
                strokeWidth={2}
              />
            </>
          )}

          {/* Tooltip */}

          {activePoint && (
            <>
              <Rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx={8}
                fill={
                  isDark
                    ? "#202127"
                    : "#FFFFFF"
                }
                stroke={
                  isDark
                    ? "#34363D"
                    : "#E2E4E9"
                }
                strokeWidth={1}
              />

              <SvgText
                x={
                  tooltipX +
                  tooltipWidth / 2
                }
                y={tooltipY + 20}
                textAnchor="middle"
                fill={
                  isDark
                    ? "#FFFFFF"
                    : "#111827"
                }
                fontSize="12"
                fontWeight="600"
              >
                {formatPrice(
                  activePoint.value
                )}
              </SvgText>

              <SvgText
                x={
                  tooltipX +
                  tooltipWidth / 2
                }
                y={tooltipY + 38}
                textAnchor="middle"
                fill={
                  isDark
                    ? "#A4A6B3"
                    : "#858896"
                }
                fontSize="9"
              >
                {formatTooltipDate(
                  activePoint.timestamp
                )}
              </SvgText>
            </>
          )}

          {/* Right price labels */}

          {yValues.map(
            (value, index) => (
              <SvgText
                key={`y-${index}`}
                x={
                  leftPad +
                  chartWidth +
                  7
                }
                y={
                  toY(value) + 4
                }
                fill={
                  isDark
                    ? "#8E919D"
                    : "#858896"
                }
                fontSize="10"
              >
                {formatPrice(value)}
              </SvgText>
            )
          )}

          {/* Bottom dates */}

          {xIndexes.map(
            (index, position) => (
              <SvgText
                key={`x-${index}`}
                x={
                  points[index].x
                }
                y={height - 3}
                fill={
                  isDark
                    ? "#8E919D"
                    : "#858896"
                }
                fontSize="10"
                textAnchor={
                  position === 0
                    ? "start"
                    : position ===
                      xIndexes.length - 1
                    ? "end"
                    : "middle"
                }
              >
                {formatBottomDate(
                  data[index]
                    ?.timestamp
                )}
              </SvgText>
            )
          )}
        </Svg>
      </View>
    );
  }
);

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

      const ptData = data.map((item) => ({
        value: parseFloat(item[4]),
        timestamp: Number(item[0]),
        date: new Date(
          Number(item[0])
        ).toLocaleString(),
      }));

      const pt_Data = data.map((item) => ({
        value: parseFloat(item[4]),
        timestamp: Number(item[0]),
      }));

      setData(ptData);
      setchartData(pt_Data);
      setpoints_data(ptData[ptData.length - 1]?.value);
      setpoints_data_time(ptData[ptData.length - 1]?.date);

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
    <View style={[styles.container, { backgroundColor: isDark ? colors.dark.bg : colors.light.bg}]}>
      <Wallet_screen_header title="Coin-Detail" onLeftIconPress={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} style={[styles.scrollView,{backgroundColor:isDark?colors.dark.bg:colors.light.bg}]}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Main Card */}
          <View style={[styles.mainCard, { backgroundColor: isDark ? colors.dark.bg : colors.light.bg }]}>
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

                <View
                  style={
                    styles.loaderContainer
                  }
                >
                  <ActivityIndicator
                    color="#4052D6"
                    size="large"
                  />
                </View>

              ) : chartError ? (

                <View
                  style={
                    styles.errorContainer
                  }
                >
                  <Text
                    style={[
                      styles.errorText,
                      {
                        color:
                          "#8E8E93",
                      },
                    ]}
                  >
                    Chart unavailable
                  </Text>
                </View>

              ) : (

                <CoinSparkline

                  data={chartData}

                  width={
                    SCREEN_WIDTH -
                    wp(8)
                  }

                  height={hp(28)}

                  color={lineColor}

                  isDark={isDark}

                  onPriceChange={(
                    value,
                    timestamp
                  ) => {

                    setpoints_data(
                      Number(value)
                    );

                    if (timestamp) {

                      setpoints_data_time(
                        new Date(
                          Number(timestamp)
                        ).toLocaleString()
                      );

                    }
                  }}

                  onDragEnd={() => {

                    const lastPoint =
                      chartData[
                      chartData.length - 1
                      ];

                    if (!lastPoint) {
                      return;
                    }

                    setpoints_data(
                      Number(
                        lastPoint.value
                      )
                    );

                    if (
                      lastPoint.timestamp
                    ) {

                      setpoints_data_time(
                        new Date(
                          Number(
                            lastPoint.timestamp
                          )
                        ).toLocaleString()
                      );

                    }
                  }}

                />

              )}

            </View>

            {/* Timeframe Buttons */}
            <View style={[styles.timeframeContainer,{backgroundColor:isDark?"#0B0B0F":"#FFFFFF"}]}>
              {timeFrames.map((tf) => (
                <TouchableOpacity
                  key={tf.index}
                  style={[
                    styles.timeframeButton,
                    pressed === tf.index && [
                      {backgroundColor:
                          isDark ? colors.dark.bg : colors.light.bg}
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
            <View style={[styles.infoCard, { backgroundColor: isDark ? "#0B0B0F" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
              Price change 24H
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              {props?.route?.params?.data?.priceChangePercentage24h}%
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: isDark ? "#0B0B0F" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
                Last price (USD)
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              ${props?.route?.params?.data?.currentPrice}
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: isDark ? "#0B0B0F" : "#FFFFFF" }]}>
              <Text style={[styles.infoLabel, { color: isDark ? "#8E8E93" : "#8E8E93" }]}>
              24H high
              </Text>
              <Text style={[styles.infoValue, { color: isDark ? "#FFF" : "black" }]}>
              ${props?.route?.params?.data?.high24h}
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: isDark ? "#0B0B0F" : "#FFFFFF" }]}>
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