import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from "react-native";
import Modal from "react-native-modal";
import Icon from "../../icon";

// One-time attestation + disclosures before first RWA use. Accept is enabled only after ticking.
export const ISSUER_TERMS = [
  { label: "Ondo Global Markets — eligibility", url: "https://docs.ondo.finance/ondo-stocks/eligibility" },
  { label: "xStocks — terms of service", url: "https://xstocks.fi/documents/xstocks-terms-of-service.pdf" },
  { label: "Paxos Gold (PAXG) — terms", url: "https://www.paxos.com/terms-and-conditions/general-terms-and-conditions" },
  { label: "Tether Gold (XAUt) — legal", url: "https://gold.tether.to/legal" },
  { label: "Ondo USDY (Stellar)", url: "https://ondo.finance/usdy" },
  { label: "Etherfuse CETES (Stellar) — terms", url: "https://etherfuse.com/legal/terms-and-conditions" },
];

export const DISCLOSURES = [
  "These tokens are not shares. They track the price of a stock, ETF, gold or bond; you don't get voting rights, and the issuer — not SwiftEx — is responsible for them.",
  "The issuer can freeze or claw back tokens (for example for sanctions or legal orders).",
  "Outside market hours prices can move a lot and may differ from the stock exchange price.",
  "You may not be able to redeem tokens with the issuer without passing their KYC. You can usually only sell them on-chain.",
  "Tokenized assets can lose value. Only use money you can afford to lose.",
];

const AttestationSheet = ({ visible, theme, onAccept, onDecline, onModalHide }) => {
  const [checked, setChecked] = useState(false);
  return (
    <Modal
      isVisible={visible}
      onBackButtonPress={onDecline}
      style={styles.modal}
      useNativeDriverForBackdrop
      onModalHide={onModalHide}
    >
      <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.headingTx }]}>
          Before you trade tokenized assets
        </Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollIn}>
          {DISCLOSURES.map((d) => (
            <View key={d} style={styles.item}>
              <Text style={[styles.bullet, { color: theme.inactiveTx }]}>•</Text>
              <Text style={[styles.itemTxt, { color: theme.headingTx }]}>{d}</Text>
            </View>
          ))}
          <Text style={[styles.sub, { color: theme.inactiveTx }]}>Issuer terms</Text>
          {ISSUER_TERMS.map((t) => (
            <TouchableOpacity key={t.url} accessibilityRole="link" onPress={() => Linking.openURL(t.url).catch(() => {})}>
              <Text style={[styles.link, { color: theme.buttonColor }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={() => setChecked(!checked)}
          style={styles.check}
        >
          <Icon name={checked ? "checkbox" : "square-outline"} type="ionicon" size={22} color={checked ? theme.buttonColor : theme.inactiveTx} />
          <Text style={[styles.checkTxt, { color: theme.headingTx }]}>
            I am not a US person and not a resident of a restricted country, and I have read the information above.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!checked}
          onPress={onAccept}
          style={[styles.btn, { backgroundColor: theme.buttonColor, opacity: checked ? 1 : 0.4 }]}
        >
          <Text style={styles.btnTxt}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onDecline} style={styles.cancel}>
          <Text style={[styles.cancelTxt, { color: theme.inactiveTx }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

export default AttestationSheet;

const styles = StyleSheet.create({
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 24, maxHeight: "92%" },
  title: { fontSize: 19, fontWeight: "800", marginBottom: 10 },
  scroll: { flexGrow: 0 },
  scrollIn: { paddingBottom: 6 },
  item: { flexDirection: "row", marginBottom: 8 },
  bullet: { width: 14, fontSize: 14, lineHeight: 20 },
  itemTxt: { flex: 1, fontSize: 14, lineHeight: 20 },
  sub: { fontSize: 12, fontWeight: "700", marginTop: 6, marginBottom: 4 },
  link: { fontSize: 14, paddingVertical: 5 },
  check: { flexDirection: "row", alignItems: "flex-start", marginTop: 10 },
  checkTxt: { flex: 1, fontSize: 13, lineHeight: 18, marginLeft: 8 },
  btn: { marginTop: 14, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelTxt: { fontSize: 15, fontWeight: "600" },
});
