import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { RWA_ENABLED } from "../config";
import { useRwaAvailability } from "../useRwaAvailability";
import { useRwaTheme } from "./ui";

// "Tokens | Stocks & RWA" switch at the top of the Swap screen. Renders nothing when RWA is off
// (release builds) or not available for the user's country, so the Swap screen looks as before.
const Entry = () => {
  const navigation = useNavigation();
  const theme = useRwaTheme();
  const { rwaVisible } = useRwaAvailability();
  if (!rwaVisible) return null;
  return (
    <View style={[styles.seg, { backgroundColor: theme.cardBg }]}>
      <View style={[styles.btn, { backgroundColor: theme.buttonColor }]}>
        <Text style={[styles.txt, { color: "#FFFFFF" }]}>Tokens</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Stocks and gold"
        style={styles.btn}
        onPress={() => navigation.navigate("RwaHome")}
      >
        <Text style={[styles.txt, { color: theme.inactiveTx }]}>Stocks & gold</Text>
      </TouchableOpacity>
    </View>
  );
};

const RwaSwapEntry = () => (RWA_ENABLED ? <Entry /> : null);
export default RwaSwapEntry;

const styles = StyleSheet.create({
  seg: { flexDirection: "row", borderRadius: 12, padding: 4, marginHorizontal: 16, marginTop: 4, marginBottom: 4 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  txt: { fontSize: 14, fontWeight: "600" },
});
