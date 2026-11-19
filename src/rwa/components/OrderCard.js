import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import Icon from "../../icon";
import { TIMELINE, STAGE_TEXT, isFinal, stageIndex } from "../orders/orderState";
import { fromUnits, fmtAmount } from "../utils/amounts";

const EXPLORER = { ETH: "https://etherscan.io/tx/", BSC: "https://bscscan.com/tx/" };

// Order status card with a timeline: Signed -> (Approved) -> Submitted -> Filling -> Filled,
// or a final state (expired / cancelled / failed) with a plain explanation.
const OrderCard = ({ record, theme, onPress }) => {
  if (!record) return null;
  const final = isFinal(record.stage);
  const bad = final && record.stage !== "filled";
  const steps = TIMELINE.filter((s) => s.stage !== "approving" || record.approveTx || record.stage === "approving");
  const cur = stageIndex(record.stage === "submitting" ? "submitted" : record.stage);
  const title = `${record.side === "buy" ? "Buy" : "Sell"} ${record.symbol}`;
  const outTxt = record.expectedOut ? `${fmtAmount(fromUnits(record.expectedOut, record.outToken.decimals), 6)} ${record.outToken.symbol}` : "";
  const tx = record.fillTx || record.approveTx;
  return (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={[styles.card, { backgroundColor: theme.cardBg }]} accessibilityRole={onPress ? "button" : undefined}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.headingTx }]}>{title}</Text>
        <Text style={[styles.amt, { color: theme.inactiveTx }]}>
          {fmtAmount(record.amountIn, 6)} {record.inToken.symbol}
          {outTxt ? ` → ~${outTxt}` : ""}
        </Text>
      </View>
      {!bad ? (
        <View style={styles.steps}>
          {steps.map((s) => {
            const done = record.stage === "filled" || stageIndex(s.stage) < cur || (s.stage === record.stage && final);
            const now = !final && (s.stage === record.stage || (record.stage === "submitting" && s.stage === "submitted"));
            const color = done ? theme.success : now ? theme.buttonColor : theme.inactiveTx;
            return (
              <View key={s.stage} style={styles.step}>
                <Icon name={done ? "checkmark-circle" : now ? "ellipse" : "ellipse-outline"} type="ionicon" size={16} color={color} />
                <Text style={[styles.stepTxt, { color }]}>{s.label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={[styles.msg, { color: bad ? theme.warn : theme.inactiveTx }]}>
        {record.stage === "failed" && record.error ? `${record.error}` : STAGE_TEXT[record.stage] || ""}
      </Text>
      {tx && EXPLORER[record.chain] ? (
        <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(EXPLORER[record.chain] + tx).catch(() => {})}>
          <Text style={[styles.link, { color: theme.buttonColor }]}>View transaction</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
};

export default OrderCard;

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginTop: 10, borderRadius: 14, padding: 14 },
  head: { marginBottom: 8 },
  title: { fontSize: 15, fontWeight: "700" },
  amt: { fontSize: 12, marginTop: 2 },
  steps: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  step: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 4 },
  stepTxt: { fontSize: 12, fontWeight: "600", marginLeft: 4 },
  msg: { fontSize: 13, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: "600", marginTop: 6 },});
