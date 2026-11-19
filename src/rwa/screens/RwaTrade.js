// Buy / Sell as one simple swap screen (Trust-Wallet style): amount in USD, pay token + chain
// picked automatically (changeable), auto-quote while typing, details collapsed, one button.
// All safety checks are unchanged: review sheet (receiver = your wallet), executeOrder ->
// fusionCheck + shared guard -> sign -> exact approval -> submit; duplicate/quote-age guards.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Animated } from "react-native";
import Modal from "react-native-modal";
import { useSelector } from "react-redux";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import { ethers } from "ethers";
import Icon from "../../icon";
import { llamaKey } from "../data/assets";
import { groupByKey } from "../data/groups";
import { useRwaAvailability } from "../useRwaAvailability";
import { isAssetAllowed } from "../regions";
import { getRwaQuote } from "../api/quote";
import { payTokenState, tokenBalance } from "../api/balances";
import { loadPrices, getCachedPrice } from "../api/prices";
import { assetMarketStatus } from "../utils/marketHours";
import { loadXStatuses, getCachedXStatus } from "../api/xstocksStatus";
import { cleanAmountInput, toUnits, fromUnits, gteUnits, fmtAmount, fmtUsd, nativeCostText } from "../utils/amounts";
import { payOptionsFor, tradeChecks } from "../utils/tradeRules";
import { quoteFigures, smallEthOrder } from "../utils/quoteMath";
import { QUOTE_DEBOUNCE_MS, QUOTE_REFRESH_MS, closedText, usdToSpend, spendToUsd, pickRoute, rateText, amountError } from "../utils/swapForm";
import { APPROVE_GAS, CHAIN_INFO, RWA_TRADING_ENABLED } from "../config";
import { useRwaTheme, RwaHeader, RwaLogo } from "../components/ui";
import ReviewSheet from "../components/ReviewSheet";
import ProgressSheet from "../components/ProgressSheet";
import { executeOrder } from "../orders/executeOrder";
import { useOrderTracker } from "../orders/useOrderTracker";
import { quoteIsFresh, isFinal } from "../orders/orderState";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

// Pulsing placeholder while a quote is loading.
const Shimmer = ({ theme, width = 140 }) => {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.9, duration: 550, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.shimmer, { width, opacity: v, backgroundColor: theme.inactiveTx }]} />;
};

