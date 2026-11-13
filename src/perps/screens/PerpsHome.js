import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSelector } from "react-redux";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from "../../icon";
import { colors } from "../../Screens/ThemeColorsConfig";
import { useAsterMarkets } from "../hooks/useAsterMarkets";
import { formatPrice, formatPercent, formatCompactUsd } from "../utils/format";
import { usePerpsAgent } from "../hooks/usePerpsAgent";
import TradingCard from "../components/TradingCard";
import CoinLogo from "../components/CoinLogo";
import { useAssetLogos } from "../hooks/useAssetLogos";
import { useAppActive } from "../hooks/useAppActive";
import PositionsSection from "../components/PositionsSection";
import { DepositSheet, WithdrawSheet } from "../components/FundsSheets";
import PerpsHistory from "../components/PerpsHistory";
import { usePerpsAccount } from "../hooks/usePerpsAccount";
import { useDepositTracker, onPerpsBalance, clearDeposit } from "../storage/depositTracker";
import { cancelOrder, placeOrder } from "../api/asterTrade";
import { buildCloseOrder } from "../utils/orderMath";
import { friendlyAsterError } from "../utils/asterErrors";
import CustomInfoProvider from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";


const MarketRow = React.memo(({ item, theme, onPress }) => {
  const change = Number(item.priceChangePercent);
  const up = !(change < 0);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${item.symbol} perp`}
      style={[styles.row, { backgroundColor: theme.cardBg }]}
      onPress={() => onPress(item)}
    >
      <CoinLogo asset={item.baseAsset} size={40} theme={theme} />
      <View style={styles.nameCol}>
        <View style={styles.nameLine}>
          <Text numberOfLines={1} style={[styles.symbol, { color: theme.headingTx }]}>
            {item.baseAsset}
          </Text>
          <View style={[styles.tag, { borderColor: theme.inactiveTx }]}>
            <Text style={[styles.tagTxt, { color: theme.inactiveTx }]}>Perp</Text>
          </View>
          {item.maxLeverage ? (
            <Text style={[styles.lev, { color: theme.buttonColor }]}>{item.maxLeverage}x</Text>
          ) : null}
        </View>
        <Text style={[styles.vol, { color: theme.inactiveTx }]}>
          Vol {formatCompactUsd(item.quoteVolume)}
        </Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={[styles.price, { color: theme.headingTx }]}>
          ${formatPrice(item.lastPrice, item.tickSize)}
        </Text>
        <Text style={[styles.change, { color: up ? theme.success : theme.fail }]}>
          {formatPercent(change)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const PerpsHome = () => {
  const navigation = useNavigation();
  const appActive = useAppActive();
  const isFocused = useIsFocused() && appActive; // live only on screen AND in the foreground
  const isDark = useSelector((state) => state.THEME.THEME) !== false;
  const theme = isDark ? colors.dark : colors.light;
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { markets, loading, refreshing, updating, error, retry, refresh } = useAsterMarkets(isFocused);
  useAssetLogos(); // start loading coin logos as soon as the tab mounts
  const agentState = usePerpsAgent(isFocused);
  const { leverage } = agentState;
  const tradingEnabled = agentState.status === "enabled";
  const accountState = usePerpsAccount({
    agent: agentState.agent,
    user: agentState.user,
    active: isFocused && tradingEnabled,
    onAgentInvalid: agentState.reset,
  });
  const [sheet, setSheet] = useState(null); // 'deposit' | 'withdraw' | null
  const [historyOpen, setHistoryOpen] = useState(false);
  const deposit = useDepositTracker();
  const depositPending = deposit.active;
  const perpsBalance = accountState.account ? accountState.account.walletBalance : null;
  // "Credited in Perps": feed each balance from the shared account poller into the tracker.
  useEffect(() => {
    if (deposit.active) onPerpsBalance(agentState.user, perpsBalance);
  }, [deposit.active, agentState.user, perpsBalance]);
  // Credited while the sheet was closed: say so once and clear the record.
  const depositCredited = !!deposit.record && !!deposit.record.creditedAt;
  useEffect(() => {
    if (depositCredited && sheet !== "deposit") {
      CustomInfoProvider.show("success", "Deposit credited", `${deposit.record.amount} USDT is now in your Perps balance.`);
      clearDeposit();
    }
  }, [depositCredited, sheet]);

  const runAction = async (title, fn) => {
    const res = await fn();
    if (res && res.agentInvalid) agentState.reset();
    if (res && res.error) CustomInfoProvider.show("error", title, friendlyAsterError(res));
    else CustomInfoProvider.show("success", title, "Done.");
    accountState.refresh();
  };

  const onClosePosition = (p) => {
    const order = buildCloseOrder({ symbol: p.symbol, positionAmt: p.positionAmt });
    if (!order) return;
    CustomInfoProvider.show(
      "info",
      "Close position?",
      `Market ${order.side === "SELL" ? "sell" : "buy"} ${order.quantity} to close your ${p.symbol} position.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          onPress: () => runAction("Close position", () => placeOrder(agentState.agent, agentState.user, order)),
        },
      ]
    );
  };

  const onCancelOrder = (o) => {
    CustomInfoProvider.show("info", "Cancel order?", `${o.symbol} ${o.type}`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel order",
        onPress: () =>
          runAction("Cancel order", () =>
            cancelOrder(agentState.agent, agentState.user, { symbol: o.symbol, orderId: o.orderId })
          ),
      },
    ]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = q
      ? markets.filter((m) => m.symbol.includes(q) || (m.baseAsset || "").toUpperCase().includes(q))
      : markets;
    if (!leverage || Object.keys(leverage).length === 0) return list;
    return list.map((m) => (leverage[m.symbol] ? { ...m, maxLeverage: leverage[m.symbol] } : m));
  }, [markets, query, leverage]);

  const onRefresh = useCallback(() => {
    refresh();
    agentState.refreshAccount();
    accountState.refresh();
  }, [refresh, agentState, accountState]);

  const confirmReset = () => {
    setMenuOpen(false);
    CustomInfoProvider.show(
      "info",
      "Reset trading key?",
      "This removes the trading key from this device. You can enable trading again at any time.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", onPress: () => agentState.reset() },
      ]
    );
  };

  const openMarket = useCallback(
    (item) => navigation.navigate("PerpsMarket", { symbol: item.symbol }),
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }) => <MarketRow item={item} theme={theme} onPress={openMarket} />,
    [theme, openMarket]
  );

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.headingTx }]}>Perps</Text>
        {agentState.status === "enabled" ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={() => setMenuOpen(!menuOpen)}
            style={styles.menuBtn}
          >
            <Icon name="ellipsis-horizontal" type="ionicon" size={24} color={theme.headingTx} />
          </TouchableOpacity>
        ) : null}
      </View>
      {menuOpen && agentState.status === "enabled" ? (
        <View style={[styles.menu, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}>
          <TouchableOpacity accessibilityRole="button" onPress={confirmReset} style={styles.menuItem}>
            <Icon name="key-outline" type="ionicon" size={18} color={theme.fail} />
            <Text style={[styles.menuTxt, { color: theme.fail }]}>Reset trading key</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <TradingCard
        theme={theme}
        agentState={agentState}
        funds={
          tradingEnabled
            ? {
                account: accountState.account,
                noDeposit: accountState.noDeposit,
                error: accountState.error,
                depositPending,
                onDeposit: () => setSheet("deposit"),
                onWithdraw: () => setSheet("withdraw"),
              }
            : null
        }
      />
      {tradingEnabled && depositPending ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Deposit in progress, show status"
          onPress={() => setSheet("deposit")}
          style={[styles.pill, { backgroundColor: theme.cardBg, borderColor: theme.inactiveTx }]}
        >
          <ActivityIndicator size="small" color={theme.buttonColor} />
          <Text style={[styles.pillTxt, { color: theme.headingTx }]}>
            Deposit in progress · {deposit.record.amount} USDT ·{" "}
            {deposit.record.confirmedAt
              ? "waiting for credit"
              : deposit.record.sentAt
              ? "confirming"
              : deposit.record.needsApprove && !deposit.record.approvedAt
              ? "approving"
              : "sending"}
          </Text>
          <Icon name="chevron-forward" type="ionicon" size={16} color={theme.inactiveTx} />
        </TouchableOpacity>
      ) : null}
      {tradingEnabled ? (
        <PositionsSection
          theme={theme}
          positions={accountState.positions}
          openOrders={accountState.openOrders}
          marks={accountState.marks}
          onClosePosition={onClosePosition}
          onCancelOrder={onCancelOrder}
        />
      ) : null}
      {tradingEnabled ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="History"
          onPress={() => setHistoryOpen(true)}
          style={[styles.historyRow, { backgroundColor: theme.cardBg }]}
        >
          <Icon name="time-outline" type="ionicon" size={20} color={theme.headingTx} />
          <Text style={[styles.historyTxt, { color: theme.headingTx }]}>History</Text>
          <Text style={[styles.historySub, { color: theme.inactiveTx }]}>Trades · Funding · Transfers</Text>
          <Icon name="chevron-forward" type="ionicon" size={18} color={theme.inactiveTx} />
        </TouchableOpacity>
      ) : null}
      <View style={[styles.search, { backgroundColor: theme.cardBg }]}>
        <Icon name="search" type="ionicon" size={20} color={theme.inactiveTx} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search markets"
          placeholderTextColor={theme.inactiveTx}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.searchInput, { color: theme.headingTx }]}
        />
        {query ? (
          <Icon
            name="close-circle"
            type="ionicon"
            size={20}
            color={theme.inactiveTx}
            onPress={() => setQuery("")}
          />
        ) : null}
      </View>
      {updating && !error && markets.length > 0 ? (
        <Text style={[styles.updating, { color: theme.inactiveTx }]}>Updating…</Text>
      ) : null}
    </View>
  );

  const empty = loading ? (
    <View style={styles.state}>
      <ActivityIndicator color={theme.buttonColor} size="large" />
      <Text style={[styles.stateTxt, { color: theme.inactiveTx }]}>Loading markets…</Text>
    </View>
  ) : error ? (
    <View style={styles.state}>
      <Icon name="cloud-offline-outline" type="ionicon" size={40} color={theme.inactiveTx} />
      <Text style={[styles.stateTxt, { color: theme.headingTx }]}>Couldn't load markets</Text>
      <Text style={[styles.stateSub, { color: theme.inactiveTx }]}>{error}</Text>
      <TouchableOpacity
        style={[styles.retryBtn, { backgroundColor: theme.buttonColor }]}
        onPress={retry}
      >
        <Text style={styles.retryTxt}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.state}>
      <Text style={[styles.stateTxt, { color: theme.inactiveTx }]}>
        {query ? "No markets match your search" : "No markets available"}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bg, paddingTop: Platform.OS === "ios" ? hp(6) : hp(2) },
      ]}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      {error && markets.length > 0 ? (
        <TouchableOpacity onPress={retry} style={[styles.banner, { backgroundColor: theme.cardBg }]}>
          <Text style={{ color: theme.warn }}>Live data may be out of date. Tap to retry.</Text>
        </TouchableOpacity>
      ) : null}
      <FlatList
        data={loading || (error && markets.length === 0) ? [] : filtered}
        keyExtractor={(item) => item.symbol}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={11}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#4CA6EA" onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: hp(12) }}
      />
      {tradingEnabled ? (
        <>
          <DepositSheet
            visible={sheet === "deposit"}
            onClose={() => setSheet(null)}
            theme={theme}
            user={agentState.user}
            perpsBalance={perpsBalance}
          />
          {historyOpen ? (
            <PerpsHistory
              visible={historyOpen}
              onClose={() => setHistoryOpen(false)}
              theme={theme}
              isDark={isDark}
              agent={agentState.agent}
              user={agentState.user}
            />
          ) : null}
          <WithdrawSheet
            visible={sheet === "withdraw"}
            onClose={() => setSheet(null)}
            theme={theme}
            agent={agentState.agent}
            user={agentState.user}
            available={accountState.account ? accountState.account.available : null}
            onWithdrawn={accountState.refresh}
          />
        </>
      ) : null}
    </View>
  );
};

