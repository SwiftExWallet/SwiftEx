import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useAssetLogos, logoCandidates } from "../hooks/useAssetLogos";

// Round coin logo: Aster logo -> app's CoinGecko image -> letter avatar (also when an image fails to load).
const CoinLogo = ({ asset, size = 40, theme, style }) => {
  const map = useAssetLogos();
  const sources = useMemo(() => logoCandidates(asset, map), [asset, map]);
  const [failed, setFailed] = useState(0); // how many candidates failed to load
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(0);
    setLoaded(false);
  }, [sources]);

  const round = { width: size, height: size, borderRadius: size / 2 };
  const uri = sources[failed];
  return (
    <View style={[round, style]}>
      {!loaded ? (
        <View style={[round, styles.avatar, { backgroundColor: theme.buttonColor }]}>
          <Text style={[styles.letter, { fontSize: Math.round(size * 0.42) }]}>
            {String(asset || "?").charAt(0)}
          </Text>
        </View>
      ) : null}
      {uri ? (
        <Image
          key={uri}
          accessibilityIgnoresInvertColors
          source={{ uri }}
          style={[round, styles.img]}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed((n) => n + 1);
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  img: { position: "absolute", top: 0, left: 0, backgroundColor: "transparent" },
  avatar: { alignItems: "center", justifyContent: "center" },
  letter: { color: "#FFFFFF", fontWeight: "700" },
});

export default React.memo(CoinLogo);
