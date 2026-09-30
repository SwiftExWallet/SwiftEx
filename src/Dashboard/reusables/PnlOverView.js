import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
    LayoutAnimation,
    UIManager,
    ScrollView,
    Share,
    PanResponder,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Svg, {
    Circle,
    Text as SvgText,
    Defs,
    Stop,
    LinearGradient,
    Path,
    Line,
    Rect,
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

if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getTheme = (activeTheme) => ({
    bg: activeTheme.cardBg,
    card: activeTheme.bg,
    border: activeTheme.inactiveTx,
    purple: activeTheme.buttonColor,
    mint: activeTheme.success,
    rose: activeTheme.fail,
    text: activeTheme.headingTx,
    dim: activeTheme.inactiveTx,
    warn: activeTheme.warn,
});

const fmtUSD = (value, decimals = 4) => {
    const n = Number(value) || 0;
    return `${n >= 0 ? "+$" : "-$"}${Math.abs(n).toFixed(decimals)}`;
};

const fmtNum = (value, decimals = 4) => Number(value || 0).toFixed(decimals);

const shortDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "short" });
    return `${day} ${month}`;
};

const formatDate = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;

const getRawRange = (timeline) => {
    const to = new Date();
    const from = new Date();
    switch (timeline) {
        case "1week":
            from.setDate(to.getDate() - 7);
            break;
        case "1month":
            from.setMonth(to.getMonth() - 1);
            break;
        case "3month":
            from.setMonth(to.getMonth() - 3);
            break;
        case "all":
            from.setFullYear(2014, 0, 1);
            from.setHours(0, 0, 0, 0);
            break;
        default:
            from.setDate(to.getDate() - 7);
    }
    return { from, to };
};

const TIMELINES = [
    { label: "1W", value: "1week" },
    { label: "1M", value: "1month" },
    { label: "3M", value: "3month" },
];

const EmptyState = ({ styles, theme, message = "No data available" }) => (
    <View style={styles.emptyState}>
        <Icon name="bar-chart-outline" size={32} color={theme.dim} type="ionicon" />
        <Text style={styles.emptyStateText}>{message}</Text>
        <Text style={styles.emptyStateSub}>No trades found for this period</Text>
    </View>
);

const EmptyListState = ({ styles, theme, message = "No data found" }) => (
    <View style={styles.emptyListState}>
        <Icon name="receipt-outline" size={22} color={theme.dim} type="ionicon" />
        <Text style={styles.emptyListText}>{message}</Text>
    </View>
);

const Sparkline = React.memo(
    ({
        data,
        rawPoints,
        width = 320,
        height = 120,
        color,
        dates = [],
        showDots = true,
        theme,
    }) => {
        const [activeIdx, setActiveIdx] = useState(null);
        const layoutRef = useRef({ x: 0, width });
        const dataLenRef = useRef(data ? data.length : 0);

        if (!data || data.length < 2) return null;

        dataLenRef.current = data.length;

        const topPad = 14;
        const bottomPad = 22;
        const leftPad = 4;
        const rightPad = 48;
        const chartH = height - topPad - bottomPad;
        const chartW = width - leftPad - rightPad;

        const buildScale = (arr) => {
            const max = Math.max(...arr);
            const min = Math.min(...arr);
            const span = max - min || 1;
            const pad = span * 0.12;
            return { sMax: max + pad, sMin: min - pad };
        };

        const { sMax: hMax, sMin: hMin } = buildScale(data);

        const holdingsArr = rawPoints
            ? rawPoints.map((p) => Number(p.holdingsValue) || 0)
            : null;
        const realizedArr = rawPoints
            ? rawPoints.map((p) => Number(p.realizedPnl) || 0)
            : null;

        const toX = (i, len) => leftPad + (i / (len - 1)) * chartW;
        const toY = (v, scMax, scMin) =>
            topPad + (1 - (v - scMin) / (scMax - scMin)) * chartH;

        const buildPath = (pts) => {
            let p = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(i - 1, 0)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(i + 2, pts.length - 1)];
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;
                p += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
            }
            return p;
        };

        const primaryPts = data.map((v, i) => ({
            x: toX(i, data.length),
            y: toY(v, hMax, hMin),
            v,
        }));
        const linePath = buildPath(primaryPts);
        const areaPath = `${linePath} L ${toX(data.length - 1, data.length)} ${topPad + chartH} L ${leftPad} ${topPad + chartH} Z`;

        let holdingsPath = null;
        if (holdingsArr && holdingsArr.length >= 2) {
            const { sMax: hldMax, sMin: hldMin } = buildScale(holdingsArr);
            holdingsPath = buildPath(
                holdingsArr.map((v, i) => ({
                    x: toX(i, holdingsArr.length),
                    y: toY(v, hldMax, hldMin),
                })),
            );
        }

        let realizedPath = null;
        if (realizedArr && realizedArr.length >= 2) {
            const { sMax: rMax, sMin: rMin } = buildScale(realizedArr);
            realizedPath = buildPath(
                realizedArr.map((v, i) => ({
                    x: toX(i, realizedArr.length),
                    y: toY(v, rMax, rMin),
                })),
            );
        }

        const yLabels = [hMax, (hMax + hMin) / 2, hMin].map((v) => ({
            y: toY(v, hMax, hMin),
            label:
                v >= 1
                    ? `$${v.toFixed(2)}`
                    : v >= 0.01
                        ? `$${v.toFixed(3)}`
                        : `$${v.toFixed(4)}`,
        }));

        const tickIndexes =
            dates.length >= 3
                ? [0, Math.floor((dates.length - 1) / 2), dates.length - 1]
                : dates.length === 2
                    ? [0, 1]
                    : [];

        const isLarge = data.length > 12;
        const peakIdx = data.indexOf(Math.max(...data));
        const troughIdx = data.indexOf(Math.min(...data));
        const specialIdx = new Set([0, data.length - 1, peakIdx, troughIdx]);
        const dotPoints = isLarge
            ? primaryPts.filter((_, i) => specialIdx.has(i))
            : primaryPts;

        const activePt = activeIdx !== null ? primaryPts[activeIdx] : null;
        const activeDate = activeIdx !== null ? dates[activeIdx] : null;
        const activeTotal = activeIdx !== null ? data[activeIdx] : null;
        const activeReal =
            activeIdx !== null && realizedArr ? realizedArr[activeIdx] : null;

        const tooltipW = 124;
        const tooltipH = activeReal !== null ? 58 : 36;
        const tooltipX = activePt
            ? Math.min(
                Math.max(activePt.x - tooltipW / 2, leftPad),
                leftPad + chartW - tooltipW,
            )
            : 0;
        const tooltipY = activePt ? Math.max(activePt.y - tooltipH - 8, topPad) : 0;

        const getIdx = (pageX) => {
            const viewX = layoutRef.current.x;
            const cw = layoutRef.current.width - leftPad - rightPad;
            const relX = pageX - viewX - leftPad;
            const len = dataLenRef.current;
            const ratio = Math.min(1, Math.max(0, relX / cw));
            return Math.round(ratio * (len - 1));
        };

        const timerRef = useRef(null);
        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: (e) => {
                    if (timerRef.current) clearTimeout(timerRef.current);
                    setActiveIdx(getIdx(e.nativeEvent.pageX));
                },
                onPanResponderMove: (e) => {
                    setActiveIdx(getIdx(e.nativeEvent.pageX));
                },
                onPanResponderRelease: () => {
                    timerRef.current = setTimeout(() => setActiveIdx(null), 2000);
                },
                onPanResponderTerminate: () => setActiveIdx(null),
            }),
        ).current;

        const purpleColor = theme?.purple || "#7F77DD";
        const mintColor = theme?.mint || "#4ECDC4";

        return (
            <View
                style={{ width, height: height + 5 }}
                onLayout={(e) => {
                    e.target.measure((_x, _y, w, _h, pageX) => {
                        layoutRef.current = { x: pageX, width: w };
                    });
                }}
                {...panResponder.panHandlers}
            >
                <Svg width={width} height={height}>
                    <Defs>
                        <LinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
                            <Stop offset="65%" stopColor={color} stopOpacity="0.06" />
                            <Stop offset="100%" stopColor={color} stopOpacity="0" />
                        </LinearGradient>
                    </Defs>

                    {[0, 0.5, 1].map((v, i) => (
                        <Line
                            key={i}
                            x1={leftPad}
                            y1={topPad + v * chartH}
                            x2={leftPad + chartW}
                            y2={topPad + v * chartH}
                            stroke="#FFFFFF"
                            strokeWidth={0.4}
                            opacity={0.08}
                        />
                    ))}

                    {hMin < 0 && (
                        <Line
                            x1={leftPad}
                            y1={toY(0, hMax, hMin)}
                            x2={leftPad + chartW}
                            y2={toY(0, hMax, hMin)}
                            stroke="#FFFFFF"
                            strokeWidth={0.7}
                            strokeDasharray="3 5"
                            opacity={0.2}
                        />
                    )}

                    <Path d={areaPath} fill="url(#sparkGrad)" />

                    {holdingsPath && (
                        <Path
                            d={holdingsPath}
                            fill="none"
                            stroke={mintColor}
                            strokeWidth={1.3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="5 4"
                            opacity={0.55}
                        />
                    )}
                    {realizedPath && (
                        <Path
                            d={realizedPath}
                            fill="none"
                            stroke={purpleColor}
                            strokeWidth={1.3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="2 4"
                            opacity={0.55}
                        />
                    )}

                    <Path
                        d={linePath}
                        fill="none"
                        stroke={color}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {showDots &&
                        dotPoints.map((pt, i) => (
                            <Circle
                                key={i}
                                cx={pt.x}
                                cy={pt.y}
                                r={pt === primaryPts[primaryPts.length - 1] ? 3.5 : 2.5}
                                fill={color}
                                stroke="#101116"
                                strokeWidth={1.2}
                            />
                        ))}

                    {yLabels.map((yl, i) => (
                        <SvgText
                            key={i}
                            x={leftPad + chartW + 5}
                            y={yl.y + 3.5}
                            fill="#8D8E99"
                            fontSize="7.5"
                            fontWeight="600"
                        >
                            {yl.label}
                        </SvgText>
                    ))}

                    {activePt && (
                        <>
                            <Line
                                x1={activePt.x}
                                y1={topPad}
                                x2={activePt.x}
                                y2={topPad + chartH}
                                stroke={color}
                                strokeWidth={1}
                                strokeDasharray="3 4"
                                opacity={0.55}
                            />
                            <Circle
                                cx={activePt.x}
                                cy={activePt.y}
                                r={5.5}
                                fill={color}
                                stroke="#101116"
                                strokeWidth={2}
                            />
                            <Rect
                                x={tooltipX}
                                y={tooltipY}
                                width={tooltipW}
                                height={tooltipH}
                                rx={7}
                                fill="#14151F"
                                opacity={0.93}
                            />
                            <SvgText
                                x={tooltipX + 9}
                                y={tooltipY + 13}
                                fill="#8D8E99"
                                fontSize="8"
                                fontWeight="700"
                            >
                                {shortDate(activeDate)}
                            </SvgText>
                            <SvgText
                                x={tooltipX + 9}
                                y={tooltipY + 27}
                                fill={color}
                                fontSize="10"
                                fontWeight="900"
                            >{`Total: $${(activeTotal || 0).toFixed(3)}`}</SvgText>
                            {activeReal !== null && (
                                <SvgText
                                    x={tooltipX + 9}
                                    y={tooltipY + 43}
                                    fill={purpleColor}
                                    fontSize="9"
                                    fontWeight="700"
                                >
                                    {`PnL: ${activeReal >= 0 ? "+" : ""}$${activeReal.toFixed(3)}`}
                                </SvgText>
                            )}
                            {holdingsArr && (
                                <Circle
                                    cx={activePt.x}
                                    cy={toY(
                                        holdingsArr[activeIdx],
                                        buildScale(holdingsArr).sMax,
                                        buildScale(holdingsArr).sMin,
                                    )}
                                    r={3.5}
                                    fill={mintColor}
                                    stroke="#101116"
                                    strokeWidth={1.2}
                                    opacity={0.8}
                                />
                            )}
                        </>
                    )}
                </Svg>

                <View
                    style={[
                        chartStyles.xLabels,
                        { paddingLeft: leftPad, paddingRight: rightPad },
                    ]}
                >
                    {tickIndexes.map((idx) => (
                        <Text key={idx} style={chartStyles.xLabel}>
                            {shortDate(dates[idx])}
                        </Text>
                    ))}
                </View>
            </View>
        );
    },
);

