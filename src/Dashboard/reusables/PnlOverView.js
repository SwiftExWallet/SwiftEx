import React, { useState, useEffect, useRef, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Image,
    Alert,
    Platform,
} from "react-native";
import Modal from "react-native-modal";
import DateTimePicker from "@react-native-community/datetimepicker";
import Svg, {
    Circle,
    Text as SvgText,
    Defs,
    Stop,
    LinearGradient as SvgGrad,
    Path,
    Line,
} from "react-native-svg";
import Icon from "../../icon";
import { FOLIO_BASE_ROUTE } from "../exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import apiHelper from "../exchange/crypto-exchange-front-end-main/src/apiHelper";
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { buildXlsxZip } from "../../utilities/PnlGenrate";
import PnlShareCard from "./PnlShareCard";

import { CHAINS } from "../../utilities/TokenUtils";

let _lobstrCache = null;
let _lobstrFetching = null;

const fetchLobstrAssetMap = () => {
    if (_lobstrCache) return Promise.resolve(_lobstrCache);
    if (_lobstrFetching) return _lobstrFetching;
    const url = CHAINS?.STR?.supportedTokenList;
    if (!url) return Promise.resolve({});
    _lobstrFetching = fetch(url)
        .then((r) => r.json())
        .then((json) => {
            const map = {};
            (json.assets || []).forEach((a) => {
                if (a.issuer && a.icon) map[a.issuer] = a.icon;
                if (!a.issuer && a.code === 'XLM' && a.icon) map['XLM_NATIVE'] = a.icon;
            });
            _lobstrCache = map;
            _lobstrFetching = null;
            return map;
        })
        .catch((e) => {
            _lobstrFetching = null;
            console.warn('Stellar token list fetch failed:', e);
            return {};
        });
    return _lobstrFetching;
};

const getTheme = (activeTheme) => {
    return {
        bg: activeTheme.cardBg,
        card: activeTheme.bg,
        border: activeTheme.inactiveTx,
        purple: activeTheme.buttonColor,
        mint: activeTheme.success,
        rose: activeTheme.fail,
        text: activeTheme.headingTx,
        dim: activeTheme.inactiveTx,
        warn: activeTheme.warn,
    };
};

const fmtUSD = (val, dec = 4) => {
    const n = Number(val) || 0;
    return `${n >= 0 ? "+$" : "-$"}${Math.abs(n).toFixed(dec)}`;
};

const fmtNum = (val, dec = 4) => Number(val || 0).toFixed(dec);
const shortDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return "—";

  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
};

const getRawRange = (tl) => {
    const to = new Date();
    const from = new Date();
    switch (tl) {
        case "1week":
            from.setDate(to.getDate() - 7);
            break;

        case "1month":
            from.setMonth(to.getMonth() - 1);
            break;

        case "2month":
            from.setMonth(to.getMonth() - 2);
            break;

        case "3month":
            from.setMonth(to.getMonth() - 3);
            break;

        default:
            from.setDate(to.getDate() - 7);
    }

    return { from, to };
};

const formatDate = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;

const CardHeader = ({ title, theme, styles }) => (
    <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
    </View>
);

const MetricBox = ({ label, val, color, theme, styles }) => (
    <View style={[styles.mBox,{borderColor:label==="TOTAL P&L"?theme.purple:theme.border,borderWidth:label==="TOTAL P&L"?2:0.5}]}>
        <Text style={styles.mLabel}>{label}</Text>
        <Text
            style={[styles.mVal, { color: color || theme.text}]}
            numberOfLines={1}
        >
            {val}
        </Text>
    </View>
);

