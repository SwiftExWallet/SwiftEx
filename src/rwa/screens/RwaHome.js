import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useSelector } from "react-redux";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useRwaAvailability } from "../useRwaAvailability";
import { CATEGORY_LABELS, filterAssets, llamaKey } from "../data/assets";
import { loadPrices, getCachedPrice } from "../api/prices";
import { loadXStatuses, getCachedXStatus } from "../api/xstocksStatus";
import { assetMarketStatus } from "../utils/marketHours";
import { fmtUsd, fmtPct, fmtAmount } from "../utils/amounts";
import { useRwaHoldings } from "../hooks/useRwaHoldings";
import { hasAttested, saveAttestation } from "../storage/attestation";
import AttestationSheet from "../components/AttestationSheet";
import { useRwaTheme, RwaLogo, ChainBadge, StatusBadge, RwaHeader, DevBanner } from "../components/ui";

const CATS = ["all", "stock", "etf", "gold", "treasury"];
const ROW_H = 68;

const AssetRow = React.memo(({ asset, theme, price, status, onPress }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${asset.symbol} ${asset.name}`} onPress={() => onPress(asset)} style={[styles.row, { backgroundColor: theme.cardBg }]}>
    <RwaLogo asset={asset} size={38} theme={theme} />
    <View style={styles.rowMid}>
      <View style={styles.rowLine}>
        <Text style={[styles.sym, { color: theme.headingTx }]} numberOfLines={1}>{asset.symbol}</Text>
        <ChainBadge chain={asset.chain} theme={theme} />
      </View>
      <Text style={[styles.name, { color: theme.inactiveTx }]} numberOfLines={1}>{asset.name}</Text>
    </View>
    <View style={styles.rowRight}>
      <Text style={[styles.price, { color: theme.headingTx }]}>{price && price.price != null ? fmtUsd(price.price) : "—"}</Text>
      <View style={styles.rowLine}>
        {price && price.change24h != null ? (
          <Text style={[styles.chg, { color: price.change24h >= 0 ? theme.success : theme.fail }]}>{fmtPct(price.change24h)}</Text>
        ) : null}
      </View>
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

  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [priceTick, setPriceTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [attest, setAttest] = useState(null); // null = unknown, false = must ask, true = ok

  // Leave if RWA isn't available (flag off / country unknown or blocked).
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

  // Market badges: refresh every minute while open.
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

  const list = useMemo(() => filterAssets(assets, { category, query }), [assets, category, query]);

  // Prices only for rows on screen (+ holdings), batched.
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
      setPriceTick((t) => t + 1);
    }, 250);
  }, []);
  useEffect(() => () => flushTimer.current && clearTimeout(flushTimer.current), []);
  const onViewable = useRef(({ viewableItems }) => {
    requestPrices(viewableItems.map((v) => llamaKey(v.item)));
    const xs = viewableItems.filter((v) => v.item.issuer === "xstocks").map((v) => v.item.symbol);
    if (xs.length) loadXStatuses(xs).then(() => setPriceTick((t) => t + 1));
  }).current;

  const { holdings, loading: holdLoading, error: holdError } = useRwaHoldings(assets, evm, stellar, focused && attest === true);
  const held = useMemo(() => assets.filter((a) => holdings[a.id]), [assets, holdings]);
  useEffect(() => {
    if (held.length) requestPrices(held.map(llamaKey));
  }, [held, requestPrices]);

  const open = useCallback((a) => navigation.navigate("RwaAsset", { id: a.id }), [navigation]);
  // xStocks: the issuer's own status (non-US listings, halts); "…" until loaded. Others: local calendar.
  const rowStatus = (item) => {
    if (item.issuer === "xstocks") return getCachedXStatus(item.symbol) || { status: "closed", label: "…", open: false };
    return statusByHours[item.marketHours] || statusByHours["24-7"];
  };

  const renderItem = useCallback(
    ({ item }) => (
      <AssetRow asset={item} theme={theme} price={getCachedPrice(llamaKey(item))} status={rowStatus(item)} onPress={open} />
    ),
    // priceTick: re-render rows when prices arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, statusByHours, open, priceTick]
  );

  const header = (
    <View>
      <DevBanner theme={theme} text={`Dev preview · quotes only, buying is off · country ${country || "?"}`} />
      <View style={styles.section}>
        <Text style={[styles.secTitle, { color: theme.headingTx }]}>Your RWAs</Text>
        {holdLoading ? (
          <ActivityIndicator color={theme.buttonColor} style={styles.holdLoad} />
        ) : held.length === 0 ? (
          <Text style={[styles.empty, { color: theme.inactiveTx }]}>
            {holdError ? "Couldn't check your balances right now." : "You don't hold any tokenized assets yet."}
          </Text>
        ) : (
          held.map((a) => {
            const p = getCachedPrice(llamaKey(a));
            const value = p && p.price != null ? Number(holdings[a.id]) * p.price : null;
            return (
              <TouchableOpacity key={a.id} onPress={() => open(a)} style={styles.holdRow} accessibilityRole="button">
                <RwaLogo asset={a} size={28} theme={theme} />
                <Text style={[styles.holdSym, { color: theme.headingTx }]}>{a.symbol}</Text>
                <ChainBadge chain={a.chain} theme={theme} />
                <Text style={[styles.holdAmt, { color: theme.inactiveTx }]}>{fmtAmount(holdings[a.id], 4)}</Text>
                <Text style={[styles.holdVal, { color: theme.headingTx }]}>{value != null ? fmtUsd(value) : "—"}</Text>
              </TouchableOpacity>
            );
          })
        )}
        {!holdLoading && held.length > 0 && holdError ? (
          <Text style={[styles.empty, { color: theme.warn }]}>Some balances couldn't be checked.</Text>
        ) : null}
      </View>
      <View style={[styles.search, { backgroundColor: theme.cardBg }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search stocks, ETFs, gold"
          placeholderTextColor={theme.inactiveTx}
          style={[styles.searchInput, { color: theme.headingTx }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.chips}>
        {CATS.map((c) => (
          <TouchableOpacity
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: category === c }}
            onPress={() => setCategory(c)}
            style={[styles.chip, { backgroundColor: category === c ? theme.buttonColor : theme.cardBg }]}
          >
            <Text style={[styles.chipTxt, { color: category === c ? "#FFFFFF" : theme.headingTx }]}>{CATEGORY_LABELS[c]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.count, { color: theme.inactiveTx }]}>{list.length} assets</Text>
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title="Stocks & RWA" theme={theme} onBack={() => navigation.goBack()} />
      {attest === true ? (
        <FlatList
          data={list}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          getItemLayout={(_, i) => ({ length: ROW_H + 8, offset: (ROW_H + 8) * i, index: i })}
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
  section: { marginHorizontal: 12, marginBottom: 10 },
  secTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
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
  row: { height: ROW_H, marginHorizontal: 12, marginBottom: 8, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
  rowMid: { flex: 1, marginLeft: 10, marginRight: 8 },
  rowLine: { flexDirection: "row", alignItems: "center" },
  sym: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  name: { fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  price: { fontSize: 14, fontWeight: "700" },
  chg: { fontSize: 11, fontWeight: "600" },
});
