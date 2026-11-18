import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Keyboard } from "react-native";
import { useSelector } from "react-redux";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import { ethers } from "ethers";
import { llamaKey } from "../data/assets";
import { groupByKey } from "../data/groups";
import { useRwaAvailability } from "../useRwaAvailability";
import { isAssetAllowed } from "../regions";
import { getRwaQuote } from "../api/quote";
import { payTokenState, tokenBalance } from "../api/balances";
import { loadPrices, getCachedPrice } from "../api/prices";
import { assetMarketStatus } from "../utils/marketHours";
import { getCachedXStatus } from "../api/xstocksStatus";
import { cleanAmountInput, toUnits, fromUnits, gteUnits, fmtAmount, fmtUsd, nativeCostText } from "../utils/amounts";
import { payOptionsFor, tradeChecks } from "../utils/tradeRules";
import { quoteFigures, smallEthOrder, defaultChain } from "../utils/quoteMath";
import { APPROVE_GAS, CHAIN_INFO, RWA_TRADING_ENABLED } from "../config";
import { useRwaTheme, RwaHeader, DevBanner, StatusBadge } from "../components/ui";
import ReviewSheet from "../components/ReviewSheet";
import OrderCard from "../components/OrderCard";
import { executeOrder } from "../orders/executeOrder";
import { useOrderTracker } from "../orders/useOrderTracker";
import { quoteIsFresh, isFinal } from "../orders/orderState";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

const Row = ({ label, value, theme, color, sub }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <View style={styles.rowRight}>
      <Text style={[styles.rowValue, { color: color || theme.headingTx }]} numberOfLines={2}>{value}</Text>
      {sub ? <Text style={[styles.rowSub, { color: theme.inactiveTx }]}>{sub}</Text> : null}
    </View>
  </View>
);

