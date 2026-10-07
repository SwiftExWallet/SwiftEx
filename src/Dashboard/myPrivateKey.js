import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import Icon from "../icon";
import { colors } from "../Screens/ThemeColorsConfig";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { alert } from "./reusables/Toasts";

const MyPrivateKey = () => {
  const navigation = useNavigation();
  const state = useSelector((reduxState) => reduxState);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [loading, setLoading] = useState(false);

  const openNativeBackup = async () => {
    try {
      setLoading(true);
      const response = await NativeModules.StorageModule.openWalletBackupScreen();
      if (response?.success) {
        alert("success", "Secret backup opened");
      }
    } catch (error) {
      console.log("openWalletBackupScreen error", error);
      alert("error", "Unable to open secret backup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Wallet_screen_header title="Secret Key" onLeftIconPress={() => navigation.goBack()} />
      <View style={styles.body}>
        <Icon
          name="shield-key-outline"
          type="materialCommunity"
          size={72}
          color={colors.dark.buttonColor}
        />
        <Text style={styles.title}>Secure Wallet Backup</Text>
        <Text style={styles.description}>
          View your recovery details in the device-protected native screen.
        </Text>
        <TouchableOpacity
          style={[styles.button, loading && styles.disabledButton]}
          disabled={loading}
          onPress={openNativeBackup}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Open Secure Backup</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MyPrivateKey;

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wp(8),
    paddingBottom: hp(10),
  },
  title: {
    color: theme.headingTx,
    fontSize: 20,
    fontWeight: "600",
    marginTop: hp(3),
    textAlign: "center",
  },
  description: {
    color: theme.inactiveTx,
    fontSize: 15,
    lineHeight: 22,
    marginTop: hp(1.5),
    textAlign: "center",
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.dark.buttonColor,
    borderRadius: 16,
    marginTop: hp(4),
    paddingVertical: hp(1.8),
    width: wp(82),
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
