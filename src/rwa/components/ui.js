// Small shared RWA UI pieces: theme hook, logo, badges, header.
import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSelector } from "react-redux";
import { heightPercentageToDP as hp } from "react-native-responsive-screen";
import Icon from "../../icon";
import { colors } from "../../Screens/ThemeColorsConfig";
import { CHAIN_INFO } from "../config";

export const useRwaTheme = () => {
  const isDark = useSelector((state) => state.THEME.THEME) !== false;
  return isDark ? colors.dark : colors.light;
};

export const RwaLogo = ({ asset, size = 40, theme }) => {
  const [failed, setFailed] = useState(false);
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (!asset.logo || failed) {
    return (
      <View style={[round, styles.avatar, { backgroundColor: theme.buttonColor }]}>
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.4) }]}>{asset.symbol.charAt(0)}</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri: asset.logo }}
      style={[round, { backgroundColor: theme.cardBg }]}
      onError={() => setFailed(true)}
    />
  );
};

export const ChainBadge = ({ chain, theme }) => (
  <View style={[styles.badge, { borderColor: theme.inactiveTx }]}>
    <Text style={[styles.badgeTxt, { color: theme.inactiveTx }]}>{CHAIN_INFO[chain] ? CHAIN_INFO[chain].label : chain}</Text>
  </View>
);

// Several chains in one badge: "ETH · BNB".
export const ChainsBadge = ({ chains, theme }) => (
  <View style={[styles.badge, { borderColor: theme.inactiveTx }]}>
    <Text style={[styles.badgeTxt, { color: theme.inactiveTx }]}>
      {chains.length === 1 && CHAIN_INFO[chains[0]] ? CHAIN_INFO[chains[0]].label : chains.map((c) => (CHAIN_INFO[c] ? CHAIN_INFO[c].short : c)).join(" · ")}
    </Text>
  </View>
);

const STATUS_COLOR = (theme, status) =>
  status === "core" || status === "24-7"
    ? theme.success
    : status === "closed" || status === "halted"
    ? theme.inactiveTx
    : theme.warn;

export const StatusBadge = ({ status, label, theme }) => {
  const c = STATUS_COLOR(theme, status) || theme.inactiveTx;
  return (
    <View style={styles.statusWrap} accessibilityLabel={`Market ${label}`}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.statusTxt, { color: c }]}>{label}</Text>
    </View>
  );
};

export const RwaHeader = ({ title, onBack, theme, right }) => (
  <View style={[styles.header, { paddingTop: Platform.OS === "ios" ? hp(6) : hp(2) }]}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back} hitSlop={10}>
      <Icon name="arrow-back" type="ionicon" size={24} color={theme.headingTx} />
    </TouchableOpacity>
    <Text style={[styles.title, { color: theme.headingTx }]} numberOfLines={1}>
      {title}
    </Text>
    <View style={styles.right}>{right || null}</View>
  </View>
);

export const DevBanner = ({ theme, text }) => (
  <View style={[styles.dev, { backgroundColor: theme.cardBg }]}>
    <Text style={[styles.devTxt, { color: theme.warn }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  letter: { color: "#FFFFFF", fontWeight: "800" },
  badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
  badgeTxt: { fontSize: 10, fontWeight: "600" },
  statusWrap: { flexDirection: "row", alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusTxt: { fontSize: 11, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8 },
  back: { padding: 4, marginRight: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: "800" },
  right: { minWidth: 24, alignItems: "flex-end" },
  dev: { marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 10 },
  devTxt: { fontSize: 12, fontWeight: "600" },
});
