import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Modal from "react-native-modal";

// Final review before an RWA order is signed: amount, token, chain, receiver (your own wallet),
// minimum you get, fee, and whether an exact-amount approval (one network fee) is needed.
const ReviewSheet = ({ visible, theme, rows, warning, busy, onConfirm, onCancel, confirmLabel, onModalHide }) => (
  <Modal
    isVisible={visible}
    onBackdropPress={busy ? undefined : onCancel}
    onBackButtonPress={busy ? undefined : onCancel}
    onModalHide={onModalHide}
    style={styles.modal}
    useNativeDriverForBackdrop
  >
    <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.headingTx }]}>Review swap</Text>
      <View style={[styles.box, { backgroundColor: theme.cardBg }]}>
        {(rows || []).map((r) => (
          <View key={r.label} style={styles.row}>
            <Text style={[styles.label, { color: theme.inactiveTx }]}>{r.label}</Text>
            <Text style={[styles.value, { color: r.color || theme.headingTx }]}>{r.value}</Text>
          </View>
        ))}
      </View>
      {warning ? <Text style={[styles.warn, { color: theme.warn }]}>{warning}</Text> : null}
      <Text style={[styles.note, { color: theme.inactiveTx }]}>
        Fees are included in the price. If the swap isn't filled in time, nothing is taken.
      </Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onConfirm} style={[styles.btn, { backgroundColor: theme.buttonColor, opacity: busy ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnTxt}>{confirmLabel || "Confirm"}</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}>
        <Text style={[styles.cancelTxt, { color: theme.inactiveTx }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  </Modal>
);

export default ReviewSheet;

const styles = StyleSheet.create({
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 26 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 12 },
  box: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  label: { fontSize: 13, marginRight: 12 },
  value: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  warn: { fontSize: 13, marginTop: 10 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  btn: { marginTop: 14, minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelTxt: { fontSize: 15, fontWeight: "600" },
});
