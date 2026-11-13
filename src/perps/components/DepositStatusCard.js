import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import Icon from "../../icon";
import { Step, hhmm, shortHash } from "./WithdrawStatusCard";
import { useAppActive } from "../hooks/useAppActive";
import { chainById, txUrl, displayName } from "../api/asterAssets";

// Deposit progress, same look as the withdraw card:
// Approve USDT (only if needed) -> Deposit sent -> Confirmed on BSC -> Credited in Perps.
// record: see storage/depositTracker.js

const elapsed = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};

const TxLink = ({ theme, hash, chain }) =>
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
        onPress={() => Linking.openURL(txUrl(chain.chainId, hash))}
        style={styles.txBtn}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      >
        <Text style={[styles.link, { color: theme.buttonColor }]}>View on {chain.explorerName}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

const DepositStatusCard = ({ theme, record }) => {
  const appActive = useAppActive();
  const chain = chainById(record.chainId || 56);
  const tok = displayName(record.asset || "USDT");
  const credited = !!record.creditedAt;
  const failed = record.failed;
  // 1s ticker for the "waiting for credit" timer, only while it is shown and the app is in front.
  const waiting = !!record.confirmedAt && !credited && !failed;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!waiting || !appActive) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [waiting, appActive]);

  const paused = !!record.interrupted;
  // Once the deposit step started (or anything after it), the approval is necessarily done.
  const approvedAt = record.approvedAt || record.depositStartAt || record.sentAt || record.confirmedAt || null;
  const approving = !paused && record.needsApprove && !approvedAt && !(failed && failed.step !== "approve");
  const steps = [];
  if (record.needsApprove) {
    const approveFailed = failed && failed.step === "approve";
    steps.push({
      label: `Approve ${tok}`,
      sub: approveFailed ? failed.text : approvedAt ? "Vault allowed to take exactly this amount" : paused ? "Re-checked when you continue (not repeated if done)" : "Confirm in your wallet",
      state: approveFailed ? "failed" : approvedAt ? "done" : paused ? "todo" : "active",
      time: hhmm(approvedAt || record.approveStartAt),
      extra: <TxLink theme={theme} hash={record.approveHash} chain={chain} />,
    });
  } else {
    steps.push({ label: `Approve ${tok}`, sub: record.isNative ? `Not needed for ${tok}` : "Not needed — allowance already set", state: "done", time: "" });
  }

  const depositFailed = failed && failed.step !== "approve";
  const notStarted = approving || (failed && failed.step === "approve");
  steps.push({
    label: "Deposit sent",
    sub: paused ? record.interrupted.text : record.checking ? "Checking whether it went out…" : depositFailed && !record.sentAt ? failed.text : record.sentAt ? "Sent from your wallet" : notStarted ? "" : "Signing and sending…",
    state: paused ? "todo" : notStarted ? "todo" : record.sentAt ? "done" : depositFailed ? "failed" : "active",
    time: hhmm(record.sentAt),
  });
  steps.push({
    label: `Confirmed on ${chain.name}`,
    sub:
      depositFailed && record.sentAt
        ? failed.text
        : record.confirmedAt
        ? record.unknownHash
          ? "Confirmed (see your wallet history for the tx)"
          : "Included in a block"
        : record.sentAt
        ? "Usually a few seconds"
        : "",
    state: record.confirmedAt ? "done" : depositFailed && record.sentAt ? "failed" : record.sentAt ? "active" : "todo",
    time: hhmm(record.confirmedAt),
    extra: <TxLink theme={theme} hash={record.depositHash} chain={chain} />,
  });
  if (!depositFailed) {
    steps.push({
      label: "Credited in Perps",
      sub: credited
        ? `${record.amount} ${tok} added · took ${elapsed(record.creditedAt - record.confirmedAt)}`
        : record.confirmedAt
        ? record.slow
          ? `Taking longer than usual (${elapsed(Date.now() - record.confirmedAt)}). Aster will still credit it.`
          : `Waiting for Aster · ${elapsed(Date.now() - record.confirmedAt)}`
        : "Usually 1–3 minutes after confirmation",
      state: credited ? "success" : record.confirmedAt ? "active" : "todo",
      time: hhmm(record.creditedAt),
    });
  }

  const title = credited ? "Deposit complete" : failed ? "Deposit failed" : paused ? "Deposit paused" : "Deposit in progress";
  const titleColor = credited ? theme.success : failed ? theme.fail : theme.headingTx;

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
      <View style={styles.header}>
        <Icon
          type="ionicon"
          name={credited ? "checkmark-done-circle" : failed ? "alert-circle" : "arrow-down-circle-outline"}
          size={28}
          color={titleColor}
        />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.inactiveTx }]}>
            {record.amount} {tok} · {chain.name} → Perps · {record.needsApprove ? "2 steps" : "1 step"}
          </Text>
        </View>
      </View>
      <View style={styles.steps}>
        {steps.map((s, i) => (
          <Step key={s.label} theme={theme} {...s} last={i === steps.length - 1} />
        ))}
      </View>
    </View>
  );
};

export default DepositStatusCard;

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center" },
  headerText: { marginLeft: 10, flex: 1 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  steps: { marginTop: 14 },
  txLine: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  txHash: { fontSize: 12, fontWeight: "600" },
  txBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  link: { fontSize: 12, fontWeight: "700" },
});
