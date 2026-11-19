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
import { closedText, fmtHolding, isDust } from "../utils/swapForm";
import { fmtUsd, fmtPct } from "../utils/amounts";
import { useRwaHoldings } from "../hooks/useRwaHoldings";
import { hasAttested, saveAttestation } from "../storage/attestation";
import AttestationSheet from "../components/AttestationSheet";
import { useOrderTracker } from "../orders/useOrderTracker";
import { isFinal } from "../orders/orderState";
import { useRwaTheme, RwaLogo, RwaHeader } from "../components/ui";

// Row: logo · ticker · name · price · 24h %. Market text only when trading is not open.
const AssetRow = React.memo(({ group, theme, price, closed, onPress }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${group.symbol} ${group.name}`} onPress={() => onPress(group)} style={styles.row}>
    <RwaLogo asset={group} size={38} theme={theme} />
    <View style={styles.rowMid}>
      <Text style={[styles.sym, { color: theme.headingTx }]} numberOfLines={1}>{group.symbol}</Text>
      <Text style={[styles.name, { color: theme.inactiveTx }]} numberOfLines={1}>{group.name}</Text>
    </View>
    <View style={styles.rowRight}>
      <Text style={[styles.price, { color: theme.headingTx }]}>{price && price.price != null ? fmtUsd(price.price) : "—"}</Text>
      {closed ? (
        <Text style={[styles.closed, { color: theme.inactiveTx }]} numberOfLines={1}>{closed}</Text>
      ) : price && price.change24h != null ? (
        <Text style={[styles.chg, { color: price.change24h >= 0 ? theme.success : theme.fail }]}>{fmtPct(price.change24h)}</Text>
      ) : null}
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
  // Closed text per market-hours kind (null = open). xStocks use the API status per symbol.
  const closedByHours = useMemo(() => {
    const out = {};
    ["ondo-24-5", "24-7"].forEach((k) => {
      out[k] = closedText(assetMarketStatus({ marketHours: k }, now), now, true);
    });
    return out;
  }, [now]);

  // Region-filtered assets -> one group per issuer+symbol -> sections.
  const groups = useMemo(() => buildGroups(assets), [assets]);
  const parts = useMemo(() => partitionGroups(groups), [groups]);
  const rows = useMemo(() => listRows(parts, { chip, query }), [parts, chip, query]);

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
  // Only orders still in progress are shown here (finished ones show in the trade's success sheet).
  const openOrders = useMemo(() => orders.filter((o) => !isFinal(o.stage) && (!o.expiresAt || Date.now() <= o.expiresAt)).slice(0, 2), [orders]);
  const filledCount = orders.filter((o) => o.stage === "filled").length;
  const { holdings, loading: holdLoading } = useRwaHoldings(assets, evm, stellar, focused && attest === true, filledCount);
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

  // Hide leftovers worth under a cent (e.g. rounding dust after selling everything).
  const shownHeld = held.filter((h) => {
    const p = getCachedPrice(llamaKey(h.group.primary));
    return !isDust(h.total, p && p.price);
  });

  const open = useCallback((g) => navigation.navigate("RwaAsset", { key: g.key }), [navigation]);
  const closedOf = (g) => {
    if (g.issuer === "xstocks") return closedText(getCachedXStatus(g.symbol), now, false);
    return g.marketHours in closedByHours ? closedByHours[g.marketHours] : closedByHours["24-7"];
  };

  const renderItem = ({ item }) =>
    item.type === "header" ? (
      <Text style={[styles.section, { color: theme.headingTx }]}>{item.title}</Text>
    ) : (
      <AssetRow group={item.group} theme={theme} price={getCachedPrice(llamaKey(item.group.primary))} closed={closedOf(item.group)} onPress={open} />
    );

  const header = (
    <View>
      {!holdLoading && shownHeld.length > 0 ? (
        <View style={styles.block}>
          <Text style={[styles.secTitle, { color: theme.headingTx }]}>Your holdings</Text>
          {shownHeld.map(({ group: g, total }) => {
            const p = getCachedPrice(llamaKey(g.primary));
            const value = p && p.price != null ? total * p.price : null;
            return (
              <TouchableOpacity key={g.key} onPress={() => open(g)} style={styles.holdRow} accessibilityRole="button">
                <RwaLogo asset={g} size={32} theme={theme} />
                <View style={styles.rowMid}>
                  <Text style={[styles.sym, { color: theme.headingTx }]}>{g.symbol}</Text>
                  <Text style={[styles.name, { color: theme.inactiveTx }]}>{fmtHolding(total, 6)}</Text>
                </View>
                <Text style={[styles.holdVal, { color: theme.headingTx }]}>{value != null ? fmtUsd(value) : "—"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {openOrders.map((o) => (
        <TouchableOpacity
          key={o.id}
          accessibilityRole="button"
          onPress={o.groupKey ? () => navigation.navigate("RwaTrade", { key: o.groupKey, side: o.side, orderId: o.id }) : undefined}
          style={[styles.pending, { backgroundColor: theme.cardBg }]}
        >
          <ActivityIndicator size="small" color={theme.buttonColor} />
          <Text style={[styles.pendingTxt, { color: theme.headingTx }]} numberOfLines={1}>
            {o.side === "buy" ? "Buying" : "Selling"} {o.symbol}…
          </Text>
          <Text style={[styles.pendingSub, { color: theme.inactiveTx }]}>Usually under a minute</Text>
        </TouchableOpacity>
      ))}
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
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title="Stocks & gold" theme={theme} onBack={() => navigation.goBack()} />
      {attest === true ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          extraData={[tick, closedByHours]}
          ListHeaderComponent={header}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10, minimumViewTime: 150 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={<Text style={[styles.emptyList, { color: theme.inactiveTx }]}>No matches.</Text>}
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
  block: { marginHorizontal: 16, marginBottom: 12 },
  secTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  section: { fontSize: 15, fontWeight: "800", marginHorizontal: 16, marginTop: 10, marginBottom: 4 },
  emptyList: { textAlign: "center", marginTop: 30, fontSize: 13 },
  holdRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  holdVal: { fontSize: 15, fontWeight: "700", textAlign: "right" },
  pending: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pendingTxt: { flex: 1, fontSize: 14, fontWeight: "700", marginLeft: 10 },
  pendingSub: { fontSize: 12 },
  search: { marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 12, height: 44, justifyContent: "center" },
  searchInput: { fontSize: 15, paddingVertical: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, margin: 4 },
  chipTxt: { fontSize: 13, fontWeight: "600" },
  row: { height: 64, marginHorizontal: 16, flexDirection: "row", alignItems: "center" },
  rowMid: { flex: 1, marginLeft: 12, marginRight: 8 },
  sym: { fontSize: 15, fontWeight: "700" },
  name: { fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: "flex-end", maxWidth: "42%" },
  price: { fontSize: 15, fontWeight: "700" },
  chg: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  closed: { fontSize: 11, marginTop: 3 },
});
