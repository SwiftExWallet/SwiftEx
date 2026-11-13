import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  SectionList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
  StatusBar,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import Icon from "../../icon";
import CoinLogo from "./CoinLogo";
import { shortHash, hhmm } from "./WithdrawStatusCard";
import { chainById, txUrl, displayName } from "../api/asterAssets";
import { usePerpsHistory } from "../hooks/usePerpsHistory";
import { fetchTradesAround } from "../api/asterHistory";
import { useDepositTracker, isDepositActive } from "../storage/depositTracker";
import { add, isValid, toPlain } from "../utils/decimal";
import { formatNumber, formatAmount } from "../utils/format";
import { friendlyAsterError } from "../utils/asterErrors";

const DAY = 24 * 60 * 60 * 1000;
const PERIODS = [
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "All", days: null }, // as far back as Aster has data (row paging on scroll)
];
const TABS = ["Trades", "Funding & Fees", "Transfers"];
const TRADE_TYPES = ["REALIZED_PNL", "COMMISSION"];
const TRANSFER_TYPES = ["DEPOSIT", "WITHDRAW", "TRANSFER", "INTERNAL_TRANSFER", "CROSS_COLLATERAL_TRANSFER"];
const TYPE_LABEL = {
  FUNDING_FEE: "Funding",
  COMMISSION: "Trading fee",
  INSURANCE_CLEAR: "Liquidation clearance",
  WELCOME_BONUS: "Bonus",
  REFERRAL_KICKBACK: "Referral reward",
  COMMISSION_REBATE: "Fee rebate",
  MARKET_MAKER_REBATE: "Maker rebate",
  API_REBATE: "Rebate",
  CONTEST_REWARD: "Reward",
  AUTO_EXCHANGE: "Auto exchange",
  MARKET_MERCHANT_RETURN_REWARD: "Reward",
};

const baseOf = (symbol) => String(symbol || "").replace(/USDT$|USD1$|USDC$/, "") || "?";
const signed = (v, d = 4) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return `${formatNumber(0, 2)}`;
  return `${n > 0 ? "+" : "−"}${formatNumber(Math.abs(n), d)}`;
};
const dayLabel = (t) => {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(Date.now() - DAY);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const groupByDay = (list) => {
  const out = [];
  list.forEach((it) => {
    const title = dayLabel(it.time);
    const last = out[out.length - 1];
    if (last && last.title === title) last.data.push(it);
    else out.push({ title, data: [it] });
  });
  return out;
};

// Fills (income rows by symbol+tradeId) -> trades (fills of one symbol within 1s).
const buildTrades = (items) => {
  const fills = new Map();
  items.forEach((it) => {
    if (!TRADE_TYPES.includes(it.type) || !it.symbol) return;
    const k = `${it.symbol}|${it.tradeId || it.tranId}`;
    const f = fills.get(k) || { symbol: it.symbol, tradeId: it.tradeId, time: it.time, pnl: "0", fee: "0", hasPnl: false };
    if (it.type === "REALIZED_PNL") {
      f.pnl = add(f.pnl, it.income);
      f.hasPnl = true;
    } else f.fee = add(f.fee, it.income);
    f.time = Math.max(f.time, it.time);
    fills.set(k, f);
  });
  const sorted = Array.from(fills.values()).sort((a, b) => b.time - a.time);
  const trades = [];
  sorted.forEach((f) => {
    const last = trades[trades.length - 1];
    if (last && last.symbol === f.symbol && last.time - f.time <= 1000) {
      last.pnl = add(last.pnl, f.pnl);
      last.fee = add(last.fee, f.fee);
      last.hasPnl = last.hasPnl || f.hasPnl;
      last.tradeIds.push(f.tradeId);
      last.minTime = f.time;
    } else {
      trades.push({ ...f, key: `${f.symbol}|${f.tradeId}|${f.time}`, tradeIds: [f.tradeId], minTime: f.time });
    }
  });
  return trades;
};

const Chip = ({ theme, label, active, onPress, left }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ selected: !!active }}
    onPress={onPress}
    style={[
      styles.chip,
      { backgroundColor: active ? theme.buttonColor : theme.cardBg, borderColor: active ? theme.buttonColor : theme.cardBg },
    ]}
  >
    {left}
    <Text style={[styles.chipTxt, { color: active ? "#FFFFFF" : theme.headingTx }]}>{label}</Text>
  </TouchableOpacity>
);

