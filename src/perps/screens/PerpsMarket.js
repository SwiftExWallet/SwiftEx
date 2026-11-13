import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSelector } from "react-redux";
import { useIsFocused } from "@react-navigation/native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from "../../icon";
import { colors } from "../../Screens/ThemeColorsConfig";
import { usePerpsAvailability } from "../usePerpsAvailability";
import { useAsterKlines } from "../hooks/useAsterKlines";
import { useAsterSymbolStats } from "../hooks/useAsterSymbolStats";
import { getCachedMarketMeta } from "../api/asterPublic";
import { getCachedMaxLeverage } from "../api/asterSigned";
import PriceChart from "../components/PriceChart";
import OrderPanel from "../components/OrderPanel";
import CoinLogo from "../components/CoinLogo";
import { usePerpsAgent } from "../hooks/usePerpsAgent";
import { usePerpsAccount } from "../hooks/usePerpsAccount";
import { DEFAULT_MAX_LEVERAGE } from "../utils/orderMath";
import {
  formatPrice,
  formatPercent,
  formatCompactUsd,
  formatFundingRate,
  formatCountdown,
} from "../utils/format";

const INTERVALS = [
  { key: "15m", label: "15m" },
  { key: "1h", label: "1H" },
  { key: "4h", label: "4H" },
  { key: "1d", label: "1D" },
];

const CHART_HEIGHT = 240;

