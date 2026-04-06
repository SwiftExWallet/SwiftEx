import AsyncStorageLib from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  ScrollView,
  PermissionsAndroid,
  Image,
  Linking,
  ActivityIndicator,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useDispatch, useSelector } from "react-redux";
import ToggleSwitch from "toggle-switch-react-native";
import Icon from "./src/icon";
import { SET_APP_THEME } from "./src/components/Redux/actions/type";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { Wallet_screen_header } from "./src/Dashboard/reusables/ExchangeHeader";
import { colors } from "./src/Screens/ThemeColorsConfig";
import Clipboard from "@react-native-clipboard/clipboard";
import { getApp } from "@react-native-firebase/app";
import { getMessaging, subscribeToTopic, unsubscribeFromTopic } from "@react-native-firebase/messaging";
import messaging from '@react-native-firebase/messaging';
import Modal from "react-native-modal";
import DeviceInfo from "react-native-device-info";
import { alert } from "./src/Dashboard/reusables/Toasts";
import darkBlue from "./assets/darkBlue.png";
import crashlytics from '@react-native-firebase/crashlytics';

const Settings = (props) => {
  const navi = useNavigation();
  const focused = useIsFocused();
  const [Checked, setCheckBox] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [analytics, setAnalytics] = useState(crashlytics().isCrashlyticsCollectionEnabled);
  const [showAbout, setShowAbout] = useState(false);
  const dispatch = useDispatch();
  const state = useSelector((state) => state);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const [notificationLoading,setNotificationLoading] = useState(false);

  const notificationPermissionStatus = async () => {
    try {
      let platformPermission = false;
      if (Platform.OS === 'ios') {
        const authStatus = await messaging().hasPermission();
        platformPermission =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      }
      else if (Platform.OS === 'android' && Platform.Version >= 33) {
        platformPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      }
      else {
        platformPermission = true;
      }

      const storedStatus = await AsyncStorageLib.getItem('notiPermissions');
      let finalStatus;
      if (storedStatus === null) {
        finalStatus = platformPermission;
      } else if (platformPermission === true && storedStatus === "false") {
        finalStatus = false;
      } else {
        finalStatus = platformPermission;
      }
      setNotificationStatus(finalStatus);
    } catch (error) {
      console.error(error)
    }
  }

  const handleCrashAnalytics=async()=>{
    await crashlytics().setCrashlyticsCollectionEnabled(!analytics)
    .then(() => setAnalytics(crashlytics().isCrashlyticsCollectionEnabled));
  }

  useEffect(() => {
    const insilize_data = async () => {
      try {
        const Checked = await AsyncStorageLib.getItem("APP_THEME");
        setCheckBox(Checked === null ? false : Checked === "false" ? false : true);
        await AsyncStorageLib.setItem("APP_THEME", JSON.stringify(state.THEME.THEME));
        await notificationPermissionStatus();
      } catch (error) {
        console.log("====****.", error)
      }
    }
    insilize_data()
  }, [focused, state.THEME.THEME, Checked, notificationStatus])

  const handleNotification = async () => {
    try {
      setNotificationLoading(true);
      const notiStatus = await AsyncStorageLib.getItem("notiPermissions");
      console.log(notiStatus)
      const app = getApp();
      const messagings = getMessaging(app);
      if (notiStatus == null || notiStatus === "false") {
        await subscribeToTopic(messagings, "txUpdates");
        await AsyncStorageLib.setItem("notiPermissions", "true");
        setNotificationStatus(true);
        await notificationPermissionStatus();
        setNotificationLoading(false);
      } else {
        await unsubscribeFromTopic(messagings, "txUpdates");
        await AsyncStorageLib.setItem("notiPermissions", "false");
        setNotificationStatus(false);
        await notificationPermissionStatus();
        setNotificationLoading(false);
      }
    } catch (error) {
      setNotificationLoading(false);
      console.error("handleNotification", error)
    }
  }

  return (
    <View style={{ backgroundColor: theme.bg, height: hp(100) }}>
      <Wallet_screen_header elementestID={"setting_back"} title="Settings" onLeftIconPress={() => navi.goBack()} />
      <View style={[styles.multicardContainer, { backgroundColor: theme.cardBg }]}>
        <TouchableOpacity
          style={[styles.card, { borderBottomColor: theme.inactiveTx }]}
          onPress={() => {
            props.navigation.navigate("AllWallets");
          }}
        >
          <View style={styles.iconCon}>
            <Icon type={"ionicon"} name="wallet" size={31} color={"#4052D6"} />
          </View>
          <Text style={[styles.text, { color: theme.headingTx }]}>Choose Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.card, { borderBottomColor: theme.inactiveTx }]}
          onPress={() => {
            props.navigation.navigate("TokensManagement");
          }}
        >
          <View style={styles.iconCon}>
            <Icon type={"material"} name={"token"} size={31} color={"#4052D6"} />
          </View>
          <Text style={[styles.text, { color: theme.headingTx }]}>Manage Tokens</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cardWithToggel, { borderBottomColor: theme.inactiveTx }]}
          onPress={async () => {
            setCheckBox(!Checked);
            dispatch({
              type: SET_APP_THEME,
              payload: { THEME: Checked === false ? true : false },
            });
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={styles.iconCon}>
              <Icon name="moon-o" type={"fa"} size={31} color={"#4052D6"} />
            </View>
            <Text style={[styles.text, { color: theme.headingTx }]}>Dark Mode</Text>
          </View>
          <View style={Platform.OS == "android" ? { paddingRight: wp(2) } : { paddingRight: wp(3.5) }}>
            <ToggleSwitch
              isOn={Checked}
              onColor="green"
              offColor="gray"
              labelStyle={{ color: "black", fontWeight: "900" }}
              size="small"
              onToggle={async () => {
                setCheckBox(!Checked);
                dispatch({
                  type: SET_APP_THEME,
                  payload: { THEME: Checked === false ? true : false },
                });
              }}
            />
          </View>
        </TouchableOpacity>


        <TouchableOpacity
          style={[styles.card, { borderBottomWidth: 0, borderBottomColor: theme.inactiveTx }]}
          onPress={() => {
            props.navigation.navigate("Transactions");
          }}
        >
          <View style={styles.iconCon}>
            <Icon type={"materials"} name="history" size={31} color={"#4052D6"} />
          </View>
          <Text style={[styles.text, { color: theme.headingTx }]}>Transactions</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.multicardContainer, { backgroundColor: theme.cardBg }]}>
        <TouchableOpacity
          style={[styles.card, { borderBottomColor: theme.inactiveTx }]}
          onPress={() => {
            setShowPrivacy(showPrivacy ? false : true);
          }}
        >
          <View style={styles.iconCon}>
            <Icon type={"materialCommunity"} name="lock" size={31} color={"#4052D6"} />
          </View>
          <Text style={[styles.text, { color: theme.headingTx }]}>Security & Privacy</Text>
        </TouchableOpacity>

        <View
          style={[styles.cardWithToggel, { borderBottomColor: theme.inactiveTx }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={styles.iconCon}>
              <Icon name={"bell"} type={"materialCommunity"} size={31} color={"#4052D6"} />
            </View>
            <Text style={[styles.text, { color: theme.headingTx }]}>Notification</Text>
          </View>
          <View style={Platform.OS == "android" ? { paddingRight: wp(2) } : { paddingRight: wp(3.5) }}>
            {notificationLoading?<ActivityIndicator color={"green"} size={"small"}/>:
              <ToggleSwitch
              isOn={notificationStatus}
              onColor="green"
              offColor="gray"
              onToggle={() => {
                handleNotification()
              }}
            />}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.card, { borderBottomColor: theme.inactiveTx }]}
          onPress={async () => {
            props.navigation.navigate("Biometric");
          }}
        >
          <View style={styles.iconCon}>
            <Icon type={Platform.OS === 'android' ? "ionicon" : "material"} name={Platform.OS === 'android' ? "finger-print" : "lock-outline"} size={31} color={"#4052D6"} />
          </View>
          <Text style={[styles.text, { color: theme.headingTx }]}>{Platform.OS === 'android' ? "Biometric Authenticaton" : "Authenticaton"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderBottomColor: theme.inactiveTx }]}
          onPress={async () => {
            setShowAbout(showAbout ? false : true);
          }}
        >
          <View style={styles.iconCon}>
            <Icon type={"material"} name={"info"} size={31} color={"#4052D6"} />
          </View>
          <Text style={[styles.text, { color: theme.headingTx }]}>About SwiftEx</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderBottomWidth: 0, borderBottomColor: theme.inactiveTx }]}
          onPress={() => { Clipboard.setString("info@swiftexwallet.com"),alert("success","E-mail successfully copied") }}
        >
          <View style={styles.iconCon}>
            <Icon type={"feather"} name="help-circle" size={31} color={"#4052D6"} />
          </View>
          <View>
            <Text style={[styles.text, { color: theme.headingTx }]}>Help Center</Text>
            <Text style={[styles.supportTxt, { color: theme.headingTx }]}>E-mail us at <Text style={[styles.supportTxt, { color: theme.headingTx, fontWeight: "900" }]}>info@swiftexwallet.com</Text></Text>
          </View>
        </TouchableOpacity>

      </View>

      <Modal
        animationType="slide"
        visible={showAbout}
        onRequestClose={() => { setShowAbout(false) }}
        useNativeDriver={true}
        useNativeDriverForBackdrop={true}
        hideModalContentWhileAnimating
        onBackdropPress={() => { setShowAbout(false) }}
        onBackButtonPress={() => { setShowAbout(false) }}
        style={styles.modalContainer}
      >
        <View style={[styles.privacyCon, { backgroundColor: theme.bg, height: hp(60) }]}>
          <TouchableOpacity style={styles.headerCon} onPress={() => { setShowAbout(false) }}>
            <Icon type={"material"} name="keyboard-arrow-left" size={36} color={theme.headingTx} />
            <Text style={[styles.privacyConHeading, { color: theme.headingTx }]}>About SwiftEx</Text>
          </TouchableOpacity>

          <View style={styles.appCon}>
            <Image style={{ width: wp(14), height: hp(10) }} source={darkBlue} />
            <View>
              <Text style={[styles.appConHeading, { color: theme.headingTx }]}>SwiftEx</Text>
              <Text style={[styles.appVersion, { color: theme.inactiveTx }]}>Version 1.1.1</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.privacySubCon, { backgroundColor: theme.cardBg }]} onPress={() => { Linking.openURL("https://swiftexwallet.com/terms-of-service") }}>
            <Text style={[styles.privacyConTxt, { color: theme.headingTx }]}>Terms of Service</Text>
            <Icon type={"material"} name="open-in-new" size={21} color={"#4052D6"} style={{ marginLeft: wp(2) }} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.privacySubCon, { backgroundColor: theme.cardBg }]} onPress={() => { Linking.openURL("https://swiftexwallet.com/privacy-policy") }}>
            <Text style={[styles.privacyConTxt, { color: theme.headingTx }]}>Privacy Policy</Text>
            <Icon type={"material"} name="open-in-new" size={21} color={"#4052D6"} style={{ marginLeft: wp(2) }} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.privacySubCon, { backgroundColor: theme.cardBg }]} onPress={() => { Linking.openURL("https://swiftexwallet.com") }}>
            <Text style={[styles.privacyConTxt, { color: theme.headingTx }]}>Visit Website</Text>
            <Icon type={"material"} name="open-in-new" size={21} color={"#4052D6"} style={{ marginLeft: wp(2) }} />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        visible={showPrivacy}
        onRequestClose={() => { setShowPrivacy(false) }}
        useNativeDriver={true}
        useNativeDriverForBackdrop={true}
        hideModalContentWhileAnimating
        onBackdropPress={() => { setShowPrivacy(false) }}
        onBackButtonPress={() => { setShowPrivacy(false) }}
        style={styles.modalContainer}
      >
        <View style={[styles.privacyCon, { backgroundColor: theme.bg }]}>
          <TouchableOpacity style={styles.headerCon} onPress={() => { setShowPrivacy(false) }}>
            <Icon type={"material"} name="keyboard-arrow-left" size={36} color={theme.headingTx} />
            <Text style={[styles.privacyConHeading, { color: theme.headingTx }]}>Security & Privacy</Text>
          </TouchableOpacity>
          <View style={[styles.privacySubCon, { backgroundColor: theme.cardBg }]}>
            <Text style={[styles.privacyConTxt, { color: theme.headingTx }]}>User ID : </Text>
            <View style={{ flexDirection: "row", width: wp(60) }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: wp(70), paddingVertical: 1, borderRadius: 5 }}>
                <Text style={[styles.privacyConTxt, { color: theme.headingTx }]}>{DeviceInfo.getUniqueIdSync()}</Text>
              </ScrollView>
              <TouchableOpacity onPress={() => { Clipboard.setString(DeviceInfo.getUniqueIdSync()), alert("success", "Device id copy."), setShowPrivacy(false) }}>
                <Icon type={"material"} name="content-copy" size={21} color={"#4052D6"} style={{ marginLeft: wp(2) }} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.privacySubCon, { backgroundColor: theme.cardBg }]}>
            <Text style={[styles.privacyConTxt, { color: theme.headingTx }]}>Share Anonymous Analytics </Text>
            <ToggleSwitch
              isOn={analytics}
              onColor="green"
              offColor="gray"
              labelStyle={{ color: "black", fontWeight: "900" }}
              size="small"
              onToggle={() => {
                handleCrashAnalytics();
              }}
            />
          </View>
          <Text style={[styles.infoTxt, { color: theme.inactiveTx }]}>SwiftEx does not use your personal information for analytics purposes.</Text>
        </View>
      </Modal>
    </View>
  );
};

