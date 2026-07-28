import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Text } from "react-native-paper";
import RecieveModal from "./Modals/RecieveModal";
import { useNavigation } from "@react-navigation/native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useDispatch, useSelector } from "react-redux";
import { Animated } from "react-native";
import SwapModal from "./Modals/SwapModal";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import Icon from "../icon";
import Wallet_selection_bottom from "./Wallets/Wallet_selection_bottom";
import {
  MULTICHAIN_PORTFOLIO,
  PORTFOLIO_CONFIG,
} from "../components/Redux/actions/type";
import Modal from "react-native-modal";
import InvestmentChart from "./InvestmentChart";
import WalletConnect from "../Dashboard/walletConnect/WalletConnect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAssetId } from "../utilities/TokenManageHook";
import { GetWalletTokens } from "../utilities/TokenUtils";
import CustomInfoProvider from "./exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import { colors } from "../Screens/ThemeColorsConfig";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental(true)
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MyHeader2 = ({ title, changeState, state, extended, setExtended }) => {
  state = useSelector((state) => state);
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalVisible2, setModalVisible2] = useState(false);
  const [modalVisible3, setModalVisible3] = useState(false);
  const [swapType, setSwapType] = useState("");
  const [user, setUser] = useState("");
  const [balanceUsd, setBalance] = useState(0.0);
  const [Wallet_modal, setWallet_modal] = useState(false);
  const [Loading_upper, setLoading_upper] = useState(true);
  const [walletSyncShow, setWalletSyncShow] = useState(false);
  const [pull, setPull] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  if (Platform.OS === "android") {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }

  const openModal2 = () => {
    setModalVisible(false);
    setModalVisible2(true);
    setModalVisible3(false);
  };

  const openModal3 = async () => {
    const walletType = await AsyncStorageLib.getItem("walletType");
    console.log(JSON.parse(walletType));
    if (!JSON.parse(walletType))
      return alert("please select a wallet first to swap tokens");
    if (
      JSON.parse(walletType) === "BSC" ||
      JSON.parse(walletType) === "Ethereum" ||
      JSON.parse(walletType) === "Multi-coin"
    ) {
      setModalVisible(false);
      setModalVisible2(false);
      navigation.navigate("EthSwap");
    } else {
      alert("Swapping is only supported for Ethereum and Binance ");
    }
  };

  const openModal4 = async () => {
    navigation.navigate("BridgeAssets");
  };

  const translation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();

    Animated.timing(translation, {
      toValue: 1,
      delay: 0.1,
      useNativeDriver: true,
    }).start();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, []);

  useEffect(() => {
    const set_user_current = async () => {
      try {
        const user = await state.wallet.name;
        if (user) {
          setUser(user);
        }
        setTimeout(() => {
          setLoading_upper(false);
        }, 600);
      } catch (error) {
        console.log("::::", error);
      }
    };
    set_user_current();
  }, [state.wallet.name]);

  const handleClosewalletmodal = () => {
    setWallet_modal(false);
  };

  const isDark = state.THEME.THEME;

  const theme = isDark ? colors.dark : colors.light;
  const themeColors = {
    bg: theme.bg,
    text: theme.headingTx,
    header: theme.bg,
    card: theme.cardBg,
    icon: theme.headingTx,
    subText: theme.cardSubTx,
    pill: theme.smallCardBg,
  };

  const mergeWithApiTokens = async (apiTokens) => {
    try {
      const stored = await AsyncStorage.getItem(
        `${state?.wallet?.address}_${state.STELLAR_PUBLICK_KEY}`,
      );
      const savedTokens = stored ? JSON.parse(stored) : [];
      const savedMap = new Map(savedTokens.map((t) => [getAssetId(t), t]));

      const merged = apiTokens.map((apiToken) => {
        const id = getAssetId(apiToken);
        const savedToken = savedMap.get(id);

        if (savedToken) {
          return {
            ...apiToken,
            active: savedToken.active,
          };
        }

        if (
          apiToken &&
          apiToken.balanceUSD !== undefined &&
          apiToken.balanceUSD !== null
        ) {
          const balanceVal = parseFloat(apiToken.balanceUSD);
          if (balanceVal <= 0) {
            return apiToken;
          }

          const isWorthy = balanceVal >= 0.5;
          return {
            ...apiToken,
            active: isWorthy ? true : false,
          };
        }

        return apiToken;
      });
      const apiIds = new Set(apiTokens.map(getAssetId));
      const customTokens = savedTokens.filter(
        (t) => !apiIds.has(getAssetId(t)),
      );

      dispatch({
        type: MULTICHAIN_PORTFOLIO,
        payload: {
          activeWalletPortFolio: [...merged, ...customTokens],
        },
      });
    } catch (e) {
      console.error("merge error", e);
    }
  };

  const PullRefreshPortFollio = async (
    evmAddress,
    stellarAddress,
    dydxAddress,
  ) => {
    try {
      const walletInfo = await GetWalletTokens(
        evmAddress,
        stellarAddress,
        dydxAddress,
      );
      if (walletInfo.tokens.length > 1) {
        await mergeWithApiTokens(walletInfo.tokens);
        dispatch({
          type: PORTFOLIO_CONFIG,
          payload: {
            isTotalInUSDVisible: true,
            totalInUSD: walletInfo.totalValueUSD,
            totalStellarInUSD: walletInfo.totalSTRUSD,
          },
        });
        return { status: true, messaeg: "done" };
      } else {
        return { status: true, messaeg: "done" };
      }
    } catch (error) {
      return { status: false, messaeg: error };
    }
  };

  const managePullRefresh = async () => {
    try {
      setPull(true);
      await PullRefreshPortFollio(
        state?.wallet?.address,
        state.STELLAR_PUBLICK_KEY,
        state.DYDX_ADDRESS_KEY,
      );
      setPull(false);
    } catch (error) {
      console.error("error in managePullRefresh:", error);
      setPull(false);
    }
  };

  const hasChangeData =
    state?.totalChangeUSD !== undefined &&
    state?.totalChangePercent !== undefined;
  const isPositiveChange = hasChangeData
    ? Number(state.totalChangeUSD) >= 0
    : true;

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: themeColors.bg,
          paddingTop: Platform.OS === "ios" ? hp(5) : 0,
        },
      ]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={pull}
            tintColor="#4CA6EA"
            onRefresh={() => {
              managePullRefresh();
            }}
          />
        }
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={themeColors.header}
        />

        {Loading_upper ? (
          <ActivityIndicator color="green" />
        ) : (
          <View
            style={[
              styles.headerContainer,
              { backgroundColor: themeColors.header },
            ]}
          >
            <View style={styles.walletCon}>
              {/* Top row: wallet selector + history / scan / settings */}
              <View style={styles.walletTopRow}>
                <TouchableOpacity
                  style={[
                    styles.walletNameCon,
                    { backgroundColor: themeColors.card },
                  ]}
                  onPress={() => setWallet_modal(true)}
                >
                  <Icon
                    name="wallet-outline"
                    type="ionicon"
                    size={18}
                    color={themeColors.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[styles.walletNameText, { color: themeColors.text }]}
                  >
                    {user ? user.slice(0, 14) : "Wallet"}
                  </Text>
                  <Icon
                    name="chevron-down-outline"
                    type="ionicon"
                    size={19}
                    color={themeColors.text}
                  />
                </TouchableOpacity>

                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity
                    style={styles.topIconBtn}
                    onPress={() => {
                      navigation.navigate("Transactions");
                    }}
                  >
                    <Icon
                      name="history"
                      type="material"
                      size={24}
                      color={themeColors.text}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.topIconBtn}
                    onPress={() => {
                      setWalletSyncShow(true);
                    }}
                  >
                    <Icon
                      name="qr-code-scanner"
                      type="material"
                      size={24}
                      color={themeColors.text}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.topIconBtn}
                    onPress={() => {
                      navigation.navigate("Settings");
                    }}
                  >
                    <Icon
                      name="settings"
                      type="feather"
                      size={22}
                      color={themeColors.text}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Portfolio balance */}
              <View style={styles.balanceSection}>
                <View style={styles.balanceLabelRow}>
                  <Text
                    style={[
                      styles.balanceLabel,
                      { color: themeColors.subText },
                    ]}
                  >
                    Portfolio Balance
                  </Text>
                  <Icon
                    name={
                      state && state.isTotalInUSDVisible ? "eye-off" : "eye"
                    }
                    type="ionicon"
                    size={18}
                    color={themeColors.subText}
                    onPress={() =>
                      dispatch({
                        type: PORTFOLIO_CONFIG,
                        payload: {
                          isTotalInUSDVisible:
                            state && state.isTotalInUSDVisible === true
                              ? false
                              : true,
                          totalInUSD: state && state.totalInUSD,
                          totalStellarInUSD: state && state.totalSTRUSD,
                        },
                      })
                    }
                  />
                </View>

                <Text
                  style={[styles.walletBalText, { color: themeColors.text }]}
                >
                  {state && state.isTotalInUSDVisible
                    ? `$${state && state.totalInUSD === undefined ? "0.00" : state.totalInUSD}`
                    : "$ X.XX"}
                </Text>

                {hasChangeData && (
                  <View style={styles.changeRow}>
                    <Icon
                      name={isPositiveChange ? "caret-up" : "caret-down"}
                      type="ionicon"
                      size={14}
                      color={isPositiveChange ? "#3DD873" : "#FF5C5C"}
                    />
                    <Text
                      style={[
                        styles.changeText,
                        { color: isPositiveChange ? "#3DD873" : "#FF5C5C" },
                      ]}
                    >
                      {" "}
                      ${Math.abs(state.totalChangeUSD)} (
                      {state.totalChangePercent}%)
                    </Text>
                    <View
                      style={[
                        styles.changeBadge,
                        { backgroundColor: themeColors.pill },
                      ]}
                    >
                      <Text
                        style={[
                          styles.changeBadgeText,
                          { color: themeColors.subText },
                        ]}
                      >
                        24h
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Send / Receive / Swap / Buy */}
              <View style={styles.featureCon}>
                {[
                  {
                    name: "Send",
                    icon: "paper-plane-outline",
                    type: "ionicon",
                    action: () => {
                      navigation.navigate("Send");
                    },
                  },
                  {
                    name: "Receive",
                    icon: "vertical-align-bottom",
                    type: "material",
                    action: openModal2,
                  },
                  {
                    name: "Swap",
                    icon: "swap-vert",
                    type: "material",
                    action: openModal3,
                  },
                  {
                    name: "Buy",
                    icon: "credit-card",
                    type: "entypo",
                    action: () => navigation.navigate("payout"),
                  },
                ].map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.featureCard,
                      { backgroundColor: themeColors.card },
                    ]}
                    onPress={item.action}
                  >
                    <Icon
                      name={item.icon}
                      type={item.type}
                      size={24}
                      color={themeColors.text}
                    />
                    <Text
                      style={[styles.featureText, { color: themeColors.text }]}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Assets header row */}
              <View style={styles.assetsHeaderRow}>
                <Text style={[styles.assetsTitle, { color: themeColors.text }]}>
                  Assets
                </Text>
                <TouchableOpacity
                  style={[
                    styles.manageBtn,
                    { backgroundColor: themeColors.card },
                  ]}
                  onPress={() => {
                    navigation.navigate("TokensManagement");
                  }}
                >
                  <Text style={styles.manageBtnText}>Manage</Text>
                  <Icon
                    name="options"
                    type="ionicon"
                    size={17}
                    color="#8B90F5"
                  />
                </TouchableOpacity>
              </View>

            </View>
            <InvestmentChart />
          </View>
        )}

        <RecieveModal
          modalVisible={modalVisible2}
          setModalVisible={setModalVisible2}
        />
        <SwapModal
          modalVisible={modalVisible3}
          setModalVisible={setModalVisible3}
          swapType={swapType}
        />

        <Modal
          isVisible={Wallet_modal}
          onBackdropPress={() => {
            setWallet_modal(false);
          }}
          onBackButtonPress={() => {
            setWallet_modal(false);
          }}
          animationIn="slideInUp"
          animationOut="slideOutDown"
          backdropOpacity={0.5}
          style={{ justifyContent: "flex-end", margin: 0 }}
        >
          <View
            style={[
              styles.modalView,
              {
                backgroundColor: theme.cardBg,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ marginHorizontal: 5 }}>
                <Text style={[styles.modalText, { color: themeColors.text }]}>
                  Choose wallet
                </Text>
                <Text
                  style={[styles.modalSubText, { color: themeColors.text }]}
                >
                  Switch active wallet
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => [
                  setWallet_modal(false),
                  navigation.navigate("Wallet"),
                ]}
                style={{
                  backgroundColor: "#5B65E1",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 10,
                  flexDirection: "row",
                }}
              >
                <Icon name={"add"} type={"ionicon"} size={24} color={"#fff"} />
                <Text style={[styles.modalText, { color: "#fff" }]}>
                  {" "}
                  Add Wallet
                </Text>
              </TouchableOpacity>
            </View>
            <Wallet_selection_bottom onClose={handleClosewalletmodal} />
          </View>
        </Modal>
      </ScrollView>
      <WalletConnect
        visible={walletSyncShow}
        onClose={() => {
          setWalletSyncShow(false);
        }}
        isDark={true}
      />
    </View>
  );
};