const Stat = ({ label, value, theme }) => (
  <View style={styles.stat}>
    <Text style={[styles.statLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.statValue, { color: theme.headingTx }]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const useNow = (active) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
};

const PerpsMarket = ({ navigation, route }) => {
  const symbol = route?.params?.symbol;
  const isFocused = useIsFocused();
  const isDark = useSelector((state) => state.THEME.THEME) !== false;
  const theme = isDark ? colors.dark : colors.light;
  const { perpsVisible, checked } = usePerpsAvailability(isFocused);
  const allowed = checked && perpsVisible;
  const [interval, setIntervalKey] = useState("1h");
  const meta = (getCachedMarketMeta() || {})[symbol] || {};
  const tickSize = meta.tickSize;
  const baseAsset = meta.baseAsset || (symbol || "").replace(/USDT$|USDC$|USD$/, "");
  const maxLeverage = getCachedMaxLeverage(symbol);

  const live = isFocused && allowed;
  const { candles, loading, error, retry } = useAsterKlines(allowed ? symbol : null, interval, live);
  const { ticker, premium, retry: retryStats } = useAsterSymbolStats(allowed ? symbol : null, live);
  const now = useNow(live);
  const agentState = usePerpsAgent(live);
  const tradingEnabled = agentState.status === "enabled";
  const accountState = usePerpsAccount({
    agent: agentState.agent,
    user: agentState.user,
    active: live && tradingEnabled,
    onAgentInvalid: agentState.reset,
  });
  const accountForPanel = accountState.account
    ? { ...accountState.account, noDeposit: accountState.noDeposit }
    : null;

  const goBack = () => navigation.goBack();
  const containerStyle = [
    styles.container,
    { backgroundColor: theme.bg, paddingTop: Platform.OS === "ios" ? hp(6) : hp(2) },
  ];

  if (!checked) {
    return (
      <View style={[containerStyle, styles.center]}>
        <ActivityIndicator color={theme.buttonColor} />
      </View>
    );
  }

  if (!allowed) {
    // Region hidden / switch off: screen is unreachable from the UI, but guard deep navigation.
    return (
      <View style={[containerStyle, styles.center]}>
        <Text style={[styles.blockedTxt, { color: theme.headingTx }]}>
          Perps is not available in your region.
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: theme.buttonColor }]}
          onPress={goBack}
        >
          <Text style={styles.retryTxt}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const lastPrice =
    ticker?.lastPrice ?? (candles.length ? candles[candles.length - 1].c : undefined);
  const change = Number(ticker?.priceChangePercent);
  const up = !(change < 0);
  const changeColor = Number.isFinite(change) ? (up ? theme.success : theme.fail) : theme.inactiveTx;
  const chartColor =
    candles.length > 1 && candles[candles.length - 1].c < candles[0].c ? theme.fail : theme.success;
  const chartWidth = wp(100) - 24;
  const countdown = premium?.nextFundingTime ? formatCountdown(premium.nextFundingTime - now) : "—";

  return (
    <View style={containerStyle}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goBack}
          style={styles.backBtn}
        >
          <Icon name="arrow-back" type="ionicon" size={26} color={theme.headingTx} />
        </TouchableOpacity>
        <CoinLogo asset={baseAsset} size={36} theme={theme} style={styles.headerLogo} />
        <View style={{ flex: 1 }}>
          <View style={styles.titleLine}>
            <Text style={[styles.title, { color: theme.headingTx }]}>{baseAsset}</Text>
            <View style={[styles.tag, { borderColor: theme.inactiveTx }]}>
              <Text style={[styles.tagTxt, { color: theme.inactiveTx }]}>Perp</Text>
            </View>
            {maxLeverage ? (
              <Text style={[styles.lev, { color: theme.buttonColor }]}>Up to {maxLeverage}x</Text>
            ) : null}
          </View>
          <Text style={[styles.subTitle, { color: theme.inactiveTx }]}>{symbol}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: hp(16) }}>
        <View style={styles.priceBlock}>
          <Text style={[styles.price, { color: theme.headingTx }]}>
            {lastPrice !== undefined ? `$${formatPrice(lastPrice, tickSize)}` : "—"}
          </Text>
          <Text style={[styles.change, { color: changeColor }]}>
            {Number.isFinite(change) ? `${formatPercent(change)} (24h)` : ""}
          </Text>
        </View>

        <View style={styles.chartBox}>
          {loading && candles.length === 0 ? (
            <View style={[styles.chartState, { height: CHART_HEIGHT }]}>
              <ActivityIndicator color={theme.buttonColor} />
            </View>
          ) : error && candles.length === 0 ? (
            <View style={[styles.chartState, { height: CHART_HEIGHT }]}>
              <Text style={[styles.stateTxt, { color: theme.inactiveTx }]}>{error}</Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: theme.buttonColor }]}
                onPress={() => {
                  retry();
                  retryStats();
                }}
              >
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <PriceChart
              candles={candles}
              width={chartWidth}
              height={CHART_HEIGHT}
              color={chartColor}
              theme={theme}
              tickSize={tickSize}
            />
          )}
        </View>

        <View style={[styles.intervals, { backgroundColor: theme.cardBg }]}>
          {INTERVALS.map((it) => {
            const selected = it.key === interval;
            return (
              <TouchableOpacity
                key={it.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setIntervalKey(it.key)}
                style={[styles.intervalBtn, selected && { backgroundColor: theme.buttonColor }]}
              >
                <Text
                  style={[
                    styles.intervalTxt,
                    { color: selected ? "#FFFFFF" : theme.inactiveTx },
                  ]}
                >
                  {it.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.statsCard, { backgroundColor: theme.cardBg }]}>
          <View style={styles.statsRow}>
            <Stat label="24h High" value={ticker ? `$${formatPrice(ticker.highPrice, tickSize)}` : "—"} theme={theme} />
            <Stat label="24h Low" value={ticker ? `$${formatPrice(ticker.lowPrice, tickSize)}` : "—"} theme={theme} />
            <Stat label="24h Volume" value={ticker ? formatCompactUsd(ticker.quoteVolume) : "—"} theme={theme} />
          </View>
          <View style={styles.statsRow}>
            <Stat label="Mark price" value={premium ? `$${formatPrice(premium.markPrice, tickSize)}` : "—"} theme={theme} />
            <Stat label="Funding" value={premium ? formatFundingRate(premium.fundingRate) : "—"} theme={theme} />
            <Stat label="Next funding" value={countdown} theme={theme} />
          </View>
        </View>

        {tradingEnabled ? (
          <OrderPanel
            theme={theme}
            symbol={symbol}
            baseAsset={baseAsset}
            meta={meta}
            markPrice={premium?.markPrice ?? lastPrice}
            maxLeverage={maxLeverage || DEFAULT_MAX_LEVERAGE}
            agentState={{ agent: agentState.agent, user: agentState.user, onInvalid: agentState.reset }}
            account={accountForPanel}
            onPlaced={accountState.refresh}
          />
        ) : (
          <View style={styles.lockedTrade}>
            <View style={styles.tradeBtns}>
              {[
                { label: "Long", color: theme.success },
                { label: "Short", color: theme.fail },
              ].map((b) => (
                <TouchableOpacity
                  key={b.label}
                  disabled
                  accessibilityState={{ disabled: true }}
                  style={[styles.tradeBtn, { backgroundColor: b.color }]}
                >
                  <Text style={styles.tradeTxt}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.soon, { color: theme.inactiveTx }]}>
              {agentState.status === "no-evm"
                ? "Perps needs an EVM wallet"
                : agentState.status === "locked"
                ? "Trading coming soon"
                : "Enable trading on the Perps tab first"}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default PerpsMarket;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  headerLogo: {
    marginRight: 10,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  subTitle: {
    fontSize: 12,
    marginTop: 1,
  },
  tag: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  tagTxt: {
    fontSize: 10,
    fontWeight: "600",
  },
  lev: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 8,
  },
  priceBlock: {
    paddingHorizontal: 19,
    marginTop: 6,
  },
  price: {
    fontSize: 32,
    fontWeight: "800",
  },
  change: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  chartBox: {
    marginTop: 16,
    marginHorizontal: 12,
  },
  chartState: {
    alignItems: "center",
    justifyContent: "center",
  },
  stateTxt: {
    fontSize: 14,
    textAlign: "center",
  },
  intervals: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 12,
    padding: 4,
  },
  intervalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  intervalTxt: {
    fontSize: 14,
    fontWeight: "600",
  },
  statsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: 8,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 3,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? hp(4) : hp(2),
  },
  tradeBtns: {
    flexDirection: "row",
  },
  tradeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 14,
    marginHorizontal: 4,
    opacity: 0.45,
  },
  tradeTxt: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  soon: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
  },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryTxt: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  blockedTxt: {
    fontSize: 16,
    textAlign: "center",
  },
});