const Seg = ({ options, value, onChange, theme }) => (
  <View style={[styles.seg, { backgroundColor: theme.cardBg }]}>
    {options.map((o) => (
      <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} style={[styles.segBtn, value === o.value && { backgroundColor: theme.buttonColor }]} accessibilityRole="button" accessibilityState={{ selected: value === o.value }}>
        <Text style={[styles.segTxt, { color: value === o.value ? "#FFFFFF" : theme.inactiveTx }]}>{o.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const RwaTrade = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const theme = useRwaTheme();
  const focused = useIsFocused();
  const wallet = useSelector((s) => s?.wallet?.address) || null;
  const group = groupByKey(params && params.key);
  const side = params && params.side === "sell" ? "sell" : "buy";
  const { country, checked } = useRwaAvailability(focused);
  const evmChains = useMemo(() => (group ? group.chains.filter((c) => c !== "XLM") : []), [group]);
  const allowed = !!group && evmChains.length > 0 && isAssetAllowed(group.primary, country);

  const [chain, setChain] = useState(null); // picked chain; null until the default is known
  const asset = group && chain ? group.byChain[chain] : null;
  const payOptions = useMemo(() => (group ? payOptionsFor(group.primary) : []), [group]);
  const [paySym, setPaySym] = useState(payOptions[0] ? payOptions[0].symbol : null);
  const pay = asset ? payOptionsFor(asset).find((p) => p.symbol === paySym) || payOptionsFor(asset)[0] : null;
  const [amount, setAmount] = useState("");
  const [chainState, setChainState] = useState(null); // { balance, allowance, native, gasPrice }
  const [chainErr, setChainErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [, setPriceTick] = useState(0);
  const { orders } = useOrderTracker(wallet, focused);
  const current = currentId ? orders.find((o) => o.id === currentId) : null;

  useEffect(() => {
    if (checked && !allowed) navigation.goBack();
  }, [checked, allowed, navigation]);

  // Default chain: where the wallet holds the most of what it would spend; else BNB Chain.
  useEffect(() => {
    if (!group || chain || !evmChains.length) return undefined;
    let alive = true;
    const pick = async () => {
      const bal = {};
      if (wallet) {
        await Promise.all(
          evmChains.map(async (c) => {
            try {
              const tok = side === "buy" ? (payOptionsFor(group.byChain[c]).find((p) => p.symbol === paySym) || payOptionsFor(group.byChain[c])[0]) : group.byChain[c];
              const raw = await tokenBalance(c, wallet, tok.address);
              bal[c] = Number(fromUnits(raw, tok.decimals));
            } catch (e) {
              bal[c] = 0;
            }
          })
        );
      }
      if (alive) setChain(defaultChain(evmChains, bal));
    };
    pick();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, wallet]);

  // The token being spent: pay token on buy, the RWA token on sell.
  const inToken = !asset || !pay ? null : side === "buy" ? pay : { symbol: asset.symbol, address: asset.address, decimals: asset.decimals };
  const outToken = !asset || !pay ? null : side === "buy" ? { symbol: asset.symbol, decimals: asset.decimals } : pay;
  const inTokenAddr = inToken ? inToken.address : null;

  useEffect(() => {
    if (!asset || !inToken || !wallet || !focused) return undefined;
    let alive = true;
    setChainState(null);
    setChainErr(false);
    payTokenState(asset.chain, wallet, inToken.address)
      .then((s) => alive && setChainState(s))
      .catch(() => alive && setChainErr(true));
    loadPrices([llamaKey(asset), CHAIN_INFO[asset.chain].nativePriceKey]).then(() => alive && setPriceTick((t) => t + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, wallet, focused, inToken && inToken.address]);

  useEffect(() => {
    setResult(null);
    setSendErr(null);
  }, [amount, paySym, chain]);

  // Refresh balances / allowance after an order finishes.
  const currentFinal = current ? isFinal(current.stage) : false;
  useEffect(() => {
    if (!currentFinal || !asset || !inTokenAddr || !wallet) return;
    payTokenState(asset.chain, wallet, inTokenAddr).then(setChainState).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFinal]);

  if (!group || !evmChains.length) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title="Not available" theme={theme} onBack={() => navigation.goBack()} />
      </View>
    );
  }
  if (!asset || !pay) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title={`${side === "buy" ? "Buy" : "Sell"} ${group.symbol}`} theme={theme} onBack={() => navigation.goBack()} />
        <ActivityIndicator color={theme.buttonColor} style={styles.loading} />
      </View>
    );
  }

  const info = CHAIN_INFO[asset.chain];
  const market = (group.issuer === "xstocks" && getCachedXStatus(group.symbol)) || assetMarketStatus(group);
  const marketPx = getCachedPrice(llamaKey(asset));
  const nativePx = getCachedPrice(info.nativePriceKey);
  const units = toUnits(amount, inToken.decimals);
  // Buy: stablecoin amount at face value ($1). Sell: asset tokens × price (quote's, else market).
  const checks = tradeChecks({
    asset,
    side,
    amount,
    unitPriceUsd: side === "buy" ? 1 : result && result.ok && result.summary.fromUsd ? result.summary.fromUsd : marketPx ? marketPx.price : null,
  });
  const insufficient = chainState && units && !gteUnits(chainState.balance, units);
  const needsApproval = chainState && units ? !gteUnits(chainState.allowance, units) : null;
  const approveCost = chainState ? ethers.BigNumber.from(chainState.gasPrice).mul(APPROVE_GAS) : null;
  const lowGas = needsApproval && approveCost && ethers.BigNumber.from(chainState.native).lt(approveCost);
  const orderUsd = side === "buy" ? Number(amount) : marketPx && marketPx.price ? Number(amount) * marketPx.price : null;

  const getQuote = async () => {
    Keyboard.dismiss();
    if (!units || checks.error) return;
    setBusy(true);
    setResult(null);
    const r = await getRwaQuote({ side, asset, payToken: pay, amountUnits: units, wallet });
    setResult(r);
    setQuotedAt(Date.now());
    setBusy(false);
  };

  const halted = market.status === "halted";
  const openOrder = orders.find((o) => !isFinal(o.stage));
  const canConfirm =
    RWA_TRADING_ENABLED && result && result.ok && !checks.error && !insufficient && !lowGas && !halted && !openOrder && !sending;
  const confirmBlock = !RWA_TRADING_ENABLED
    ? "Buying is turned off in this build."
    : halted
    ? "Trading in this asset is paused by the issuer."
    : insufficient
    ? `Not enough ${inToken.symbol}.`
    : lowGas
    ? `Not enough ${info.native} for the network fee.`
    : openOrder
    ? "You have an order in progress. Wait until it finishes."
    : null;

  const openReview = () => {
    setSendErr(null);
    if (!quoteIsFresh(quotedAt)) {
      setResult(null);
      setSendErr("The quote expired. Get a new quote.");
      return;
    }
    setReview(true);
  };

  const confirm = async () => {
    if (!quoteIsFresh(quotedAt)) {
      setReview(false);
      setResult(null);
      setSendErr("The quote expired. Get a new quote.");
      return;
    }
    setSending(true);
    const res = await executeOrder(
      { wallet, asset, side, payToken: pay, amountUnits: units, amountText: amount, quote: result.quote, summary: result.summary, quotedAt, groupKey: group.key },
      (rec) => setCurrentId(rec.id)
    );
    setSending(false);
    setReview(false);
    if (res && res.error) setSendErr(res.error);
    else if (res && res.id) {
      setCurrentId(res.id);
      setResult(null);
      setAmount("");
    }
  };

  // "Get USDC/USDT": the app's existing Swap (same chain) — no new swap logic here.
  const missingPay = side === "buy" && insufficient;

  const s = result && result.ok ? result.summary : null;
  const outAmt = s && s.toAmount ? fromUnits(s.toAmount, outToken.decimals) : null;
  const minAmt = s && s.minReceived ? fromUnits(s.minReceived, outToken.decimals) : null;
  const feeAmt = s && s.tokenFee ? fromUnits(s.tokenFee, outToken.decimals) : null;
  const fig = s ? quoteFigures({ side, amountIn: amount, out: outAmt, fee: feeAmt, marketPrice: marketPx && marketPx.price }) : null;
  const feeUsd = feeAmt ? (side === "buy" ? Number(feeAmt) * (fig && fig.effectivePrice ? fig.effectivePrice : 0) : Number(feeAmt)) : 0;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title={`${side === "buy" ? "Buy" : "Sell"} ${group.symbol}`} theme={theme} onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <DevBanner theme={theme} text="Dev build · real orders with real funds." />
        <View style={styles.line}>
          <Text style={[styles.net, { color: theme.inactiveTx }]}>Network</Text>
          <StatusBadge status={market.status} label={market.label} theme={theme} />
        </View>
        {evmChains.length > 1 ? (
          <Seg theme={theme} value={chain} onChange={setChain} options={evmChains.map((c) => ({ value: c, label: CHAIN_INFO[c].label }))} />
        ) : (
          <Text style={[styles.single, { color: theme.headingTx }]}>{info.label}</Text>
        )}
        {smallEthOrder(asset.chain, orderUsd) ? (
          <Text style={[styles.hint, { color: theme.warn }]}>Ethereum costs more for small orders{evmChains.includes("BSC") ? " — BNB Chain is usually cheaper." : "."}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.inactiveTx }]}>{side === "buy" ? "Pay with" : "Receive"}</Text>
        <Seg theme={theme} value={pay.symbol} onChange={setPaySym} options={payOptionsFor(asset).map((p) => ({ value: p.symbol, label: p.symbol }))} />
        {group.issuer === "ondo" ? <Text style={[styles.hint, { color: theme.inactiveTx }]}>Ondo assets trade against USDC only.</Text> : null}

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
          Balance: {chainState ? `${fmtAmount(fromUnits(chainState.balance, inToken.decimals), 4)} ${inToken.symbol}` : chainErr ? "couldn't read" : "…"}
        </Text>
        {insufficient ? <Text style={[styles.warn, { color: theme.fail }]}>Not enough {inToken.symbol}. You can still check a quote.</Text> : null}
        {missingPay ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate("EthSwap")} style={styles.getBtn}>
            <Text style={[styles.getTxt, { color: theme.buttonColor }]}>
              Get {inToken.symbol} on {info.label} → Swap
            </Text>
          </TouchableOpacity>
        ) : null}
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
            <Row
              theme={theme}
              label="Your price"
              value={fig && fig.effectivePrice ? `${fmtUsd(fig.effectivePrice)} per ${asset.symbol}` : "—"}
              sub={
                marketPx && marketPx.price
                  ? `Market ${fmtUsd(marketPx.price)}${fig && fig.vsMarketPct != null ? ` · ${fig.vsMarketPct >= 0 ? `${fig.vsMarketPct.toFixed(2)}% worse` : `${Math.abs(fig.vsMarketPct).toFixed(2)}% better`}` : ""}`
                  : null
              }
              color={fig && fig.vsMarketPct != null && fig.vsMarketPct > 1 ? theme.warn : undefined}
            />
            <Row
              theme={theme}
              label="Provider fee"
              value={feeAmt && Number(feeAmt) > 0 ? `${fmtAmount(feeAmt, 6)} ${outToken.symbol}` : "None"}
              sub={feeAmt && Number(feeAmt) > 0 && fig && fig.feePct != null ? `${fig.feePct.toFixed(2)}% of order${feeUsd ? ` · ~$${feeUsd < 0.01 ? "0.01" : feeUsd.toFixed(2)}` : ""}` : null}
              color={fig && fig.feePct != null && fig.feePct > 1 ? theme.warn : undefined}
            />
            <Row
              theme={theme}
              label="Approval"
              value={needsApproval === null ? "—" : needsApproval ? "One-time approval needed" : "Not needed"}
              sub={needsApproval && approveCost ? `Network fee ${nativeCostText(approveCost.toString(), info.native, nativePx && nativePx.price)}` : null}
              color={needsApproval ? theme.warn : undefined}
            />
            {lowGas ? <Text style={[styles.warn, { color: theme.fail }]}>Not enough {info.native} for the approval fee.</Text> : null}
          </View>
        ) : null}

        {s ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!canConfirm}
              onPress={openReview}
              style={[styles.btn, { backgroundColor: side === "buy" ? theme.success : theme.fail, opacity: canConfirm ? 1 : 0.4 }]}
            >
              <Text style={styles.btnTxt}>Review {side === "buy" ? "buy" : "sell"}</Text>
            </TouchableOpacity>
            {confirmBlock ? <Text style={[styles.hint, styles.center, { color: theme.inactiveTx }]}>{confirmBlock}</Text> : null}
          </>
        ) : null}
        {sendErr ? <Text style={[styles.warn, { color: theme.fail }]}>{sendErr}</Text> : null}
        {current ? <OrderCard record={current} theme={theme} /> : openOrder ? <OrderCard record={openOrder} theme={theme} /> : null}
      </ScrollView>
      <ReviewSheet
        visible={review}
        theme={theme}
        busy={sending}
        onCancel={() => setReview(false)}
        onConfirm={confirm}
        confirmLabel={`Confirm ${side === "buy" ? "buy" : "sell"}`}
        warning={!market.open ? "The market is closed: the order may not fill, or fill at a different price." : smallEthOrder(asset.chain, orderUsd) ? "Ethereum costs more for small orders." : null}
        rows={
          s
            ? [
                { label: "You pay", value: `${fmtAmount(amount, 6)} ${inToken.symbol}` },
                { label: "You get at least", value: minAmt ? `${fmtAmount(minAmt, 6)} ${outToken.symbol}` : "—" },
                { label: "Estimated", value: outAmt ? `${fmtAmount(outAmt, 6)} ${outToken.symbol}` : "—" },
                { label: "Network", value: info.label },
                { label: "Receiver", value: `Your wallet ${short(wallet)}` },
                {
                  label: "Approval",
                  value: needsApproval
                    ? `Exact ${fmtAmount(amount, 6)} ${inToken.symbol} · fee ${approveCost ? nativeCostText(approveCost.toString(), info.native, nativePx && nativePx.price) : ""}`
                    : "Not needed",
                  color: needsApproval ? theme.warn : undefined,
                },
                { label: "Provider fee", value: feeAmt && Number(feeAmt) > 0 ? `${fmtAmount(feeAmt, 6)} ${outToken.symbol}${fig && fig.feePct != null ? ` (${fig.feePct.toFixed(2)}%)` : ""}` : "None" },
              ]
            : []
        }
      />
    </View>
  );
};

export default RwaTrade;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 40 },
  loading: { marginTop: 40 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 12, marginBottom: 6 },
  net: { fontSize: 12 },
  single: { fontSize: 15, fontWeight: "700", marginHorizontal: 12 },
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
  rowRight: { flexShrink: 1, alignItems: "flex-end" },
  rowValue: { fontSize: 13, fontWeight: "600", textAlign: "right" },
  rowSub: { fontSize: 11, marginTop: 2, textAlign: "right" },
  errTitle: { fontSize: 14, fontWeight: "700" },
  center: { textAlign: "center" },
  getBtn: { marginHorizontal: 12, marginTop: 6, paddingVertical: 6 },
  getTxt: { fontSize: 14, fontWeight: "700" },
  dev: { fontSize: 11, marginTop: 6 },
});
