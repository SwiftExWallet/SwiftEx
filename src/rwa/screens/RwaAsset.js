import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, useWindowDimensions } from "react-native";
import { useSelector } from "react-redux";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import Snackbar from "react-native-snackbar";
import PriceChart from "../../perps/components/PriceChart";
import { assetById, llamaKey } from "../data/assets";
import { useRwaAvailability } from "../useRwaAvailability";
import { isAssetAllowed } from "../regions";
import { loadPrices, getCachedPrice, loadHistory } from "../api/prices";
import { evmBalances, stellarBalances, readMultiplier } from "../api/balances";
import { assetMarketStatus, nextOpen, formatEastern } from "../utils/marketHours";
import { loadXStatuses, getCachedXStatus } from "../api/xstocksStatus";
import { fmtUsd, fmtPct, fmtAmount, fromUnits } from "../utils/amounts";
import { stellarSwapParams } from "../utils/stellarTokens";
import { CHAIN_INFO } from "../config";
import { useRwaTheme, RwaLogo, ChainBadge, StatusBadge, RwaHeader } from "../components/ui";

const ISSUER_LABEL = {
  ondo: "Ondo Global Markets",
  xstocks: "xStocks (Backed Finance)",
  paxos: "Paxos",
  tether: "Tether",
  "ondo-stellar": "Ondo Finance",
  etherfuse: "Etherfuse",
};
const CAT_LABEL = { stock: "Tokenized stock", etf: "Tokenized ETF", gold: "Tokenized gold", treasury: "Tokenized treasury" };
const RANGES = ["1D", "1W", "1M"];

const Info = ({ label, value, theme, onPress }) => (
  <TouchableOpacity disabled={!onPress} onPress={onPress} style={styles.info} accessibilityRole={onPress ? "button" : undefined}>
    <Text style={[styles.infoLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.infoValue, { color: onPress ? theme.buttonColor : theme.headingTx }]} numberOfLines={2}>
      {value}
    </Text>
  </TouchableOpacity>
);

const multiplierNote = (asset, m) => {
  if (!asset.multiplier || asset.multiplier.kind === "none") return null;
  const v = m != null ? ` Current: ${m.toFixed(5)}.` : "";
  return asset.multiplier.kind === "xstocks-rebase"
    ? `Splits and dividends are applied by changing every holder's token balance (rebasing), so 1 token may not equal 1 share.${v}`
    : `Splits and dividends are applied through a share multiplier, so 1 token may not equal 1 share.${v}`;
};

