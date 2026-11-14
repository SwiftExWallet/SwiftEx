import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Icon from "../../icon";
import { formatNumber } from "../utils/format";

const RISKS = [
  "Perpetual futures are high risk. You can lose your whole margin.",
  "Leverage magnifies losses as well as gains.",
  "Not available in some regions.",
  "This is not financial advice.",
];

const DisabledFundButtons = ({ theme }) => (
  <>
    <View style={styles.btnRow}>
      {["Deposit", "Withdraw"].map((label) => (
        <TouchableOpacity
          key={label}
          disabled
          accessibilityState={{ disabled: true }}
          style={[styles.fundBtn, { backgroundColor: theme.buttonColor, opacity: 0.45 }]}
        >
          <Text style={styles.btnTxt}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
    <Text style={[styles.note, { color: theme.inactiveTx }]}>Coming soon</Text>
  </>
);

// Top card on the Perps tab. Driven by usePerpsAgent() state.
// funds (optional): { account, noDeposit, depositPending, onDeposit, onWithdraw }
const TradingCard = ({ theme, agentState, funds }) => {
  const [accepted, setAccepted] = useState(false);
  const { status, error, balance, balanceError, enable } = agentState;
  const cardStyle = [styles.card, { backgroundColor: theme.cardBg }];

  if (status === "checking") {
    return (
      <View style={[cardStyle, styles.center]}>
        <ActivityIndicator color={theme.buttonColor} />
      </View>
    );
  }

  if (status === "no-evm") {
    return (
      <View style={cardStyle}>
        <Text style={[styles.title, { color: theme.headingTx }]}>Perps needs an EVM wallet</Text>
        <Text style={[styles.body, { color: theme.inactiveTx }]}>
          Switch to a wallet with an Ethereum / BNB Chain address to trade perps.
        </Text>
      </View>
    );
  }

  if (status === "enabled") {
    const acc = funds && funds.account;
    const noDeposit = funds ? funds.noDeposit : balance && balance.noDeposit;
    const rawPnl = acc ? Number(acc.unrealizedPnl) : 0;
    const pnl = Math.abs(rawPnl) < 0.005 ? 0 : rawPnl; // avoid a red "-$0.00"
    const canWithdraw = !!acc && !noDeposit && Number(acc.available) > 0;
    return (
      <View style={cardStyle}>
        <Text style={[styles.label, { color: theme.inactiveTx }]}>Perps balance</Text>
        <Text style={[styles.balance, { color: theme.headingTx }]}>
          {acc ? `$${formatNumber(acc.equity, 2)}` : balance ? `$${formatNumber(balance.balance, 2)}` : "—"}
        </Text>
        {noDeposit ? (
          <Text style={[styles.note, styles.left, { color: theme.inactiveTx }]}>
            {funds && funds.depositPending
              ? "Deposit on its way · deposits can take a few minutes"
              : "Trading enabled · no deposit yet"}
          </Text>
        ) : acc ? (
          <View style={styles.statLine}>
            <Text style={[styles.statTxt, { color: theme.inactiveTx }]}>
              Available ${formatNumber(acc.available, 2)}
            </Text>
            <Text style={[styles.statTxt, { color: pnl > 0 ? theme.success : pnl < 0 ? theme.fail : theme.inactiveTx }]}>
              Unrealized PnL {pnl >= 0 ? "+" : "-"}${formatNumber(Math.abs(pnl), 2)}
            </Text>
          </View>
        ) : null}
        {balanceError || (funds && funds.error && !acc) ? (
          <Text style={[styles.note, styles.left, { color: theme.warn }]}>
            {balanceError || funds.error}
          </Text>
        ) : null}
        {funds ? (
          <View style={styles.btnRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={funds.onDeposit}
              style={[styles.fundBtn, { backgroundColor: theme.buttonColor }]}
            >
              <Text style={styles.btnTxt}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !canWithdraw }}
              disabled={!canWithdraw}
              onPress={funds.onWithdraw}
              style={[styles.fundBtn, { backgroundColor: theme.buttonColor, opacity: canWithdraw ? 1 : 0.45 }]}
            >
              <Text style={styles.btnTxt}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <DisabledFundButtons theme={theme} />
        )}
      </View>
    );
  }

  // not-enabled | enabling | locked (app build without secure key storage)
  const locked = status === "locked";
  const enabling = status === "enabling";
  const canPress = !locked && !enabling && accepted;

  return (
    <View style={cardStyle}>
      <Text style={[styles.title, { color: theme.headingTx }]}>Trade perpetual futures</Text>
      <Text style={[styles.body, { color: theme.inactiveTx }]}>
        Go long or short on BTC, ETH and more with leverage. Enabling trading creates a trading
        key on this device and asks your wallet to approve it once. It cannot withdraw your funds.
      </Text>
      <View style={[styles.riskBox, { borderColor: theme.warn }]}>
        {RISKS.map((r) => (
          <View key={r} style={styles.riskLine}>
            <Icon name="warning-outline" type="ionicon" size={14} color={theme.warn} />
            <Text style={[styles.riskTxt, { color: theme.headingTx }]}>{r}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled: locked }}
        disabled={locked || enabling}
        onPress={() => setAccepted(!accepted)}
        style={styles.checkRow}
      >
        <Icon
          name={accepted ? "checkbox" : "square-outline"}
          type="ionicon"
          size={22}
          color={accepted ? theme.buttonColor : theme.inactiveTx}
        />
        <Text style={[styles.checkTxt, { color: theme.headingTx }]}>I understand the risks</Text>
      </TouchableOpacity>
      {error ? <Text style={[styles.error, { color: theme.fail }]}>{error}</Text> : null}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !canPress }}
        disabled={!canPress}
        onPress={enable}
        style={[styles.enableBtn, { backgroundColor: theme.buttonColor, opacity: canPress ? 1 : 0.45 }]}
      >
        {enabling ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.btnTxt}>{locked ? "Trading coming soon" : "Enable Trading"}</Text>
        )}
      </TouchableOpacity>
      {enabling ? (
        <Text style={[styles.note, { color: theme.inactiveTx }]}>Confirm in your wallet…</Text>
      ) : null}
    </View>
  );
};

export default TradingCard;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
  },
  center: {
    alignItems: "center",
    paddingVertical: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
  },
  balance: {
    fontSize: 30,
    fontWeight: "800",
    marginTop: 4,
  },
  riskBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  riskLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 3,
  },
  riskTxt: {
    fontSize: 13,
    marginLeft: 6,
    flex: 1,
    lineHeight: 18,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  checkTxt: {
    fontSize: 15,
    marginLeft: 8,
    fontWeight: "500",
  },
  error: {
    fontSize: 13,
    marginTop: 10,
  },
  enableBtn: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 48,
  },
  btnRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  fundBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 12,
    marginRight: 8,
  },
  btnTxt: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  note: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  left: {
    textAlign: "left",
    marginTop: 2,
  },
  statLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  statTxt: {
    fontSize: 13,
    fontWeight: "500",
  },
});
