import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { unrealizedPnl } from "../utils/orderMath";
import { gt, div, isPositive, sub, toPlain } from "../utils/decimal";
import { formatNumber, formatPrice } from "../utils/format";
import { getCachedMarketMeta } from "../api/asterPublic";

const metaOf = (symbol) => (getCachedMarketMeta() || {})[symbol] || {};

const absStr = (v) => (gt(v, "0") ? toPlain(v) : sub("0", v));

const PositionRow = ({ p, mark, theme, onClose }) => {
  const meta = metaOf(p.symbol);
  const isLong = gt(p.positionAmt, "0");
  const lev = Number(p.leverage) || null;
  const markPrice = mark !== undefined ? mark : p.markPrice;
  const notional = absStr(p.notional || "0");
  const margin = isPositive(p.isolatedWallet)
    ? p.isolatedWallet
    : lev && isPositive(notional)
    ? div(notional, String(lev))
    : null;
  const { pnl, pct } = unrealizedPnl({ positionAmt: p.positionAmt, entryPrice: p.entryPrice, markPrice, margin });
  const rawPnl = pnl !== null ? Number(pnl) : 0;
  const pnlNum = Math.abs(rawPnl) < 0.005 ? 0 : rawPnl; // avoid a red "-$0.00"
  const pnlColor = pnlNum > 0 ? theme.success : pnlNum < 0 ? theme.fail : theme.inactiveTx;
  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
      <View style={styles.headRow}>
        <Text style={[styles.symbol, { color: theme.headingTx }]}>{meta.baseAsset || p.symbol}</Text>
        <View style={[styles.tag, { backgroundColor: isLong ? theme.success : theme.fail }]}>
          <Text style={styles.tagTxt}>
            {isLong ? "Long" : "Short"}
            {lev ? ` ${lev}x` : ""}
          </Text>
        </View>
        <Text style={[styles.mode, { color: theme.inactiveTx }]}>
          {String(p.marginType || "").toLowerCase() === "cross" ? "Cross" : "Isolated"}
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onClose(p)}
          style={[styles.closeBtn, { borderColor: theme.fail }]}
        >
          <Text style={[styles.closeTxt, { color: theme.fail }]}>Close</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        <Cell theme={theme} label="Size" value={`${absStr(p.positionAmt)} ${meta.baseAsset || ""}`} />
        <Cell theme={theme} label="Entry" value={`$${formatPrice(p.entryPrice, meta.tickSize)}`} />
        <Cell theme={theme} label="Mark" value={`$${formatPrice(markPrice, meta.tickSize)}`} />
      </View>
      <View style={styles.grid}>
        <Cell
          theme={theme}
          label="Liq. price"
          value={isPositive(p.liquidationPrice) ? `$${formatPrice(p.liquidationPrice, meta.tickSize)}` : "—"}
        />
        <Cell
          theme={theme}
          label="Unrealized PnL"
          color={pnlColor}
          value={pnl !== null ? `${pnlNum >= 0 ? "+" : "-"}$${formatNumber(Math.abs(pnlNum), 2)}` : "—"}
        />
        <Cell
          theme={theme}
          label="ROE"
          color={pnlColor}
          value={
            pct !== null
              ? Math.abs(Number(pct)) < 0.005
                ? "0.00%"
                : `${Number(pct) >= 0 ? "+" : ""}${formatNumber(pct, 2)}%`
              : "—"
          }
        />
      </View>
    </View>
  );
};

const Cell = ({ label, value, theme, color }) => (
  <View style={styles.cell}>
    <Text style={[styles.cellLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.cellValue, { color: color || theme.headingTx }]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const orderLabel = (o) => {
  const t = o.type || o.origType;
  if (t === "TAKE_PROFIT_MARKET") return "Take profit";
  if (t === "STOP_MARKET") return "Stop loss";
  if (t === "LIMIT") return "Limit";
  return t;
};

const OrderRow = ({ o, theme, onCancel }) => {
  const meta = metaOf(o.symbol);
  const isBuy = o.side === "BUY";
  const trigger = isPositive(o.stopPrice) ? o.stopPrice : null;
  return (
    <View style={[styles.orderRow, { backgroundColor: theme.cardBg }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.orderTitle, { color: theme.headingTx }]}>
          {meta.baseAsset || o.symbol} · {orderLabel(o)}{" "}
          <Text style={{ color: isBuy ? theme.success : theme.fail }}>{isBuy ? "Buy" : "Sell"}</Text>
        </Text>
        <Text style={[styles.orderSub, { color: theme.inactiveTx }]}>
          {trigger ? `Trigger $${formatPrice(trigger, meta.tickSize)}` : `Price $${formatPrice(o.price, meta.tickSize)}`}
          {o.closePosition ? " · closes position" : isPositive(o.origQty) ? ` · ${o.origQty} ${meta.baseAsset || ""}` : ""}
        </Text>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={() => onCancel(o)} style={styles.cancelBtn}>
        <Text style={[styles.cancelTxt, { color: theme.buttonColor }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

// Positions + open orders on the Perps tab.
const PositionsSection = ({ theme, positions, openOrders, marks, onClosePosition, onCancelOrder }) => {
  if (!positions.length && !openOrders.length) return null;
  return (
    <View style={styles.wrap}>
      {positions.length ? (
        <>
          <Text style={[styles.title, { color: theme.headingTx }]}>Positions</Text>
          {positions.map((p) => (
            <PositionRow
              key={`${p.symbol}-${p.positionSide}`}
              p={p}
              mark={marks[p.symbol]}
              theme={theme}
              onClose={onClosePosition}
            />
          ))}
        </>
      ) : null}
      {openOrders.length ? (
        <>
          <Text style={[styles.title, { color: theme.headingTx }]}>Open orders</Text>
          {openOrders.map((o) => (
            <OrderRow key={String(o.orderId)} o={o} theme={theme} onCancel={onCancelOrder} />
          ))}
        </>
      ) : null}
    </View>
  );
};

export default PositionsSection;

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  title: { fontSize: 18, fontWeight: "700", marginHorizontal: 19, marginTop: 14, marginBottom: 8 },
  card: { marginHorizontal: 12, marginBottom: 8, borderRadius: 16, padding: 14 },
  headRow: { flexDirection: "row", alignItems: "center" },
  symbol: { fontSize: 16, fontWeight: "700" },
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 8 },
  tagTxt: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  mode: { fontSize: 12, marginLeft: 8 },
  closeBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  closeTxt: { fontSize: 13, fontWeight: "700" },
  grid: { flexDirection: "row", marginTop: 10 },
  cell: { flex: 1 },
  cellLabel: { fontSize: 11 },
  cellValue: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  orderRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginBottom: 8, borderRadius: 14, padding: 12 },
  orderTitle: { fontSize: 14, fontWeight: "600" },
  orderSub: { fontSize: 12, marginTop: 3 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  cancelTxt: { fontSize: 14, fontWeight: "700" },
});
