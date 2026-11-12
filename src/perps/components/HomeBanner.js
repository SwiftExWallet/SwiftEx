import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "../../icon";

// Simple home banner card (icon + title + subtitle + arrow). Used for "Trade Perps" and "Discover".
const HomeBanner = ({ theme, title, subtitle, icon, iconType, highlighted, onPress }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={title}
    activeOpacity={0.8}
    style={[
      styles.card,
      {
        backgroundColor: theme.cardBg,
        borderColor: highlighted ? theme.buttonColor : "transparent",
      },
    ]}
    onPress={onPress}
  >
    <View style={[styles.iconWrap, { backgroundColor: theme.buttonColor }]}>
      <Icon name={icon} type={iconType} size={24} color="#FFFFFF" />
    </View>
    <View style={styles.textWrap}>
      <Text style={[styles.title, { color: theme.headingTx }]}>{title}</Text>
      <Text style={[styles.sub, { color: theme.inactiveTx }]}>{subtitle}</Text>
    </View>
    <Icon name="arrow-forward" type="ionicon" size={22} color={theme.buttonColor} />
  </TouchableOpacity>
);

export default HomeBanner;

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  sub: {
    fontSize: 14,
    marginTop: 2,
  },
});
