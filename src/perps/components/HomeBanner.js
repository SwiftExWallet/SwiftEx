import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "../../icon";
import { getCachedMarketMeta } from "../api/asterPublic";
import { perpsBannerSubtitle } from "../utils/positionFocus";

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

// Live market count for the "Trade Perps" banner: the in-memory market rules if loaded, else the
// saved market list (perps_markets_cache, written by useAsterMarkets). No network request.
const usePerpsMarketCount = () => {
  const [n, setN] = useState(() => {
    const m = getCachedMarketMeta();
    return m ? Object.keys(m).length : null;
  });
  useEffect(() => {
    if (n) return undefined;
    let cancelled = false;
    AsyncStorage.getItem("perps_markets_cache")
      .then((raw) => {
        const c = raw ? JSON.parse(raw) : null;
        if (!cancelled && c && Array.isArray(c.markets) && c.markets.length) setN(c.markets.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return n;
};

// Home "Trade Perps" banner. Neutral copy: never advertises a max leverage (it varies by market).
export const PerpsBanner = ({ theme, onPress }) => {
  const count = usePerpsMarketCount();
  return (
    <HomeBanner
      theme={theme}
      highlighted
      title="Trade Perps"
      subtitle={perpsBannerSubtitle(count)}
      icon="candlestick-chart"
      iconType="material"
      onPress={onPress}
    />
  );
};

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