const Detail = ({ label, value, theme, color }) => (
  <View style={styles.dRow}>
    <Text style={[styles.dLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.dValue, { color: color || theme.headingTx }]}>{value}</Text>
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
  const payByChain = useMemo(() => {
    const out = {};
    evmChains.forEach((c) => {
      out[c] = payOptionsFor(group.byChain[c]);
    });
    return out;
  }, [group, evmChains]);

  const [route, setRoute] = useState(null); // { chain, paySym }
  const [routeBal, setRouteBal] = useState(null); // { [chain]: { [sym]: raw, asset: raw } }
  const [picker, setPicker] = useState(false);
  const [usd, setUsd] = useState("");
  const [max, setMax] = useState(false);
  const [chainState, setChainState] = useState(null); // { balance, allowance, native, gasPrice }
  const [result, setResult] = useState(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0); // bump = refresh the quote for the same input
  const [details, setDetails] = useState(false);
  const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [currentId, setCurrentId] = useState(params && params.orderId ? params.orderId : null);
  const [liveRec, setLiveRec] = useState(null);
  const [progress, setProgress] = useState(!!(params && params.orderId));
  const [, setTick] = useState(0);
  const openProgressAfterReview = useRef(false);
  const reqId = useRef(0);
  const lastKey = useRef("");
  const { orders } = useOrderTracker(wallet, focused);

  const chain = route ? route.chain : null;
  const asset = group && chain ? group.byChain[chain] : null;
  const pay = asset ? (payByChain[chain] || []).find((p) => p.symbol === route.paySym) || (payByChain[chain] || [])[0] : null;
  const inToken = !asset || !pay ? null : side === "buy" ? pay : { symbol: asset.symbol, address: asset.address, decimals: asset.decimals };
  const outToken = !asset || !pay ? null : side === "buy" ? { symbol: asset.symbol, decimals: asset.decimals } : pay;
  const info = chain ? CHAIN_INFO[chain] : null;

  useEffect(() => {
    if (checked && !allowed) navigation.goBack();
  }, [checked, allowed, navigation]);

  // Balances on every chain for every option -> automatic route (BNB preferred when nothing held).
  const loadRouteBalances = async () => {
    const raw = {};
    await Promise.all(
      evmChains.map(async (c) => {
        raw[c] = {};
        if (!wallet) return;
        const toks = [...(payByChain[c] || []).map((p) => ({ key: p.symbol, t: p })), { key: "asset", t: group.byChain[c] }];
        await Promise.all(
          toks.map(async ({ key, t }) => {
            try {
              raw[c][key] = await tokenBalance(c, wallet, t.address);
            } catch (e) {
              raw[c][key] = null;
            }
          })
        );
      })
    );
    return raw;
  };
  const humanBalances = (raw) => {
    const out = {};
    Object.keys(raw || {}).forEach((c) => {
      out[c] = {};
      (payByChain[c] || []).forEach((p) => {
        out[c][p.symbol] = raw[c][p.symbol] ? Number(fromUnits(raw[c][p.symbol], p.decimals)) : 0;
      });
      out[c].asset = raw[c].asset ? Number(fromUnits(raw[c].asset, group.byChain[c].decimals)) : 0;
    });
    return out;
  };

  useEffect(() => {
    if (!group || !evmChains.length || !focused) return undefined;
    let alive = true;
    loadRouteBalances().then((raw) => {
      if (!alive) return;
      setRouteBal(raw);
      setRoute((r) => r || pickRoute({ side, chains: evmChains, payOptionsByChain: payByChain, balances: humanBalances(raw) }));
    });
    loadPrices(evmChains.map((c) => llamaKey(group.byChain[c])).concat(evmChains.map((c) => CHAIN_INFO[c].nativePriceKey))).then(() => alive && setTick((t) => t + 1));
    if (group.issuer === "xstocks") loadXStatuses([group.symbol]).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, wallet, focused]);

  // Allowance / gas data for the chosen route.
  const inAddr = inToken ? inToken.address : null;
  useEffect(() => {
    if (!asset || !inAddr || !wallet || !focused) return undefined;
    let alive = true;
    setChainState(null);
    payTokenState(asset.chain, wallet, inAddr)
      .then((s) => alive && setChainState(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, inAddr, wallet, focused]);

  // ---- derived amounts ----
  const marketPx = asset ? getCachedPrice(llamaKey(asset)) : null;
  const px = marketPx && marketPx.price ? marketPx.price : null;
  const spend = !inToken
    ? ""
    : max && chainState
    ? fromUnits(chainState.balance, inToken.decimals)
    : usdToSpend({ side, usd, price: px, decimals: inToken.decimals });
  const units = inToken && spend ? toUnits(spend, inToken.decimals) : null;
  const checks = asset ? tradeChecks({ asset, side, amount: spend, unitPriceUsd: side === "buy" ? 1 : px }) : { error: null };
  const insufficient = !!(chainState && units && !gteUnits(chainState.balance, units));
  const needsApproval = chainState && units ? !gteUnits(chainState.allowance, units) : null;
  const approveCost = chainState ? ethers.BigNumber.from(chainState.gasPrice).mul(APPROVE_GAS) : null;
  const lowGas = !!(needsApproval && approveCost && ethers.BigNumber.from(chainState.native).lt(approveCost));
  const err = inToken ? amountError({ ruleError: checks.error, insufficient, spendSymbol: inToken.symbol, lowGas, nativeSymbol: info.native }) : null;

  // ---- auto quote (debounced, stale answers dropped, refreshed before expiry) ----
  const quoteKey = units && !checks.error && asset && pay ? `${chain}|${pay.symbol}|${side}|${units}` : "";
  useEffect(() => {
    const id = ++reqId.current;
    const sameInput = quoteKey && quoteKey === lastKey.current;
    lastKey.current = quoteKey;
    if (!sameInput) {
      setResult(null);
      setSendErr(null);
    }
    if (!quoteKey || !focused) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const t = setTimeout(
      async () => {
        const r = await getRwaQuote({ side, asset, payToken: pay, amountUnits: units, wallet });
        if (id !== reqId.current) return; // a newer input/refresh replaced this one
        setResult(r);
        setQuotedAt(Date.now());
        setLoading(false);
      },
      sameInput ? 0 : QUOTE_DEBOUNCE_MS
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, nonce, focused]);

  useEffect(() => {
    if (!result || !result.ok || review || sending || !focused) return undefined;
    const t = setTimeout(() => setNonce((n) => n + 1), Math.max(1000, QUOTE_REFRESH_MS - (Date.now() - quotedAt)));
    return () => clearTimeout(t);
  }, [result, quotedAt, review, sending, focused]);

  // ---- orders ----
  const tracked = currentId ? orders.find((o) => o.id === currentId) : null;
  const progressRec = tracked || (liveRec && (!currentId || liveRec.id === currentId) ? liveRec : null);
  const openOrder = orders.find((o) => !isFinal(o.stage) && (!o.expiresAt || Date.now() <= o.expiresAt));
  const progressFinal = progressRec ? isFinal(progressRec.stage) : false;
  useEffect(() => {
    if (!progressFinal || !asset || !inAddr || !wallet) return;
    payTokenState(asset.chain, wallet, inAddr).then(setChainState).catch(() => {});
    loadRouteBalances().then(setRouteBal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressFinal]);

  if (!group || !evmChains.length) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title="Not available" theme={theme} onBack={() => navigation.goBack()} />
      </View>
    );
  }
  const title = `${side === "buy" ? "Buy" : "Sell"} ${group.symbol}`;
  if (!asset || !pay) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <RwaHeader title={title} theme={theme} onBack={() => navigation.goBack()} />
        <ActivityIndicator color={theme.buttonColor} style={styles.loadingBig} />
      </View>
    );
  }

  const market = (group.issuer === "xstocks" && getCachedXStatus(group.symbol)) || assetMarketStatus(group);
  const closed = closedText(market, new Date(), group.issuer !== "xstocks");
  const nativePx = getCachedPrice(info.nativePriceKey);
  const s = result && result.ok ? result.summary : null;
  const outAmt = s && s.toAmount ? fromUnits(s.toAmount, outToken.decimals) : null;
  const minAmt = s && s.minReceived ? fromUnits(s.minReceived, outToken.decimals) : null;
  const feeAmt = s && s.tokenFee ? fromUnits(s.tokenFee, outToken.decimals) : null;
  const fig = s ? quoteFigures({ side, amountIn: spend, out: outAmt, fee: feeAmt, marketPrice: px }) : null;
  const payUsd = spendToUsd({ side, amount: spend, price: px });
  const outUsd = outAmt ? (side === "buy" ? (px ? Number(outAmt) * px : null) : Number(outAmt)) : null;
  const rate = s ? rateText({ side, symbol: asset.symbol, amountIn: spend, amountOut: outAmt }) : null;
  const networkFee = needsApproval === null ? "—" : needsApproval ? `${approveCost ? nativeCostText(approveCost.toString(), info.native, nativePx && nativePx.price) : "—"} · for approval` : "None";
  const balRaw = routeBal && routeBal[chain] ? routeBal[chain][side === "buy" ? pay.symbol : "asset"] : null;
  const balTxt = chainState ? fmtAmount(fromUnits(chainState.balance, inToken.decimals), side === "buy" ? 2 : 6) : balRaw ? fmtAmount(fromUnits(balRaw, inToken.decimals), side === "buy" ? 2 : 6) : "…";

  // One button: its label explains why it's disabled.
  let btn = { label: "Continue", enabled: false };
  if (openOrder) btn = { label: "Order in progress — view", enabled: true, action: "progress" };
  else if (!RWA_TRADING_ENABLED) btn = { label: "Trading is off in this build", enabled: false };
  else if (market.status === "halted") btn = { label: "Trading paused by the issuer", enabled: false };
  else if (!market.open) btn = { label: `Market closed${closed && closed !== "Closed" ? ` · ${closed}` : ""}`, enabled: false };
  else if (!units) btn = { label: "Enter an amount", enabled: false };
  else if (err) btn = { label: "Continue", enabled: false };
  else if (!s) btn = { label: loading ? "Fetching best quote…" : "Continue", enabled: false };
  else btn = { label: "Continue", enabled: !sending };

  const onButton = () => {
    if (btn.action === "progress") {
      setCurrentId(openOrder.id);
      setProgress(true);
      return;
    }
    setSendErr(null);
    if (!quoteIsFresh(quotedAt)) {
      setSendErr("Price updated — check it and tap Continue again.");
      setNonce((n) => n + 1);
      return;
    }
    setReview(true);
  };

  const confirm = async () => {
    if (!quoteIsFresh(quotedAt)) {
      setReview(false);
      setSendErr("Price updated — check it and tap Continue again.");
      setNonce((n) => n + 1);
      return;
    }
    setSending(true);
    setLiveRec(null);
    setCurrentId(null);
    openProgressAfterReview.current = true;
    setReview(false);
    const res = await executeOrder(
      { wallet, asset, side, payToken: pay, amountUnits: units, amountText: spend, quote: result.quote, summary: s, quotedAt, groupKey: group.key },
      (rec) => {
        setLiveRec(rec);
        setCurrentId(rec.id);
      }
    );
    setSending(false);
    if (res && res.error) {
      openProgressAfterReview.current = false;
      setProgress(false);
      setSendErr(res.error);
    } else if (res && res.id) {
      setCurrentId(res.id);
      setLiveRec(res);
      if (res.stage !== "failed") {
        setUsd("");
        setMax(false);
        setResult(null);
      }
    }
  };

  const reviewRows = s
    ? [
        { label: "You pay", value: `${payUsd != null ? `${fmtUsd(payUsd)} · ` : ""}${fmtAmount(spend, 6)} ${inToken.symbol}` },
        { label: "You receive", value: `≈ ${fmtAmount(outAmt, 6)} ${outToken.symbol}${outUsd != null ? ` (${fmtUsd(outUsd)})` : ""}` },
        { label: "Minimum received", value: minAmt ? `${fmtAmount(minAmt, 6)} ${outToken.symbol}` : "—" },
        { label: "Network fee", value: networkFee },
        { label: "Network", value: info.label },
        { label: "Receiver", value: `Your wallet ${short(wallet)}` },
      ]
    : [];

  const routeOptions = [];
  evmChains.forEach((c) =>
    (payByChain[c] || []).forEach((p) => {
      const raw = routeBal && routeBal[c] ? routeBal[c][side === "buy" ? p.symbol : "asset"] : null;
      const dec = side === "buy" ? p.decimals : group.byChain[c].decimals;
      routeOptions.push({ chain: c, paySym: p.symbol, bal: raw ? fmtAmount(fromUnits(raw, dec), side === "buy" ? 2 : 6) : "0" });
    })
  );

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <RwaHeader title={title} theme={theme} onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>

        {/* You pay */}
        <View style={[styles.box, { backgroundColor: theme.cardBg }]}>
          <View style={styles.boxHead}>
            <Text style={[styles.boxLabel, { color: theme.inactiveTx }]}>{side === "buy" ? "You pay" : "You sell"}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setPicker(true)} style={styles.payWith} hitSlop={8}>
              <Text style={[styles.payWithTxt, { color: theme.headingTx }]}>
                {side === "buy" ? `${pay.symbol} · ${info.label}` : `Get ${pay.symbol} · ${info.label}`}
              </Text>
              <Icon name="chevron-down" type="ionicon" size={14} color={theme.inactiveTx} />
            </TouchableOpacity>
          </View>
          <View style={styles.amountRow}>
            <Text style={[styles.dollar, { color: usd ? theme.headingTx : theme.inactiveTx }]}>$</Text>
            <TextInput
              value={usd}
              onChangeText={(t) => {
                setMax(false);
                setUsd(cleanAmountInput(t, 2));
              }}
              placeholder="0"
              placeholderTextColor={theme.inactiveTx}
              keyboardType="decimal-pad"
              style={[styles.amountInput, { color: theme.headingTx }]}
              accessibilityLabel="Amount in US dollars"
            />
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!chainState}
              onPress={() => {
                if (!chainState) return;
                const all = fromUnits(chainState.balance, inToken.decimals);
                const v = spendToUsd({ side, amount: all, price: px });
                setMax(true);
                setUsd(v != null ? String(Math.floor(v * 100) / 100) : "");
              }}
              style={[styles.maxBtn, { borderColor: theme.buttonColor }]}
            >
              <Text style={[styles.maxTxt, { color: theme.buttonColor }]}>Max</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.boxFoot}>
            <Text style={[styles.sub, { color: theme.inactiveTx }]}>{spend ? `${fmtAmount(spend, 6)} ${inToken.symbol}` : " "}</Text>
            <Text style={[styles.sub, { color: theme.inactiveTx }]}>
              Balance {balTxt} {inToken.symbol}
            </Text>
          </View>
        </View>
        {err ? (
          <View style={styles.errRow}>
            <Text style={[styles.err, { color: theme.fail }]}>{err}</Text>
            {insufficient && side === "buy" ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate("EthSwap")}>
                <Text style={[styles.errLink, { color: theme.buttonColor }]}>Get {inToken.symbol}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* You receive */}
        <View style={[styles.box, { backgroundColor: theme.cardBg }]}>
          <Text style={[styles.boxLabel, { color: theme.inactiveTx }]}>You receive</Text>
          <View style={styles.recvRow}>
            {side === "buy" ? <RwaLogo asset={group} size={28} theme={theme} /> : null}
            {loading && !s ? (
              <View style={styles.recvTxt}>
                <Shimmer theme={theme} />
                <Text style={[styles.sub, { color: theme.inactiveTx }]}>Fetching best quote…</Text>
              </View>
            ) : (
              <View style={styles.recvTxt}>
                <Text style={[styles.recvAmt, { color: s ? theme.headingTx : theme.inactiveTx }]} numberOfLines={1}>
                  {s && outAmt ? `≈ ${fmtAmount(outAmt, 6)} ${outToken.symbol}` : `0 ${outToken.symbol}`}
                </Text>
                {s && outUsd != null ? <Text style={[styles.sub, { color: theme.inactiveTx }]}>{fmtUsd(outUsd)}</Text> : null}
              </View>
            )}
          </View>
        </View>
        {result && !result.ok ? (
          <Text style={[styles.err, styles.errPad, { color: theme.fail }]}>
            {result.error.text}
          </Text>
        ) : null}

        {s ? (
          <>
            <View style={styles.rateRow}>
              <Text style={[styles.rate, { color: theme.inactiveTx }]}>{rate}</Text>
              {loading ? <ActivityIndicator size="small" color={theme.inactiveTx} /> : null}
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={styles.dHead}>
              <Text style={[styles.dHeadTxt, { color: theme.inactiveTx }]}>Details</Text>
              <Icon name={details ? "chevron-up" : "chevron-down"} type="ionicon" size={16} color={theme.inactiveTx} />
            </TouchableOpacity>
            {details ? (
              <View style={[styles.dBox, { backgroundColor: theme.cardBg }]}>
                <Detail theme={theme} label="Minimum received" value={minAmt ? `${fmtAmount(minAmt, 6)} ${outToken.symbol}` : "—"} />
                <Detail theme={theme} label="Network fee" value={networkFee} />
                <Detail
                  theme={theme}
                  label="Provider fee"
                  value={fig && fig.feePct != null && Number(feeAmt) > 0 ? `${fig.feePct.toFixed(2)}% · included in the price` : "None"}
                />
                <Detail
                  theme={theme}
                  label="Network"
                  value={`${info.label}${smallEthOrder(chain, payUsd) ? " · costs more for small orders" : ""}`}
                  color={smallEthOrder(chain, payUsd) ? theme.warn : undefined}
                />
                <Detail theme={theme} label="Provider" value="1inch" />
              </View>
            ) : null}
          </>
        ) : null}

        {sendErr ? <Text style={[styles.err, styles.errPad, { color: theme.fail }]}>{sendErr}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.bg }]}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!btn.enabled}
          onPress={onButton}
          style={[styles.btn, { backgroundColor: theme.buttonColor, opacity: btn.enabled ? 1 : 0.45 }]}
        >
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnTxt}>{btn.label}</Text>}
        </TouchableOpacity>
      </View>

      <Modal isVisible={picker} onBackdropPress={() => setPicker(false)} onBackButtonPress={() => setPicker(false)} style={styles.modal} useNativeDriverForBackdrop>
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <Text style={[styles.sheetTitle, { color: theme.headingTx }]}>{side === "buy" ? "Pay with" : "Receive"}</Text>
          {routeOptions.map((o) => {
            const sel = o.chain === chain && o.paySym === pay.symbol;
            return (
              <TouchableOpacity
                key={`${o.chain}-${o.paySym}`}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                onPress={() => {
                  setRoute({ chain: o.chain, paySym: o.paySym });
                  setMax(false);
                  setPicker(false);
                }}
                style={[styles.opt, { backgroundColor: sel ? theme.cardBg : "transparent" }]}
              >
                <View style={styles.optMid}>
                  <Text style={[styles.optTitle, { color: theme.headingTx }]}>{o.paySym}</Text>
                  <Text style={[styles.sub, { color: theme.inactiveTx }]}>{CHAIN_INFO[o.chain].label}</Text>
                </View>
                <Text style={[styles.sub, { color: theme.inactiveTx }]}>
                  {side === "buy" ? `${o.bal} ${o.paySym}` : `${o.bal} ${group.symbol}`}
                </Text>
                {sel ? <Icon name="checkmark" type="ionicon" size={18} color={theme.buttonColor} style={styles.optCheck} /> : null}
              </TouchableOpacity>
            );
          })}
          {group.issuer === "ondo" ? <Text style={[styles.sub, styles.optNote, { color: theme.inactiveTx }]}>Ondo stocks trade with USDC only.</Text> : null}
        </View>
      </Modal>

      <ReviewSheet
        visible={review}
        theme={theme}
        busy={false}
        title={title}
        onCancel={() => setReview(false)}
        onConfirm={confirm}
        onModalHide={() => {
          if (openProgressAfterReview.current) {
            openProgressAfterReview.current = false;
            setProgress(true);
          }
        }}
        confirmLabel="Confirm swap"
        warning={smallEthOrder(chain, payUsd) ? "Ethereum network fees are high for small orders." : null}
        rows={reviewRows}
      />
      <ProgressSheet
        visible={progress && !!progressRec}
        record={progressRec}
        theme={theme}
        onClose={() => setProgress(false)}
        onViewBalance={() => {
          setProgress(false);
          navigation.navigate("RwaAsset", { key: group.key });
        }}
      />
    </View>
  );
};

