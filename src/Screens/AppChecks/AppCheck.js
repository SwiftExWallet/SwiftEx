import { useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, BackHandler, Linking } from 'react-native';
import darkBlue from '../../../assets/darkBlue.png'
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";
import { getAppStoreUrl } from './appVersionUtils';
export const AppCheck = ({ route }) => {
  const indexId = route.params?.info ?? 0;
  const updateInfo = route.params?.updateInfo;
  const isUpdateRequired = indexId === 2;
  const info = [
    {
      heading: "Currently Unavailable in Your Area",
      subHeading: "This service has not yet launched in your region. Stay tuned — we hope to serve your area in the near future."
    },
    {
      heading: "We're Currently Experiencing Issues",
      subHeading: "We are currently investigating a service disruption affecting some users. We apologize for the inconvenience and appreciate your understanding while we resolve this issue."
    },
    {
      heading: "App Update Required",
      subHeading: "Please update SwiftEx Wallet to the latest version to continue using the app."
    }
  ]

  useEffect(() => {
    if (!isUpdateRequired) {
      return undefined;
    }

    const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => backSubscription.remove();
  }, [isUpdateRequired]);

  const openStore = async () => {
    const storeUrl = getAppStoreUrl(updateInfo?.platform);
    if (storeUrl) {
      await Linking.openURL(storeUrl);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.upperCon}>
        <Image source={darkBlue} style={styles.imageCon} />
        <Text style={styles.headingText}>{info[indexId].heading}</Text>
        <Text style={styles.subHeadingText}>
          {isUpdateRequired
            ? `${info[indexId].subHeading}\n\nCurrent version: ${updateInfo?.currentVersion || "—"}\nLatest version: ${updateInfo?.latestVersion || "—"}`
            : info[indexId].subHeading}
        </Text>
      </View>
      <TouchableOpacity style={styles.btnCon} onPress={isUpdateRequired ? openStore : () => BackHandler.exitApp()}>
        <Text style={styles.btnTxt}>{isUpdateRequired ? "Update" : "Okay"}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "black"
  },
  imageCon: {
    width: wp(65),
    height: hp(25),
  },
  headingText: {
    fontSize: 18,
    color: "#fff",
    width: "90%",
    textAlign: "center",
    fontWeight: "800",
    paddingVertical: hp(2)
  },
  subHeadingText: {
    fontSize: 15,
    color: "#fff",
    width: "90%",
    textAlign: "center",
    fontWeight: "600",
    marginTop: hp(-1)
  },
  upperCon: {
    height: hp(80),
    width: wp(100),
    alignItems: "center",
    justifyContent: "center"
  },
  btnCon: {
    height: hp(6),
    justifyContent: "center",
    borderRadius: 20,
    width: wp(95),
    backgroundColor: "#4052D6"
  },
  btnTxt: {
    color: "#fff",
    fontSize: 20,
    textAlign: "center",
    fontWeight: "400"
  }
});
