import React, { useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Modal from "react-native-modal";
import Icon from "../../icon";
import { useModalPresence } from "../utils/modalSafe";

// Order success sheet (perps-owned; the shared success dialog was built for a single button).
// result: { title, rows: [{ label, value }], note, warn, viewText } from orderResultContent(), or null.
// onView / onDone run only after the sheet has fully hidden (iOS: one native modal at a time).
const OrderResultSheet = ({ theme, result, onClose, onView, onDone }) => {
  const visible = !!result;
  const presence = useModalPresence(visible);
  const after = useRef(null);
  // Keep the last content while the sheet slides out.
  const last = useRef(null);
  if (result) last.current = result;
  const r = result || last.current;

  const close = (action) => {
    after.current = action;
    onClose();
  };
  const onHide = () => {
    presence.onModalHide();
    const fn = after.current;
    after.current = null;
    if (fn) fn();
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={() => close(onDone)}
      onBackButtonPress={() => close(onDone)}
      style={styles.modal}
      useNativeDriverForBackdrop
      onModalHide={onHide}
    >
      {r ? (
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <View style={styles.head}>
            <Icon
              name={r.warn ? "alert-circle" : "checkmark-circle"}
              type="ionicon"
              size={52}
              color={r.warn ? theme.warn : theme.success}
            />
            <Text accessibilityRole="header" style={[styles.title, { color: theme.headingTx }]}>
              {r.title}
            </Text>
          </View>
          <View style={[styles.rows, { backgroundColor: theme.cardBg }]}>
            {r.rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>{row.label}</Text>
                <Text style={[styles.rowValue, { color: theme.headingTx }]}>{row.value}</Text>
              </View>
            ))}
          </View>
          {r.note ? <Text style={[styles.note, { color: theme.warn }]}>{r.note}</Text> : null}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={r.viewText}
            onPress={() => close(onView)}
            activeOpacity={0.85}
            style={[styles.btn, styles.primary, { backgroundColor: theme.buttonColor }]}
          >
            <Text style={styles.primaryTxt}>{r.viewText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => close(onDone)}
            activeOpacity={0.7}
            style={[styles.btn, styles.secondary, { borderColor: theme.buttonColor }]}
          >
            <Text style={[styles.secondaryTxt, { color: theme.buttonColor }]}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View />
      )}
    </Modal>
  );
};

export default OrderResultSheet;

const styles = StyleSheet.create({
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  head: { alignItems: "center", marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "800", marginTop: 8, textAlign: "center" },
  rows: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  rowLabel: { fontSize: 14, marginRight: 12 },
  rowValue: { fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  note: { fontSize: 13, marginTop: 12, lineHeight: 18 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primary: { marginTop: 18 },
  secondary: { marginTop: 12, borderWidth: 1.5, backgroundColor: "transparent" },
  primaryTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryTxt: { fontSize: 16, fontWeight: "700" },
});