export default Settings;
const styles = StyleSheet.create({
  text: {
    color: "black",
    fontSize: hp("2"),
    fontWeight: "600",
    marginHorizontal: wp(1.5),
  },
  singleCard: {
    width: wp(93),
    flexDirection: "row",
    alignSelf: "center",
    borderRadius: 20,
    marginTop: hp(1.5),
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    paddingVertical: hp(0.6),
    paddingHorizontal: 10,
  },
  card: {
    width: wp(90),
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1
  },
  multicardContainer: {
    width: wp(93),
    justifyContent: "center",
    alignSelf: "center",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: hp(1),
    marginTop: hp(1.5)
  },
  cardWithToggel: {
    width: wp(90),
    flexDirection: "row",
    alignSelf: "center",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1
  },
  iconCon: {
    width: 58,
    height: 63,
    marginLeft: 10,
    marginRight: wp(0.1),
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    width: wp(93),
    alignSelf: "center",
    borderRadius: 16,
    paddingHorizontal: wp(3.3),
    paddingVertical: hp(1.4),
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
  },
  profileInfoContainer: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: hp(0),
  },
  profileEmail: {
    marginTop: hp(-0.3),
    fontSize: 16
  },
  profileIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: wp(2),
    borderWidth: 0.8,
    borderColor: "#4052D6",
    elevation: 10
  },
  profileIconTxt: {
    fontSize: 30,
    fontWeight: "500",
  },
  loginBtn: {
    paddingHorizontal: wp(4),
    paddingVertical: hp(0.7),
    backgroundColor: "#4052D6",
    borderRadius: 10,
    alignContent: "center",
    justifyContent: "center"
  },
  loginBtnTxt: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "400"
  },
  skeletonCard: {
    width: wp(93),
    alignSelf: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
  skeletonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
    justifyContent: 'center',
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  supportTxt: {
    marginTop: hp(0.2),
    maxWidth: wp(70),
    fontSize: 15,
    fontWeight: "500",
    marginHorizontal: wp(1.5),
  },
  modalContainer: {
    justifyContent: "flex-end",
    margin: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)"
  },
  privacyCon: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: hp(30),
    paddingTop: hp(3),
    paddingHorizontal: wp(4),
  },
  privacySubCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 13,
    borderRadius: 10,
    marginTop: hp(1.3)
  },
  privacyConTxt: {
    fontSize: 18,
    fontWeight: "500"
  },
  privacyConHeading: {
    fontSize: 22.9,
    fontWeight: "500"
  },
  infoTxt: {
    fontSize: 14,
    paddingLeft: 6,
    textAlign: "left",
    marginTop: hp(0.5)
  },
  appCon: {
    paddingVertical: hp(2),
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center"
  },
  appConHeading: {
    marginTop: -5,
    fontSize: 40,
    fontWeight: "600"
  },
  appVersion: {
    fontSize: 15,
    marginTop: -5,
    marginLeft: wp(1)
  },
  headerCon: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center"
  }
});