const Sparkline = React.memo(({ data, width = 300, height = 160, color, dates }) => {
    if (!data || data.length < 2) return null;

    const BPAD = 28;
    const TPAD = 12;
    const H    = height - BPAD - TPAD;
    const W    = width;

    const max   = Math.max(...data, 0);
    const min   = Math.min(...data, 0);
    const range = max - min || 1;

    const toX = (i) => (i / (data.length - 1)) * W;
    const toY = (v) => TPAD + (1 - (v - min) / range) * H;
    const zeroY = toY(0);

    const pts = data.map((v, i) => ({ x: toX(i), y: toY(v) }));

    // Catmull-Rom → cubic bezier (natural, finance-style curves)
    const buildPath = (p) => {
        let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
        for (let i = 0; i < p.length - 1; i++) {
            const p0 = p[Math.max(i - 1, 0)];
            const p1 = p[i];
            const p2 = p[i + 1];
            const p3 = p[Math.min(i + 2, p.length - 1)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        return d;
    };

    const linePath = buildPath(pts);
    const areaPath = `${linePath} L ${W.toFixed(1)} ${(TPAD + H).toFixed(1)} L 0 ${(TPAD + H).toFixed(1)} Z`;

    // Vertical grid — spaced across the available dates
    const vGrids = (() => {
        if (!dates || dates.length === 0) return [];
        const result = [];
        const step = Math.max(1, Math.floor(dates.length / 7));
        for (let i = 0; i < dates.length; i += step) {
            if (isNaN(new Date(dates[i]).getTime())) continue;
            result.push(toX(i));
        }
        result.push(W);
        return result;
    })();

    // Grid: 4 horizontal lines
    const hGrids = [0, 0.33, 0.66, 1].map(t => TPAD + t * H);

    return (
        <Svg width={width} height={height}>
            <Defs>
                <SvgGrad id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%"   stopColor={color} stopOpacity="0.25" />
                    <Stop offset="60%"  stopColor={color} stopOpacity="0.08" />
                    <Stop offset="100%" stopColor={color} stopOpacity="0" />
                </SvgGrad>
            </Defs>

            {/* Horizontal grid lines */}
            {hGrids.map((gy, i) => (
                <Line key={`hg${i}`}
                    x1={0} y1={gy} x2={W} y2={gy}
                    stroke="#ffffff" strokeWidth={0.5} opacity={0.07} />
            ))}

            {/* Vertical grid lines at tick positions */}
            {vGrids.map((gx, i) => (
                <Line key={`vg${i}`}
                    x1={gx} y1={TPAD} x2={gx} y2={TPAD + H}
                    stroke="#ffffff" strokeWidth={0.5} opacity={0.07} />
            ))}

            {/* Zero baseline dashed */}
            <Line x1={0} y1={zeroY} x2={W} y2={zeroY}
                stroke="#ffffff" strokeWidth={0.8}
                strokeDasharray="4 5" opacity={0.2} />

            {/* Area fill */}
            <Path d={areaPath} fill="url(#chartFill)" />

            {/* Line */}
            <Path d={linePath} fill="none"
                stroke={color} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
});
const TIMELINES = [
    { label: '1 Week', value: '1week' },
    { label: '1 Month', value: '1month' },
    { label: '2 Month', value: '2month' },
    { label: '3 Month', value: '3month' },
];

const PnlOverView = ({
    refresh = false,
    stellarKey,
    activeTheme,
    onSummaryUpdate,
}) => {
    const theme = useMemo(() => getTheme(activeTheme), [activeTheme]);
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [selectedTimeline, setSelectedTimeline] = useState("1week");
    const pnlCardRef = useRef();

    const [lobstrAssetMap, setLobstrAssetMap] = useState({});

    useEffect(() => {
        fetchLobstrAssetMap().then(setLobstrAssetMap);
    }, []);

    const [pnlInfo, setPnlInfo] = useState(null);
    const [hideTotalPnL, setHideTotalPnL] = useState(false);
    const [isPnlVisible, setIsPnlVisible] = useState(false);
    const [isSheetVisible, setIsSheetVisible] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [fromDate, setFromDate] = useState(() => getRawRange(selectedTimeline || "1week").from,);
    const [toDate, setToDate] = useState(() => getRawRange(selectedTimeline || "1week").to,);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    useEffect(() => {
        const { from, to } = getRawRange(selectedTimeline);

        setFromDate(from);
        setToDate(to);
    }, [selectedTimeline]);

    useEffect(() => {
        fetchPnl();
    }, [refresh, selectedTimeline, stellarKey]);

    const fetchPnl = async () => {
        if (!stellarKey) return;

        const { from, to } = getRawRange(selectedTimeline);

        const url =
            `${FOLIO_BASE_ROUTE}/pnl` +
            `?address=${stellarKey}` +
            `&from=${formatDate(from)}` +
            `&to=${formatDate(to)}` +
            `&nocache=true` +
            `&summary=true`;

        try {
            const res = await apiHelper.get(url);

            if (res.success && res.data) {
                setPnlInfo(res.data);

                onSummaryUpdate?.(res.data);
            }
        } catch (e) {
            console.error("PnlOverView fetch error:", e);
        }
    };

    const handleDownload = async () => {
        if (!stellarKey) return;
        setIsDownloading(true);
        const from = formatDate(fromDate);
        const to = formatDate(toDate);
        try {
            const res = await apiHelper.get(`${FOLIO_BASE_ROUTE}/pnl` + `?address=${stellarKey}` + `&from=${from}` + `&to=${to}` + `&nocache=true` + `&summary=false` + `&excel=true`,);
            if (res?.success) {
                if (!res.data) {
                    Alert.alert("!Oops", "No records for this range.");
                } else {
                    await buildXlsxZip(res.data, `${from}->${to}`);
                }
            }
        } catch (e) {
            console.error("Download error:", e);
        }

        setIsDownloading(false);

        setIsSheetVisible(false);
    };

    const data = pnlInfo ?? {};

    const totalPnL = Number(data.totalPnL || 0);
    const winRate = Number(data.winRate || 0);
    const winColor = totalPnL >= 0 ? theme.mint : theme.rose;
    const circ = 2 * Math.PI * 30;
    const filled = (winRate / 100) * circ;

    const byDate = (dir) => (a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
        return dir === 'asc' ? da - db : db - da;
    };

    const positions = Array.isArray(data.positions) ? data.positions : [];
    const disposalsChronological = Array.isArray(data.disposals)
        ? [...data.disposals].sort(byDate('asc'))
        : [];

    /* =====================================================
         PNL BY ASSET
      ===================================================== */

    const pnlByAsset = positions

        .map((p) => ({
            asset: p.asset,
            issuer: p.issuer ?? '',
            totalPnL: (Number(p.realizedPnL) || 0) + (Number(p.unrealized) || 0),
        }))

        .filter((p) => p.totalPnL !== 0)

        .sort((a, b) => b.totalPnL - a.totalPnL);

    const maxPnL =
        pnlByAsset.length > 0
            ? Math.max(...pnlByAsset.map((p) => Math.abs(p.totalPnL)))
            : 1;

    /* =====================================================
         CUMULATIVE REALIZED PNL
      ===================================================== */

    const cumulativeRealizedPnl = useMemo(() => {
        if (disposalsChronological.length < 2) return [];
        let cumulative = 0;
        return disposalsChronological.map((item) => {
            cumulative += Number(item.pnl) || 0;
            return cumulative;
        });
    }, [disposalsChronological.length, data]);

    /* =====================================================
         CHART WIDTH
      ===================================================== */

    const chartWidth = wp(100);

    /* =====================================================
         RENDER
      ===================================================== */

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.bg,
                },
            ]}
        >
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: hp(1) }}>
                    <View>
                        <Text style={[styles.secTitle, { fontSize: 19, color: theme.text, }]}>P&L Overview</Text>
                        <Text style={[styles.freshnessTag, { color: theme.dim }]}>Freshness: ~15 mins</Text>
                    </View>
                       

                        <TouchableOpacity
                            style={[
                                styles.actionBtn,
                                {
                                    backgroundColor: theme.card,
                                    borderColor: theme.border,
                                },
                            ]}
                            disabled={!pnlInfo}
                            onPress={() => setIsSheetVisible(true)}
                        >
                            <View style={{justifyContent:"center",flexDirection:"row"}}>
                            <Icon
                                name="download-outline"
                                size={17}
                                color={theme.purple}
                                type="ionicon"
                            />
                            <Text
                                style={[
                                    styles.actionTxt,
                                    {
                                        color: theme.purple,
                                        fontSize: 12,
                                    },
                                ]}
                            >
                                Download
                            </Text>
                            </View>

                            <Text
                                style={[
                                    styles.actionTxt,
                                    {
                                        color: theme.purple,
                                        fontSize: 12,
                                    },
                                ]}
                            >
                                Detailed P&L Stmt.
                            </Text>
                        </TouchableOpacity>

                </View>
                 <View style={[styles.metricGrid,{marginBottom:hp(0.9)}]}>
                                <MetricBox
                                    label="TOTAL P&L"
                                    val={fmtUSD(data.totalPnL, 4)}
                                    color={totalPnL >= 0 ? theme.mint : theme.rose}
                                    theme={theme}
                                    styles={styles}
                                />

                                <MetricBox
                                    label="UNREALIZED"
                                    val={fmtUSD(data.totalUnrealized, 4)}
                                    color={
                                        Number(data.totalUnrealized) >= 0 ? theme.mint : theme.rose
                                    }
                                    theme={theme}
                                    styles={styles}
                                />

                                <MetricBox
                                    label="REALIZED"
                                    val={fmtUSD(data.totalRealized, 4)}
                                    color={
                                        Number(data.totalRealized) >= 0 ? theme.mint : theme.rose
                                    }
                                    theme={theme}
                                    styles={styles}
                                />
                        </View>

                <View style={styles.row}>
                    <View
                        style={[
                            styles.card,
                            {
                                flex: 0.7,
                            },
                        ]}
                    >
                        <CardHeader
                            title="TRADE OUTCOME ANALYSIS"
                            styles={styles}
                        />

                        <View style={styles.flexRow}>
                            <Svg width={75} height={75}>
                                <Circle
                                    cx="37"
                                    cy="37"
                                    r="30"
                                    stroke={theme.border}
                                    strokeWidth="6"
                                    fill="none"
                                />

                                <Circle
                                    cx="37"
                                    cy="37"
                                    r="30"
                                    stroke={theme.purple}
                                    strokeWidth="6"
                                    fill="none"
                                    strokeDasharray={`${filled} ${circ - filled}`}
                                    strokeLinecap="round"
                                    strokeDashoffset={circ / 4}
                                />

                                <SvgText
                                    x="38"
                                    y="39"
                                    textAnchor="middle"
                                    fill={theme.text}
                                    fontSize="15"
                                    fontWeight="bold"
                                >
                                    {winRate+"%"}
                                </SvgText>

                                <SvgText
                                    x="37"
                                    y="48"
                                    textAnchor="middle"
                                    fill={theme.dim}
                                    fontSize="6"
                                    fontWeight="700"
                                >
                                    WIN RATE
                                </SvgText>
                            </Svg>

                            <View
                                style={{
                                    flex: 1,
                                    marginLeft: 8,
                                }}
                            >

                                <View style={styles.bwGrid}>
                                    <View style={styles.bwBox}>
                                        <Text style={styles.bwLabel}>
                                            BEST{" "}
                                            {data.bestTrade?.asset
                                                ? `(${data.bestTrade.asset})`
                                                : ""}
                                        </Text>

                                        <Text
                                            style={[
                                                styles.bwVal,
                                                {
                                                    color: theme.mint,
                                                },
                                            ]}
                                        >
                                            {fmtUSD(data.bestTrade?.pnl, 4)}
                                        </Text>
                                    </View>

                                    <View style={styles.bwBox}>
                                        <Text style={styles.bwLabel}>
                                            WORST{" "}
                                            {data.worstTrade?.asset
                                                ? `(${data.worstTrade.asset})`
                                                : ""}
                                        </Text>

                                        <Text
                                            style={[
                                                styles.bwVal,
                                                {
                                                    color: theme.rose,
                                                },
                                            ]}
                                        >
                                            {fmtUSD(data.worstTrade?.pnl, 4)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                      <View
                            style={[
                                styles.card,
                                {
                                flex: 0.3,
                            },
                            ]}
                        >
                                
                                <View>
                                <CardHeader
                                    title="TIMELINE"
                                    styles={styles}
                                />
                                    <View style={styles.tlRow}>
                                        <View
                                            style={[
                                                styles.tlDot,
                                                {
                                                    backgroundColor: theme.warn,
                                                },
                                            ]}
                                        />

                                        <View>
                                            <Text style={styles.tlLbl}>FIRST TRADE</Text>

                                            <Text style={styles.tlVal}>
                                                {shortDate(data.firstTradeDate)}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.tlLine} />

                                    <View style={styles.tlRow}>
                                        <View
                                            style={[
                                                styles.tlDot,
                                                {
                                                    backgroundColor: theme.purple,
                                                },
                                            ]}
                                        />

                                        <View>
                                            <Text style={styles.tlLbl}>LAST TRADE</Text>

                                            <Text style={styles.tlVal}>
                                                {shortDate(data.lastTradeDate)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>


                    {cumulativeRealizedPnl.length >= 2 && (
                        <View style={styles.pnlChartCard}>
                            <View style={styles.pnlChartHeader}>
                                <View
                                    style={{
                                        flex: 1,
                                    }}
                                >

                                    <CardHeader
                                        title="TOTAL P&L"
                                        styles={styles}
                                    />
                                </View>

                                <Text
                                    style={[
                                        styles.pnlChartTotal,
                                        {
                                            color: winColor,
                                        },
                                    ]}
                                >
                                    {fmtUSD(data.totalPnL, 4)}
                                </Text>
                            </View>

                            <View style={styles.pnlChartWrap}>
                                <Sparkline
                                    data={cumulativeRealizedPnl}
                                    width={chartWidth}
                                    height={90}
                                    color={winColor}
                                    dates={disposalsChronological.map(d => d.date)}
                                />
                            </View>
                        </View>
                    )}

                </View>


                    <>
                        <View style={styles.card}>
                            <CardHeader
                                title="Performance Metrics"
                                styles={styles}
                            />

                            <View style={styles.metricGrid}>
                                <MetricBox
                                    label={"USDC\nSPENT"}
                                    val={`$${fmtNum(data.usdcSpent, 2)}`}
                                    theme={theme}
                                    styles={styles}
                                />

                                <MetricBox
                                    label={"USDC\nRECEIVED"}
                                    val={`$${fmtNum(data.usdcReceived, 2)}`}
                                    theme={theme}
                                    styles={styles}
                                />

                                <MetricBox
                                    label={"NET USDC\nFLOW"}
                                    val={fmtUSD(data.netUSDCFlow, 2)}
                                    color={Number(data.netUSDCFlow) >= 0 ? theme.mint : theme.rose}
                                    theme={theme}
                                    styles={styles}
                                />
                            </View>
                        </View>

                        {pnlByAsset.length > 0 && (
                            <View style={styles.card}>
                                <CardHeader
                                    title="P&L Distribution"
                                    styles={styles}
                                />

                                <Text
                                    style={[
                                        styles.miniDesc,
                                        {
                                            marginBottom: 10,
                                        },
                                    ]}
                                >
                                    Top assets by total P&L impact
                                </Text>

                                {pnlByAsset.map((item, i) => {
                                    const pct = Math.abs(item.totalPnL) / maxPnL;

                                    const clr = item.totalPnL >= 0 ? theme.mint : theme.rose;

                                    const imageUrl = item.issuer
                                        ? lobstrAssetMap[item.issuer]
                                        : lobstrAssetMap['XLM_NATIVE'];

                                    return (
                                        <View
                                            key={i}
                                            style={{
                                                marginBottom: 10,
                                            }}
                                        >
                                            <View style={styles.distRow}>
                                                <View style={styles.distLeft}>
                                                    {imageUrl ? (
                                                        <Image
                                                            source={{ uri: imageUrl }}
                                                            style={styles.distImg}
                                                        />
                                                    ) : (
                                                        <View style={[styles.distIcon, { backgroundColor: `${clr}25` }]}>
                                                            <Text style={[styles.distIconTxt, { color: clr }]}>
                                                                {item.asset?.[0]?.toUpperCase() ?? '?'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                    <Text
                                                        style={[
                                                            styles.distAsset,
                                                            { color: theme.text },
                                                        ]}
                                                    >
                                                        {item.asset}
                                                    </Text>
                                                </View>

                                                <Text
                                                    style={[
                                                        styles.distVal,
                                                        { color: clr },
                                                    ]}
                                                >
                                                    {fmtUSD(item.totalPnL, 4)}
                                                </Text>
                                            </View>

                                            <View style={styles.barBg}>
                                                <View
                                                    style={[
                                                        styles.barFill,
                                                        {
                                                            width: `${pct * 100}%`,
                                                            backgroundColor: clr,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        <View style={styles.card}>
                            <CardHeader
                                title="Portfolio Diagnostics"
                                styles={styles}
                            />

                            {data.costBasisWarning && (
                                <View style={styles.warnBox}>
                                    <Icon
                                        name="warning-outline"
                                        size={14}
                                        color={theme.warn}
                                        type="ionicon"
                                    />

                                    <Text
                                        style={[
                                            styles.warnTxt,
                                            {
                                                color: theme.warn,
                                            },
                                        ]}
                                    >
                                        Auto Cost Basis applied
                                    </Text>
                                </View>
                            )}

                            <View style={styles.diagGrid}>
                                <View style={styles.diagBox}>
                                    <Text style={styles.diagLabel}>RAW COUNT</Text>

                                    <Text style={styles.diagVal}>{data.rawCount ?? "—"}</Text>
                                </View>

                                <View style={styles.diagBox}>
                                    <Text style={styles.diagLabel}>COLLAPSED</Text>

                                    <Text style={styles.diagVal}>
                                        {data.collapsedCount ?? "—"}
                                    </Text>
                                </View>

                                <View style={styles.diagBox}>
                                    <Text style={styles.diagLabel}>ACTIVE DAYS</Text>

                                    <Text style={styles.diagVal}>{data.activeDays ?? "—"}</Text>
                                </View>

                                <View style={styles.diagBox}>
                                    <Text style={styles.diagLabel}>POSITIONS</Text>

                                    <Text style={styles.diagVal}>{positions.length}</Text>
                                </View>
                            </View>

                            {data.largestPosition && (
                                <View style={styles.largestPos}>
                                    <Text style={styles.miniDesc}>
                                        Largest position:{" "}
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontWeight: "700",
                                            }}
                                        >
                                            {data.largestPosition.asset}
                                        </Text>
                                        {"  "}
                                        {fmtNum(data.largestPosition.remaining, 4)}
                                        {" · "}${fmtNum(data.largestPosition.currentValue, 2)}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </>

                    <View style={styles.timelineContainer}>
                            {TIMELINES.map((item) => {
                                const isActive = selectedTimeline === item.value;
                                return (
                                    <TouchableOpacity
                                        key={item.value}
                                        onPress={() => setSelectedTimeline(item.value)}
                                        style={[styles.timelineBtn, isActive && styles.timelineBtnActive]}
                                    >
                                        <Text style={[styles.timelineText, isActive && styles.timelineTextActive]}>
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                     <TouchableOpacity
                            style={[
                                styles.shareBtn,
                                {
                                    backgroundColor: theme.card,
                                    borderColor: theme.border,
                                },
                            ]}
                            disabled={!pnlInfo}
                            onPress={() => setIsPnlVisible(true)}
                        >
                            <Icon
                                name="share-outline"
                                size={16}
                                color={theme.purple}
                                type="ionicon"
                            />

                            <Text
                                style={[
                                    styles.actionTxt,
                                    {
                                        color: theme.purple,
                                    },
                                ]}
                            >
                                Share P&L
                            </Text>
                        </TouchableOpacity>

                        

                {pnlInfo && (
                    <View style={styles.hiddenCard} pointerEvents="none">
                        <PnlShareCard
                            ref={pnlCardRef}
                            brandName="SwiftEx Wallet"
                            days={selectedTimeline}
                            totalPnlPercent={
                                pnlInfo?.openPnLPct
                            }
                            totalPnlDollar={totalPnL}
                            winRate={pnlInfo?.winRate}
                            trades={pnlInfo?.rawCount}
                            bestTrade={pnlInfo?.bestTrade?.pnl}
                            hideTotal={hideTotalPnL}
                        />
                    </View>
                )}

            <Modal
                isVisible={isSheetVisible}
                onBackdropPress={() => !isDownloading && setIsSheetVisible(false)}
                style={styles.modalStyle}
                backdropOpacity={0.6}
                useNativeDriverForBackdrop
            >
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <Text style={styles.sheetTitle}>Export Custom Range</Text>

                    <View style={styles.dateRow}>
                        <TouchableOpacity
                            style={styles.dateBox}
                            onPress={() => setShowFromPicker(true)}
                        >
                            <Text style={styles.dateBoxLbl}>From</Text>

                            <Text style={styles.dateBoxVal}>
                                {fromDate?.toLocaleDateString()}
                            </Text>
                        </TouchableOpacity>

                        <Icon
                            name="arrow-forward-outline"
                            size={18}
                            color={theme.dim}
                            type="ionicon"
                            style={{
                                alignSelf: "center",
                            }}
                        />

                        <TouchableOpacity
                            style={styles.dateBox}
                            onPress={() => setShowToPicker(true)}
                        >
                            <Text style={styles.dateBoxLbl}>To</Text>

                            <Text style={styles.dateBoxVal}>
                                {toDate?.toLocaleDateString()}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {showFromPicker && (
                        <DateTimePicker
                            value={fromDate}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            maximumDate={new Date()}
                            onChange={(e, d) => {
                                setShowFromPicker(Platform.OS === "ios");

                                if (d) {
                                    setFromDate(d);
                                }
                            }}
                        />
                    )}

                    {showToPicker && (
                        <DateTimePicker
                            value={toDate}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            maximumDate={new Date()}
                            minimumDate={fromDate}
                            onChange={(e, d) => {
                                setShowToPicker(Platform.OS === "ios");

                                if (d) {
                                    setToDate(d);
                                }
                            }}
                        />
                    )}

                    <TouchableOpacity
                        style={styles.sheetBtn}
                        onPress={handleDownload}
                        disabled={isDownloading}
                    >
                        {isDownloading ? (
                            <ActivityIndicator color={theme.text} size="small" />
                        ) : (
                            <Text style={styles.sheetBtnTxt}>Generate Statement</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </Modal>

            <Modal
                isVisible={isPnlVisible}
                onBackdropPress={() => setIsPnlVisible(false)}
                style={styles.modalStyle}
                backdropOpacity={0.6}
                useNativeDriverForBackdrop
            >
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <Text style={styles.sheetTitle}>Share P&L Card</Text>

                    <View style={styles.toggleRow}>
                        <Text
                            style={{
                                color: theme.dim,
                                fontSize: 14,
                                flex: 1,
                            }}
                        >
                            Hide total P&L amount
                        </Text>

                        <TouchableOpacity
                            onPress={() => setHideTotalPnL((p) => !p)}
                            style={[
                                styles.toggle,
                                {
                                    backgroundColor: hideTotalPnL ? theme.mint : theme.border,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.toggleKnob,
                                    {
                                        alignSelf: hideTotalPnL ? "flex-end" : "flex-start",
                                    },
                                ]}
                            />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.sheetBtn}
                        onPress={async () => {
                            try {
                                await pnlCardRef.current?.share();
                            } catch (e) {
                                console.log(e);
                            }

                            setIsPnlVisible(false);
                        }}
                    >
                        <Text style={styles.sheetBtnTxt}>Share</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </View>
    );
};

const createStyles = (theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        wrap: {
            flex: 1,
            backgroundColor: theme.bg,
        },
        row: {
            flexDirection: "row",
            marginBottom: 0,
            gap:5
        },
        flexRow: {
            flexDirection: "row",
            alignItems: "center",
        },
        card: {
            backgroundColor: theme.card,
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
            borderWidth: 0.8,
            borderColor: theme.border,
            overflow: "hidden",
        },
        cardHeader: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
        },
        cardTitle: {
            color: theme.dim,
            fontSize: 12,
            fontWeight: "bold",
            marginLeft: 6,
            letterSpacing: 0.6,
        },
        miniDesc: {
            color: theme.dim,
            fontSize: 11,
            lineHeight: 14,
        },
        bwGrid: {
            gap: 6,
            marginTop: 6,
        },
        bwBox: {
            flex: 1,
            backgroundColor: `${theme.text}08`,
            padding: 6,
            borderRadius: 6,
            minWidth: 0,
            justifyContent: "center",
            alignItems: "center"
        },
        bwLabel: {
            color: theme.dim,
            fontSize: 9,
            fontWeight: "bold",
            marginBottom: 2,
        },
        bwVal: {
            fontSize: 12,
            fontWeight: "bold",
        },
        tlRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
        },
        tlDot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            flexShrink: 0,
        },
        tlLbl: {
            color: theme.dim,
            fontSize: 10,
            fontWeight: "600",
        },
        tlVal: {
            color: theme.text,
            fontSize: 9,
            fontWeight: "500",
        },
        tlLine: {
            width: 1,
            height: 10,
            backgroundColor: theme.border,
            marginLeft: 3,
            marginVertical: 2,
        },
        metricGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 5,
        },
        mBox: {
            flexBasis: "31%",
            flexGrow: 1,
            backgroundColor: `${theme.bg}4D`,
            padding: 9,
            borderRadius: 8,
            borderWidth: 0.5,
            borderColor: theme.border,
            minWidth: 0,
        },
        mLabel: {
            color: theme.dim,
            fontSize: 10,
            fontWeight: "bold",
            marginBottom: 4,
            letterSpacing: 0.5,
        },
        mVal: {
            fontSize: 12,
            fontWeight: "bold",
        },
        pnlChartCard: {
            flex: 1,
            backgroundColor: theme.card,
            borderRadius: 16,
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: 0,
            marginBottom: 10,
            borderWidth: 0.8,
            borderColor: theme.border,
            overflow: "hidden",
        },
        pnlChartHeader: {
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
        },
        pnlChartTotal: {
            fontSize: 13,
            fontWeight: "800",
        },
        pnlChartWrap: {
            marginHorizontal: -16,
            overflow: "hidden",
        },
        distRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
        },
        distLeft: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flex: 1,
        },
        distImg: {
            width: 26,
            height: 26,
            borderRadius: 13,
        },
        distIcon: {
            width: 26,
            height: 26,
            borderRadius: 13,
            justifyContent: "center",
            alignItems: "center",
        },
        distIconTxt: {
            fontSize: 11,
            fontWeight: "800",
        },
        distAsset: {
            fontSize: 12,
            fontWeight: "700",
        },
        distVal: {
            fontSize: 12,
            fontWeight: "700",
        },
        barBg: {
            height: 5,
            backgroundColor: `${theme.text}10`,
            borderRadius: 3,
            overflow: "hidden",
        },
        barFill: {
            height: 5,
            borderRadius: 3,
        },
        warnBox: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: `${theme.warn}15`,
            padding: 8,
            borderRadius: 8,
            marginBottom: 10,
        },
        warnTxt: {
            fontSize: 12,
            fontWeight: "600",
        },
        diagGrid: {
            flexDirection: "row",
            gap: 8,
            marginBottom: 8,
        },
        diagBox: {
            flex: 1,
            backgroundColor: `${theme.bg}4D`,
            paddingVertical: hp(1),
            height: hp(6),
            borderRadius: 8,
            borderWidth: 0.5,
            borderColor: theme.border,
            alignItems: "center",
        },
        diagLabel: {
            color: theme.dim,
            fontSize: 10,
            fontWeight: "500",
        },
        diagVal: {
            color: theme.text,
            fontSize: 16,
            fontWeight: "800",
        },
        largestPos: {
            backgroundColor: `${theme.text}08`,
            padding: 8,
            borderRadius: 8,
        },
        actionBtn: {
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            paddingVertical: 1,
            paddingHorizontal:wp(3),
            borderRadius: 10,
            borderWidth: 1,
        },
        shareBtn: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            paddingVertical: hp(1.5),
            paddingHorizontal:wp(3),
            borderRadius: 20,
            borderWidth: 1,
        },
        actionTxt: {
            fontSize: 13,
            fontWeight: "700",
        },
        timelineContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 1,
            marginBottom: hp(1),
            gap: 9,
        },
        timelineBtn: {
            flex: 1,
            paddingVertical: 7,
            borderRadius: 10,
            alignItems: 'center',
            borderWidth: 1,
            backgroundColor: theme.card,
            borderColor: theme.border,
        },
        timelineBtnActive: {
            backgroundColor: `${theme.purple}20`,
            borderColor: theme.purple,
        },
        timelineText: {
            fontSize: 12,
            fontWeight: '500',
            color: theme.dim,
        },
        timelineTextActive: {
            color: theme.purple,
            fontWeight: '700',
        },
        hiddenCard: {
            position: "absolute",
            top: -9999,
            left: -9999,
        },
        modalStyle: {
            justifyContent: "flex-end",
            margin: 0,
        },
        sheet: {
            backgroundColor: theme.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: hp(0),
        },
        handle: {
            width: 40,
            height: 4,
            backgroundColor: `${theme.text}30`,
            borderRadius: 2,
            alignSelf: "center",
            marginBottom: 16,
        },
        sheetTitle: {
            color: theme.text,
            fontSize: 17,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 20,
        },
        dateRow: {
            flexDirection: "row",
            gap: 10,
            marginBottom: 20,
        },
        dateBox: {
            flex: 1,
            backgroundColor: `${theme.bg}4D`,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
        },
        dateBoxLbl: {
            color: theme.dim,
            fontSize: 10,
            marginBottom: 4,
        },
        dateBoxVal: {
            color: theme.text,
            fontSize: 13,
            fontWeight: "600",
        },
        toggleRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
        },
        toggle: {
            width: 44,
            height: 26,
            borderRadius: 13,
            padding: 2,
            justifyContent: "center",
        },
        toggleKnob: {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.text,
        },
        sheetBtn: {
            backgroundColor: theme.purple,
            borderRadius: 14,
            paddingVertical: hp(1.8),
            marginBottom:hp(2),
            alignItems: "center",
        },
        sheetBtnTxt: {
            color: theme.text,
            fontSize: 15,
            fontWeight: "700",
        },
        secTitle: {
            fontSize: 19,
            fontWeight: "bold"
        },
        freshnessTag: {
            fontSize: 13,
            fontWeight: "400"
        },
    });

export default React.memo(PnlOverView);