import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from "react-native";
import Modal from "react-native-modal";
import Icon from "../../icon";

// One-time attestation + disclosures before first use of Stocks & gold (stored per wallet).
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

// Short first-time sheet: 3 key points, full risk disclosure + issuer terms one tap away, one button.
export const KEY_POINTS = [
  "These tokens are not shares: no voting rights, and the issuer (not SwiftEx) is responsible for them.",
  "The issuer can freeze or claw back tokens.",
  "Not available to US persons or residents of restricted countries.",
];

const AttestationSheet = ({ visible, theme, onAccept, onDecline, onModalHide }) => {
  const [more, setMore] = useState(false);
  return (
    <Modal isVisible={visible} onBackButtonPress={onDecline} style={styles.modal} useNativeDriverForBackdrop onModalHide={onModalHide}>
      <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.headingTx }]}>
          Before you trade stocks & gold
        </Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollIn}>
          {KEY_POINTS.map((d) => (
            <View key={d} style={styles.item}>
              <Text style={[styles.bullet, { color: theme.inactiveTx }]}>•</Text>
              <Text style={[styles.itemTxt, { color: theme.headingTx }]}>{d}</Text>
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={styles.moreHead}>
            <Text style={[styles.moreTxt, { color: theme.buttonColor }]}>Risk disclosure</Text>
            <Icon name={more ? "chevron-up" : "chevron-down"} type="ionicon" size={16} color={theme.buttonColor} />
          </TouchableOpacity>
          {more ? (
            <View>
              {DISCLOSURES.map((d) => (
                <View key={d} style={styles.item}>
                  <Text style={[styles.bullet, { color: theme.inactiveTx }]}>•</Text>
                  <Text style={[styles.smallTxt, { color: theme.inactiveTx }]}>{d}</Text>
                </View>
              ))}
              <Text style={[styles.sub, { color: theme.inactiveTx }]}>Issuer terms</Text>
              {ISSUER_TERMS.map((t) => (
                <TouchableOpacity key={t.url} accessibilityRole="link" onPress={() => Linking.openURL(t.url).catch(() => {})}>
                  <Text style={[styles.link, { color: theme.buttonColor }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" onPress={onAccept} style={[styles.btn, { backgroundColor: theme.buttonColor }]}>
          <Text style={styles.btnTxt}>I understand · I'm not a US person</Text>
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
  title: { fontSize: 19, fontWeight: "800", marginBottom: 12 },
  scroll: { flexGrow: 0 },
  scrollIn: { paddingBottom: 6 },
  item: { flexDirection: "row", marginBottom: 8 },
  bullet: { width: 14, fontSize: 14, lineHeight: 20 },
  itemTxt: { flex: 1, fontSize: 14, lineHeight: 20 },
  smallTxt: { flex: 1, fontSize: 12, lineHeight: 17 },
  moreHead: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  moreTxt: { fontSize: 14, fontWeight: "700", marginRight: 4 },
  sub: { fontSize: 12, fontWeight: "700", marginTop: 6, marginBottom: 4 },
  link: { fontSize: 13, paddingVertical: 5 },
  btn: { marginTop: 14, minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  btnTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelTxt: { fontSize: 15, fontWeight: "600" },
});
