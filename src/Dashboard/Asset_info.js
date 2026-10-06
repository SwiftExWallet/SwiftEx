import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  PanResponder,
} from "react-native";

import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Path as SvgPath,
  Circle,
  Text as SvgText,
} from "react-native-svg";

import Icon from "../icon";

import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";

import { useNavigation } from "@react-navigation/native";


import {
  REACT_APP_LOCAL_TOKEN,
} from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";

import AsyncStorageLib from "@react-native-async-storage/async-storage";

import { alert } from "./reusables/Toasts";

import { useSelector } from "react-redux";

import {
  Wallet_screen_header,
} from "./reusables/ExchangeHeader";

import TokenQrCode from "./Modals/TokensQrCode";

import InfoComponent from "./exchange/crypto-exchange-front-end-main/src/components/InfoComponent";

import LinearGradient from "react-native-linear-gradient";

import {
  CHAINTOCHARTID,
} from "../utilities/TokenUtils";

import {
  colors,
} from "../Screens/ThemeColorsConfig";

import {
  STELLAR_URL,
} from "./constants";


/* ============================================================
   CUSTOM CHART
============================================================ */

const AssetSparkline = React.memo(
  ({
    data,
    width,
    height,
    color,
    isDark,
    onPriceChange,
  }) => {
    const [activeIndex, setActiveIndex] =
      React.useState(null);

    const topPad = 14;
    const bottomPad = 24;
    const leftPad = 4;
    const rightPad = 54;

    if (!data || data.length < 2) {
      return null;
    }

    const chartH =
      height - topPad - bottomPad;

    const chartW =
      width - leftPad - rightPad;

    /* ===============================
       VALUES
    =============================== */

    const values = data.map(
      item => Number(item.value) || 0
    );

    const max = Math.max(...values);
    const min = Math.min(...values);

    const span =
      max - min ||
      Math.max(
        Math.abs(max) * 0.02,
        0.000001
      );

    const sMax =
      max + span * 0.12;

    const sMin =
      min - span * 0.12;

    /* ===============================
       SCALE
    =============================== */

    const toX = index =>
      leftPad +
      (index / (data.length - 1)) *
        chartW;

    const toY = value =>
      topPad +
      (1 -
        (value - sMin) /
          (sMax - sMin)) *
        chartH;

    /* ===============================
       POINTS
    =============================== */

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

    /* ===============================
       SMOOTH PATH
    =============================== */

    const buildPath = pts => {
      let path =
        `M ${pts[0].x.toFixed(1)} ` +
        `${pts[0].y.toFixed(1)}`;

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
          `${cp1x.toFixed(1)} ` +
          `${cp1y.toFixed(1)} ` +
          `${cp2x.toFixed(1)} ` +
          `${cp2y.toFixed(1)} ` +
          `${p2.x.toFixed(1)} ` +
          `${p2.y.toFixed(1)}`;
      }

      return path;
    };

    const linePath =
      buildPath(points);

    const bottomY =
      topPad + chartH;

    const areaPath =
      `${linePath} ` +
      `L ${
        points[
          points.length - 1
        ].x
      } ${bottomY} ` +
      `L ${leftPad} ${bottomY} Z`;

    /* ===============================
       Y LABELS
    =============================== */

    const yTicks = [
      sMax,
      (sMax + sMin) / 2,
      sMin,
    ];

    /* ===============================
       X LABELS
    =============================== */

    const tickIndexes = [
      0,

      Math.floor(
        (data.length - 1) / 2
      ),

      data.length - 1,
    ];

    /* ===============================
       PRICE FORMAT
    =============================== */

    const formatPrice = value => {
      if (
        Math.abs(value) >= 1000
      ) {
        return `$${value.toLocaleString(
          "en-US",
          {
            maximumFractionDigits: 2,
          }
        )}`;
      }

      if (
        Math.abs(value) >= 1
      ) {
        return `$${value.toFixed(2)}`;
      }

      if (
        Math.abs(value) >= 0.01
      ) {
        return `$${value.toFixed(3)}`;
      }

      return `$${value.toFixed(5)}`;
    };

    /* ===============================
       DATE FORMAT
    =============================== */

    const formatDate = timestamp => {
      if (!timestamp) return "";

      const date =
        new Date(
          Number(timestamp)
        );

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

    /* ===============================
       NORMAL DOTS
    =============================== */

    const dotIndexes =
      data.length <= 12
        ? data.map(
            (_, index) => index
          )
        : Array.from(
            new Set([
              0,

              Math.floor(
                (data.length - 1) *
                  0.14
              ),

              Math.floor(
                (data.length - 1) *
                  0.29
              ),

              Math.floor(
                (data.length - 1) *
                  0.43
              ),

              Math.floor(
                (data.length - 1) *
                  0.57
              ),

              Math.floor(
                (data.length - 1) *
                  0.71
              ),

              Math.floor(
                (data.length - 1) *
                  0.86
              ),

              data.length - 1,
            ])
          );

    /* ===============================
       DRAG HANDLER
    =============================== */

    const handleTouch = x => {
      /*
       * Finger X ko chart ke
       * andar clamp kar rahe hain.
       */

      const clampedX =
        Math.max(
          leftPad,
          Math.min(
            x,
            leftPad + chartW
          )
        );

      /*
       * X coordinate -> nearest
       * data index
       */

      const ratio =
        (clampedX - leftPad) /
        chartW;

      let index =
        Math.round(
          ratio *
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

      if (onPriceChange) {
        onPriceChange(
          data[index]?.value
        );
      }
    };

    /* ===============================
       PAN RESPONDER
    =============================== */

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
              },

            onPanResponderTerminate:
              () => {
                setActiveIndex(null);
              },
          }),

        [
          data,
          width,
          chartW,
        ]
      );

    /* ===============================
       ACTIVE POINT
    =============================== */

    const activePoint =
      activeIndex !== null
        ? points[activeIndex]
        : null;

    /* ===============================
       TOOLTIP SIZE
    =============================== */

    const tooltipWidth = 118;
    const tooltipHeight = 48;

    let tooltipX =
      activePoint
        ? activePoint.x -
          tooltipWidth / 2
        : 0;

    /*
     * Tooltip screen ke bahar
     * na nikle.
     */

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
          12
        : 0;

    /*
     * Agar point top ke paas hai
     * to tooltip niche show hoga.
     */

    if (
      tooltipY <
      topPad
    ) {
      tooltipY =
        activePoint
          ? activePoint.y + 12
          : topPad;
    }

    /* ===============================
       RENDER
    =============================== */

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
          {/* GRADIENT */}

          <Defs>
            <SvgLinearGradient
              id="assetChartGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop
                offset="0%"
                stopColor={color}
                stopOpacity="0.25"
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

          {/* AREA */}

          <SvgPath
            d={areaPath}
            fill="url(#assetChartGradient)"
          />

          {/* HORIZONTAL DASHED LINE */}

          <SvgPath
            d={
              `M ${leftPad} ` +
              `${toY(yTicks[1])} ` +
              `L ${
                leftPad + chartW
              } ` +
              `${toY(yTicks[1])}`
            }
            fill="none"
            stroke="#8D91FF"
            strokeWidth={1.2}
            strokeDasharray="4 5"
            opacity={0.8}
          />

          {/* MAIN LINE */}

          <SvgPath
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* NORMAL DOTS */}

          {dotIndexes.map(
            index => {
              const point =
                points[index];

              if (!point) {
                return null;
              }

              return (
                <Circle
                  key={
                    `dot-${index}`
                  }
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
            }
          )}

          {/* =========================
              DRAG VERTICAL LINE
          ========================= */}

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
                  ? "#6B7280"
                  : "#A5A8B2"
              }
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* =========================
              ACTIVE BIG DOT
          ========================= */}

          {activePoint && (
            <>
              <Circle
                cx={
                  activePoint.x
                }
                cy={
                  activePoint.y
                }
                r={8}
                fill={color}
                opacity={0.18}
              />

              <Circle
                cx={
                  activePoint.x
                }
                cy={
                  activePoint.y
                }
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

          {/* =========================
              TOOLTIP
          ========================= */}

          {activePoint && (
            <>
              <SvgPath
                d={`
                  M ${tooltipX + 8}
                    ${tooltipY}

                  L ${
                    tooltipX +
                    tooltipWidth -
                    8
                  }
                    ${tooltipY}

                  Q ${
                    tooltipX +
                    tooltipWidth
                  }
                    ${tooltipY}

                    ${
                      tooltipX +
                      tooltipWidth
                    }
                    ${
                      tooltipY + 8
                    }

                  L ${
                    tooltipX +
                    tooltipWidth
                  }
                    ${
                      tooltipY +
                      tooltipHeight -
                      8
                    }

                  Q ${
                    tooltipX +
                    tooltipWidth
                  }
                    ${
                      tooltipY +
                      tooltipHeight
                    }

                    ${
                      tooltipX +
                      tooltipWidth -
                      8
                    }
                    ${
                      tooltipY +
                      tooltipHeight
                    }

                  L ${tooltipX + 8}
                    ${
                      tooltipY +
                      tooltipHeight
                    }

                  Q ${tooltipX}
                    ${
                      tooltipY +
                      tooltipHeight
                    }

                    ${tooltipX}
                    ${
                      tooltipY +
                      tooltipHeight -
                      8
                    }

                  L ${tooltipX}
                    ${
                      tooltipY + 8
                    }

                  Q ${tooltipX}
                    ${tooltipY}

                    ${
                      tooltipX + 8
                    }
                    ${tooltipY}

                  Z
                `}
                fill={
                  isDark
                    ? "#202127"
                    : "#FFFFFF"
                }
                stroke={
                  isDark
                    ? "#34363D"
                    : "#E5E7EB"
                }
                strokeWidth={1}
              />

              {/* PRICE */}

              <SvgText
                x={
                  tooltipX +
                  tooltipWidth / 2
                }
                y={
                  tooltipY + 20
                }
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

              {/* DATE */}

              <SvgText
                x={
                  tooltipX +
                  tooltipWidth / 2
                }
                y={
                  tooltipY + 38
                }
                textAnchor="middle"
                fill={
                  isDark
                    ? "#A4A6B3"
                    : "#858896"
                }
                fontSize="9"
              >
                {formatDate(
                  activePoint.timestamp
                )}
              </SvgText>
            </>
          )}

          {/* =========================
              RIGHT Y LABELS
          ========================= */}

          {yTicks.map(
            (
              value,
              index
            ) => (
              <SvgText
                key={
                  `y-${index}`
                }
                x={
                  leftPad +
                  chartW +
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
                {formatPrice(
                  value
                )}
              </SvgText>
            )
          )}

          {/* =========================
              X DATE LABELS
          ========================= */}

          {tickIndexes.map(
            (
              index,
              position
            ) => (
              <SvgText
                key={
                  `x-${index}`
                }
                x={
                  points[index].x
                }
                y={
                  height - 3
                }
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
                      tickIndexes.length -
                        1
                    ? "end"
                    : "middle"
                }
              >
                {formatDate(
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


/* ============================================================
   MAIN SCREEN
============================================================ */

const Asset_info = ({ route }) => {

  const state =
    useSelector(
      state => state,
    );


  const isDark =
    state.THEME.THEME;


  const {
    asset_type,
  } = route.params;


  const navigation =
    useNavigation();


  /* ================================
     STATES
  ================================= */

  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    chartLoading,
    setChartLoading,
  ] = useState(true);


  const [
    chartError,
    setChartError,
  ] = useState(false);


  const [
    fadeAnim,
  ] = useState(
    new Animated.Value(0),
  );

  const [
    qrVisible,
    setQrVisible,
  ] = useState(false);


  const [
    qrValue,
    setQrValue,
  ] = useState("");


  const [
    qrName,
    setQrName,
  ] = useState("");


  const [
    iconType,
    setIconType,
  ] = useState("");


  const [
    selectedTimeframe,
    setSelectedTimeframe,
  ] = useState("1w");


  const [
    token,
    setToken,
  ] = useState("");


  const [
    assetData,
    setAssetData,
  ] = useState(null);


  const [
    chartData,
    setChartData,
  ] = useState([]);


  const [
    lineColor,
    setLineColor,
  ] = useState("#00C389");


  const [
    currentPrice,
    setCurrentPrice,
  ] = useState(0);


  const [
    priceChange,
    setPriceChange,
  ] = useState(0);


  const [
    priceTime,
    setPriceTime,
  ] = useState("");


  const [
    infoVisible,
    setinfoVisible,
  ] = useState("");


  const [
    infotype,
    setinfotype,
  ] = useState("");


  const [
    infomessage,
    setinfomessage,
  ] = useState("");


  /* ================================
     ASSET SYMBOL
  ================================= */

  const assetSymbol =
    useMemo(
      () =>
        asset_type
          ?.symbol
          ?.toUpperCase() ||
        asset_type?.symbol,

      [asset_type],
    );


  /* ================================
     ASSET IMAGE
  ================================= */

  const assetImage =
    useMemo(
      () => ({

        uri:
          asset_type?.img ||
          asset_type?.imageUrl,

      }),

      [
        assetSymbol,
        asset_type,
      ],
    );


  /* ================================
     FADE ANIMATION
  ================================= */

  useEffect(
    () => {

      Animated.timing(
        fadeAnim,
        {

          toValue: 1,

          duration: 800,

          useNativeDriver:
            true,

        },
      ).start();

    },
    [],
  );


  /* ================================
     INITIAL DATA
  ================================= */

  useEffect(
    () => {

      initializeData();

    },
    [],
  );


  const initializeData =
    async () => {

      try {

        const storedToken =
          await AsyncStorageLib.getItem(
            REACT_APP_LOCAL_TOKEN,
          );


        setToken(
          storedToken,
        );


        setChartLoading(
          true,
        );


        setLoading(
          true,
        );


        await Promise.all([

          fetchAssetData(
            assetSymbol,
          ),

          fetchChartData(
            assetSymbol,
            selectedTimeframe,
          ),

        ]);


      } catch (error) {

        console.error(
          "Initialization error:",
          error,
        );


        alert(
          "error",
          "Failed to load asset data",
        );

      }
    };


  /* ================================
     ASSET DATA
  ================================= */

  const fetchAssetData =
    async symbol => {

      try {

        if (
          symbol === "XLM"
        ) {

          await fetchXLMData();

        } else {

          await fetchBinanceData(
            symbol,
          );

        }

      } catch (error) {

        console.error(
          "Asset data fetch error:",
          error,
        );


        setLoading(false);

      }
    };


  /* ================================
     XLM DATA
  ================================= */

  const fetchXLMData =
    async () => {

      try {

        const response =
          await fetch(
            "https://api.coingecko.com/api/v3/coins/stellar",
          );


        const result =
          await response.json();


        setAssetData({

          current_price:
            result.market_data
              .current_price.usd,

          high_24h:
            result.market_data
              .high_24h.usd,

          low_24h:
            result.market_data
              .low_24h.usd,

          market_cap:
            result.market_data
              .market_cap.usd,

          total_volume:
            result.market_data
              .total_volume.usd,

          total_supply:
            result.market_data
              .total_supply,

          price_change_percentage_24h:
            result.market_data
              .price_change_percentage_24h,

        });


        setCurrentPrice(
          result.market_data
            .current_price.usd,
        );


        setPriceChange(
          result.market_data
            .price_change_percentage_24h,
        );


        setLoading(false);


      } catch (error) {

        console.log(
          "XLM data error:",
          error,
        );


        setLoading(false);

      }
    };


  /* ============================================================
     STELLAR CHART
  ============================================================ */

  const STELLAR_USDC_ISSUER =
    "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";


  const getStellarPriceChart =
    async ({
      code,
      issuer,
      timeframe = "1w",
    }) => {

      const timeframeConfig = {

        "1h": {
          duration:
            60 *
            60 *
            1000,

          resolution:
            60 *
            1000,
        },


        "1d": {
          duration:
            24 *
            60 *
            60 *
            1000,

          resolution:
            5 *
            60 *
            1000,
        },


        "1w": {
          duration:
            7 *
            24 *
            60 *
            60 *
            1000,

          resolution:
            60 *
            60 *
            1000,
        },


        "1m": {
          duration:
            30 *
            24 *
            60 *
            60 *
            1000,

          resolution:
            24 *
            60 *
            60 *
            1000,
        },

      };


      const config =
        timeframeConfig[
          timeframe
        ] ||
        timeframeConfig["1w"];


      const endTime =
        Date.now();


      const startTime =
        endTime -
        config.duration;


      const cleanCode =
        code?.toUpperCase();


      const isNative =
        cleanCode === "XLM" ||
        issuer === "Native" ||
        !issuer;


      const params =
        new URLSearchParams();


      if (isNative) {

        params.append(
          "base_asset_type",
          "native",
        );

      } else {

        params.append(

          "base_asset_type",

          cleanCode.length <= 4
            ? "credit_alphanum4"
            : "credit_alphanum12",

        );


        params.append(
          "base_asset_code",
          cleanCode,
        );


        params.append(
          "base_asset_issuer",
          issuer,
        );
      }


      if (isNative) {

        params.append(
          "counter_asset_type",
          "credit_alphanum4",
        );


        params.append(
          "counter_asset_code",
          "USDC",
        );


        params.append(
          "counter_asset_issuer",
          STELLAR_USDC_ISSUER,
        );

      } else {

        params.append(
          "counter_asset_type",
          "native",
        );

      }


      params.append(
        "start_time",
        String(startTime),
      );


      params.append(
        "end_time",
        String(endTime),
      );


      params.append(
        "resolution",
        String(
          config.resolution,
        ),
      );


      params.append(
        "order",
        "asc",
      );


      params.append(
        "limit",
        "200",
      );


      const url =
        `${STELLAR_URL.URL}` +
        `/trade_aggregations?${params.toString()}`;


      const response =
        await fetch(url);


      if (!response.ok) {

        throw new Error(
          `Stellar chart request failed: ${response.status}`,
        );

      }


      const result =
        await response.json();


      const records =
        result?._embedded
          ?.records || [];


      return records.map(
        item => ({

          timestamp:
            Number(
              item.timestamp,
            ),

          price:
            Number(
              item.close,
            ),

          open:
            Number(
              item.open,
            ),

          high:
            Number(
              item.high,
            ),

          low:
            Number(
              item.low,
            ),

          close:
            Number(
              item.close,
            ),

          avg:
            Number(
              item.avg,
            ),

          volume:
            Number(
              item.base_volume,
            ),

          trades:
            Number(
              item.trade_count,
            ),

        }),
      );
    };


  /* ================================
     FORMAT STELLAR CHART
  ================================= */

  const fetchStellarChartData =
    async timeframe => {

      const code =
        asset_type
          ?.symbol
          ?.toUpperCase();


      const issuer =
        asset_type
          ?.contractAddress ===
        "Native"

          ? null

          : asset_type
              ?.contractAddress;


      const data =
        await getStellarPriceChart({

          code,

          issuer,

          timeframe,

        });


      if (!data?.length) {

        throw new Error(
          "No Stellar chart data found",
        );

      }


      const formattedData =
        data.map(
          item => ({

            value:
              item.price,

            timestamp:
              item.timestamp,

            open:
              item.open,

            high:
              item.high,

            low:
              item.low,

            close:
              item.close,

            volume:
              item.volume,

            trades:
              item.trades,

          }),
        );


      setChartData(
        formattedData,
      );


      const firstPrice =
        formattedData[0]
          ?.value || 0;


      const lastPrice =
        formattedData[
          formattedData.length - 1
        ]?.value || 0;


      setCurrentPrice(
        lastPrice,
      );


      const change =
        firstPrice > 0

          ? (
              (
                lastPrice -
                firstPrice
              ) /
              firstPrice
            ) * 100

          : 0;


      setPriceChange(
        change,
      );


      setLineColor(

        lastPrice >=
        firstPrice

          ? "#00C389"

          : "#FF5C5C",

      );


      setPriceTime(
        "Today",
      );

    };
      /* ============================================================
     BINANCE ASSET DATA
  ============================================================ */

  const fetchBinanceData = async (symbol) => {
    try {
      const currentChain = asset_type?.chain;

      const cleanSymbol = symbol
        ? symbol.toUpperCase()
        : "";

      let targetTicker = cleanSymbol;


      /* --------------------------------
         Stable coins
      -------------------------------- */

      if (
        cleanSymbol === "USDT" ||
        cleanSymbol === "USDC"
      ) {
        targetTicker = "USDC";
      }

      /* --------------------------------
         Native chain token
      -------------------------------- */

      else if (
        asset_type?.contractAddress === "Native" &&
        CHAINTOCHARTID[currentChain]
      ) {
        targetTicker =
          CHAINTOCHARTID[currentChain];
      }

      /* --------------------------------
         Symbol mapping
      -------------------------------- */

      else if (
        CHAINTOCHARTID[cleanSymbol]
      ) {
        targetTicker =
          CHAINTOCHARTID[cleanSymbol];
      }


      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/tradingDay?symbol=${targetTicker}USDT`
      );


      if (!response.ok) {
        throw new Error(
          `Binance pair ${targetTicker}USDT not found`
        );
      }


      const data =
        await response.json();


      setAssetData({
        current_price:
          parseFloat(data.lastPrice) || 0,

        high_24h:
          parseFloat(data.highPrice) || 0,

        low_24h:
          parseFloat(data.lowPrice) || 0,

        market_cap:
          "N/A",

        total_volume:
          parseFloat(data.volume) || 0,

        total_supply:
          "N/A",

        price_change_percentage_24h:
          parseFloat(
            data.priceChangePercent
          ) || 0,
      });


      setCurrentPrice(
        parseFloat(data.lastPrice) || 0
      );


      setPriceChange(
        parseFloat(
          data.priceChangePercent
        ) || 0
      );


      setLoading(false);

    } catch (error) {

      console.error(
        "Binance data fetch fallback error:",
        error
      );


      /* --------------------------------
         Fallback price
      -------------------------------- */

      if (asset_type?.price) {

        setAssetData({
          current_price:
            asset_type.price,

          high_24h:
            asset_type.price,

          low_24h:
            asset_type.price,

          market_cap:
            "N/A",

          total_volume:
            0,

          total_supply:
            "N/A",

          price_change_percentage_24h:
            0,
        });


        setCurrentPrice(
          asset_type.price
        );


        setPriceChange(0);
      }


      setLoading(false);
    }
  };


  /* ============================================================
     BINANCE CHART INTERVAL
  ============================================================ */

  const getIntervalForTimeframe = (
    timeframe
  ) => {

    const intervals = {

      "1h": {
        interval: "1m",
        limit: 60,
      },

      "1d": {
        interval: "5m",
        limit: 288,
      },

      "1w": {
        interval: "1h",
        limit: 168,
      },

      "1m": {
        interval: "1d",
        limit: 30,
      },

    };


    return (
      intervals[timeframe] ||
      intervals["1w"]
    );
  };


  /* ============================================================
     FETCH CHART DATA
  ============================================================ */

  const fetchChartData = async (
    symbol,
    timeframe
  ) => {

    setChartLoading(true);

    setChartError(false);


    try {

      /* ========================================================
         STELLAR
      ======================================================== */

      if (
        asset_type?.chain === "Stellar"
      ) {

        await fetchStellarChartData(
          timeframe
        );


        setChartLoading(false);

        return;
      }


      /* ========================================================
         BINANCE
      ======================================================== */

      const currentChain =
        asset_type?.chain;


      const cleanSymbol =
        symbol
          ? symbol.toUpperCase()
          : "";


      let targetTicker =
        cleanSymbol;


      if (
        cleanSymbol === "USDT" ||
        cleanSymbol === "USDC"
      ) {

        targetTicker =
          "USDC";

      } else if (
        asset_type?.contractAddress ===
          "Native" &&
        CHAINTOCHARTID[currentChain]
      ) {

        targetTicker =
          CHAINTOCHARTID[
            currentChain
          ];

      } else if (
        CHAINTOCHARTID[
          cleanSymbol
        ]
      ) {

        targetTicker =
          CHAINTOCHARTID[
            cleanSymbol
          ];
      }


      const {
        interval,
        limit,
      } =
        getIntervalForTimeframe(
          timeframe
        );


      const response =
        await fetch(
          `https://api.binance.com/api/v1/klines?symbol=${targetTicker}USDT&interval=${interval}&limit=${limit}`
        );


      if (!response.ok) {

        throw new Error(
          `Failed to fetch chart for ${targetTicker}USDT`
        );
      }


      const data =
        await response.json();


      if (
        !data ||
        data.length === 0
      ) {

        throw new Error(
          "No chart endpoints found"
        );
      }


      /* ========================================================
         IMPORTANT CHANGE

         Binance Kline:
         item[0] = timestamp
         item[4] = close price

         Timestamp bottom date labels ke
         liye required hai.
      ======================================================== */

      const formattedData =
        data.map((item) => ({

          value:
            parseFloat(item[4]),

          timestamp:
            Number(item[0]),

        }));


      setChartData(
        formattedData
      );


      const lastPrice =
        formattedData[
          formattedData.length - 1
        ];


      setCurrentPrice(
        lastPrice.value
      );


      setPriceTime(
        "Today"
      );


      const firstPrice =
        formattedData[0].value;


      const lastPriceValue =
        lastPrice.value;


      const change =
        (
          (
            lastPriceValue -
            firstPrice
          ) /
          firstPrice
        ) * 100;


      setPriceChange(
        parseFloat(change)
      );


      /* ========================================================
         GREEN / RED CHART
      ======================================================== */

      setLineColor(
        lastPriceValue >=
          firstPrice

          ? "#00C389"

          : "#FF5C5C"
      );


      setChartLoading(false);

    } catch (error) {

      console.error(
        "Chart fetch error:",
        error
      );


      setChartError(true);

      setChartLoading(false);


      if (
        assetData?.current_price
      ) {

        setCurrentPrice(
          assetData.current_price
        );


        setPriceChange(
          assetData
            .price_change_percentage_24h ||
          0
        );


        setPriceTime(
          "Today"
        );
      }
    }
  };


  /* ============================================================
     TIMEFRAME CHANGE
  ============================================================ */

  const handleTimeframeChange = (
    timeframe
  ) => {

    setSelectedTimeframe(
      timeframe
    );


    fetchChartData(
      assetSymbol,
      timeframe
    );
  };


  /* ============================================================
     SEND
  ============================================================ */

  const handleSend =
    useCallback(() => {

      if (
        asset_type.chain ===
        "Stellar"
      ) {

        if (
          asset_type
            .contractAddress ===
          "Native"
        ) {

          navigation.navigate(
            "SendXLM"
          );

        } else {

          navigation.navigate(
            "send_recive",
            {
              bala:
                asset_type.balance,

              assetIssuer:
                asset_type
                  ?.contractAddress,

              asset_name:
                asset_type.symbol,
            }
          );
        }

      } else if (
        asset_type
          .contractAddress ===
        "Native"
      ) {

        navigation.navigate(
          "Send",
          {
            token:
              asset_type?.chain,
          }
        );

      } else {

        navigation.navigate(
          "TokenSend",
          {
            tokenAddress:
              asset_type
                ?.contractAddress,

            tokenType:
              asset_type?.chain,

            tokenDecimals:
              asset_type?.decimals,

            tokenSymbol:
              asset_type?.symbol ||
              asset_type?.name,

            tokenImage:
              asset_type?.img ||
              asset_type?.imageUrl,
          }
        );
      }

    }, [
      asset_type,
      navigation,
    ]);


  /* ============================================================
     RECEIVE
  ============================================================ */

  const handleRequest =
    useCallback(() => {

      if (
        asset_type.chain ===
        "Stellar"
      ) {

        setQrValue(
          state
            ?.STELLAR_PUBLICK_KEY
        );


        setQrName(
          asset_type?.name
        );


        setQrVisible(true);

      } else if (
        asset_type?.symbol
      ) {

        setQrValue(
          state
            ?.wallet
            ?.address
        );


        setQrName(
          asset_type?.name
        );


        setQrVisible(true);
      }

    }, [
      asset_type,
      state,
    ]);


  /* ============================================================
     BUY
  ============================================================ */

  const handleBuy =
    useCallback(() => {

      navigation.navigate(
        "payout"
      );

    }, [
      token,
      navigation,
    ]);


  /* ============================================================
     SWAP
  ============================================================ */

  const handleSwap =
    useCallback(() => {

      if (
        asset_type.chain ===
        "Stellar"
      ) {

        navigation.navigate(
          "newOffer_modal",
          {

            purchesReq: 0,

            tradeAssetType:
              assetSymbol === "BSC"

                ? "ETH"

                : ["ETH"].includes(
                    assetSymbol
                  )

                ? assetSymbol

                : assetSymbol
                    ?.toUpperCase(),


            tradeAssetIssuer:
              [
                "ETH",
                "BTC",
                "BSC",
              ].includes(
                assetSymbol
              )

                ? "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC"

                : null,

          }
        );

      } else {

        navigation.navigate(
          "EthSwap"
        );
      }

    }, [
      token,
      assetSymbol,
      navigation,
      asset_type,
    ]);


  /* ============================================================
     ACTION BUTTON
  ============================================================ */

  const ActionButton = ({
    icon,
    iconProvider,
    label,
    onPress,
    disabled,
    customInfo,
    customInfoTxt,
  }) => (

    <TouchableOpacity

      disabled={
        disabled ||
        (
          chartLoading &&
          loading
        )
      }

      style={
        styles.actionButton
      }

      onPress={onPress}
    >

      {/* --------------------------------
          INFO ICON
      -------------------------------- */}

      {customInfo && (

        <TouchableOpacity

          style={{
            zIndex: 20,

            position:
              "absolute",

            top: -10,

            right: -5,
          }}

          onPress={() => {

            setinfomessage(
              customInfoTxt
            );

            setinfotype("");

            setinfoVisible(
              true
            );
          }}
        >

          <Icon
            type={
              "materialCommunity"
            }

            name={
              "information-outline"
            }

            size={23}

            color={
              chartLoading &&
              loading

                ? "gray"

                : isDark

                ? "#FFF"

                : "#000"
            }
          />

        </TouchableOpacity>

      )}


      {/* --------------------------------
          MAIN ICON
      -------------------------------- */}

      <View
        style={[
          styles.actionIcon,

          {
            backgroundColor:
              isDark

                ? colors.dark
                    .cardBg

                : colors.light
                    .cardBg,
          },
        ]}
      >

        <Icon

          type={
            iconProvider
          }

          name={icon}

          size={23}

          color={
            chartLoading &&
            loading

              ? "gray"

              : isDark

              ? "#FFF"

              : "#000"
          }

        />

      </View>


      {/* --------------------------------
          LABEL
      -------------------------------- */}

      <Text
        style={[
          styles.actionLabel,

          {
            color:
              isDark

                ? "#E6E8EB"

                : "#272729",
          },
        ]}
      >

        {label}

      </Text>

    </TouchableOpacity>

  );


  /* ============================================================
     TIMEFRAME BUTTON
  ============================================================ */

  const TimeframeButton = ({
    label,
    value,
  }) => (

    <TouchableOpacity

      style={[
        styles.timeframeButton,

        {
          backgroundColor:
            selectedTimeframe ===
            value

              ? isDark

                ? colors.dark.bg

                : colors.light.bg

              : "transparent",
        },
      ]}

      onPress={() =>
        handleTimeframeChange(
          value
        )
      }
    >

      <Text
        style={[
          styles.timeframeText,

          {
            color:
              selectedTimeframe ===
              value

                ? isDark

                  ? "#FFF"

                  : "#272729"

                : isDark

                ? "#666"

                : "#999",


            fontWeight:
              selectedTimeframe ===
              value

                ? "600"

                : "400",
          },
        ]}
      >

        {label}

      </Text>

    </TouchableOpacity>

  );
    /* ============================================================
     MAIN RENDER
  ============================================================ */

  return (
    <>
      <Wallet_screen_header
        title={assetSymbol}
        onLeftIconPress={() =>
          navigation.goBack()
        }
      />

      <InfoComponent
        visible={infoVisible}
        type={infotype}
        message={infomessage}
        onClose={() =>
          setinfoVisible(false)
        }
      />

      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark
              ? colors.dark.bg
              : colors.light.bg,
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: fadeAnim,
            }}
          >
            {/* ==================================================
                TOP / CHART SECTION
            ================================================== */}

            <View
              style={[
                styles.chartContainer,
                {
                  backgroundColor: isDark
                    ? colors.dark.bg
                    : colors.light.bg,
                },
              ]}
            >
              <View
                style={
                  styles.headerSection
                }
              >
                {/* ==============================================
                    ASSET NAME + ICON
                ============================================== */}

                <View
                  style={
                    styles.assetHeader
                  }
                >
                  {!assetImage?.uri ? (
                    <LinearGradient
                      colors={[
                        "#3b82f6",
                        "#8b5cf6",
                      ]}
                      start={{
                        x: 0,
                        y: 0,
                      }}
                      end={{
                        x: 1,
                        y: 1,
                      }}
                      style={
                        styles.fallbackImageCon
                      }
                    >
                      <Text
                        style={
                          styles.fallbackImageConText
                        }
                      >
                        {assetSymbol?.charAt(
                          0
                        )}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <Image
                      source={assetImage}
                      style={
                        styles.assetIcon
                      }
                    />
                  )}

                  <Text
                    style={[
                      styles.assetSymbol,
                      {
                        color: isDark
                          ? "#FFF"
                          : "#000",
                      },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {assetSymbol}
                  </Text>
                </View>

                {/* ==============================================
                    CURRENT PRICE
                ============================================== */}

                <Text
                  style={[
                    styles.currentPrice,
                    {
                      color: isDark
                        ? "#FFF"
                        : "#000",
                    },
                  ]}
                >
                  {isNaN(currentPrice)
                    ? "Info unavailable"
                    : currentPrice?.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                </Text>

                {/* ==============================================
                    PRICE CHANGE
                ============================================== */}

                <View
                  style={
                    styles.priceChangeRow
                  }
                >
                  <Icon
                    name={
                      priceChange >= 0
                        ? "trending-up"
                        : "trending-down"
                    }
                    type="feather"
                    size={16}
                    color={
                      priceChange >= 0
                        ? "#4ADE80"
                        : "#FF6B6B"
                    }
                  />

                  <Text
                    style={[
                      styles.priceChangeText,
                      {
                        color:
                          priceChange >= 0
                            ? "#4ADE80"
                            : "#FF6B6B",
                      },
                    ]}
                  >
                    {isNaN(currentPrice)
                      ? "Info unavailable"
                      : `${Math.abs(
                          (priceChange *
                            currentPrice) /
                            100
                        ).toFixed(
                          2
                        )} ${
                          priceChange >= 0
                            ? "+"
                            : ""
                        }${priceChange.toFixed(
                          2
                        )}%`}
                  </Text>
                </View>

                {/* ==============================================
                    CHART
                ============================================== */}

                <View
                  style={
                    styles.chartWrapper
                  }
                >
                  {chartLoading ? (
                    <View
                      style={
                        styles.chartLoader
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
                        styles.chartError
                      }
                    >
                      <Icon
                        name="alert-circle"
                        type="feather"
                        size={40}
                        color={
                          isDark
                            ? "#666"
                            : "#999"
                        }
                      />

                      <Text
                        style={[
                          styles.errorText,
                          {
                            color: isDark
                              ? "#666"
                              : "#999",
                          },
                        ]}
                      >
                        Unable to load chart
                      </Text>
                    </View>
                  ) : (
                    <AssetSparkline
                      data={chartData}
                      width={wp(90)}
                      height={hp(25)}
                      color={lineColor}
                      isDark={isDark}
                    />
                  )}
                </View>

                {/* ==============================================
                    TIMEFRAMES
                ============================================== */}

                <View
                  style={[
                    styles.timeframeContainer,
                    {
                      backgroundColor:
                        isDark
                          ? colors.dark
                              .cardBg
                          : colors.light
                              .cardBg,
                    },
                  ]}
                >
                  <TimeframeButton
                    label="1H"
                    value="1h"
                  />

                  <TimeframeButton
                    label="1D"
                    value="1d"
                  />

                  <TimeframeButton
                    label="1W"
                    value="1w"
                  />

                  <TimeframeButton
                    label="1M"
                    value="1m"
                  />
                </View>
              </View>
            </View>

            {/* ==================================================
                ACTION BUTTONS
            ================================================== */}

            <View
              style={[
                styles.actionsContainer,
                {
                  backgroundColor: isDark
                    ? colors.dark.bg
                    : colors.light.bg,
                },
              ]}
            >
              <ActionButton
                icon="paper-plane-outline"
                iconProvider="ionicon"
                label="Send"
                onPress={handleSend}
              />

              <ActionButton
                icon="vertical-align-bottom"
                iconProvider="material"
                label="Receive"
                onPress={
                  handleRequest
                }
              />

              <ActionButton
                icon="swap-vert"
                iconProvider="material"
                label={`Swap${"\n"}`}
                onPress={handleSwap}
                customInfo={true}
                customInfoTxt={
                  "This swap runs on Stellar’s on-chain SDEX. A small network fee (typically a fraction of a cent) is paid to the Stellar network per swap."
                }
              />

              <ActionButton
                icon="credit-card"
                iconProvider="material"
                label="Buy"
                onPress={handleBuy}
              />
            </View>

            {/* ==================================================
                LOADING / ABOUT
            ================================================== */}

            {loading ? (
              <View
                style={[
                  styles.statsLoader,
                  {
                    backgroundColor:
                      isDark
                        ? colors.dark.bg
                        : colors.light.bg,
                  },
                ]}
              >
                <ActivityIndicator
                  color="#4052D6"
                  size="large"
                />
              </View>
            ) : (
              assetData && (
                <>
                  <View
                    style={[
                      styles.aboutSection,
                      {
                        backgroundColor:
                          isDark
                            ? colors.dark
                                .bg
                            : colors.light
                                .bg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.aboutTitle,
                        {
                          color: isDark
                            ? "#FFF"
                            : "#000",
                        },
                      ]}
                    >
                      About
                    </Text>

                    {/* ==========================================
                        ROW 1
                    ========================================== */}

                    <View
                      style={
                        styles.statRow
                      }
                    >
                      <View
                        style={[
                          styles.statItem,
                          {
                            backgroundColor:
                              isDark
                                ? colors
                                    .dark
                                    .cardBg
                                : colors
                                    .light
                                    .cardBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#232428",
                            },
                          ]}
                        >
                          Price Change 24h
                        </Text>

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#282828",
                            },
                          ]}
                        >
                          {assetData.price_change_percentage_24h !==
                          "N/A"
                            ? `${assetData.price_change_percentage_24h} %`
                            : "Info unavailable"}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statItem,
                          {
                            backgroundColor:
                              isDark
                                ? colors
                                    .dark
                                    .cardBg
                                : colors
                                    .light
                                    .cardBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#232428",
                            },
                          ]}
                        >
                          Last price (USD)
                        </Text>

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#282828",
                            },
                          ]}
                        >
                          {isNaN(
                            assetData.current_price
                          )
                            ? "Info unavailable"
                            : `$${assetData.current_price?.toLocaleString()}`}
                        </Text>
                      </View>
                    </View>

                    {/* ==========================================
                        ROW 2
                    ========================================== */}

                    <View
                      style={
                        styles.statRow
                      }
                    >
                      <View
                        style={[
                          styles.statItem,
                          {
                            backgroundColor:
                              isDark
                                ? colors
                                    .dark
                                    .cardBg
                                : colors
                                    .light
                                    .cardBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#232428",
                            },
                          ]}
                        >
                          24h High
                        </Text>

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#282828",
                            },
                          ]}
                        >
                          {isNaN(
                            assetData.high_24h
                          )
                            ? "Info unavailable"
                            : `$${assetData.high_24h?.toLocaleString()}`}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statItem,
                          {
                            backgroundColor:
                              isDark
                                ? colors
                                    .dark
                                    .cardBg
                                : colors
                                    .light
                                    .cardBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#232428",
                            },
                          ]}
                        >
                          24h Low
                        </Text>

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                isDark
                                  ? "#E6E8EB"
                                  : "#282828",
                            },
                          ]}
                        >
                          {isNaN(
                            assetData.low_24h
                          )
                            ? "Info unavailable"
                            : `$${assetData.low_24h?.toLocaleString()}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              )
            )}

            <View
              style={{
                height: hp(3),
              }}
            />
          </Animated.View>
        </ScrollView>

        {/* ====================================================
            QR MODAL
        ==================================================== */}

        <TokenQrCode
          modalVisible={qrVisible}
          setModalVisible={
            setQrVisible
          }
          iconType={qrName}
          qrvalue={qrValue}
          isDark={isDark}
        />
      </View>
    </>
  );
};


/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  headerSection: {
    paddingTop: hp(2),
  },

  /* ==========================================================
     ASSET HEADER
  ========================================================== */

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
    maxWidth: wp(40),
  },

  /* ==========================================================
     PRICE
  ========================================================== */

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

  /* ==========================================================
     CHART
  ========================================================== */

  chartContainer: {
    paddingHorizontal: wp(5),
    marginTop: hp(1),
  },

  chartWrapper: {
    marginTop: hp(1.5),
    marginLeft: wp(-1),
  },

  chartLoader: {
    height: hp(25),
    justifyContent: "center",
    alignItems: "center",
  },

  chartError: {
    height: hp(25),
    justifyContent: "center",
    alignItems: "center",
  },

  errorText: {
    fontSize: 14,
    marginTop: hp(1),
  },

  /* ==========================================================
     TIMEFRAME
  ========================================================== */

  timeframeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: hp(2),
    paddingVertical: hp(0.5),
    borderRadius: 10,
    marginBottom: hp(2),
  },

  timeframeButton: {
    paddingHorizontal: wp(6.5),
    paddingVertical: hp(1),
    borderRadius: 10,
  },

  timeframeText: {
    fontSize: 14,
  },

  /* ==========================================================
     ACTIONS
  ========================================================== */

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
    textAlign: "center",
  },

  /* ==========================================================
     ABOUT
  ========================================================== */

  aboutSection: {
    paddingHorizontal: wp(5),
    marginTop: hp(-3),
    paddingTop: hp(2),
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

  /* ==========================================================
     STATS
  ========================================================== */

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
    width: wp(43),
    padding: 10,
    borderRadius: 10,
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

  /* ==========================================================
     FALLBACK ICON
  ========================================================== */

  fallbackImageCon: {
    width: 32,
    height: 32,
    borderRadius: 22,
    marginRight: wp(1),
    alignItems: "center",
    justifyContent: "center",
  },

  fallbackImageConText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
});


export default Asset_info;