const chartStyles = StyleSheet.create({
    xLabels: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: -3,
    },
    xLabel: { color: "#8D8E99", fontSize: 9 },
});

const MetricCard = ({
    theme,
    label,
    value,
    color,
    styles,
    large = false,
    borderColor,
}) => (
    <View
        style={[
            styles.metricCard,
            large && styles.metricCardLarge,
            { borderColor: borderColor || theme.border },
        ]}
    >
        <Text style={styles.metricCardLabel}>{label}</Text>
        <Text
            numberOfLines={1}
            style={[
                styles.metricCardValue,
                large && styles.metricCardValueLarge,
                color && { color },
            ]}
        >
            {value}
        </Text>
    </View>
);

const StatCell = ({ value, label, styles, color }) => (
    <View style={styles.statCell}>
        <Text style={[styles.statValue, color && { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const AnalyticsRow = ({
    title,
    summary,
    icon,
    iconColor,
    expanded,
    onPress,
    styles,
    theme,
}) => (
    <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[styles.analyticsRow, expanded && styles.analyticsRowExpanded]}
    >
        <View
            style={[
                styles.analyticsIcon,
                { backgroundColor: `${iconColor || theme.purple}20` },
            ]}
        >
            <Icon
                name={icon}
                size={18}
                color={iconColor || theme.purple}
                type="ionicon"
            />
        </View>
        <View style={styles.analyticsCopy}>
            <Text style={styles.analyticsTitle}>{title}</Text>
            <Text style={styles.analyticsSummary} numberOfLines={1}>
                {summary}
            </Text>
        </View>
        <Icon
            name={expanded ? "chevron-up" : "chevron-forward"}
            size={20}
            color={theme.text}
            type="ionicon"
        />
    </TouchableOpacity>
);

const DetailLine = ({ label, value, styles, color }) => (
    <View style={styles.detailLine}>
        <Text style={styles.detailLineLabel}>{label}</Text>
        <Text style={[styles.detailLineValue, color && { color }]}>{value}</Text>
    </View>
);

const WinRateRing = ({ winRate, theme, size = 112 }) => {
    const r = 41;
    const circ = 2 * Math.PI * r;
    const rate = Math.min(100, Math.max(0, winRate || 0));
    return (
        <Svg width={size} height={size}>
            <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={theme.border}
                strokeWidth="8"
                fill="none"
            />
            <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={theme.purple}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(rate / 100) * circ} ${(1 - rate / 100) * circ}`}
                strokeDashoffset={circ / 4}
            />
            <SvgText
                x={size / 2}
                y={size / 2 + 2}
                textAnchor="middle"
                fill={theme.text}
                fontSize="22"
                fontWeight="800"
            >
                {Math.round(rate) + "%"}
            </SvgText>
            <SvgText
                x={size / 2}
                y={size / 2 + 16}
                textAnchor="middle"
                fill={theme.dim}
                fontSize="9"
                fontWeight="700"
            >
                Win Rate
            </SvgText>
        </Svg>
    );
};

const TradeDetailView = ({
    styles,
    theme,
    data,
    winRate,
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    tradeBreakdown,
    lastFiveTrades,
    hasData,
}) => (
    <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.detailScroll}
        showsVerticalScrollIndicator={false}
    >
        {!hasData ? (
            <EmptyState
                styles={styles}
                theme={theme}
                message="No trade data available"
            />
        ) : (
            <>
                <View style={styles.detailHeroRow}>
                    <View style={styles.detailRing}>
                        <WinRateRing winRate={winRate} theme={theme} />
                    </View>
                    <View style={styles.detailBestWorst}>
                        <View style={styles.bestWorstCard}>
                            <Text style={styles.bwLabel}>
                                BEST TRADE{" "}
                                {data.bestTrade?.asset ? `(${data.bestTrade.asset})` : ""}
                            </Text>
                            <Text style={[styles.bwValue, { color: theme.mint }]}>
                                {data.bestTrade?.pnl != null
                                    ? fmtUSD(data.bestTrade.pnl, 4)
                                    : "—"}
                            </Text>
                        </View>
                        <View style={styles.bestWorstCard}>
                            <Text style={styles.bwLabel}>
                                WORST TRADE{" "}
                                {data.worstTrade?.asset ? `(${data.worstTrade.asset})` : ""}
                            </Text>
                            <Text style={[styles.bwValue, { color: theme.rose }]}>
                                {data.worstTrade?.pnl != null
                                    ? fmtUSD(data.worstTrade.pnl, 4)
                                    : "—"}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <StatCell
                        value={totalTrades || "—"}
                        label="Total Trades"
                        styles={styles}
                    />
                    <StatCell
                        value={winningTrades || "—"}
                        label="Winning"
                        styles={styles}
                    />
                    <StatCell
                        value={losingTrades || "—"}
                        label="Losing"
                        styles={styles}
                    />
                    <StatCell
                        value={breakevenTrades || "—"}
                        label="Breakeven"
                        styles={styles}
                    />
                </View>

                <View style={styles.detailListCard}>
                    <Text style={styles.detailSectionLabel}>TRADE BREAKDOWN</Text>
                    {tradeBreakdown.length === 0 ? (
                        <EmptyListState
                            styles={styles}
                            theme={theme}
                            message="No breakdown data"
                        />
                    ) : (
                        <>
                            <View style={styles.tableHeader}>
                                <Text
                                    style={[
                                        styles.tableHeaderCell,
                                        { flex: 2, textAlign: "left" },
                                    ]}
                                >
                                    Pair
                                </Text>
                                <Text style={styles.tableHeaderCell}>Trades</Text>
                                <Text style={styles.tableHeaderCell}>P&L</Text>
                                <Text style={styles.tableHeaderCell}>Win%</Text>
                            </View>
                            {tradeBreakdown.map((row, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <Text
                                        style={[
                                            styles.tableCell,
                                            {
                                                flex: 2,
                                                textAlign: "left",
                                                color: theme.text,
                                                fontWeight: "700",
                                            },
                                        ]}
                                    >
                                        {row.pair}
                                    </Text>
                                    <Text style={styles.tableCell}>{row.count}</Text>
                                    <Text
                                        style={[
                                            styles.tableCell,
                                            {
                                                color: Number(row.pnl) >= 0 ? theme.mint : theme.rose,
                                                fontWeight: "800",
                                            },
                                        ]}
                                    >
                                        {fmtUSD(row.pnl, 4)}
                                    </Text>
                                    <Text style={styles.tableCell}>
                                        {row.winPct != null ? `${row.winPct}%` : "—"}
                                    </Text>
                                </View>
                            ))}
                        </>
                    )}
                </View>

                <View style={styles.detailListCard}>
                    <Text style={styles.detailSectionLabel}>LAST 5 TRADES</Text>
                    {lastFiveTrades.length === 0 ? (
                        <EmptyListState
                            styles={styles}
                            theme={theme}
                            message="No recent trades"
                        />
                    ) : (
                        lastFiveTrades.map((trade, i) => {
                            const pnl = Number(trade.pnl) || 0;
                            return (
                                <View key={i} style={styles.tradeHistoryRow}>
                                    <View
                                        style={[
                                            styles.sideBadge,
                                            {
                                                backgroundColor:
                                                    pnl >= 0 ? `${theme.mint}18` : `${theme.rose}18`,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.sideBadgeText,
                                                { color: pnl >= 0 ? theme.mint : theme.rose },
                                            ]}
                                        >
                                            {trade.side || "Sell"}
                                        </Text>
                                    </View>
                                    <Text
                                        style={[
                                            styles.tableCell,
                                            { flex: 2, textAlign: "left", color: theme.text },
                                        ]}
                                    >
                                        {trade.asset || "—"}/USDC
                                    </Text>
                                    <Text
                                        style={[
                                            styles.tableCell,
                                            {
                                                color: pnl >= 0 ? theme.mint : theme.rose,
                                                fontWeight: "800",
                                            },
                                        ]}
                                    >
                                        {fmtUSD(pnl, 4)}
                                    </Text>
                                    <Text style={styles.tableCell}>
                                        {trade.date
                                            ? new Date(trade.date).toLocaleDateString("en-US", {
                                                day: "2-digit",
                                                month: "short",
                                            })
                                            : "—"}
                                    </Text>
                                </View>
                            );
                        })
                    )}
                </View>
            </>
        )}
    </ScrollView>
);

const MetricsDetailView = ({
    styles,
    theme,
    data,
    temporaryDates,
    isLiveChart,
    hasData,
}) => {
    const [chartWidth, setChartWidth] = useState(300);

    const chartPts = useMemo(() => {
        if (!isLiveChart) return null;
        const pts = data?.chart?.points || [];
        const step = Math.max(1, Math.floor(pts.length / 60));
        return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    }, [data?.chart?.points, isLiveChart]);

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.detailScroll}
            showsVerticalScrollIndicator={false}
        >
            {!hasData ? (
                <EmptyState
                    styles={styles}
                    theme={theme}
                    message="No metrics available"
                />
            ) : (
                <>
                    <View style={styles.detailListCard}>
                        <Text style={styles.detailSectionLabel}>USDC FLOW</Text>
                        <View style={styles.metricCardsRow}>
                            <MetricCard
                                theme={theme}
                                label="USDC SPENT"
                                value={
                                    data.usdcSpent != null ? `$${fmtNum(data.usdcSpent, 2)}` : "—"
                                }
                                styles={styles}
                            />
                            <MetricCard
                                theme={theme}
                                label="USDC RECEIVED"
                                value={
                                    data.usdcReceived != null
                                        ? `$${fmtNum(data.usdcReceived, 2)}`
                                        : "—"
                                }
                                styles={styles}
                            />
                            <MetricCard
                                theme={theme}
                                label="NET USDC FLOW"
                                value={
                                    data.netUSDCFlow != null ? fmtUSD(data.netUSDCFlow, 2) : "—"
                                }
                                color={theme.rose}
                                styles={styles}
                            />
                        </View>
                    </View>

                    <View style={styles.detailListCard}>
                        <View style={styles.rowBetween}>
                            <Text style={styles.detailSectionLabel}>
                                REALIZED P&L OVER TIME
                            </Text>
                            {!isLiveChart && <Text style={styles.previewText}>PREVIEW</Text>}
                        </View>
                        <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                            <Sparkline
                                data={
                                    isLiveChart
                                        ? chartPts.map(
                                            (p) => Number(p.holdingsValue) + Number(p.realizedPnl),
                                        )
                                        : [
                                            -0.02, 0.04, 0.13, 0.18, 0.3, 0.2, 0.16, 0.15, 0.13,
                                            0.11,
                                        ]
                                }
                                rawPoints={isLiveChart ? chartPts : null}
                                width={chartWidth}
                                height={120}
                                color={theme.purple}
                                showDots={false}
                                theme={theme}
                                dates={
                                    isLiveChart ? chartPts.map((p) => p.date) : temporaryDates
                                }
                            />
                        </View>
                    </View>

                    <View style={styles.detailListCard}>
                        <Text style={styles.detailSectionLabel}>MORE METRICS</Text>
                        <DetailLine
                            label="Profit Factor"
                            value={
                                data.profitFactor != null ? fmtNum(data.profitFactor, 2) : "—"
                            }
                            styles={styles}
                        />
                        <DetailLine
                            label="Sharpe Ratio"
                            value={
                                data.sharpeRatio != null ? fmtNum(data.sharpeRatio, 2) : "—"
                            }
                            styles={styles}
                        />
                        <DetailLine
                            label="Max Drawdown"
                            value={data.maxDrawdown != null ? String(data.maxDrawdown) : "—"}
                            color={theme.rose}
                            styles={styles}
                        />
                        <DetailLine
                            label="Active Days"
                            value={data.activeDays != null ? String(data.activeDays) : "—"}
                            styles={styles}
                        />
                    </View>
                </>
            )}
        </ScrollView>
    );
};

const DiagnosticsDetailView = ({
    styles,
    theme,
    data,
    positions,
    largestPosition,
    costBasisWarning,
    onCostBasis,
    hasData,
}) => (
    <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.detailScroll}
        showsVerticalScrollIndicator={false}
    >
        {!hasData ? (
            <EmptyState
                styles={styles}
                theme={theme}
                message="No diagnostics available"
            />
        ) : (
            <>
                {costBasisWarning && (
                    <TouchableOpacity
                        style={styles.warnBox}
                        activeOpacity={0.8}
                        onPress={onCostBasis}
                    >
                        <Icon
                            name="warning-outline"
                            size={18}
                            color={theme.warn}
                            type="ionicon"
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.warnTitle, { color: theme.warn }]}>
                                Auto Cost Basis applied
                            </Text>
                            <Text style={styles.warnSub}>
                                Using estimated cost basis for calculations.
                            </Text>
                        </View>
                        <Icon
                            name="chevron-forward"
                            size={17}
                            color={theme.warn}
                            type="ionicon"
                        />
                    </TouchableOpacity>
                )}

                <Text style={styles.detailSectionLabel}>POSITION SUMMARY</Text>
                <View style={styles.statsRow}>
                    <StatCell
                        value={data.rawCount ?? "—"}
                        label="Raw Trades"
                        styles={styles}
                    />
                    <StatCell
                        value={data.collapsedCount ?? "—"}
                        label="Collapsed"
                        styles={styles}
                    />
                    <StatCell
                        value={data.activeDays ?? "—"}
                        label="Active Days"
                        styles={styles}
                    />
                    <StatCell
                        value={positions.length || "—"}
                        label="Positions"
                        styles={styles}
                    />
                </View>

                {largestPosition ? (
                    <View style={styles.detailListCard}>
                        <Text style={styles.detailSectionLabel}>LARGEST POSITION</Text>
                        <View style={styles.positionRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.positionAsset}>
                                    {largestPosition.asset}
                                </Text>
                                <Text style={styles.positionMeta}>Asset</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: "center" }}>
                                <Text style={styles.positionValue}>
                                    {fmtNum(largestPosition.remaining, 4)}
                                </Text>
                                <Text style={styles.positionMeta}>Amount</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: "flex-end" }}>
                                <Text style={styles.positionValue}>
                                    ${fmtNum(largestPosition.currentValue, 2)}
                                </Text>
                                <Text style={[styles.positionMeta, { textAlign: "right" }]}>
                                    Value (USD)
                                </Text>
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={styles.detailListCard}>
                        <EmptyListState
                            styles={styles}
                            theme={theme}
                            message="No open positions"
                        />
                    </View>
                )}

                <View style={styles.detailListCard}>
                    <Text style={styles.detailSectionLabel}>DIAGNOSTICS</Text>
                    <DetailLine
                        label="Cost Basis Method"
                        value={data.costBasisMethod || "Auto (Estimated)"}
                        styles={styles}
                    />
                    <DetailLine
                        label="Data Quality"
                        value={data.dataQuality || "Good"}
                        color={theme.mint}
                        styles={styles}
                    />
                    <DetailLine
                        label="Data Source"
                        value={data.dataSource || "Stellar Network"}
                        styles={styles}
                    />
                </View>

                <View style={[styles.detailListCard, { marginBottom: 24 }]}>
                    <Text
                        style={[
                            styles.detailSectionLabel,
                            { color: theme.purple, letterSpacing: 0 },
                        ]}
                    >
                        What does this mean?
                    </Text>
                    <Text style={styles.infoExplain}>
                        Auto Cost Basis is used when trade history is incomplete or external
                        data is missing. Some P&L values may be estimated.
                    </Text>
                </View>
            </>
        )}
    </ScrollView>
);

const CostBasisDetailView = ({ styles, theme, onClose }) => (
    <View style={styles.infoModalBody}>
        <View style={styles.infoIcon}>
            <Icon
                name="information-circle-outline"
                size={30}
                color={theme.purple}
                type="ionicon"
            />
        </View>
        <Text style={styles.infoTitle}>About Auto Cost Basis</Text>
        <Text style={styles.infoText}>
            Auto Cost Basis is applied when your wallet or trade history doesn't
            contain enough information to calculate the exact cost basis.
        </Text>
        <Text style={styles.infoText}>This may happen when:</Text>
        <Text style={styles.bullet}>
            • Trades are imported from external sources
        </Text>
        <Text style={styles.bullet}>• Some historical data is missing</Text>
        <Text style={styles.bullet}>• Assets were received outside the DEX</Text>
        <TouchableOpacity
            style={styles.sheetBtn}
            activeOpacity={0.8}
            onPress={onClose}
        >
            <Text style={styles.sheetBtnText}>Got it</Text>
        </TouchableOpacity>
    </View>
);

const PnlOverView = ({
    refresh = false,
    stellarKey,
    activeTheme,
    onSummaryUpdate,
}) => {
    const theme = useMemo(() => getTheme(activeTheme), [activeTheme]);
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [selectedTimeline, setSelectedTimeline] = useState("1week");
    const [pnlInfo, setPnlInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expandedSection, setExpandedSection] = useState(null);
    const [detailType, setDetailType] = useState(null);
    const [bottomSheet, setBottomSheet] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [hideTotalPnL, setHideTotalPnL] = useState(false);
    const [heroChartWidth, setHeroChartWidth] = useState(300);
    const [fromDate, setFromDate] = useState(() => getRawRange("1week").from);
    const [toDate, setToDate] = useState(() => getRawRange("1week").to);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    const pnlCardRef = useRef();
    const isPanelOpen = bottomSheet === "share" || bottomSheet === "export";

    const hasData =
        pnlInfo !== null && (pnlInfo.rawCount > 0 || pnlInfo.collapsedCount > 0);

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
        setLoading(true);
        const { from, to } = getRawRange(selectedTimeline);
        const url = `${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${formatDate(from)}&to=${formatDate(to)}&nocache=true&summary=false`;
        try {
            const res = await apiHelper.get(url);
            if (res?.success && res?.data) {
                setPnlInfo(res.data);
                onSummaryUpdate?.(res.data);
            } else {
                setPnlInfo(null);
            }
        } catch (e) {
            console.error("PnlOverView fetch error:", e);
            setPnlInfo(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!stellarKey) return;
        setIsDownloading(true);
        try {
            const from = formatDate(fromDate);
            const to = formatDate(toDate);
            const res = await apiHelper.get(
                `${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${from}&to=${to}&nocache=true&summary=false&excel=true`,
            );
            if (res?.success && res?.data) {
                await buildXlsxZip(res.data, `${from}->${to}`);
            } else {
                Alert.alert("No Data", "No records for this range.");
            }
        } catch (e) {
            console.error("Download error:", e);
        } finally {
            setIsDownloading(false);
            setBottomSheet(null);
        }
    };

    const data = pnlInfo || {};
    const totalPnL = hasData ? Number(data.totalPnL || 0) : null;
    const totalUnrealized = hasData ? Number(data.totalUnrealized || 0) : null;
    const totalRealized = hasData ? Number(data.totalRealized || 0) : null;
    const winRate = hasData ? Number(data.winRate || 0) : null;
    const pnlColor = (totalPnL ?? 0) >= 0 ? theme.mint : theme.rose;
    const positions = Array.isArray(data.positions) ? data.positions : [];
    const disposals = Array.isArray(data.disposals)
        ? [...data.disposals].sort(
            (a, b) => new Date(a.date || 0) - new Date(b.date || 0),
        )
        : [];

    const totalTrades = hasData
        ? Number(data.rawCount || data.collapsedCount || 0)
        : null;
    const winningTrades =
        hasData && Number.isFinite(Number(data.winningTrades))
            ? Number(data.winningTrades)
            : hasData
                ? Math.round(
                    (totalTrades * Math.max(0, Math.min(100, winRate || 0))) / 100,
                )
                : null;
    const losingTrades =
        hasData && Number.isFinite(Number(data.losingTrades))
            ? Number(data.losingTrades)
            : hasData
                ? Math.max(0, (totalTrades || 0) - (winningTrades || 0))
                : null;
    const breakevenTrades = hasData ? Number(data.breakevenTrades || 0) : null;

    const { chartData, chartDates, chartRawPoints, isLiveChart } = useMemo(() => {
        const pts = data?.chart?.points;
        if (Array.isArray(pts) && pts.length >= 2) {
            const step = Math.max(1, Math.floor(pts.length / 60));
            const sampled = pts.filter(
                (_, i) => i % step === 0 || i === pts.length - 1,
            );
            return {
                chartData: sampled.map(
                    (p) => Number(p.holdingsValue) + Number(p.realizedPnl),
                ),
                chartDates: sampled.map((p) => p.date),
                chartRawPoints: sampled,
                isLiveChart: true,
            };
        }
        return {
            chartData: null,
            chartDates: [],
            chartRawPoints: null,
            isLiveChart: false,
        };
    }, [data?.chart?.points]);

    const temporaryDates = useMemo(() => {
        const now = new Date();
        return Array.from({ length: 10 }, (_, i) => {
            const d = new Date(now);
            d.setDate(now.getDate() - (9 - i));
            return d.toISOString();
        });
    }, []);

    const largestPosition = hasData ? data.largestPosition : null;
    const costBasisWarning = data.costBasisWarning ?? false;

    const tradeBreakdown = useMemo(() => {
        if (!hasData) return [];
        if (Array.isArray(data.tradeBreakdown) && data.tradeBreakdown.length)
            return data.tradeBreakdown;
        if (Array.isArray(data.disposals) && data.disposals.length) {
            const assetMap = {};
            data.disposals.forEach((d) => {
                const key = d.asset;
                if (!assetMap[key]) assetMap[key] = { pnl: 0, count: 0, wins: 0 };
                assetMap[key].pnl += Number(d.pnl) || 0;
                assetMap[key].count += 1;
                if ((Number(d.pnl) || 0) > 0) assetMap[key].wins += 1;
            });
            return Object.entries(assetMap)
                .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
                .slice(0, 4)
                .map(([asset, val]) => ({
                    pair: `${asset}/USDC`,
                    count: val.count,
                    pnl: val.pnl,
                    winPct:
                        val.count > 0 ? Math.round((val.wins / val.count) * 100) : null,
                }));
        }
        return [];
    }, [data.tradeBreakdown, data.disposals, hasData]);

    const lastFiveTrades = useMemo(() => {
        if (!hasData || !Array.isArray(data.disposals) || !data.disposals.length)
            return [];
        return [...data.disposals]
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            .slice(0, 5)
            .map((d) => ({ ...d, side: "Sell" }));
    }, [data.disposals, hasData]);

    const toggleSection = (section) => {
        try {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        } catch (_) { }
        setExpandedSection((cur) => (cur === section ? null : section));
    };

    const openDetail = (type) => setDetailType(type);
    const closeDetail = () => setDetailType(null);

    const detailTitle =
        {
            trade: "Trade Performance",
            metrics: "Performance Metrics",
            diagnostics: "Portfolio Diagnostics",
            costBasis: "About Auto Cost Basis",
        }[detailType] || "";

    if (detailType !== null) {
        return (
            <View style={[styles.container, { backgroundColor: theme.bg }]}>
                <View style={styles.detailHeader}>
                    <TouchableOpacity
                        style={styles.backButton}
                        activeOpacity={0.8}
                        onPress={closeDetail}
                    >
                        <Icon
                            name="arrow-back"
                            size={20}
                            color={theme.text}
                            type="ionicon"
                        />
                    </TouchableOpacity>
                    <Text style={styles.detailTitle}>{detailTitle}</Text>
                    <View style={{ width: 36 }} />
                </View>

                {detailType === "trade" && (
                    <TradeDetailView
                        styles={styles}
                        theme={theme}
                        data={data}
                        hasData={hasData}
                        winRate={winRate}
                        totalTrades={totalTrades}
                        winningTrades={winningTrades}
                        losingTrades={losingTrades}
                        breakevenTrades={breakevenTrades}
                        tradeBreakdown={tradeBreakdown}
                        lastFiveTrades={lastFiveTrades}
                    />
                )}
                {detailType === "metrics" && (
                    <MetricsDetailView
                        styles={styles}
                        theme={theme}
                        data={data}
                        hasData={hasData}
                        temporaryDates={temporaryDates}
                        isLiveChart={isLiveChart}
                    />
                )}
                {detailType === "diagnostics" && (
                    <DiagnosticsDetailView
                        styles={styles}
                        theme={theme}
                        data={data}
                        hasData={hasData}
                        positions={positions}
                        largestPosition={largestPosition}
                        costBasisWarning={costBasisWarning}
                        onCostBasis={() => openDetail("costBasis")}
                    />
                )}
                {detailType === "costBasis" && (
                    <CostBasisDetailView
                        styles={styles}
                        theme={theme}
                        onClose={closeDetail}
                    />
                )}
            </View>
        );
    }

    return (
        <View
            style={[
                styles.container,
                { backgroundColor: theme.bg, paddingVertical: 6 },
            ]}
        >
            {!isPanelOpen && (
                <>
                    <View style={styles.sectionHeader}>
                        <View style={styles.titleWrap}>
                            <Text style={styles.secTitle}>P&L Overview</Text>
                            <Text style={styles.freshnessTag}>Freshness: ~15 mins</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.secondaryAction}
                            activeOpacity={0.8}
                            onPress={() => setBottomSheet("export")}
                        >
                            <Icon
                                name="arrow-down-circle-outline"
                                size={19}
                                color={theme.purple}
                                type="ionicon"
                            />
                            <Text style={styles.secondaryActionText}>Detailed P&L</Text>
                        </TouchableOpacity>
                    </View>

                    <View
                        style={styles.heroCard}
                        onLayout={(e) => setHeroChartWidth(e.nativeEvent.layout.width - 26)}
                    >
                        {loading ? (
                            <View style={styles.loadingWrap}>
                                <ActivityIndicator color={theme.purple} size="small" />
                                <Text style={styles.loadingText}>Loading P&L data…</Text>
                            </View>
                        ) : !hasData ? (
                            <>
                                <View style={styles.metricCardsRow}>
                                    <MetricCard
                                        theme={theme}
                                        label="TOTAL P&L"
                                        value="—"
                                        styles={styles}
                                        borderColor={theme.purple}
                                    />
                                    <MetricCard
                                        theme={theme}
                                        label="UNREALIZED"
                                        value="—"
                                        styles={styles}
                                        borderColor={theme.border}
                                    />
                                    <MetricCard
                                        theme={theme}
                                        label="REALIZED"
                                        value="—"
                                        styles={styles}
                                        borderColor={theme.border}
                                    />
                                </View>
                                <View style={styles.noChartWrap}>
                                    <Icon
                                        name="bar-chart-outline"
                                        size={28}
                                        color={theme.dim}
                                        type="ionicon"
                                    />
                                    <Text style={styles.noChartText}>
                                        No trading data for this period
                                    </Text>
                                    <Text style={styles.noChartSub}>
                                        Try selecting a different time range
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.metricCardsRow}>
                                    <MetricCard
                                        theme={theme}
                                        label="TOTAL P&L"
                                        value={fmtUSD(totalPnL, 4)}
                                        color={pnlColor}
                                        styles={styles}
                                        borderColor={theme.purple}
                                    />
                                    <MetricCard
                                        theme={theme}
                                        label="UNREALIZED"
                                        value={fmtUSD(totalUnrealized, 4)}
                                        color={totalUnrealized >= 0 ? theme.mint : theme.rose}
                                        styles={styles}
                                        borderColor={theme.border}
                                    />
                                    <MetricCard
                                        theme={theme}
                                        label="REALIZED"
                                        value={fmtUSD(totalRealized, 4)}
                                        color={totalRealized >= 0 ? theme.mint : theme.rose}
                                        styles={styles}
                                        borderColor={theme.border}
                                    />
                                </View>
                                {chartData && chartData.length >= 2 ? (
                                    <View style={styles.chartWrap}>
                                        <Sparkline
                                            data={chartData}
                                            dates={chartDates}
                                            rawPoints={chartRawPoints}
                                            width={heroChartWidth}
                                            height={80}
                                            color={pnlColor}
                                            theme={theme}
                                        />
                                    </View>
                                ) : (
                                    <View style={styles.noChartWrap}>
                                        <Text style={styles.noChartSub}>
                                            Chart data unavailable
                                        </Text>
                                    </View>
                                )}
                            </>
                        )}
                    </View>

                    <AnalyticsRow
                        title="Trade Performance"
                        summary={
                            hasData
                                ? `${Math.round(winRate || 0)}% win rate · ${totalTrades} trades`
                                : "No data for this period"
                        }
                        icon="pie-chart-outline"
                        expanded={expandedSection === "trade"}
                        onPress={() => toggleSection("trade")}
                        styles={styles}
                        theme={theme}
                    />
                    {expandedSection === "trade" && (
                        <View style={styles.expandedCard}>
                            {!hasData ? (
                                <EmptyListState
                                    styles={styles}
                                    theme={theme}
                                    message="No trade data for this period"
                                />
                            ) : (
                                <>
                                    <View style={styles.tradeTop}>
                                        <View style={styles.ringWrap}>
                                            <WinRateRing winRate={winRate} theme={theme} />
                                        </View>
                                        <View style={styles.bestWorstColumn}>
                                            <View style={styles.bestWorstCard}>
                                                <Text style={styles.bwLabel}>
                                                    Best Trade{" "}
                                                    {data.bestTrade?.asset
                                                        ? `(${data.bestTrade.asset})`
                                                        : ""}
                                                </Text>
                                                <Text style={[styles.bwValue, { color: theme.mint }]}>
                                                    {data.bestTrade?.pnl != null
                                                        ? fmtUSD(data.bestTrade.pnl, 4)
                                                        : "—"}
                                                </Text>
                                            </View>
                                            <View style={styles.bestWorstCard}>
                                                <Text style={styles.bwLabel}>
                                                    Worst Trade{" "}
                                                    {data.worstTrade?.asset
                                                        ? `(${data.worstTrade.asset})`
                                                        : ""}
                                                </Text>
                                                <Text style={[styles.bwValue, { color: theme.rose }]}>
                                                    {data.worstTrade?.pnl != null
                                                        ? fmtUSD(data.worstTrade.pnl, 4)
                                                        : "—"}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={styles.statsRow}>
                                        <StatCell
                                            value={totalTrades ?? "—"}
                                            label="Total Trades"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={winningTrades ?? "—"}
                                            label="Winning"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={losingTrades ?? "—"}
                                            label="Losing"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={breakevenTrades ?? "—"}
                                            label="Breakeven"
                                            styles={styles}
                                        />
                                    </View>
                                </>
                            )}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={styles.detailButton}
                                onPress={() => openDetail("trade")}
                            >
                                <Text style={styles.detailButtonText}>
                                    View Trade Breakdown
                                </Text>
                                <Icon
                                    name="chevron-forward"
                                    size={18}
                                    color={theme.text}
                                    type="ionicon"
                                />
                            </TouchableOpacity>
                        </View>
                    )}

                    <AnalyticsRow
                        title="Performance Metrics"
                        summary={
                            hasData
                                ? `$${fmtNum(data.usdcSpent ?? 0, 2)} spent · ${fmtUSD(data.netUSDCFlow ?? 0, 2)} net flow`
                                : "No data for this period"
                        }
                        icon="stats-chart-outline"
                        expanded={expandedSection === "metrics"}
                        onPress={() => toggleSection("metrics")}
                        styles={styles}
                        theme={theme}
                    />
                    {expandedSection === "metrics" && (
                        <View style={styles.expandedCard}>
                            {!hasData ? (
                                <EmptyListState
                                    styles={styles}
                                    theme={theme}
                                    message="No metrics for this period"
                                />
                            ) : (
                                <>
                                    <Text style={styles.detailSectionLabel}>USDC FLOW</Text>
                                    <View style={styles.metricCardsRow}>
                                        <MetricCard
                                            theme={theme}
                                            label="USDC SPENT"
                                            value={
                                                data.usdcSpent != null
                                                    ? `$${fmtNum(data.usdcSpent, 2)}`
                                                    : "—"
                                            }
                                            styles={styles}
                                        />
                                        <MetricCard
                                            theme={theme}
                                            label="USDC RECEIVED"
                                            value={
                                                data.usdcReceived != null
                                                    ? `$${fmtNum(data.usdcReceived, 2)}`
                                                    : "—"
                                            }
                                            styles={styles}
                                        />
                                        <MetricCard
                                            theme={theme}
                                            label="NET USDC FLOW"
                                            value={
                                                data.netUSDCFlow != null
                                                    ? fmtUSD(data.netUSDCFlow, 2)
                                                    : "—"
                                            }
                                            color={theme.rose}
                                            styles={styles}
                                        />
                                    </View>
                                    <Text style={[styles.detailSectionLabel, { marginTop: 18 }]}>
                                        TRADING STATS
                                    </Text>
                                    <View style={styles.statsRow}>
                                        <StatCell
                                            value={totalTrades ?? "—"}
                                            label="Total Trades"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={winRate != null ? `${Math.round(winRate)}%` : "—"}
                                            label="Win Rate"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={data.activeDays ?? "—"}
                                            label="Active Days"
                                            styles={styles}
                                        />
                                    </View>
                                </>
                            )}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={styles.detailButton}
                                onPress={() => openDetail("metrics")}
                            >
                                <Text style={styles.detailButtonText}>View All Metrics</Text>
                                <Icon
                                    name="chevron-forward"
                                    size={18}
                                    color={theme.text}
                                    type="ionicon"
                                />
                            </TouchableOpacity>
                        </View>
                    )}

                    <AnalyticsRow
                        title="Portfolio Diagnostics"
                        summary={
                            hasData
                                ? `${data.rawCount ?? 0} raw · ${data.collapsedCount ?? 0} collapsed · ${data.activeDays ?? 0} days`
                                : "No data for this period"
                        }
                        icon="warning-outline"
                        iconColor={theme.warn}
                        expanded={expandedSection === "diagnostics"}
                        onPress={() => toggleSection("diagnostics")}
                        styles={styles}
                        theme={theme}
                    />
                    {expandedSection === "diagnostics" && (
                        <View style={styles.expandedCard}>
                            {!hasData ? (
                                <EmptyListState
                                    styles={styles}
                                    theme={theme}
                                    message="No diagnostics for this period"
                                />
                            ) : (
                                <>
                                    {costBasisWarning && (
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={styles.warnBox}
                                            onPress={() => openDetail("costBasis")}
                                        >
                                            <Icon
                                                name="warning-outline"
                                                size={18}
                                                color={theme.warn}
                                                type="ionicon"
                                            />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.warnTitle, { color: theme.warn }]}>
                                                    Auto Cost Basis applied
                                                </Text>
                                                <Text style={styles.warnSub}>
                                                    Using estimated cost basis for calculations.
                                                </Text>
                                            </View>
                                            <Icon
                                                name="chevron-forward"
                                                size={17}
                                                color={theme.warn}
                                                type="ionicon"
                                            />
                                        </TouchableOpacity>
                                    )}
                                    <View style={styles.statsRow}>
                                        <StatCell
                                            value={data.rawCount ?? "—"}
                                            label="Raw Trades"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={data.collapsedCount ?? "—"}
                                            label="Collapsed"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={data.activeDays ?? "—"}
                                            label="Active Days"
                                            styles={styles}
                                        />
                                        <StatCell
                                            value={positions.length || "—"}
                                            label="Positions"
                                            styles={styles}
                                        />
                                    </View>
                                    {largestPosition && (
                                        <View style={styles.positionCard}>
                                            <Text style={styles.detailSectionLabel}>
                                                LARGEST POSITION
                                            </Text>
                                            <View style={styles.positionRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.positionAsset}>
                                                        {largestPosition.asset}
                                                    </Text>
                                                    <Text style={styles.positionMeta}>Asset</Text>
                                                </View>
                                                <View style={{ flex: 1, alignItems: "center" }}>
                                                    <Text style={styles.positionValue}>
                                                        {fmtNum(largestPosition.remaining, 4)}
                                                    </Text>
                                                    <Text style={styles.positionMeta}>Amount</Text>
                                                </View>
                                                <View style={{ flex: 1, alignItems: "flex-end" }}>
                                                    <Text style={styles.positionValue}>
                                                        ${fmtNum(largestPosition.currentValue, 2)}
                                                    </Text>
                                                    <Text
                                                        style={[
                                                            styles.positionMeta,
                                                            { textAlign: "right" },
                                                        ]}
                                                    >
                                                        Value (USD)
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={styles.detailButton}
                                onPress={() => openDetail("diagnostics")}
                            >
                                <Text style={styles.detailButtonText}>
                                    View Full Diagnostics
                                </Text>
                                <Icon
                                    name="chevron-forward"
                                    size={18}
                                    color={theme.text}
                                    type="ionicon"
                                />
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.periodRow}>
                        {TIMELINES.map((item) => {
                            const active = selectedTimeline === item.value;
                            return (
                                <TouchableOpacity
                                    key={item.value}
                                    activeOpacity={0.8}
                                    onPress={() => setSelectedTimeline(item.value)}
                                    style={[styles.periodBtn, active && styles.periodBtnActive]}
                                >
                                    <Text
                                        style={[
                                            styles.periodText,
                                            active && styles.periodTextActive,
                                        ]}
                                    >
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                        <TouchableOpacity
                            style={[styles.secondaryAction, { height: 35 }]}
                            activeOpacity={0.8}
                            onPress={() => setBottomSheet("share")}
                        >
                            <Icon
                                name="share-social-outline"
                                size={19}
                                color={theme.purple}
                                type="ionicon"
                            />
                            <Text style={styles.secondaryActionText}>Share P&L</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {pnlInfo && (
                <View style={styles.hiddenCard} pointerEvents="none">
                    <PnlShareCard
                        ref={pnlCardRef}
                        brandName="SwiftEx Wallet"
                        days={selectedTimeline}
                        totalPnlPercent={data.totalPortfolioValue}
                        totalPnlDollar={data.totalUnrealized}
                        winRate={data.winRate}
                        trades={data.rawCount}
                        bestTrade={data.bestTrade?.pnl}
                        hideTotal={hideTotalPnL}
                    />
                </View>
            )}

            {bottomSheet === "export" && (
                <View style={styles.panelFull}>
                    <View style={styles.inlinePanel}>
                        <View style={styles.inlinePanelHeader}>
                            <Text style={styles.sheetTitle}>Export Custom Range</Text>
                            <TouchableOpacity
                                onPress={() => setBottomSheet(null)}
                                activeOpacity={0.7}
                                style={styles.panelClose}
                            >
                                <Icon name="close" size={20} color={theme.dim} type="ionicon" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.dateRow}>
                            <TouchableOpacity
                                style={styles.dateBox}
                                onPress={() => setShowFromPicker(true)}
                            >
                                <Text style={styles.dateBoxLabel}>From</Text>
                                <Text style={styles.dateBoxValue}>
                                    {fromDate?.toLocaleDateString()}
                                </Text>
                            </TouchableOpacity>
                            <Icon
                                name="arrow-forward-outline"
                                size={18}
                                color={theme.dim}
                                type="ionicon"
                            />
                            <TouchableOpacity
                                style={styles.dateBox}
                                onPress={() => setShowToPicker(true)}
                            >
                                <Text style={styles.dateBoxLabel}>To</Text>
                                <Text style={styles.dateBoxValue}>
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
                                onChange={(_, d) => {
                                    setShowFromPicker(Platform.OS === "ios");
                                    if (d) setFromDate(d);
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
                                onChange={(_, d) => {
                                    setShowToPicker(Platform.OS === "ios");
                                    if (d) setToDate(d);
                                }}
                            />
                        )}
                        <TouchableOpacity
                            style={styles.sheetBtn}
                            onPress={handleDownload}
                            disabled={isDownloading}
                        >
                            {isDownloading ? (
                                <ActivityIndicator color={theme.text} />
                            ) : (
                                <Text style={styles.sheetBtnText}>Generate Statement</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {bottomSheet === "share" && (
                <View style={styles.panelFull}>
                    <View style={styles.inlinePanel}>
                        <View style={styles.inlinePanelHeader}>
                            <Text style={styles.sheetTitle}>Share P&L Card</Text>
                            <TouchableOpacity
                                onPress={() => setBottomSheet(null)}
                                activeOpacity={0.7}
                                style={styles.panelClose}
                            >
                                <Icon name="close" size={20} color={theme.dim} type="ionicon" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.toggleRow}>
                            <Text style={styles.toggleLabel}>Hide total P&L amount</Text>
                            <TouchableOpacity
                                onPress={() => setHideTotalPnL((v) => !v)}
                                style={[
                                    styles.toggle,
                                    { backgroundColor: hideTotalPnL ? theme.mint : theme.border },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.toggleKnob,
                                        { alignSelf: hideTotalPnL ? "flex-end" : "flex-start" },
                                    ]}
                                />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={styles.sheetBtn}
                            onPress={async () => {
                                try {
                                    if (pnlCardRef.current?.share)
                                        await pnlCardRef.current.share();
                                    else await Share.share({ message: "SwiftEx P&L" });
                                } catch (e) {
                                    console.log(e);
                                }
                                setBottomSheet(null);
                            }}
                        >
                            <Text style={styles.sheetBtnText}>Share</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
};

const createStyles = (theme) =>
    StyleSheet.create({
        container: { flex: 1 },
        sectionHeader: {
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
        },
        titleWrap: { flex: 1 },
        secTitle: {
            color: theme.text,
            fontSize: 17,
            fontWeight: "800",
            letterSpacing: -0.2,
        },
        freshnessTag: { color: theme.dim, fontSize: 11, marginTop: 3 },
        periodRow: {
            flexDirection: "row",
            gap: 4,
            justifyContent: "center",
            alignItems: "center",
        },
        periodBtn: {
            minWidth: 64,
            height: 35,
            paddingHorizontal: 8,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 0.8,
            borderColor: theme.border,
            backgroundColor: `${theme.card}70`,
        },
        periodBtnActive: {
            backgroundColor: theme.purple,
            borderColor: theme.purple,
        },
        periodText: { color: theme.dim, fontSize: 15, fontWeight: "700" },
        periodTextActive: { color: "#fff" },
        heroCard: {
            backgroundColor: theme.card,
            borderRadius: 16,
            padding: 13,
            marginBottom: 9,
            marginTop: 9,
            borderWidth: 0.8,
            borderColor: theme.border,
        },
        metricCardsRow: { flexDirection: "row", gap: 7 },
        metricCard: {
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            padding: 9,
            borderRadius: 10,
            backgroundColor: `${theme.bg}60`,
            borderWidth: 0.7,
            borderColor: `${theme.border}C0`,
            justifyContent: "center",
        },
        metricCardLarge: {
            flex: 1.25,
            borderColor: theme.purple,
            borderWidth: 1.1,
        },
        metricCardLabel: {
            color: theme.dim,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.4,
            marginBottom: 5,
        },
        metricCardValue: { color: theme.text, fontSize: 12.5, fontWeight: "900" },
        metricCardValueLarge: { fontSize: 24, letterSpacing: -0.5 },
        chartWrap: { marginTop: 1, alignItems: "flex-start" },
        previewText: {
            color: theme.purple,
            fontSize: 8,
            fontWeight: "900",
            letterSpacing: 0.5,
        },
        loadingWrap: { alignItems: "center", paddingVertical: 24, gap: 10 },
        loadingText: { color: theme.dim, fontSize: 12 },
        noChartWrap: { alignItems: "center", paddingVertical: 24, gap: 6 },
        noChartText: {
            color: theme.dim,
            fontSize: 13,
            fontWeight: "700",
            marginTop: 6,
        },
        noChartSub: { color: theme.dim, fontSize: 11, opacity: 0.7 },
        emptyState: { alignItems: "center", paddingVertical: 40, gap: 10 },
        emptyStateText: { color: theme.text, fontSize: 14, fontWeight: "700" },
        emptyStateSub: { color: theme.dim, fontSize: 12 },
        emptyListState: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 16,
            justifyContent: "center",
        },
        emptyListText: { color: theme.dim, fontSize: 12, fontWeight: "600" },
        analyticsRow: {
            minHeight: 60,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 11,
            paddingVertical: 9,
            marginBottom: 7,
            borderRadius: 12,
            backgroundColor: theme.card,
            borderWidth: 0.8,
            borderColor: theme.border,
        },
        analyticsRowExpanded: {
            marginBottom: 0,
            borderColor: theme.purple,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
        },
        analyticsIcon: {
            width: 32,
            height: 32,
            borderRadius: 9,
            marginRight: 10,
            alignItems: "center",
            justifyContent: "center",
        },
        analyticsCopy: { flex: 1 },
        analyticsTitle: {
            color: theme.text,
            fontSize: 14,
            fontWeight: "800",
            marginBottom: 3,
        },
        analyticsSummary: { color: theme.dim, fontSize: 10.5 },
        expandedCard: {
            backgroundColor: theme.card,
            borderWidth: 0.8,
            borderColor: theme.border,
            borderTopWidth: 0,
            borderRadius: 12,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            padding: 13,
            marginBottom: 7,
        },
        tradeTop: { flexDirection: "row", alignItems: "center" },
        ringWrap: { width: 116, alignItems: "center" },
        bestWorstColumn: { flex: 1, gap: 8 },
        bestWorstCard: {
            minHeight: 58,
            padding: 9,
            borderRadius: 10,
            justifyContent: "center",
            backgroundColor: `${theme.bg}65`,
            borderWidth: 0.8,
            borderColor: `${theme.border}A0`,
        },
        bwLabel: {
            color: theme.dim,
            fontSize: 9.5,
            fontWeight: "700",
            marginBottom: 4,
        },
        bwValue: { fontSize: 15, fontWeight: "900" },
        statsRow: {
            flexDirection: "row",
            marginTop: 12,
            paddingVertical: 11,
            borderTopWidth: 0.8,
            borderBottomWidth: 0.8,
            borderColor: `${theme.border}55`,
        },
        statCell: { flex: 1, minWidth: 0, alignItems: "center" },
        statValue: {
            color: theme.text,
            fontSize: 16,
            fontWeight: "900",
            marginBottom: 3,
        },
        statLabel: {
            color: theme.dim,
            fontSize: 8.5,
            textAlign: "center",
            lineHeight: 11,
        },
        detailButton: {
            height: 42,
            marginTop: 11,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 0.8,
            borderColor: theme.border,
            backgroundColor: `${theme.bg}50`,
            alignItems: "center",
            justifyContent: "space-between",
            flexDirection: "row",
        },
        detailButtonText: { color: theme.text, fontSize: 11, fontWeight: "800" },
        detailHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: hp(0.8),
            paddingHorizontal: 4,
            marginBottom: 14,
        },
        backButton: {
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: `${theme.bg}70`,
            alignItems: "center",
            justifyContent: "center",
        },
        detailTitle: { color: theme.text, fontSize: 16, fontWeight: "800" },
        detailScroll: { paddingBottom: 30, paddingHorizontal: 2 },
        detailHeroRow: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
        },
        detailRing: { width: 114, alignItems: "center" },
        detailBestWorst: { flex: 1, gap: 8 },
        detailSectionLabel: {
            color: theme.dim,
            fontSize: 9,
            fontWeight: "900",
            letterSpacing: 0.6,
            marginBottom: 9,
        },
        detailListCard: {
            marginTop: 11,
            padding: 12,
            borderRadius: 11,
            backgroundColor: `${theme.bg}55`,
            borderWidth: 0.8,
            borderColor: `${theme.border}B0`,
        },
        rowBetween: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        detailLine: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
            borderBottomWidth: 0.5,
            borderBottomColor: `${theme.border}50`,
        },
        detailLineLabel: { color: theme.dim, fontSize: 10.5 },
        detailLineValue: {
            color: theme.text,
            fontSize: 11,
            fontWeight: "800",
            textAlign: "right",
            maxWidth: "60%",
        },
        tableHeader: {
            flexDirection: "row",
            paddingBottom: 7,
            borderBottomWidth: 0.5,
            borderBottomColor: `${theme.border}60`,
        },
        tableHeaderCell: {
            flex: 1,
            textAlign: "right",
            color: theme.dim,
            fontSize: 8.5,
            fontWeight: "800",
        },
        tableRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 9,
            borderBottomWidth: 0.5,
            borderBottomColor: `${theme.border}40`,
        },
        tableCell: { flex: 1, color: theme.dim, fontSize: 10, textAlign: "right" },
        tradeHistoryRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 9,
            borderBottomWidth: 0.5,
            borderBottomColor: `${theme.border}40`,
        },
        sideBadge: {
            minWidth: 42,
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 6,
            alignItems: "center",
        },
        sideBadgeText: { fontSize: 8, fontWeight: "900" },
        warnBox: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 10,
            marginBottom: 10,
            borderRadius: 11,
            backgroundColor: `${theme.warn}18`,
        },
        warnTitle: { fontSize: 11, fontWeight: "900", marginBottom: 2 },
        warnSub: { color: theme.dim, fontSize: 9.5 },
        positionCard: {
            marginTop: 10,
            padding: 11,
            borderRadius: 10,
            backgroundColor: `${theme.bg}55`,
        },
        positionRow: { flexDirection: "row", gap: 8 },
        positionAsset: { color: theme.text, fontSize: 15, fontWeight: "900" },
        positionValue: { color: theme.text, fontSize: 12, fontWeight: "900" },
        positionMeta: { color: theme.dim, fontSize: 8, marginTop: 2 },
        infoExplain: { color: theme.dim, fontSize: 11, lineHeight: 17 },
        infoModalBody: {
            alignItems: "center",
            paddingHorizontal: 12,
            paddingTop: 10,
        },
        infoIcon: {
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: `${theme.purple}18`,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
        },
        infoTitle: {
            color: theme.text,
            fontSize: 20,
            fontWeight: "900",
            marginBottom: 14,
        },
        infoText: {
            color: theme.dim,
            fontSize: 12,
            lineHeight: 18,
            textAlign: "center",
            marginBottom: 12,
        },
        bullet: {
            alignSelf: "stretch",
            color: theme.text,
            fontSize: 11,
            lineHeight: 18,
        },
        secondaryAction: {
            flex: 1,
            height: 39,
            borderRadius: 11,
            borderWidth: 0.8,
            borderColor: theme.border,
            backgroundColor: theme.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
        },
        secondaryActionText: {
            color: theme.purple,
            fontSize: 14,
            fontWeight: "800",
        },
        hiddenCard: { position: "absolute", top: -9999, left: -9999 },
        panelFull: { flex: 1, width: "100%", justifyContent: "flex-start" },
        inlinePanel: {
            backgroundColor: theme.card,
            borderRadius: 16,
            padding: 18,
            marginBottom: 12,
            borderWidth: 0.8,
            borderColor: theme.border,
        },
        inlinePanelHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
        },
        panelClose: {
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: theme.bg,
            alignItems: "center",
            justifyContent: "center",
        },
        sheetTitle: {
            color: theme.text,
            fontSize: 17,
            fontWeight: "800",
            textAlign: "center",
            marginBottom: 20,
        },
        dateRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
        },
        dateBox: {
            flex: 1,
            padding: 12,
            borderRadius: 12,
            backgroundColor: `${theme.bg}55`,
            borderWidth: 0.8,
            borderColor: theme.border,
        },
        dateBoxLabel: { color: theme.dim, fontSize: 10, marginBottom: 4 },
        dateBoxValue: { color: theme.text, fontSize: 13, fontWeight: "700" },
        toggleRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
        },
        toggleLabel: { flex: 1, color: theme.dim, fontSize: 14 },
        toggle: {
            width: 44,
            height: 26,
            padding: 2,
            borderRadius: 13,
            justifyContent: "center",
        },
        toggleKnob: {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.text,
        },
        sheetBtn: {
            minHeight: 46,
            marginTop: 12,
            borderRadius: 12,
            backgroundColor: theme.purple,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 18,
        },
        sheetBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
    });

export default React.memo(PnlOverView);