const TxLine = ({ theme, hash, chainId }) =>
  hash ? (
    <View style={styles.txLine}>
      <Text style={[styles.txHash, { color: theme.inactiveTx }]}>{shortHash(hash)}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Copy transaction hash"
        onPress={() => Clipboard.setString(hash)}
        style={styles.txBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon type="ionicon" name="copy-outline" size={14} color={theme.inactiveTx} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="link"
        onPress={() => Linking.openURL(txUrl(chainId || 56, hash))}
        style={styles.txBtn}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      >
        <Text style={[styles.link, { color: theme.buttonColor }]}>View on {chainById(chainId || 56).explorerName}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

const Skeleton = ({ theme }) => (
  <View style={styles.pad}>
    {[0, 1, 2, 3, 4].map((i) => (
      <View key={i} style={[styles.skelRow, { backgroundColor: theme.cardBg }]}>
        <View style={[styles.skelDot, { backgroundColor: theme.inactiveTx }]} />
        <View style={styles.flex}>
          <View style={[styles.skelLine, { width: "45%", backgroundColor: theme.inactiveTx }]} />
          <View style={[styles.skelLine, { width: "25%", backgroundColor: theme.inactiveTx, marginTop: 8 }]} />
        </View>
      </View>
    ))}
  </View>
);

// Trade row; tap = load the fills (side / price / qty) for this symbol + a 1-minute window.
const TradeRow = ({ theme, trade, agent, user }) => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null); // { fills } | { error }
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || detail) return;
    const res = await fetchTradesAround(agent, user, trade.symbol, trade.time);
    if (res.error) {
      setDetail({ error: friendlyAsterError(res) });
      return;
    }
    const ids = new Set(trade.tradeIds.map(String));
    const fills = res.data.filter((f) => ids.has(String(f.id)));
    setDetail({ fills: fills.length ? fills : res.data.filter((f) => Math.abs(Number(f.time) - trade.time) <= 1000) });
  };
  const pnlN = Number(trade.pnl);
  const fills = detail && detail.fills ? detail.fills : null;
  const side = fills && fills[0] ? fills[0].side : null;
  const qty = fills ? fills.reduce((s, f) => add(s, f.qty), "0") : null;
  const quote = fills ? fills.reduce((s, f) => add(s, f.quoteQty), "0") : null;
  const avg = fills && Number(qty) > 0 ? Number(quote) / Number(qty) : null;
  // One-way mode: a fill with realized PnL closes; BUY that closes = closing a Short.
  const action = trade.hasPnl
    ? side
      ? `Closed ${side === "SELL" ? "Long" : "Short"}`
      : "Closed"
    : side
    ? `Opened ${side === "BUY" ? "Long" : "Short"}`
    : "Opened";
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${baseOf(trade.symbol)} trade, show details`}
      onPress={toggle}
      style={[styles.card, { backgroundColor: theme.cardBg }]}
    >
      <View style={styles.rowTop}>
        <CoinLogo asset={baseOf(trade.symbol)} size={32} theme={theme} />
        <View style={styles.mid}>
          <Text style={[styles.rowTitle, { color: theme.headingTx }]}>
            {baseOf(trade.symbol)} · {action}
          </Text>
          <Text style={[styles.rowSub, { color: theme.inactiveTx }]}>
            {hhmm(trade.time)} · {trade.tradeIds.length} fill{trade.tradeIds.length > 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.right}>
          {trade.hasPnl ? (
            <Text style={[styles.rowAmt, { color: pnlN > 0 ? theme.success : pnlN < 0 ? theme.fail : theme.headingTx }]}>
              {signed(trade.pnl)} USDT
            </Text>
          ) : null}
          <Text style={[styles.rowSub, { color: theme.inactiveTx }]}>Fee {signed(trade.fee)}</Text>
        </View>
      </View>
      {open ? (
        <View style={[styles.detail, { borderTopColor: theme.inactiveTx }]}>
          {!detail ? (
            <ActivityIndicator size="small" color={theme.buttonColor} />
          ) : detail.error ? (
            <Text style={[styles.rowSub, { color: theme.fail }]}>{detail.error}</Text>
          ) : fills.length === 0 ? (
            <Text style={[styles.rowSub, { color: theme.inactiveTx }]}>Fill details are no longer available.</Text>
          ) : (
            <>
              <Detail theme={theme} label="Side" value={side === "BUY" ? "Buy" : "Sell"} />
              <Detail theme={theme} label="Size" value={`${toPlain(qty)} ${baseOf(trade.symbol)}`} />
              <Detail theme={theme} label="Avg price" value={avg ? `$${formatNumber(avg, avg < 10 ? 4 : 2)}` : "—"} />
              <Detail theme={theme} label="Value" value={`$${formatNumber(quote, 2)}`} />
              <Detail theme={theme} label="Maker / taker" value={fills.every((f) => f.maker) ? "Maker" : fills.some((f) => f.maker) ? "Mixed" : "Taker"} />
            </>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const Detail = ({ theme, label, value }) => (
  <View style={styles.detailRow}>
    <Text style={[styles.rowSub, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.detailVal, { color: theme.headingTx }]}>{value}</Text>
  </View>
);

const IncomeRow = ({ theme, item }) => {
  const n = Number(item.income);
  return (
    <View style={[styles.card, styles.rowTop, { backgroundColor: theme.cardBg }]}>
      {item.symbol ? (
        <CoinLogo asset={baseOf(item.symbol)} size={32} theme={theme} />
      ) : (
        <Icon type="ionicon" name="pricetag-outline" size={24} color={theme.inactiveTx} />
      )}
      <View style={styles.mid}>
        <Text style={[styles.rowTitle, { color: theme.headingTx }]}>
          {item.symbol ? `${baseOf(item.symbol)} · ` : ""}
          {TYPE_LABEL[item.type] || item.type}
        </Text>
        <Text style={[styles.rowSub, { color: theme.inactiveTx }]}>{hhmm(item.time)}</Text>
      </View>
      <Text style={[styles.rowAmt, { color: n > 0 ? theme.success : theme.headingTx }]}>
        {signed(item.income, 6)} {item.asset}
      </Text>
    </View>
  );
};

const STATE_TEXT = { SUCCESS: "Completed", PROCESSING: "Processing", PENDING: "Processing", FAILED: "Failed", local: "In progress" };

const TransferRow = ({ theme, t }) => {
  const isDeposit = t.type === "DEPOSIT";
  const st = t.state || "SUCCESS";
  const failed = st === "FAILED";
  const done = st === "SUCCESS";
  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
      <View style={styles.rowTop}>
        <Icon
          type="ionicon"
          name={failed ? "alert-circle" : isDeposit ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
          size={30}
          color={failed ? theme.fail : theme.headingTx}
        />
        <View style={styles.mid}>
          <Text style={[styles.rowTitle, { color: theme.headingTx }]}>
            {isDeposit ? "Deposit" : t.type === "WITHDRAW" ? "Withdrawal" : TYPE_LABEL[t.type] || "Transfer"}
          </Text>
          <View style={styles.stateLine}>
            {!done && !failed ? <ActivityIndicator size="small" color={theme.buttonColor} style={styles.stateSpin} /> : null}
            <Text style={[styles.rowSub, { color: failed ? theme.fail : theme.inactiveTx }]}>
              {STATE_TEXT[st] || st} · {hhmm(t.time)} · {chainById(t.chainId || 56).name}
            </Text>
          </View>
        </View>
        <Text style={[styles.rowAmt, { color: theme.headingTx }]}>
          {isDeposit ? "+" : "−"}
          {formatAmount(t.amount, 6)} {displayName(t.asset || "USDT")}
        </Text>
      </View>
      <TxLine theme={theme} hash={t.txHash} chainId={t.chainId} />
    </View>
  );
};

const Summary = ({ theme, pnl, fees, funding, pending, note }) => (
  <View>
  <View style={[styles.summary, { backgroundColor: theme.cardBg }]}>
    {[
      ["Realized PnL", pnl, true],
      ["Fees", fees, false],
      ["Funding", funding, true],
    ].map(([label, v, colored]) => {
      const n = Number(v);
      return (
        <View key={label} style={styles.flex}>
          <Text style={[styles.sumLabel, { color: theme.inactiveTx }]}>{label}</Text>
          <Text
            style={[
              styles.sumValue,
              { color: colored && n > 0 ? theme.success : colored && n < 0 ? theme.fail : theme.headingTx },
            ]}
          >
            {pending ? "…" : signed(v)}
          </Text>
        </View>
      );
    })}
  </View>
  {note ? <Text style={[styles.sumNote, { color: theme.inactiveTx }]}>{note}</Text> : null}
  </View>
);

// Full-screen History (opened from the Perps tab). No polling; refreshes on open + pull.
const PerpsHistory = ({ visible, onClose, theme, isDark, agent, user }) => {
  const [tab, setTab] = useState(0);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [symbol, setSymbol] = useState(null);
  const h = usePerpsHistory({ agent, user, active: visible });
  const { record: deposit } = useDepositTracker();

  // "All" = no lower bound: rows load 200 at a time as the list scrolls.
  const periodStart = period.days === null ? 0 : Date.now() - period.days * DAY;
  const periodCovered = h.reachedEnd || (h.coveredFrom !== null && h.coveredFrom <= periodStart);
  // A fixed period must be fully loaded for correct totals (bounded paged loads).
  useEffect(() => {
    if (visible && h.hasData && !h.loading && period.days !== null && !periodCovered) h.ensureCovered(periodStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, period.key, h.hasData, h.loading]);

  const inPeriod = useMemo(() => h.items.filter((it) => it.time >= periodStart), [h.items, periodStart]);
  const symbols = useMemo(
    () => Array.from(new Set(inPeriod.filter((it) => it.symbol).map((it) => it.symbol))).sort(),
    [inPeriod]
  );
  const scoped = symbol ? inPeriod.filter((it) => it.symbol === symbol) : inPeriod;

  const totals = useMemo(() => {
    let pnl = "0";
    let fees = "0";
    let funding = "0";
    scoped.forEach((it) => {
      if (!isValid(it.income)) return;
      if (it.type === "REALIZED_PNL") pnl = add(pnl, it.income);
      else if (it.type === "COMMISSION") fees = add(fees, it.income);
      else if (it.type === "FUNDING_FEE") funding = add(funding, it.income);
    });
    return { pnl, fees, funding };
  }, [scoped]);

  const trades = useMemo(() => buildTrades(scoped), [scoped]);
  const funding = useMemo(
    () => scoped.filter((it) => !TRADE_TYPES.includes(it.type) && !TRANSFER_TYPES.includes(it.type)),
    [scoped]
  );
  const transfers = useMemo(() => {
    // Aster's deposit/withdraw records (with tx hash) + income-only transfers + a local pending deposit.
    const list = h.transfers
      .filter((t) => Number(t.time) >= periodStart)
      .map((t) => ({ ...t, key: `dw:${t.id}`, time: Number(t.time) }));
    inPeriod
      .filter((it) => TRANSFER_TYPES.includes(it.type))
      .forEach((it) => {
        const amt = Math.abs(Number(it.income));
        const matched = list.some(
          (t) => t.type === it.type && Math.abs(Number(t.amount) - amt) < 1e-9 && Math.abs(t.time - it.time) < 10 * 60000
        );
        if (!matched) list.push({ key: `in:${it.k}`, type: it.type, amount: String(amt), asset: it.asset, state: "SUCCESS", time: it.time });
      });
    if (isDepositActive(deposit) && deposit.user.toLowerCase() === String(user).toLowerCase()) {
      const known = deposit.depositHash && list.some((t) => t.txHash && t.txHash.toLowerCase() === deposit.depositHash.toLowerCase());
      if (!known) {
        list.push({ key: "local-deposit", type: "DEPOSIT", amount: deposit.amount, asset: deposit.asset || "USDT", chainId: deposit.chainId || 56, state: "local", time: deposit.startedAt, txHash: deposit.depositHash });
      }
    }
    return list.sort((a, b) => b.time - a.time);
  }, [h.transfers, inPeriod, deposit, user, periodStart]);

  const listData = tab === 0 ? trades : tab === 1 ? funding : transfers;
  const sections = useMemo(() => groupByDay(listData), [listData]);
  // Scroll loads older rows: always for "All"; for a period only if it isn't fully loaded yet.
  const canLoadOlder = !h.reachedEnd && (period.days === null || !periodCovered);
  const sinceText = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const summaryNote =
    period.days !== null && !periodCovered && (h.covering || h.loading)
      ? "Calculating totals for this period…"
      : period.days !== null && !periodCovered && h.coveredFrom
      ? `Partial: totals since ${sinceText(h.coveredFrom)}. Scroll to load more.`
      : period.days === null && !h.reachedEnd && h.coveredFrom
      ? `Totals for loaded history (since ${sinceText(h.coveredFrom)}). Scroll for older.`
      : null;

  const renderItem = ({ item }) =>
    tab === 0 ? (
      <TradeRow theme={theme} trade={item} agent={agent} user={user} />
    ) : tab === 1 ? (
      <IncomeRow theme={theme} item={item} />
    ) : (
      <TransferRow theme={theme} t={item} />
    );

  const emptyText =
    tab === 0
      ? "No trades in this period."
      : tab === 1
      ? "No funding payments in this period. Trading fees are shown on each trade."
      : "No deposits or withdrawals in this period.";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={styles.back}>
            <Icon type="ionicon" name="arrow-back" size={26} color={theme.headingTx} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.headingTx }]}>History</Text>
        </View>

        <View style={[styles.tabs, { backgroundColor: theme.cardBg }]}>
          {TABS.map((t, i) => (
            <TouchableOpacity
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === i }}
              onPress={() => setTab(i)}
              style={[styles.tab, tab === i && { backgroundColor: theme.buttonColor }]}
            >
              <Text style={[styles.tabTxt, { color: tab === i ? "#FFFFFF" : theme.inactiveTx }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filters}>
          {PERIODS.map((p) => (
            <Chip key={p.key} theme={theme} label={p.key} active={period.key === p.key} onPress={() => setPeriod(p)} />
          ))}
        </View>
        {tab !== 2 && symbols.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolsBar} contentContainerStyle={styles.symbols}>
            <Chip theme={theme} label="All" active={!symbol} onPress={() => setSymbol(null)} />
            {symbols.map((s) => (
              <Chip
                key={s}
                theme={theme}
                label={baseOf(s)}
                active={symbol === s}
                onPress={() => setSymbol(symbol === s ? null : s)}
                left={<CoinLogo asset={baseOf(s)} size={18} theme={theme} style={styles.chipLogo} />}
              />
            ))}
          </ScrollView>
        ) : null}

        {h.loading && !h.hasData ? (
          <Skeleton theme={theme} />
        ) : h.error && !h.hasData ? (
          <View style={styles.state}>
            <Icon name="cloud-offline-outline" type="ionicon" size={40} color={theme.inactiveTx} />
            <Text style={[styles.stateTxt, { color: theme.headingTx }]}>Couldn't load your history</Text>
            <Text style={[styles.stateSub, { color: theme.inactiveTx }]}>{friendlyAsterError(h.error)}</Text>
            <TouchableOpacity style={[styles.retry, { backgroundColor: theme.buttonColor }]} onPress={() => h.refresh({ pull: true })}>
              <Text style={styles.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(it) => it.key || it.k}
            renderItem={renderItem}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={
              <>
                {tab !== 2 ? (
                  <Summary
                    theme={theme}
                    {...totals}
                    pending={period.days !== null && !periodCovered && (h.covering || h.loading)}
                    note={summaryNote}
                  />
                ) : null}
                {h.error ? (
                  <Text style={[styles.inlineErr, { color: theme.warn }]}>
                    Couldn't refresh: {friendlyAsterError(h.error)}. Showing saved history.
                  </Text>
                ) : null}
              </>
            }
            renderSectionHeader={({ section }) => (
              <Text style={[styles.day, { color: theme.inactiveTx }]}>{section.title}</Text>
            )}
            ListEmptyComponent={
              canLoadOlder || h.loadingOlder || h.covering ? null : (
                <Text style={[styles.empty, { color: theme.inactiveTx }]}>{emptyText}</Text>
              )
            }
            ListFooterComponent={
              h.loadingOlder || h.covering || canLoadOlder ? (
                <ActivityIndicator style={styles.footer} color={theme.buttonColor} />
              ) : sections.length > 0 && h.reachedEnd ? (
                <Text style={[styles.footerTxt, { color: theme.inactiveTx }]}>Beginning of your history</Text>
              ) : null
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => canLoadOlder && !h.covering && h.loadOlder()}
            refreshControl={
              <RefreshControl refreshing={h.refreshing} tintColor="#4CA6EA" onRefresh={() => h.refresh({ pull: true })} />
            }
            contentContainerStyle={styles.listPad}
          />
        )}
      </View>
    </Modal>
  );
};

export default PerpsHistory;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: Platform.OS === "ios" ? 50 : (StatusBar.currentHeight || 24) + 8 },
  symbolsBar: { flexGrow: 0, flexShrink: 0 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  back: { padding: 6 },
  title: { fontSize: 24, fontWeight: "800", marginLeft: 8 },
  tabs: { flexDirection: "row", marginHorizontal: 16, marginTop: 6, borderRadius: 14, padding: 4 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  tabTxt: { fontSize: 13, fontWeight: "700" },
  filters: { flexDirection: "row", paddingHorizontal: 16, marginTop: 12 },
  symbols: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1 },
  chipTxt: { fontSize: 13, fontWeight: "600" },
  chipLogo: { marginRight: 6 },
  summary: { flexDirection: "row", borderRadius: 16, padding: 14, marginTop: 12 },
  sumLabel: { fontSize: 12 },
  sumValue: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  sumNote: { fontSize: 12, marginTop: 6 },
  listPad: { paddingHorizontal: 16, paddingBottom: 40 },
  day: { fontSize: 13, fontWeight: "700", marginTop: 16, marginBottom: 6 },
  card: { borderRadius: 14, padding: 12, marginBottom: 8 },
  rowTop: { flexDirection: "row", alignItems: "center" },
  mid: { flex: 1, marginLeft: 10 },
  right: { alignItems: "flex-end" },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowAmt: { fontSize: 14, fontWeight: "700" },
  stateLine: { flexDirection: "row", alignItems: "center" },
  stateSpin: { transform: [{ scale: 0.7 }], marginRight: 2, marginTop: 2 },
  detail: { marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  detailVal: { fontSize: 13, fontWeight: "600" },
  txLine: { flexDirection: "row", alignItems: "center", marginTop: 6, marginLeft: 40 },
  txHash: { fontSize: 12, fontWeight: "600" },
  txBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  link: { fontSize: 12, fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
  footer: { marginVertical: 16 },
  footerTxt: { textAlign: "center", marginVertical: 16, fontSize: 12 },
  inlineErr: { fontSize: 12, marginTop: 8 },
  state: { alignItems: "center", marginTop: 60, paddingHorizontal: 24 },
  stateTxt: { fontSize: 16, fontWeight: "700", marginTop: 10 },
  stateSub: { fontSize: 13, marginTop: 4, textAlign: "center" },
  retry: { marginTop: 14, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10 },
  retryTxt: { color: "#FFFFFF", fontWeight: "700" },
  pad: { paddingHorizontal: 16, marginTop: 14 },
  skelRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, marginBottom: 8 },
  skelDot: { width: 32, height: 32, borderRadius: 16, opacity: 0.2 },
  skelLine: { height: 10, borderRadius: 5, opacity: 0.2, marginLeft: 10 },
  flex: { flex: 1 },
});
