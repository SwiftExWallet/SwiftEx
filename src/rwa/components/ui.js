// Small shared RWA UI pieces: theme hook, logo, header.
import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSelector } from "react-redux";
import { heightPercentageToDP as hp } from "react-native-responsive-screen";
import Icon from "../../icon";
import { colors } from "../../Screens/ThemeColorsConfig";

export const useRwaTheme = () => {
  const isDark = useSelector((state) => state.THEME.THEME) !== false;
  return isDark ? colors.dark : colors.light;
};

// Letter avatar until the image has loaded (and if it fails) — never an empty circle.
export const RwaLogo = ({ asset, size = 40, theme }) => {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const round = { width: size, height: size, borderRadius: size / 2 };
  const letter = (
    <View style={[round, styles.avatar, { backgroundColor: theme.buttonColor }]}>
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.4) }]}>{asset.symbol.charAt(0)}</Text>
    </View>
  );
  if (!asset.logo || failed) return letter;
  return (
    <View style={round}>
      {!loaded ? <View style={StyleSheet.absoluteFill}>{letter}</View> : null}
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: asset.logo }}
        style={round}
        // Android: decode at view size (xStocks logos are 400x400 = ~640 KB each in memory).
        resizeMethod="resize"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
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

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  letter: { color: "#FFFFFF", fontWeight: "800" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8 },
  back: { padding: 4, marginRight: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: "800" },
  right: { minWidth: 24, alignItems: "flex-end" },
});
