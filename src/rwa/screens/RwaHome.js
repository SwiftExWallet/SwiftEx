import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useSelector } from "react-redux";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useRwaAvailability } from "../useRwaAvailability";
import { llamaKey } from "../data/assets";
import { buildGroups, partitionGroups, listRows, CHIPS, CHIP_LABELS } from "../data/groups";
import { loadPrices, getCachedPrice } from "../api/prices";
import { loadXStatuses, getCachedXStatus } from "../api/xstocksStatus";
import { assetMarketStatus } from "../utils/marketHours";
import { fmtUsd, fmtPct, fmtAmount } from "../utils/amounts";
import { useRwaHoldings } from "../hooks/useRwaHoldings";
import { hasAttested, saveAttestation } from "../storage/attestation";
import AttestationSheet from "../components/AttestationSheet";
import OrderCard from "../components/OrderCard";
import { useOrderTracker } from "../orders/useOrderTracker";
import { isFinal } from "../orders/orderState";
import { useRwaTheme, RwaLogo, ChainsBadge, StatusBadge, RwaHeader, DevBanner } from "../components/ui";

const AssetRow = React.memo(({ group, theme, price, status, onPress }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${group.symbol} ${group.name}`} onPress={() => onPress(group)} style={[styles.row, { backgroundColor: theme.cardBg }]}>
    <RwaLogo asset={group} size={38} theme={theme} />
    <View style={styles.rowMid}>
      <View style={styles.rowLine}>
        <Text style={[styles.sym, { color: theme.headingTx }]} numberOfLines={1}>{group.symbol}</Text>
        <ChainsBadge chains={group.chains} theme={theme} />
      </View>
      <Text style={[styles.name, { color: theme.inactiveTx }]} numberOfLines={1}>{group.name}</Text>
    </View>
    <View style={styles.rowRight}>
      <Text style={[styles.price, { color: theme.headingTx }]}>{price && price.price != null ? fmtUsd(price.price) : "—"}</Text>
      {price && price.change24h != null ? (
        <Text style={[styles.chg, { color: price.change24h >= 0 ? theme.success : theme.fail }]}>{fmtPct(price.change24h)}</Text>
      ) : null}
      <StatusBadge status={status.status} label={status.label} theme={theme} />
    </View>
  </TouchableOpacity>
));

const RwaHome = () => {
  const navigation = useNavigation();
  const theme = useRwaTheme();
  const focused = useIsFocused();
  const state = useSelector((s) => s);
  const evm = state?.wallet?.address || null;
  const stellar = state?.STELLAR_PUBLICK_KEY || null;
  const { rwaVisible, checked, assets, country } = useRwaAvailability(focused);

  const [chip, setChip] = useState("all");
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [attest, setAttest] = useState(null); // null = unknown, false = must ask, true = ok

  useEffect(() => {
    if (checked && !rwaVisible) navigation.goBack();
  }, [checked, rwaVisible, navigation]);

  useEffect(() => {
    let alive = true;
    hasAttested(evm).then((ok) => alive && setAttest(ok));
    return () => {
      alive = false;
    };
  }, [evm]);

  useEffect(() => {
    if (!focused) return undefined;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [focused]);
  const statusByHours = useMemo(() => {
    const out = {};
    ["ondo-24-5", "xstocks", "24-7"].forEach((k) => {
      out[k] = assetMarketStatus({ marketHours: k }, now);
    });
    return out;
  }, [now]);

  // Region-filtered assets -> one group per issuer+symbol -> sections.
  const groups = useMemo(() => buildGroups(assets), [assets]);
  const parts = useMemo(() => partitionGroups(groups), [groups]);
  const rows = useMemo(() => listRows(parts, { chip, query }), [parts, chip, query]);
  const assetCount = useMemo(() => rows.filter((r) => r.type === "asset").length, [rows]);

  // Prices + xStocks status only for rows on screen (+ holdings), batched.
  const pending = useRef(new Set());
  const flushTimer = useRef(null);
  const requestPrices = useCallback((keys) => {
    keys.forEach((k) => k && pending.current.add(k));
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(async () => {
      flushTimer.current = null;
      const ks = Array.from(pending.current);
      pending.current.clear();
      await loadPrices(ks);
      setTick((t) => t + 1);
    }, 250);
  }, []);
  useEffect(() => () => flushTimer.current && clearTimeout(flushTimer.current), []);
  const onViewable = useRef(({ viewableItems }) => {
    const gs = viewableItems.filter((v) => v.item.type === "asset").map((v) => v.item.group);
    requestPrices(gs.map((g) => llamaKey(g.primary)));
    const xs = gs.filter((g) => g.issuer === "xstocks").map((g) => g.symbol);
    if (xs.length) loadXStatuses(xs).then(() => setTick((t) => t + 1));
  }).current;

  const { orders } = useOrderTracker(evm, focused && attest === true);
  const recentOrders = useMemo(
    () => orders.filter((o) => !isFinal(o.stage) || Date.now() - (o.doneAt || o.createdAt) < 24 * 3600 * 1000).slice(0, 3),
    [orders]
  );
  const filledCount = orders.filter((o) => o.stage === "filled").length;
  const { holdings, loading: holdLoading, error: holdError } = useRwaHoldings(assets, evm, stellar, focused && attest === true, filledCount);
  // Holdings per group (sum over chains, human units).
  const held = useMemo(() => {
    const out = [];
    groups.forEach((g) => {
      const perChain = g.chains.filter((c) => holdings[g.byChain[c].id]).map((c) => ({ chain: c, amount: holdings[g.byChain[c].id] }));
      if (perChain.length) out.push({ group: g, total: perChain.reduce((s, x) => s + Number(x.amount), 0), perChain });
    });
    return out;
  }, [groups, holdings]);
  useEffect(() => {
    if (held.length) requestPrices(held.map((h) => llamaKey(h.group.primary)));
  }, [held, requestPrices]);

  const open = useCallback((g) => navigation.navigate("RwaAsset", { key: g.key }), [navigation]);
  const statusOf = (g) => {
    if (g.issuer === "xstocks") return getCachedXStatus(g.symbol) || { status: "closed", label: "…", open: false };
    return statusByHours[g.marketHours] || statusByHours["24-7"];
  };

  const renderItem = ({ item }) =>
    item.type === "header" ? (
      <Text style={[styles.section, { color: theme.headingTx }]}>{item.title}</Text>
    ) : (
      <AssetRow group={item.group} theme={theme} price={getCachedPrice(llamaKey(item.group.primary))} status={statusOf(item.group)} onPress={open} />
    );

  const header = (
    <View>
      <DevBanner theme={theme} text={`Dev build · real orders · country ${country || "?"}`} />
      <View style={styles.block}>
        <Text style={[styles.secTitle, { color: theme.headingTx }]}>Your RWAs</Text>
        {holdLoading ? (
          <ActivityIndicator color={theme.buttonColor} style={styles.holdLoad} />
        ) : held.length === 0 ? (
          <Text style={[styles.empty, { color: theme.inactiveTx }]}>
            {holdError ? "Couldn't check your balances right now." : "You don't hold any tokenized assets yet."}
          </Text>
        ) : (
          held.map(({ group: g, total }) => {
            const p = getCachedPrice(llamaKey(g.primary));
            const value = p && p.price != null ? total * p.price : null;
            return (
              <TouchableOpacity key={g.key} onPress={() => open(g)} style={styles.holdRow} accessibilityRole="button">
                <RwaLogo asset={g} size={28} theme={theme} />
                <Text style={[styles.holdSym, { color: theme.headingTx }]}>{g.symbol}</Text>
                <ChainsBadge chains={g.chains.filter((c) => holdings[g.byChain[c].id])} theme={theme} />
                <Text style={[styles.holdAmt, { color: theme.inactiveTx }]}>{fmtAmount(String(total), 4)}</Text>
                <Text style={[styles.holdVal, { color: theme.headingTx }]}>{value != null ? fmtUsd(value) : "—"}</Text>
              </TouchableOpacity>
            );
          })
        )}
        {!holdLoading && held.length > 0 && holdError ? (
          <Text style={[styles.empty, { color: theme.warn }]}>Some balances couldn't be checked.</Text>
        ) : null}
      </View>
      {recentOrders.length ? (
        <View style={styles.ordersBlock}>
          <Text style={[styles.secTitle, styles.ordersTitle, { color: theme.headingTx }]}>Recent orders</Text>
          {recentOrders.map((o) => (
            <OrderCard key={o.id} record={o} theme={theme} onPress={o.groupKey ? () => navigation.navigate("RwaAsset", { key: o.groupKey }) : undefined} />
          ))}
        </View>
      ) : null}
      <View style={[styles.search, { backgroundColor: theme.cardBg }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search all stocks, ETFs, gold"
          placeholderTextColor={theme.inactiveTx}
          style={[styles.searchInput, { color: theme.headingTx }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.chips}>
        {CHIPS.map((c) => (
          <TouchableOpacity
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: chip === c }}
            onPress={() => setChip(c)}
            style={[styles.chip, { backgroundColor: chip === c ? theme.buttonColor : theme.cardBg }]}
          >
            <Text style={[styles.chipTxt, { color: chip === c ? "#FFFFFF" : theme.headingTx }]}>{CHIP_LABELS[c]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.count, { color: theme.inactiveTx }]}>
        {assetCount} assets{query ? " (searching all markets)" : ""}
      </Text>
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title="Stocks & RWA" theme={theme} onBack={() => navigation.goBack()} />
      {attest === true ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          extraData={[tick, statusByHours]}
          ListHeaderComponent={header}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10, minimumViewTime: 150 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={<Text style={[styles.empty, styles.emptyList, { color: theme.inactiveTx }]}>No assets match.</Text>}
        />
      ) : (
        <View style={styles.center}>{attest === null ? <ActivityIndicator color={theme.buttonColor} /> : null}</View>
      )}
      <AttestationSheet
        visible={attest === false && rwaVisible}
        theme={theme}
        onAccept={async () => {
          await saveAttestation(evm, country);
          setAttest(true);
        }}
        onDecline={() => navigation.goBack()}
      />
    </View>
  );
};

export default RwaHome;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listPad: { paddingBottom: 40 },
  block: { marginHorizontal: 12, marginBottom: 10 },
  ordersBlock: { marginBottom: 10 },
  ordersTitle: { marginHorizontal: 12 },
  secTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  section: { fontSize: 15, fontWeight: "800", marginHorizontal: 12, marginTop: 8, marginBottom: 8 },
  holdLoad: { alignSelf: "flex-start", marginVertical: 6 },
  empty: { fontSize: 13 },
  emptyList: { textAlign: "center", marginTop: 30 },
  holdRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  holdSym: { fontSize: 14, fontWeight: "700", marginLeft: 8 },
  holdAmt: { flex: 1, textAlign: "right", fontSize: 13, marginRight: 10 },
  holdVal: { fontSize: 14, fontWeight: "600", minWidth: 70, textAlign: "right" },
  search: { marginHorizontal: 12, borderRadius: 12, paddingHorizontal: 12, height: 44, justifyContent: "center" },
  searchInput: { fontSize: 15, paddingVertical: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, margin: 4 },
  chipTxt: { fontSize: 13, fontWeight: "600" },
  count: { fontSize: 12, marginHorizontal: 12, marginVertical: 6 },
  row: { height: 68, marginHorizontal: 12, marginBottom: 8, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
  rowMid: { flex: 1, marginLeft: 10, marginRight: 8 },
  rowLine: { flexDirection: "row", alignItems: "center" },
  sym: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  name: { fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  price: { fontSize: 14, fontWeight: "700" },
  chg: { fontSize: 11, fontWeight: "600" },
});
