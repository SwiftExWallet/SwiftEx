import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, useWindowDimensions } from "react-native";
import { useSelector } from "react-redux";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import Snackbar from "react-native-snackbar";
import PriceChart from "../../perps/components/PriceChart";
import { llamaKey } from "../data/assets";
import { groupByKey } from "../data/groups";
import { useRwaAvailability } from "../useRwaAvailability";
import { isAssetAllowed } from "../regions";
import { loadPrices, getCachedPrice, loadHistory } from "../api/prices";
import { evmBalances, stellarBalances, readMultiplier } from "../api/balances";
import { assetMarketStatus } from "../utils/marketHours";
import { loadXStatuses, getCachedXStatus } from "../api/xstocksStatus";
import { fmtUsd, fmtPct, fmtAmount, fromUnits } from "../utils/amounts";
import { stellarSwapParams } from "../utils/stellarTokens";
import { CHAIN_INFO } from "../config";
import { closedText, fmtHolding, isDust } from "../utils/swapForm";
import Icon from "../../icon";
import { useRwaTheme, RwaLogo, RwaHeader } from "../components/ui";

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

const multiplierNote = (g, m) => {
  if (!g.multiplier || g.multiplier.kind === "none") return null;
  const v = m != null ? ` Current: ${m.toFixed(5)}.` : "";
  return g.multiplier.kind === "xstocks-rebase"
    ? `Splits and dividends change your token balance automatically, so 1 token may not equal 1 share.${v}`
    : `Splits and dividends are reflected in the token price, so 1 token may not equal 1 share.${v}`;
};

const shortAddr = (a) => `${a.slice(0, 8)}…${a.slice(-6)}`;

