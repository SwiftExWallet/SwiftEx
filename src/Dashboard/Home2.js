import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  AppState,
  BackHandler,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { setUser, setWalletType } from "../components/Redux/actions/auth";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import InvestmentChart from "./InvestmentChart";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { setCurrentWallet } from "../components/Redux/actions/auth";
import { useNavigationState } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import LockAppModal from "./Modals/lockAppModal";
import useFirebaseCloudMessaging from "./notifications/firebaseNotifications";
import CustomInfoProvider from "./exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";

const Home2 = ({ navigation }) => {
  const state = useSelector((state) => state);
  const dispatch = useDispatch();
  const currentState = useRef(AppState.currentState);
  const [visible, setVisible] = useState(false)
  const { getToken, requestUserPermission } = useFirebaseCloudMessaging();
  const SetCurrentWallet = async () => {
    let user = await AsyncStorageLib.getItem("currentWallet");
    let mainUser = await AsyncStorageLib.getItem("user");
    let walletType = await AsyncStorageLib.getItem("walletType");
    let wallet = await AsyncStorageLib.getItem(`Wallet`).then((wallet) => {
      if (JSON.parse(wallet).xrp) {
        dispatch(
          setCurrentWallet(
            JSON.parse(wallet).address,
            user,
            JSON.parse(wallet).privateKey,
            JSON.parse(wallet).mnemonic,
            JSON.parse(wallet).xrp.address
              ? JSON.parse(wallet).xrp.address
              : "",
            JSON.parse(wallet).xrp.privateKey
              ? JSON.parse(wallet).xrp.privateKey
              : "",
            (walletType = "Multi-coin")
          )
        );
      } else {
        dispatch(
          setCurrentWallet(
            JSON.parse(wallet).address,
            user,
            JSON.parse(wallet).privateKey
          )
        );
      }
      dispatch(setWalletType(JSON.parse(walletType)));
      dispatch(setUser(mainUser));
    });
    return wallet;
  };

  useEffect(() => {
    const setupWallet = async () => {
      try {
        requestUserPermission();
        getToken();
        await SetCurrentWallet()
      } catch (e) {
        console.log(e);
      }
    }
    setupWallet()
  }, []);

  const currentRout = useNavigationState(state => {
    const route = state.routes[state.index];
    return route.name;
  });

  const extractRouteName = (key) => {
    const [routeName] = key.split('-');
    return routeName;
  };
  const currentRoute = useNavigationState(state => state.routes[state.index]?.state?.history[1]?.key);
  useEffect(() => {
    const handleAppStateChange = (changedState) => {
      currentState.current = changedState;
      console.log(currentState.current);

      if (currentState.current === "background") {
        if (currentRoute && (extractRouteName(currentRoute) === "On/Off Ramp" || currentRout === "Wallet")) {
        } else {
          setVisible(true);
        }
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [currentRoute, currentRout]);


  useFocusEffect(
    React.useCallback(() => {
      const backAction = () => {
        CustomInfoProvider.show("Hold on!", "Are you sure you want to exit?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: () => BackHandler.exitApp() },
        ])
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => backHandler.remove();
    }, [])
  );

  return (
    <View style={{ backgroundColor: state.THEME.THEME === false ? "#fff" : "#1B1B1C" }}>
      <View style={[Styles.container, { backgroundColor: state.THEME.THEME === false ? "#fff" : "#1B1B1C" }]}>
        {/* <InvestmentChart/> */}
      </View>
      <LockAppModal pinViewVisible={visible} setPinViewVisible={setVisible} />
    </View>
  );
};

export default Home2;
const Styles = StyleSheet.create({
  container: {
    marginTop:hp(3),
    height: hp(90),
    width: wp("100"),
    borderTopRightRadius: 20,
    borderTopLeftRadius: 20,
  },
});