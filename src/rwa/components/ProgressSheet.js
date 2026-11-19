import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Modal from "react-native-modal";
import Icon from "../../icon";
import { isFinal, STAGE_TEXT } from "../orders/orderState";
import OrderCard from "./OrderCard";

// After "Confirm swap": a simple 3-step progress (Signed -> Processing -> Done). The full order
// timeline + transaction links stay available under "Details".
const STEPS = ["Signed", "Processing", "Done"];
const stepOf = (stage) => {
  if (stage === "filled") return 3;
  if (stage === "submitted" || stage === "filling") return 2;
  if (stage === "approving" || stage === "submitting") return 1;
  return 0;
};

const ProgressSheet = ({ visible, record, theme, onClose, onViewBalance }) => {
  const [details, setDetails] = useState(false);
  if (!record) return null;
  const final = isFinal(record.stage);
  const ok = record.stage === "filled";
  const bad = final && !ok;
  const step = stepOf(record.stage);
  const title = ok
    ? `${record.side === "buy" ? record.symbol : record.outToken.symbol} added to your wallet`
    : bad
    ? record.stage === "expired"
      ? "Not filled in time"
      : "Swap didn't go through"
    : step >= 2
    ? "Swapping…"
    : "Confirming…";
  const sub = ok
    ? "Done. You can close this screen."
    : bad
    ? record.stage === "failed" && record.error
      ? record.error
      : STAGE_TEXT[record.stage]
    : step >= 2
    ? "Usually under a minute. You can close this — it keeps going."
    : record.stage === "approving"
    ? "Approving the exact amount…"
    : "Check your wallet if it asks you to confirm.";
  return (
    <Modal isVisible={visible} onBackButtonPress={onClose} onBackdropPress={onClose} style={styles.modal} useNativeDriverForBackdrop>
      <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
        <View style={styles.iconWrap}>
          {ok ? (
            <Icon name="checkmark-circle" type="ionicon" size={56} color={theme.success} />
          ) : bad ? (
            <Icon name="close-circle" type="ionicon" size={56} color={theme.fail} />
          ) : (
            <ActivityIndicator size="large" color={theme.buttonColor} />
          )}
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.headingTx }]}>{title}</Text>
        <Text style={[styles.sub, { color: theme.inactiveTx }]}>{sub}</Text>
        {!bad ? (
          <View style={styles.steps}>
            {STEPS.map((label, i) => {
              const done = step > i || (ok && i === 2);
              const now = !final && step === i;
              const color = done ? theme.success : now ? theme.buttonColor : theme.inactiveTx;
              return (
                <View key={label} style={styles.step}>
                  <Icon name={done ? "checkmark-circle" : now ? "ellipse" : "ellipse-outline"} type="ionicon" size={18} color={color} />
                  <Text style={[styles.stepTxt, { color }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={styles.detailsHead}>
          <Text style={[styles.detailsTxt, { color: theme.inactiveTx }]}>Details</Text>
          <Icon name={details ? "chevron-up" : "chevron-down"} type="ionicon" size={16} color={theme.inactiveTx} />
        </TouchableOpacity>
        {details ? <OrderCard record={record} theme={theme} /> : null}
        {ok && onViewBalance ? (
          <TouchableOpacity accessibilityRole="button" onPress={onViewBalance} style={[styles.btn, { backgroundColor: theme.buttonColor }]}>
            <Text style={styles.btnTxt}>View in wallet</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.btn, ok && onViewBalance ? { backgroundColor: theme.cardBg } : { backgroundColor: theme.buttonColor }]}
        >
          <Text style={[styles.btnTxt, ok && onViewBalance ? { color: theme.headingTx } : null]}>{final ? "Done" : "Close"}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

export default ProgressSheet;

const styles = StyleSheet.create({
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 26, maxHeight: "90%" },
  iconWrap: { alignItems: "center", marginTop: 6, marginBottom: 10, minHeight: 56, justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 6 },
  steps: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  step: { flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  stepTxt: { fontSize: 13, fontWeight: "600", marginLeft: 4 },
  detailsHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 14, paddingVertical: 6 },
  detailsTxt: { fontSize: 13, fontWeight: "600", marginRight: 4 },
  btn: { marginTop: 12, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