export default RwaTrade;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 120 },
  loadingBig: { marginTop: 40 },
  box: { marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 14 },
  boxHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  boxLabel: { fontSize: 13 },
  payWith: { flexDirection: "row", alignItems: "center" },
  payWithTxt: { fontSize: 13, fontWeight: "700", marginRight: 4 },
  amountRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  dollar: { fontSize: 32, fontWeight: "700", marginRight: 2 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: "700", paddingVertical: 0 },
  maxBtn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  maxTxt: { fontSize: 13, fontWeight: "700" },
  boxFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  sub: { fontSize: 12 },
  errRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 20, marginTop: 6 },
  err: { fontSize: 13, fontWeight: "600" },
  errPad: { marginHorizontal: 20, marginTop: 6 },
  errLink: { fontSize: 13, fontWeight: "700" },
  recvRow: { flexDirection: "row", alignItems: "center", marginTop: 8, minHeight: 44 },
  recvTxt: { flex: 1, marginLeft: 10 },
  recvAmt: { fontSize: 22, fontWeight: "700" },
  shimmer: { height: 20, borderRadius: 6, marginBottom: 6 },
  rateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 20, marginTop: 12 },
  rate: { fontSize: 13 },
  dHead: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginTop: 8, paddingVertical: 6 },
  dHeadTxt: { fontSize: 13, fontWeight: "600", marginRight: 4 },
  dBox: { marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  dRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  dLabel: { fontSize: 13, marginRight: 10 },
  dValue: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  btn: { minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  btnTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" },
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 26 },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8, marginLeft: 4 },
  opt: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 12 },
  optMid: { flex: 1 },
  optTitle: { fontSize: 15, fontWeight: "700" },
  optCheck: { marginLeft: 8 },
  optNote: { marginTop: 8, marginLeft: 4 },
});