const RwaAsset = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const theme = useRwaTheme();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const state = useSelector((s) => s);
  const evm = state?.wallet?.address || null;
  const stellar = state?.STELLAR_PUBLICK_KEY || null;
  const group = groupByKey(params && params.key);
  const { country, checked } = useRwaAvailability(focused);
  const allowed = !!group && isAssetAllowed(group.primary, country);

  const [range, setRange] = useState("1M");
  const [candles, setCandles] = useState(null);
  const [chartErr, setChartErr] = useState(false);
  const [price, setPrice] = useState(null);
  const [holding, setHolding] = useState(undefined); // undefined = loading, null = error, { [chain]: "amount" }
  const [mult, setMult] = useState(null);
  const [xs, setXs] = useState(null);
  const [about, setAbout] = useState(false);

  useEffect(() => {
    if (checked && !allowed) navigation.goBack();
  }, [checked, allowed, navigation]);

  const key = group ? llamaKey(group.primary) : null;
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
    if (!group || !focused) return undefined;
    let alive = true;
    const run = async () => {
      try {
        const out = {};
        for (const c of group.chains) {
          const a = group.byChain[c];
          if (c === "XLM") {
            // eslint-disable-next-line no-await-in-loop
            const b = stellar ? await stellarBalances(stellar, [a]) : {};
            out[c] = b[a.id] || "0";
          } else {
            // eslint-disable-next-line no-await-in-loop
            const b = evm ? await evmBalances(c, evm, [a]) : {};
            out[c] = b[a.id] ? fromUnits(b[a.id], a.decimals) : "0";
          }
        }
        if (alive) setHolding(out);
      } catch (e) {
        if (alive) setHolding(null);
      }
    };
    run();
    readMultiplier(group.primary).then((m) => alive && setMult(m));
    if (group.issuer === "xstocks") {
      loadXStatuses([group.symbol]).then(() => alive && setXs(getCachedXStatus(group.symbol)));
    }
    return () => {
      alive = false;
    };
  }, [group, focused, evm, stellar]);

  const status = useMemo(() => {
    if (!group) return null;
    return xs || assetMarketStatus(group);
  }, [group, xs]);

  if (!group) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title="Not found" theme={theme} onBack={() => navigation.goBack()} />
      </View>
    );
  }

  const isStellar = group.chains.includes("XLM");
  const goTrade = (side) => {
    if (isStellar) {
      const p = stellarSwapParams(group.primary, side);
      if (p) navigation.navigate("newOffer_modal", p);
      else Snackbar.show({ text: "This asset isn't in the Stellar token list.", duration: Snackbar.LENGTH_SHORT });
      return;
    }
    navigation.navigate("RwaTrade", { key: group.key, side });
  };
  const total = holding ? Object.values(holding).reduce((s, x) => s + Number(x || 0), 0) : null;
  const holdValue = total !== null && price && price.price != null ? total * price.price : null;
  const chartColor = price && price.change24h != null && price.change24h < 0 ? theme.fail : theme.success;
  const note = multiplierNote(group, mult);
  const copy = (text) => {
    Clipboard.setString(text);
    Snackbar.show({ text: "Copied", duration: Snackbar.LENGTH_SHORT });
  };

  const closed = closedText(status, new Date(), group.issuer !== "xstocks");
  const multiChain = group.chains.length > 1;
  const hasBalance = total !== null && !isDust(total, price && price.price);
  const canSell = holding === null || hasBalance; // unknown balance: let the trade screen decide

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title={group.symbol} theme={theme} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.top}>
          <RwaLogo asset={group} size={40} theme={theme} />
          <Text style={[styles.name, { color: theme.inactiveTx }]} numberOfLines={2}>{group.name}</Text>
        </View>
        <Text style={[styles.price, { color: theme.headingTx }]}>{price && price.price != null ? fmtUsd(price.price) : "—"}</Text>
        <View style={styles.subLine}>
          {price && price.change24h != null ? (
            <Text style={[styles.chg, { color: price.change24h >= 0 ? theme.success : theme.fail }]}>{fmtPct(price.change24h)} today</Text>
          ) : null}
          {closed ? <Text style={[styles.closed, { color: theme.inactiveTx }]}>  ·  {closed === "Paused" ? "Trading paused" : closed}</Text> : null}
        </View>

        <View style={styles.chart}>
          {candles ? (
            candles.length > 1 ? (
              <PriceChart candles={candles} width={width - 32} height={180} color={chartColor} theme={theme} tickSize="0.01" />
            ) : (
              <Text style={[styles.muted, { color: theme.inactiveTx }]}>No price history yet.</Text>
            )
          ) : chartErr ? (
            <Text style={[styles.muted, { color: theme.inactiveTx }]}>Couldn't load the chart.</Text>
          ) : (
            <ActivityIndicator color={theme.buttonColor} />
          )}
        </View>
        <View style={styles.ranges}>
          {RANGES.map((r) => (
            <TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.rangeBtn, range === r && { backgroundColor: theme.cardBg }]} accessibilityRole="button" accessibilityState={{ selected: range === r }}>
              <Text style={[styles.rangeTxt, { color: range === r ? theme.headingTx : theme.inactiveTx }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasBalance ? (
          <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
            <Text style={[styles.cardLabel, { color: theme.inactiveTx }]}>Your balance</Text>
            <View style={styles.balRow}>
              <Text style={[styles.balUsd, { color: theme.headingTx }]}>{holdValue != null ? fmtUsd(holdValue) : "—"}</Text>
              <Text style={[styles.balAmt, { color: theme.inactiveTx }]}>
                {fmtHolding(total, 6)} {group.symbol}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: about }} onPress={() => setAbout(!about)} style={styles.aboutHead}>
          <Text style={[styles.aboutTitle, { color: theme.headingTx }]}>About</Text>
          <Icon name={about ? "chevron-up" : "chevron-down"} type="ionicon" size={18} color={theme.inactiveTx} />
        </TouchableOpacity>
        {about ? (
          <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
            <Info label="Issuer" value={ISSUER_LABEL[group.issuer] || group.issuer} theme={theme} />
            <Info label="Type" value={CAT_LABEL[group.category]} theme={theme} />
            {group.underlying ? <Info label="Tracks" value={group.underlying} theme={theme} /> : null}
            {status ? <Info label="Market" value={status.label} theme={theme} /> : null}
            {multiChain && holding
              ? group.chains.map((c) => <Info key={`b${c}`} label={`Balance on ${CHAIN_INFO[c].label}`} value={fmtAmount(holding[c] || "0", 6)} theme={theme} />)
              : null}
            {group.chains.map((c) => {
              const a = group.byChain[c];
              return c === "XLM" ? (
                <Info key={c} label="Stellar issuer" value={`${a.code} · ${a.stellarIssuer.slice(0, 6)}…${a.stellarIssuer.slice(-6)}`} theme={theme} onPress={() => copy(a.stellarIssuer)} />
              ) : (
                <Info key={c} label={`Contract (${CHAIN_INFO[c].label})`} value={shortAddr(a.address)} theme={theme} onPress={() => copy(a.address)} />
              );
            })}
            {note ? <Text style={[styles.note, { color: theme.inactiveTx }]}>{note}</Text> : null}
            <Text style={[styles.note, { color: theme.inactiveTx }]}>
              This token is not a share. The issuer can freeze or claw it back, off-hours prices can differ from the exchange, and
              redeeming with the issuer may require their KYC.
            </Text>
            <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(group.termsUrl).catch(() => {})}>
              <Text style={[styles.link, { color: theme.buttonColor }]}>Issuer terms</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.actions, { backgroundColor: theme.bg }]}>
        <TouchableOpacity accessibilityRole="button" onPress={() => goTrade("buy")} style={[styles.actBtn, { backgroundColor: theme.buttonColor }]}>
          <Text style={styles.actTxt}>Buy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canSell}
          onPress={() => goTrade("sell")}
          style={[styles.actBtn, { backgroundColor: theme.cardBg, opacity: canSell ? 1 : 0.5 }]}
        >
          <Text style={[styles.actTxt, { color: theme.headingTx }]}>Sell</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default RwaAsset;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 110 },
  top: { flexDirection: "row", alignItems: "center", marginHorizontal: 16 },
  name: { flex: 1, fontSize: 14, marginLeft: 10 },
  price: { fontSize: 32, fontWeight: "800", marginHorizontal: 16, marginTop: 12 },
  subLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginHorizontal: 16, marginTop: 2 },
  chg: { fontSize: 14, fontWeight: "600" },
  closed: { fontSize: 13 },
  chart: { height: 180, marginHorizontal: 16, marginTop: 14, alignItems: "center", justifyContent: "center" },
  muted: { fontSize: 13 },
  ranges: { flexDirection: "row", justifyContent: "center", marginTop: 8 },
  rangeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10, marginHorizontal: 4 },
  rangeTxt: { fontSize: 13, fontWeight: "700" },
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 14 },
  cardLabel: { fontSize: 12 },
  balRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 },
  balUsd: { fontSize: 20, fontWeight: "800" },
  balAmt: { fontSize: 13 },
  aboutHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, marginTop: 18, paddingVertical: 6 },
  aboutTitle: { fontSize: 16, fontWeight: "700" },
  info: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  infoLabel: { fontSize: 13, marginRight: 10 },
  infoValue: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  note: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  link: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  actions: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 20 },
  actBtn: { flex: 1, marginHorizontal: 4, minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  actTxt: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