const RwaAsset = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const theme = useRwaTheme();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const state = useSelector((s) => s);
  const evm = state?.wallet?.address || null;
  const stellar = state?.STELLAR_PUBLICK_KEY || null;
  const asset = assetById(params && params.id);
  const { country, checked } = useRwaAvailability(focused);
  const allowed = !!asset && isAssetAllowed(asset, country);

  const [range, setRange] = useState("1M");
  const [candles, setCandles] = useState(null);
  const [chartErr, setChartErr] = useState(false);
  const [price, setPrice] = useState(null);
  const [holding, setHolding] = useState(undefined); // undefined = loading
  const [mult, setMult] = useState(null);
  const [xs, setXs] = useState(null);

  useEffect(() => {
    if (checked && !allowed) navigation.goBack();
  }, [checked, allowed, navigation]);

  const key = asset ? llamaKey(asset) : null;
  useEffect(() => {
    if (!key) return;
    loadPrices([key]).then(() => setPrice(getCachedPrice(key)));
  }, [key]);

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setCandles(null);
    setChartErr(false);
    loadHistory(key, range)
      .then((d) => alive && setCandles(d))
      .catch(() => alive && setChartErr(true));
    return () => {
      alive = false;
    };
  }, [key, range]);

  useEffect(() => {
    if (!asset || !focused) return undefined;
    let alive = true;
    const run = async () => {
      try {
        if (asset.chain === "XLM") {
          const b = stellar ? await stellarBalances(stellar, [asset]) : {};
          if (alive) setHolding(b[asset.id] || "0");
        } else {
          const b = evm ? await evmBalances(asset.chain, evm, [asset]) : {};
          if (alive) setHolding(b[asset.id] ? fromUnits(b[asset.id], asset.decimals) : "0");
        }
      } catch (e) {
        if (alive) setHolding(null);
      }
    };
    run();
    readMultiplier(asset).then((m) => alive && setMult(m));
    if (asset.issuer === "xstocks") {
      loadXStatuses([asset.symbol]).then(() => alive && setXs(getCachedXStatus(asset.symbol)));
    }
    return () => {
      alive = false;
    };
  }, [asset, focused, evm, stellar]);

  const status = useMemo(() => {
    if (!asset) return null;
    if (xs) return xs;
    const s = assetMarketStatus(asset);
    if (!s.open) {
      const n = nextOpen(new Date());
      return { ...s, nextText: n ? `Opens ${formatEastern(n)}` : null };
    }
    return s;
  }, [asset, xs]);

  if (!asset) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title="Not found" theme={theme} onBack={() => navigation.goBack()} />
      </View>
    );
  }

  const isStellar = asset.chain === "XLM";
  const goTrade = (side) => {
    if (isStellar) {
      const p = stellarSwapParams(asset, side);
      if (p) navigation.navigate("newOffer_modal", p);
      else Snackbar.show({ text: "This asset isn't in the Stellar token list.", duration: Snackbar.LENGTH_SHORT });
      return;
    }
    navigation.navigate("RwaTrade", { id: asset.id, side });
  };
  const holdValue = holding && price && price.price != null ? Number(holding) * price.price : null;
  const chartColor = price && price.change24h != null && price.change24h < 0 ? theme.fail : theme.success;
  const note = multiplierNote(asset, mult);

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title={asset.symbol} theme={theme} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.top}>
          <RwaLogo asset={asset} size={44} theme={theme} />
          <View style={styles.topMid}>
            <Text style={[styles.name, { color: theme.headingTx }]} numberOfLines={2}>{asset.name}</Text>
            <View style={styles.line}>
              <ChainBadge chain={asset.chain} theme={theme} />
              <View style={styles.gap} />
              {status ? <StatusBadge status={status.status} label={status.label} theme={theme} /> : null}
            </View>
          </View>
        </View>
        <Text style={[styles.price, { color: theme.headingTx }]}>{price && price.price != null ? fmtUsd(price.price) : "—"}</Text>
        {price && price.change24h != null ? (
          <Text style={[styles.chg, { color: price.change24h >= 0 ? theme.success : theme.fail }]}>{fmtPct(price.change24h)} (24h)</Text>
        ) : null}
        {status && !status.open ? (
          <Text style={[styles.closed, { color: theme.warn }]}>
            Market closed{status.nextText ? ` · ${status.nextText}` : ""}. Prices may move when it reopens.
          </Text>
        ) : null}

        <View style={styles.chart}>
          {candles ? (
            candles.length > 1 ? (
              <PriceChart candles={candles} width={width - 24} height={180} color={chartColor} theme={theme} tickSize="0.01" />
            ) : (
              <Text style={[styles.muted, { color: theme.inactiveTx }]}>No price history yet.</Text>
            )
          ) : chartErr ? (
            <Text style={[styles.muted, { color: theme.inactiveTx }]}>Couldn't load the chart.</Text>
          ) : (
            <ActivityIndicator color={theme.buttonColor} />
          )}
        </View>
        <View style={[styles.seg, { backgroundColor: theme.cardBg }]}>
          {RANGES.map((r) => (
            <TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.segBtn, range === r && { backgroundColor: theme.buttonColor }]} accessibilityRole="button" accessibilityState={{ selected: range === r }}>
              <Text style={[styles.segTxt, { color: range === r ? "#FFFFFF" : theme.inactiveTx }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
          <Text style={[styles.cardTitle, { color: theme.headingTx }]}>Your holding</Text>
          {holding === undefined ? (
            <ActivityIndicator color={theme.buttonColor} style={styles.left} />
          ) : holding === null ? (
            <Text style={[styles.muted, { color: theme.inactiveTx }]}>Couldn't read your balance.</Text>
          ) : (
            <Text style={[styles.hold, { color: theme.headingTx }]}>
              {fmtAmount(holding, 6)} {asset.symbol}
              {holdValue != null ? `  ·  ${fmtUsd(holdValue)}` : ""}
            </Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
          <Info label="Issuer" value={ISSUER_LABEL[asset.issuer] || asset.issuer} theme={theme} />
          <Info label="Type" value={CAT_LABEL[asset.category]} theme={theme} />
          {asset.underlying ? <Info label="Tracks" value={asset.underlying} theme={theme} /> : null}
          <Info label="Network" value={CHAIN_INFO[asset.chain].label} theme={theme} />
          <Info
            label={isStellar ? "Issuer account" : "Contract"}
            value={isStellar ? `${asset.code} · ${asset.stellarIssuer.slice(0, 6)}…${asset.stellarIssuer.slice(-6)}` : `${asset.address.slice(0, 8)}…${asset.address.slice(-6)}`}
            theme={theme}
            onPress={() => {
              Clipboard.setString(isStellar ? asset.stellarIssuer : asset.address);
              Snackbar.show({ text: "Copied", duration: Snackbar.LENGTH_SHORT });
            }}
          />
          {note ? <Text style={[styles.note, { color: theme.inactiveTx }]}>{note}</Text> : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
          <Text style={[styles.risk, { color: theme.warn }]}>
            This token is not a share. The issuer can freeze or claw it back, off-hours prices can differ from the
            exchange, and redeeming with the issuer may require their KYC.
          </Text>
          <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(asset.termsUrl).catch(() => {})}>
            <Text style={[styles.link, { color: theme.buttonColor }]}>Issuer terms</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <View style={[styles.actions, { backgroundColor: theme.bg }]}>
        <TouchableOpacity accessibilityRole="button" onPress={() => goTrade("buy")} style={[styles.actBtn, { backgroundColor: theme.success }]}>
          <Text style={styles.actTxt}>Buy</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => goTrade("sell")} style={[styles.actBtn, { backgroundColor: theme.fail }]}>
          <Text style={styles.actTxt}>Sell</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default RwaAsset;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 100 },
  top: { flexDirection: "row", alignItems: "center", marginHorizontal: 12 },
  topMid: { flex: 1, marginLeft: 10 },
  name: { fontSize: 15, fontWeight: "600" },
  line: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  gap: { width: 8 },
  price: { fontSize: 30, fontWeight: "800", marginHorizontal: 12, marginTop: 12 },
  chg: { fontSize: 14, fontWeight: "600", marginHorizontal: 12 },
  closed: { fontSize: 13, marginHorizontal: 12, marginTop: 6 },
  chart: { height: 180, marginHorizontal: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  muted: { fontSize: 13 },
  seg: { flexDirection: "row", borderRadius: 12, padding: 4, marginHorizontal: 12, marginTop: 10 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 9 },
  segTxt: { fontSize: 13, fontWeight: "600" },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  left: { alignSelf: "flex-start" },
  hold: { fontSize: 15, fontWeight: "600" },
  info: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  infoLabel: { fontSize: 13, marginRight: 10 },
  infoValue: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  note: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  risk: { fontSize: 13, lineHeight: 18 },
  link: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  actions: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", padding: 12, paddingBottom: 20 },
  actBtn: { flex: 1, marginHorizontal: 4, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actTxt: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
