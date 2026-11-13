import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import Icon from "../../icon";

// Withdraw progress: Requested -> Processing -> Sent on BSC -> Received in wallet.
// Neutral colors; green only when the funds are in the wallet, red only if Aster reports a failure.
// tracking: { amount, fee, receive, requestedAt, processingAt, sentAt, receivedAt, status, txHash, failed }

export const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "");
export const hhmm = (t) => {
  if (!t) return "";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const Step = ({ theme, label, sub, state, time, last, extra }) => {
  // state: done | active | todo | success | failed
  const iconColor =
    state === "success" ? theme.success : state === "failed" ? theme.fail : state === "done" ? theme.headingTx : theme.inactiveTx;
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        {state === "active" ? (
          <ActivityIndicator size="small" color={theme.buttonColor} style={styles.icon} />
        ) : (
          <Icon
            type="ionicon"
            size={20}
            color={iconColor}
            name={
              state === "success" || state === "done"
                ? "checkmark-circle"
                : state === "failed"
                ? "close-circle"
                : "ellipse-outline"
            }
            style={styles.icon}
          />
        )}
        {!last ? <View style={[styles.line, { backgroundColor: theme.inactiveTx }]} /> : null}
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepTop}>
          <Text
            style={[
              styles.stepLabel,
              { color: state === "todo" ? theme.inactiveTx : state === "success" ? theme.success : state === "failed" ? theme.fail : theme.headingTx },
            ]}
          >
            {label}
          </Text>
          {time ? <Text style={[styles.time, { color: theme.inactiveTx }]}>{time}</Text> : null}
        </View>
        {sub ? <Text style={[styles.stepSub, { color: theme.inactiveTx }]}>{sub}</Text> : null}
        {extra || null}
      </View>
    </View>
  );
};

const WithdrawStatusCard = ({ theme, tracking }) => {
  const { amount, fee, receive, txHash, failed } = tracking;
  const received = !!tracking.receivedAt;
  const sent = !!tracking.sentAt || received;

  const steps = [
    { label: "Requested", sub: "Signed with your wallet", state: "done", time: hhmm(tracking.requestedAt) },
    {
      label: "Processing",
      sub: "Aster is preparing the transfer",
      state: sent || failed ? "done" : "active",
      time: hhmm(tracking.processingAt || tracking.requestedAt),
    },
    {
      label: "Sent on BNB Smart Chain",
      sub: sent ? "On-chain transfer submitted" : "Usually within a few minutes",
      state: received ? "done" : sent ? "active" : "todo",
      time: hhmm(tracking.sentAt),
    },
    {
      label: "Received in your wallet",
      sub: received ? `${receive} USDT added` : "Waiting for the wallet balance",
      state: received ? "success" : "todo",
      time: hhmm(tracking.receivedAt),
    },
  ];
  if (failed) {
    steps.splice(2, 2, {
      label: "Withdrawal failed",
      sub: "Aster didn't complete it. Your USDT stays in Perps.",
      state: "failed",
      time: "",
    });
  }

  const title = received ? "Withdrawal complete" : failed ? "Withdrawal failed" : "Withdrawal in progress";
  const titleColor = received ? theme.success : failed ? theme.fail : theme.headingTx;

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
      <View style={styles.header}>
        <Icon
          type="ionicon"
          name={received ? "checkmark-done-circle" : failed ? "alert-circle" : "arrow-up-circle-outline"}
          size={28}
          color={titleColor}
        />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.inactiveTx }]}>{amount} USDT to your wallet</Text>
        </View>
      </View>

      <View style={styles.amounts}>
        <View style={styles.amountCol}>
          <Text style={[styles.amountLabel, { color: theme.inactiveTx }]}>Amount</Text>
          <Text style={[styles.amountValue, { color: theme.headingTx }]}>{amount} USDT</Text>
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amountLabel, { color: theme.inactiveTx }]}>Fee</Text>
          <Text style={[styles.amountValue, { color: theme.headingTx }]}>{fee} USDT</Text>
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amountLabel, { color: theme.inactiveTx }]}>You receive</Text>
          <Text style={[styles.amountValue, { color: theme.headingTx }]}>{receive} USDT</Text>
        </View>
      </View>

      <View style={styles.steps}>
        {steps.map((s, i) => (
          <Step key={s.label} theme={theme} {...s} last={i === steps.length - 1} />
        ))}
      </View>

      {txHash ? (
        <View style={[styles.txRow, { borderTopColor: theme.inactiveTx }]}>
          <Text style={[styles.txLabel, { color: theme.inactiveTx }]}>Tx</Text>
          <Text style={[styles.txHash, { color: theme.headingTx }]}>{shortHash(txHash)}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Copy transaction hash"
            onPress={() => Clipboard.setString(txHash)}
            style={styles.txBtn}
          >
            <Icon type="ionicon" name="copy-outline" size={18} color={theme.headingTx} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => Linking.openURL(`https://bscscan.com/tx/${txHash}`)}
            style={styles.txBtn}
          >
            <Text style={[styles.link, { color: theme.buttonColor }]}>View on BscScan</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

export default WithdrawStatusCard;

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center" },
  headerText: { marginLeft: 10, flex: 1 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  amounts: { flexDirection: "row", marginTop: 14 },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 12 },
  amountValue: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  steps: { marginTop: 14 },
  step: { flexDirection: "row" },
  rail: { width: 24, alignItems: "center" },
  icon: { width: 20, height: 20 },
  line: { width: 1, flex: 1, minHeight: 14, opacity: 0.4, marginVertical: 2 },
  stepBody: { flex: 1, marginLeft: 10, paddingBottom: 12 },
  stepTop: { flexDirection: "row", justifyContent: "space-between" },
  stepLabel: { fontSize: 14, fontWeight: "600" },
  time: { fontSize: 12 },
  stepSub: { fontSize: 12, marginTop: 2 },
  txRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  txLabel: { fontSize: 13, marginRight: 8 },
  txHash: { fontSize: 13, fontWeight: "600", flex: 1 },
  txBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  link: { fontSize: 13, fontWeight: "700" },
});