export default PerpsHome;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: 19,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 12,
  },
  menuBtn: {
    padding: 6,
  },
  menu: {
    position: "absolute",
    right: 14,
    top: 40,
    zIndex: 10,
    elevation: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuTxt: {
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  nameCol: {
    flex: 1,
    marginLeft: 12,
  },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  symbol: {
    fontSize: 16,
    fontWeight: "700",
    maxWidth: wp(30),
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
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
  },
  vol: {
    fontSize: 12,
    marginTop: 3,
  },
  priceCol: {
    alignItems: "flex-end",
  },
  price: {
    fontSize: 15,
    fontWeight: "600",
  },
  change: {
    fontSize: 13,
    marginTop: 3,
    fontWeight: "600",
  },
  state: {
    alignItems: "center",
    paddingVertical: hp(6),
    paddingHorizontal: 24,
  },
  stateTxt: {
    fontSize: 16,
    marginTop: 10,
    textAlign: "center",
  },
  stateSub: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
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
  updating: {
    fontSize: 12,
    textAlign: "center",
    marginTop: -2,
    marginBottom: 6,
  },
  banner: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  historyTxt: {
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 10,
  },
  historySub: {
    flex: 1,
    fontSize: 12,
    marginLeft: 8,
  },
  pillTxt: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
  },
});
