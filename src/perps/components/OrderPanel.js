import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Modal from "react-native-modal";
import Icon from "../../icon";
import {
  buildEntryOrder,
  buildTpSlOrders,
  estimateFee,
  DEFAULT_TAKER_FEE_RATE,
} from "../utils/orderMath";
import { gt, isPositive, toPlain, roundToStep, mul, floorToStep } from "../utils/decimal";
import { formatNumber } from "../utils/format";
import { friendlyAsterError } from "../utils/asterErrors";
import {
  openPosition,
  fetchPositions,
  fetchMultiAssetsMode,
  setMultiAssetsMode,
} from "../api/asterTrade";
import { formatPrice } from "../utils/format";
import CoinLogo from "./CoinLogo";
import { ensureFreshMarketMeta, getCachedMarketMeta, ORDER_RULE_FIELDS } from "../api/asterPublic";

const RULES_MAX_AGE_MS = 60 * 60 * 1000; // refetch exchangeInfo before an order if older than 1h
import CustomInfoProvider from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";

const DEFAULT_LEVERAGE = 5;

const Segmented = ({ options, value, onChange, theme }) => (
  <View style={[styles.segment, { backgroundColor: theme.cardBg }]}>
    {options.map((o) => {
      const selected = o.value === value;
      return (
        <TouchableOpacity
          key={o.value}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => onChange(o.value)}
          style={[styles.segmentBtn, selected && { backgroundColor: theme.buttonColor }]}
        >
          <Text style={[styles.segmentTxt, { color: selected ? "#FFFFFF" : theme.inactiveTx }]}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const Field = ({ label, value, onChangeText, placeholder, theme, suffix, right }) => (
  <View style={styles.fieldWrap}>
    <Text style={[styles.fieldLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <View style={[styles.field, { backgroundColor: theme.cardBg }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.inactiveTx}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.headingTx }]}
      />
      {suffix ? <Text style={[styles.suffix, { color: theme.inactiveTx }]}>{suffix}</Text> : null}
      {right}
    </View>
  </View>
);

const Row = ({ label, value, theme, valueColor }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.rowValue, { color: valueColor || theme.headingTx }]}>{value}</Text>
  </View>
);

// Digits + one dot (comma accepted as dot), max 8 decimals.
const cleanInput = (t) =>
  t.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,8}).*$/, "$1");

