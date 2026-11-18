import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Keyboard } from "react-native";
import { useSelector } from "react-redux";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import { ethers } from "ethers";
import { assetById } from "../data/assets";
import { useRwaAvailability } from "../useRwaAvailability";
import { isAssetAllowed } from "../regions";
import { getRwaQuote } from "../api/quote";
import { payTokenState } from "../api/balances";
import { assetMarketStatus } from "../utils/marketHours";
import { getCachedXStatus } from "../api/xstocksStatus";
import { cleanAmountInput, toUnits, fromUnits, gteUnits, fmtAmount, fmtUsd } from "../utils/amounts";
import { payOptionsFor, tradeChecks } from "../utils/tradeRules";
import { APPROVE_GAS, CHAIN_INFO, RWA_TRADING_ENABLED } from "../config";
import { useRwaTheme, RwaHeader, DevBanner, StatusBadge } from "../components/ui";

const Row = ({ label, value, theme, color }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.rowValue, { color: color || theme.headingTx }]} numberOfLines={2}>{value}</Text>
  </View>
);

const RwaTrade = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const theme = useRwaTheme();
  const focused = useIsFocused();
  const wallet = useSelector((s) => s?.wallet?.address) || null;
  const asset = assetById(params && params.id);
  const side = params && params.side === "sell" ? "sell" : "buy";
  const { country, checked } = useRwaAvailability(focused);
  const allowed = !!asset && isAssetAllowed(asset, country);

  const payOptions = useMemo(() => (asset ? payOptionsFor(asset) : []), [asset]);
  const [paySym, setPaySym] = useState(payOptions[0] ? payOptions[0].symbol : null);
  const pay = payOptions.find((p) => p.symbol === paySym) || payOptions[0];
  const [amount, setAmount] = useState("");
  const [chain, setChain] = useState(null); // pay-side state { balance, allowance, native, gasPrice }
  const [chainErr, setChainErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // getRwaQuote result

  useEffect(() => {
    if (checked && !allowed) navigation.goBack();
  }, [checked, allowed, navigation]);

  // The token being spent: pay token on buy, the RWA token on sell.
  const inToken = side === "buy" ? pay : asset && { symbol: asset.symbol, address: asset.address, decimals: asset.decimals };
  const outToken = side === "buy" ? asset && { symbol: asset.symbol, decimals: asset.decimals } : pay;

  useEffect(() => {
    if (!asset || !inToken || !wallet || !focused) return undefined;
    let alive = true;
    setChain(null);
    setChainErr(false);
    payTokenState(asset.chain, wallet, inToken.address)
      .then((s) => alive && setChain(s))
      .catch(() => alive && setChainErr(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, wallet, focused, inToken && inToken.address]);

  useEffect(() => setResult(null), [amount, paySym]);

  if (!asset || !pay) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title="Not available" theme={theme} onBack={() => navigation.goBack()} />
      </View>
    );
  }

  const info = CHAIN_INFO[asset.chain];
  const market = (asset.issuer === "xstocks" && getCachedXStatus(asset.symbol)) || assetMarketStatus(asset);
  const units = toUnits(amount, inToken.decimals);
  const checks = tradeChecks({ asset, side, amount, unitPriceUsd: result && result.ok ? result.summary.fromUsd : null });
  const insufficient = chain && units && !gteUnits(chain.balance, units);
  const needsApproval = chain && units ? !gteUnits(chain.allowance, units) : null;
  const approveCost = chain ? ethers.BigNumber.from(chain.gasPrice).mul(APPROVE_GAS) : null;
  const lowGas = needsApproval && approveCost && ethers.BigNumber.from(chain.native).lt(approveCost);

  const getQuote = async () => {
    Keyboard.dismiss();
    if (!units || checks.error) return;
    setBusy(true);
    setResult(null);
    const r = await getRwaQuote({ side, asset, payToken: pay, amountUnits: units, wallet });
    setResult(r);
    setBusy(false);
  };

  const s = result && result.ok ? result.summary : null;
  const outAmt = s && s.toAmount ? fromUnits(s.toAmount, outToken.decimals) : null;
  const minAmt = s && s.minReceived ? fromUnits(s.minReceived, outToken.decimals) : null;
  const feeAmt = s && s.tokenFee ? fromUnits(s.tokenFee, outToken.decimals) : null;
  const unitPrice =
    outAmt && Number(outAmt) > 0 ? (side === "buy" ? Number(amount) / Number(outAmt) : Number(outAmt) / Number(amount)) : null;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title={`${side === "buy" ? "Buy" : "Sell"} ${asset.symbol}`} theme={theme} onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <DevBanner theme={theme} text="Dev preview · quotes only. Nothing is bought or sold." />
        <View style={styles.line}>
          <Text style={[styles.net, { color: theme.inactiveTx }]}>{info.label}</Text>
          <StatusBadge status={market.status} label={market.label} theme={theme} />
        </View>

        <Text style={[styles.label, { color: theme.inactiveTx }]}>{side === "buy" ? "Pay with" : "Receive"}</Text>
        <View style={[styles.seg, { backgroundColor: theme.cardBg }]}>
          {payOptions.map((p) => (
            <TouchableOpacity key={p.symbol} onPress={() => setPaySym(p.symbol)} style={[styles.segBtn, pay.symbol === p.symbol && { backgroundColor: theme.buttonColor }]} accessibilityRole="button" accessibilityState={{ selected: pay.symbol === p.symbol }}>
              <Text style={[styles.segTxt, { color: pay.symbol === p.symbol ? "#FFFFFF" : theme.inactiveTx }]}>{p.symbol}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {asset.issuer === "ondo" ? <Text style={[styles.hint, { color: theme.inactiveTx }]}>Ondo assets trade against USDC only.</Text> : null}

        <Text style={[styles.label, { color: theme.inactiveTx }]}>Amount ({inToken.symbol})</Text>
        <View style={[styles.field, { backgroundColor: theme.cardBg }]}>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(cleanAmountInput(t, Math.min(inToken.decimals, 8)))}
            placeholder="0.00"
            placeholderTextColor={theme.inactiveTx}
            keyboardType="decimal-pad"
            style={[styles.input, { color: theme.headingTx }]}
          />
          <Text style={[styles.suffix, { color: theme.inactiveTx }]}>{inToken.symbol}</Text>
        </View>
        <Text style={[styles.hint, { color: theme.inactiveTx }]}>
          Balance: {chain ? `${fmtAmount(fromUnits(chain.balance, inToken.decimals), 4)} ${inToken.symbol}` : chainErr ? "couldn't read" : "…"}
        </Text>
        {insufficient ? <Text style={[styles.warn, { color: theme.fail }]}>Not enough {inToken.symbol}. You can still check a quote.</Text> : null}
        {checks.error ? <Text style={[styles.warn, { color: theme.fail }]}>{checks.error}</Text> : null}
        {!market.open ? <Text style={[styles.warn, { color: theme.warn }]}>Market closed — the price may change a lot when it opens.</Text> : null}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!units || busy || !!checks.error}
          onPress={getQuote}
          style={[styles.btn, { backgroundColor: theme.buttonColor, opacity: !units || busy || checks.error ? 0.45 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnTxt}>Get quote</Text>}
        </TouchableOpacity>

        {result && !result.ok ? (
          <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
            <Text style={[styles.errTitle, { color: theme.fail }]}>{result.error.text}</Text>
            {__DEV__ ? (
              <Text style={[styles.dev, { color: theme.inactiveTx }]}>
                dev: HTTP {String(result.raw.status)} · {String(Array.isArray(result.raw.message) ? result.raw.message.join(" ") : result.raw.message).slice(0, 200)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {s ? (
          <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
            <Row theme={theme} label="You pay" value={`${fmtAmount(amount, 6)} ${inToken.symbol}`} />
            <Row theme={theme} label="You get (est.)" value={outAmt ? `${fmtAmount(outAmt, 6)} ${outToken.symbol}` : "—"} />
            <Row theme={theme} label="Min. received" value={minAmt ? `${fmtAmount(minAmt, 6)} ${outToken.symbol}` : "—"} />
            <Row theme={theme} label="Price" value={unitPrice ? `${fmtUsd(unitPrice)} per ${asset.symbol}` : "—"} />
            <Row theme={theme} label="Provider fee" value={feeAmt && Number(feeAmt) > 0 ? `${fmtAmount(feeAmt, 6)} ${outToken.symbol}` : "None (gasless)"} />
            <Row
              theme={theme}
              label="Approval"
              value={
                needsApproval === null
                  ? "—"
                  : needsApproval
                  ? `One-time approval needed · ~${Number(ethers.utils.formatEther(approveCost)).toFixed(5)} ${info.native}`
                  : "Not needed"
              }
              color={needsApproval ? theme.warn : undefined}
            />
            {lowGas ? <Text style={[styles.warn, { color: theme.fail }]}>Not enough {info.native} for the approval fee.</Text> : null}
          </View>
        ) : null}

        <TouchableOpacity accessibilityRole="button" disabled={!RWA_TRADING_ENABLED} style={[styles.btn, { backgroundColor: side === "buy" ? theme.success : theme.fail, opacity: 0.4 }]}>
          <Text style={styles.btnTxt}>{side === "buy" ? "Buying" : "Selling"} coming soon (dev)</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default RwaTrade;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 40 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 12 },
  net: { fontSize: 13, fontWeight: "600" },
  label: { fontSize: 12, marginHorizontal: 12, marginTop: 14, marginBottom: 6 },
  seg: { flexDirection: "row", borderRadius: 12, padding: 4, marginHorizontal: 12 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  segTxt: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12, marginHorizontal: 12, marginTop: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, height: 50, marginHorizontal: 12 },
  input: { flex: 1, fontSize: 18, fontWeight: "600", paddingVertical: 0 },
  suffix: { fontSize: 14, marginLeft: 6 },
  warn: { fontSize: 13, marginHorizontal: 12, marginTop: 8 },
  btn: { marginHorizontal: 12, marginTop: 16, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  card: { marginHorizontal: 12, marginTop: 14, borderRadius: 14, padding: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { fontSize: 13, marginRight: 10 },
  rowValue: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  errTitle: { fontSize: 14, fontWeight: "700" },
  dev: { fontSize: 11, marginTop: 6 },
});