export default MyHeader2;

const styles = StyleSheet.create({
  safeArea: {
    width: "100%",
  },
  headerContainer: {
    width: wp(100),
  },
  walletCon: {
    paddingHorizontal: 19,
    marginTop: 16,
  },
  walletTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  walletNameCon: {
    maxWidth: "60%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  walletNameText: {
    fontSize: 17,
    fontWeight: "700",
    marginRight: 5,
  },
  topIconBtn: {
    padding: 8,
    marginLeft: 6,
  },
  balanceSection: {
    marginTop: 24,
  },
  balanceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 15,
    fontWeight: "500",
    marginRight: 8,
  },
  walletBalText: {
    fontSize: 44,
    fontWeight: "800",
    marginTop: 4,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  changeText: {
    fontSize: 15,
    fontWeight: "600",
  },
  changeBadge: {
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  changeBadgeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  featureCon: {
    flexDirection: "row",
    marginTop: 24,
    justifyContent: "space-between",
    alignItems: "center",
  },
  featureCard: {
    alignItems: "center",
    justifyContent: "center",
    width: wp(20.5),
    height: 78,
    borderRadius: 20,
  },
  featureText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "500",
  },
  assetsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 16,
  },
  assetsTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  manageBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#8B90F5",
    marginRight: 6,
  },
  modalBackground: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  modalView: {
    width: wp(100),
    height: hp(45),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingVertical: hp(1.5),
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    width: wp(100),
    marginTop: 5,
    paddingVertical: 5,
    paddingHorizontal: 19,
    justifyContent: "space-between",
    marginBottom: 19,
  },
  modalText: {
    fontSize: 18,
    fontWeight: "400",
  },
  modalSubText: {
    fontSize: 15,
    fontWeight: "200",
  },
  topHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 15,
    position: "relative",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#222",
  },
  iconButton: {
    position: "absolute",
    right: 15,
    padding: 5,
  }
});