// Trade form shown on PerpsMarket once trading is enabled.
const OrderPanel = ({ theme, symbol, baseAsset, meta, markPrice, maxLeverage, agentState, account, onPlaced }) => {
  const { agent, user } = agentState;
  const [type, setType] = useState("MARKET");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState(Math.min(DEFAULT_LEVERAGE, maxLeverage));
  const [marginType, setMarginType] = useState("ISOLATED");
  const [showDetails, setShowDetails] = useState(false);
  const [tpslOn, setTpslOn] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [confirm, setConfirm] = useState(null); // direction being confirmed
  const [submitting, setSubmitting] = useState(false);
  // What Aster has now for this market (leverage, margin type, whether a position is open).
  const [server, setServer] = useState({ leverage: null, marginType: null, hasPosition: false });
  const [serverTick, setServerTick] = useState(0);
  // True once Aster answered (or failed) for this market's leverage / margin / position, so the
  // pre-warnings below never run on defaults. The form itself is usable right away.
  const [serverLoaded, setServerLoaded] = useState(false);
  const [multiAssets, setMultiAssets] = useState(null); // account Multi-Assets mode (null = unknown)
  const marginTouchedRef = useRef(false);
  const leverageTouchedRef = useRef(false);
  const changeLeverage = (fn) => {
    leverageTouchedRef.current = true;
    setLeverage(fn);
  };

  useEffect(() => {
    setLeverage((l) => Math.min(Math.max(1, l), maxLeverage));
  }, [maxLeverage]);

  // Multi-Assets mode forbids Isolated margin: default to Cross there (unless the user chose).
  useEffect(() => {
    let cancelled = false;
    if (!agent || !user) return undefined;
    fetchMultiAssetsMode(agent, user).then((res) => {
      if (cancelled || res.error || !res.data) return;
      const on = res.data.multiAssetsMargin === true || res.data.multiAssetsMargin === "true";
      setMultiAssets(on);
      if (on && !marginTouchedRef.current) setMarginType("CROSSED");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, user]);

  const chooseMarginType = (value) => {
    marginTouchedRef.current = true;
    if (value === "ISOLATED" && multiAssets) {
      CustomInfoProvider.show(
        "info",
        "Switch to Single-Asset mode?",
        "Isolated margin isn't available while your Aster account uses Multi-Assets mode. Switch the account to Single-Asset mode (USDT margin only)? This applies to all markets.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Switch",
            onPress: async () => {
              const res = await setMultiAssetsMode(agent, user, false);
              if (res.error) {
                CustomInfoProvider.show("error", "Couldn't switch mode", friendlyAsterError(res));
                return;
              }
              setMultiAssets(false);
              setMarginType("ISOLATED");
            },
          },
        ]
      );
      return;
    }
    setMarginType(value);
  };

  // Current leverage / margin type on Aster (needs a deposit; unknown => we apply ours).
  useEffect(() => {
    let cancelled = false;
    if (!agent || !user) return undefined;
    fetchPositions(agent, user, symbol).then((res) => {
      if (cancelled) return;
      setServerLoaded(true);
      if (res.error) return;
      const p = (Array.isArray(res.data) ? res.data : [res.data]).find((x) => x && x.symbol === symbol);
      if (p) {
        const serverLev = Number(p.leverage) || null;
        const serverMargin = p.marginType
          ? String(p.marginType).toLowerCase() === "cross"
            ? "CROSSED"
            : "ISOLATED"
          : null;
        setServer({
          leverage: serverLev,
          marginType: serverMargin,
          hasPosition: Number(p.positionAmt) !== 0,
        });
        // Start from what Aster has for this market unless the user already changed it.
        if (serverLev && !leverageTouchedRef.current) setLeverage(Math.min(serverLev, maxLeverage));
        if (serverMargin && !marginTouchedRef.current) setMarginType(serverMargin);
      }
    });
    return () => {
      cancelled = true;
    };
    // maxLeverage changes are handled by the clamp effect above; re-fetching here is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, user, symbol, serverTick]);

  const switchType = (t) => {
    setType(t);
    if (t === "LIMIT" && !limitPrice && isPositive(toPlain(markPrice)) && meta.tickSize) {
      setLimitPrice(roundToStep(toPlain(markPrice), meta.tickSize));
    }
  };

  const preview = useMemo(
    () =>
      buildEntryOrder({
        symbol,
        direction: "LONG",
        type,
        margin: amount,
        leverage,
        markPrice,
        limitPrice,
        meta,
      }),
    [symbol, type, amount, leverage, markPrice, limitPrice, meta]
  );

  const available = account && account.available !== undefined ? account.available : null;
  let blockReason = null;
  if (!serverLoaded) blockReason = "Loading your settings for this market…";
  else if (!amount) blockReason = "Enter an amount";
  else if (!preview.ok) blockReason = preview.error;
  else if (account && account.noDeposit) blockReason = "Deposit USDT to start trading";
  else if (available !== null && gt(preview.marginUsed, available)) blockReason = "Not enough available balance";
  else if (server.hasPosition && server.marginType && marginType !== server.marginType)
    blockReason = `Close your ${baseAsset} position before changing margin mode`;
  else if (server.hasPosition && server.marginType === "ISOLATED" && server.leverage && leverage < server.leverage)
    blockReason = `Leverage can't be lowered below ${server.leverage}x while an isolated position is open`;

  const entryForTpSl = type === "LIMIT" ? preview.price : toPlain(markPrice);
  const tpslCheck = (direction) =>
    tpslOn
      ? buildTpSlOrders({ symbol, direction, entryPrice: entryForTpSl, tp, sl, tickSize: meta.tickSize })
      : { ok: true, errors: [], orders: [] };

  const openConfirm = (direction) => {
    if (blockReason) return;
    const check = tpslCheck(direction);
    if (!check.ok) {
      CustomInfoProvider.show("error", "Check TP / SL", check.errors.join("\n"));
      return;
    }
    setConfirm(direction);
  };

  const confirmOrder = confirm
    ? buildEntryOrder({ symbol, direction: confirm, type, margin: amount, leverage, markPrice, limitPrice, meta })
    : null;
  // The order recomputes with the live mark price; if that makes it invalid, close the sheet.
  useEffect(() => {
    if (confirm && confirmOrder && !confirmOrder.ok && !submitting) setConfirm(null);
  }, [confirm, confirmOrder, submitting]);
  const confirmTpSl = confirm ? tpslCheck(confirm) : null;

  const submit = async () => {
    if (!confirmOrder || !confirmOrder.ok || submitting) return;
    setSubmitting(true);
    // Never trade on stale rules: if the saved exchangeInfo is older than 1h, refetch it first.
    // If the rules for this market changed, stop so the user re-checks the recalculated order.
    const fresh = await ensureFreshMarketMeta(RULES_MAX_AGE_MS);
    if (!fresh.ok) {
      setSubmitting(false);
      CustomInfoProvider.show(
        "error",
        "Order not placed",
        "Couldn't refresh this market's trading rules. Check your connection and try again."
      );
      return;
    }
    if (fresh.refreshed) {
      const latest = (getCachedMarketMeta() || {})[symbol];
      const changed =
        !latest || ORDER_RULE_FIELDS.some((k) => String(latest[k]) !== String(meta[k]));
      if (changed) {
        setSubmitting(false);
        setConfirm(null);
        CustomInfoProvider.show(
          "info",
          "Market rules updated",
          latest
            ? "This market's trading rules changed. Please check your order and confirm again."
            : `${symbol} is not available for trading right now.`
        );
        return;
      }
    }
    const res = await openPosition({
      agent,
      user,
      symbol,
      entryParams: confirmOrder.params,
      tpSlOrders: confirmTpSl ? confirmTpSl.orders : [],
      leverage,
      leverageChanged: server.leverage !== leverage,
      marginType,
      marginTypeChanged: server.marginType !== marginType,
    });
    setSubmitting(false);
    setConfirm(null);
    setServerTick((t) => t + 1); // re-read leverage / margin / position from Aster
    if (res.agentInvalid && agentState.onInvalid) agentState.onInvalid();
    if (!res.ok) {
      CustomInfoProvider.show("error", "Order not placed", friendlyAsterError(res));
      return;
    }
    const failed = (res.tpsl || []).filter((x) => !x.ok);
    CustomInfoProvider.show(
      failed.length ? "info" : "success",
      failed.length ? "Order placed — TP/SL failed" : "Order placed",
      failed.length
        ? `${failed.map((f) => `${f.type}: ${friendlyAsterError(f)}`).join("\n")}\nSet TP/SL again from your position.`
        : type === "LIMIT"
        ? `Limit ${confirm === "LONG" ? "buy" : "sell"} ${confirmOrder.qty} ${baseAsset} at $${formatPrice(confirmOrder.price, meta.tickSize)} placed. If the price is already there it fills right away; otherwise it waits in Open orders.`
        : `${confirm === "LONG" ? "Long" : "Short"} ${confirmOrder.qty} ${baseAsset} opened at market.`
    );
    setAmount("");
    if (onPlaced) onPlaced();
  };

  const setMax = () => {
    if (available === null || !isPositive(available)) return;
    // keep a little room for fees: 98% of available, 2 decimals
    setAmount(floorToStep(mul(available, "0.98"), "0.01"));
  };

  return (
    <View style={styles.wrap}>
      <Segmented
        theme={theme}
        value={type}
        onChange={switchType}
        options={[
          { value: "MARKET", label: "Market" },
          { value: "LIMIT", label: "Limit" },
        ]}
      />
      {type === "LIMIT" ? (
        <Field
          theme={theme}
          label="Limit price"
          value={limitPrice}
          onChangeText={(t) => setLimitPrice(cleanInput(t))}
          placeholder="0.00"
          suffix="USDT"
        />
      ) : null}
      <Field
        theme={theme}
        label={`Amount (margin) · Available ${available !== null ? `$${formatNumber(available, 2)}` : "…"}`}
        value={amount}
        onChangeText={(t) => setAmount(cleanInput(t))}
        placeholder="0.00"
        suffix="USDT"
        right={
          <TouchableOpacity onPress={setMax} style={styles.maxBtn}>
            <Text style={[styles.maxTxt, { color: theme.buttonColor }]}>Max</Text>
          </TouchableOpacity>
        }
      />
      <Text style={[styles.sizeLine, { color: theme.inactiveTx }]}>
        {preview.ok
          ? `Position size ≈ $${formatNumber(preview.notional, 2)} = ${preview.qty} ${baseAsset} (amount × ${leverage}x)`
          : `Position size = amount × ${leverage}x`}
      </Text>
      {preview.ok && gt(amount, mul(preview.marginUsed, "1.01")) ? (
        <Text style={[styles.sizeLine, { color: theme.warn }]}>
          {`Rounded down to ${meta.stepSize} ${baseAsset} steps: margin used $${formatNumber(preview.marginUsed, 2)} of $${amount}`}
        </Text>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setShowDetails(!showDetails)}
        style={[styles.detailsRow, { borderColor: theme.smallCardBorderColor }]}
      >
        <Text style={[styles.detailsTxt, { color: theme.headingTx }]}>
          Details · {leverage}x · {marginType === "ISOLATED" ? "Isolated" : "Cross"}
        </Text>
        <Icon name={showDetails ? "chevron-up" : "chevron-down"} type="ionicon" size={18} color={theme.inactiveTx} />
      </TouchableOpacity>
      {showDetails ? (
        <View style={styles.details}>
          <Text style={[styles.fieldLabel, { color: theme.inactiveTx }]}>Leverage (max {maxLeverage}x)</Text>
          <View style={styles.stepper}>
            {[-5, -1].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => changeLeverage((l) => Math.max(1, l + d))}
                style={[styles.stepBtn, { backgroundColor: theme.cardBg }]}
              >
                <Text style={[styles.stepTxt, { color: theme.headingTx }]}>{d}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.levValue, { color: theme.headingTx }]}>{leverage}x</Text>
            {[1, 5].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => changeLeverage((l) => Math.min(maxLeverage, l + d))}
                style={[styles.stepBtn, { backgroundColor: theme.cardBg }]}
              >
                <Text style={[styles.stepTxt, { color: theme.headingTx }]}>+{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { color: theme.inactiveTx, marginTop: 10 }]}>Margin mode</Text>
          <Segmented
            theme={theme}
            value={marginType}
            onChange={chooseMarginType}
            options={[
              { value: "ISOLATED", label: "Isolated" },
              { value: "CROSSED", label: "Cross" },
            ]}
          />
          {multiAssets ? (
            <Text style={[styles.sizeLine, { color: theme.inactiveTx }]}>
              Account is in Multi-Assets mode: Cross margin only (Isolated needs Single-Asset mode).
            </Text>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity accessibilityRole="switch" onPress={() => setTpslOn(!tpslOn)} style={styles.tpslToggle}>
        <Icon
          name={tpslOn ? "checkbox" : "square-outline"}
          type="ionicon"
          size={20}
          color={tpslOn ? theme.buttonColor : theme.inactiveTx}
        />
        <Text style={[styles.detailsTxt, { color: theme.headingTx, marginLeft: 8 }]}>Take profit / Stop loss</Text>
      </TouchableOpacity>
      {tpslOn ? (
        <View style={styles.tpslRow}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Field theme={theme} label="TP price" value={tp} onChangeText={(t) => setTp(cleanInput(t))} placeholder="Optional" />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Field theme={theme} label="SL price" value={sl} onChangeText={(t) => setSl(cleanInput(t))} placeholder="Optional" />
          </View>
        </View>
      ) : null}

      {amount && blockReason ? <Text style={[styles.block, { color: theme.fail }]}>{blockReason}</Text> : null}

      <View style={styles.tradeBtns}>
        {[
          { dir: "LONG", label: "Long", color: theme.success },
          { dir: "SHORT", label: "Short", color: theme.fail },
        ].map((b) => (
          <TouchableOpacity
            key={b.dir}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!blockReason }}
            disabled={!!blockReason}
            onPress={() => openConfirm(b.dir)}
            style={[styles.tradeBtn, { backgroundColor: b.color, opacity: blockReason ? 0.45 : 1 }]}
          >
            <Text style={styles.tradeTxt}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        isVisible={!!confirm}
        onBackdropPress={() => !submitting && setConfirm(null)}
        onBackButtonPress={() => !submitting && setConfirm(null)}
        style={styles.modal}
        useNativeDriverForBackdrop
      >
        {confirmOrder && confirmOrder.ok ? (
          <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
            <View style={styles.sheetTitleRow}>
              <CoinLogo asset={baseAsset} size={28} theme={theme} style={styles.sheetLogo} />
              <Text style={[styles.sheetTitle, styles.sheetTitleInRow, { color: confirm === "LONG" ? theme.success : theme.fail }]}>
                {confirm === "LONG" ? "Long" : "Short"} {baseAsset}
              </Text>
            </View>
            <Row theme={theme} label="Market" value={`${symbol} perpetual`} />
            <Row theme={theme} label="Order type" value={type === "MARKET" ? "Market" : `Limit @ $${confirmOrder.price}`} />
            <Row theme={theme} label="Size" value={`${confirmOrder.qty} ${baseAsset} ($${formatNumber(confirmOrder.notional, 2)})`} />
            <Row theme={theme} label="Est. entry price" value={`$${formatPrice(confirmOrder.price, meta.tickSize)}`} />
            <Row theme={theme} label="Leverage" value={`${leverage}x`} />
            <Row theme={theme} label="Margin mode" value={marginType === "ISOLATED" ? "Isolated" : "Cross"} />
            <Row theme={theme} label="Margin used" value={`$${formatNumber(confirmOrder.marginUsed, 2)}`} />
            <Row
              theme={theme}
              label="TP / SL"
              value={
                confirmTpSl && confirmTpSl.orders.length
                  ? confirmTpSl.orders
                      .map((o) => `${o.type === "STOP_MARKET" ? "SL" : "TP"} $${o.stopPrice}`)
                      .join(" · ")
                  : "None"
              }
            />
            <Row
              theme={theme}
              label={`Est. fee (${mul(DEFAULT_TAKER_FEE_RATE, "100")}%)`}
              value={`$${formatNumber(estimateFee(confirmOrder.notional), 4)}`}
            />
            <Text style={[styles.risk, { color: theme.warn }]}>
              Leverage magnifies losses. You can lose all of the margin used for this position.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={submitting}
              onPress={submit}
              style={[styles.confirmBtn, { backgroundColor: confirm === "LONG" ? theme.success : theme.fail }]}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.tradeTxt}>Confirm</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={submitting} onPress={() => setConfirm(null)} style={styles.cancelBtn}>
              <Text style={[styles.cancelTxt, { color: theme.inactiveTx }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View />
        )}
      </Modal>
    </View>
  );
};

export default OrderPanel;

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 14 },
  segment: { flexDirection: "row", borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  segmentTxt: { fontSize: 14, fontWeight: "600" },
  fieldWrap: { marginTop: 12 },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, height: 48 },
  input: { flex: 1, fontSize: 17, fontWeight: "600", paddingVertical: 0 },
  suffix: { fontSize: 14, marginLeft: 6 },
  maxBtn: { marginLeft: 10, paddingVertical: 6, paddingHorizontal: 4 },
  maxTxt: { fontSize: 14, fontWeight: "700" },
  sizeLine: { fontSize: 12, marginTop: 8 },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailsTxt: { fontSize: 14, fontWeight: "600" },
  details: { paddingTop: 10 },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginRight: 6 },
  stepTxt: { fontSize: 14, fontWeight: "700" },
  levValue: { fontSize: 18, fontWeight: "800", minWidth: 56, textAlign: "center", marginRight: 6 },
  tpslToggle: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  tpslRow: { flexDirection: "row" },
  block: { fontSize: 13, marginTop: 10 },
  tradeBtns: { flexDirection: "row", marginTop: 14 },
  tradeBtn: { flex: 1, alignItems: "center", paddingVertical: 15, borderRadius: 14, marginHorizontal: 4 },
  tradeTxt: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginBottom: 12 },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  sheetTitleInRow: { marginBottom: 0, flexShrink: 1 },
  sheetLogo: { marginRight: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  risk: { fontSize: 12, marginTop: 10 },
  confirmBtn: { marginTop: 14, alignItems: "center", paddingVertical: 15, borderRadius: 14, minHeight: 50 },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelTxt: { fontSize: 15, fontWeight: "600" },
});
