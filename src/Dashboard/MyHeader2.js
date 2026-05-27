import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
  TouchableOpacity,
  StatusBar, ActivityIndicator,
  ScrollView
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
import { PORTFOLIO_CONFIG } from "../components/Redux/actions/type";
import Modal from "react-native-modal";
import InvestmentChart from "./InvestmentChart";
import WalletConnect from "../Dashboard/walletConnect/WalletConnect"
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
  const openModal3= async()=>{
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
      navigation.navigate("EthSwap")
    } else {
      alert("Swapping is only supported for Ethereum and Binance ");
    }
  }
  const openModal4= async()=>{
    navigation.navigate("BridgeAssets");
  }

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
    const set_user_current=async()=>{
      try {
        const user = await state.wallet.name;
        if (user) {
          setUser(user);
        }
        setTimeout(()=>{
          setLoading_upper(false)
        },600)
      } catch (error) {
        console.log("::::",error)
      }
    }
    set_user_current()
  }, [state.wallet.name]);
  const handleClosewalletmodal = () => {
    setWallet_modal(false);
  };

  const isDark = state.THEME.THEME;

  const themeColors = {
    bg: isDark ? "#1B1B1C" : "#fff",
    text: isDark ? "#fff" : "black",
    header: isDark ? "#1B1B1C" : "#fff",
    card: isDark ? "#23262F99" : "#F4F4F4",
    icon: isDark ? "#E6E8EB" : "#272729",
  };

  const BasicHeader = ({ title,iconName,iconProvder }) => {
    return (
      <View style={[styles.topHeaderContainer,{backgroundColor:themeColors.bg}]}>
        <Text style={[styles.headerTitle,{color:themeColors.text}]}>{title}</Text>
        <TouchableOpacity style={styles.iconButton} onPress={()=>{navigation.navigate("Settings")}}>
          <Icon name={iconName} type={iconProvder} size={24} color={themeColors.icon} />
        </TouchableOpacity>
      </View>
    );
  };
  
  return (
    <View style={[styles.safeArea, { backgroundColor: themeColors.bg,paddingTop:Platform.OS==="ios"?hp(5):0 }]}>
    <ScrollView>
    
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={themeColors.header}
      />

      {Loading_upper ? (
        <ActivityIndicator color="green" />
      ) : (
        <View style={[styles.headerContainer, { backgroundColor: themeColors.header }]}>
          {/* <BasicHeader title={"Home"} iconName={"settings"} iconProvder={"feather"}/> */}
          <View style={styles.walletCon}>
            <View style={styles.walletTopRow}>
              <TouchableOpacity
                style={[
                  styles.walletNameCon,
                  { backgroundColor: isDark ? "#242426" : "#F4F4F8" },
                ]}
                onPress={() => setWallet_modal(true)}
              >
                <Text style={[styles.walletNameText, { color: themeColors.text }]}>
                  {user ? user.slice(0, 14) : "Wallet"}
                </Text>
                <Icon
                  name="chevron-down-outline"
                  type="ionicon"
                  size={21}
                  color={themeColors.text}
                />
              </TouchableOpacity>

             <View style={{flexDirection:"row"}}>
             <TouchableOpacity
                style={[
                  styles.bellCon,
                  { backgroundColor: isDark ? "#18181C" : "#F4F4F8",marginRight:10 },
                ]}
                onPress={() => {setWalletSyncShow(true)}}
              >
                <Icon
                  name="qr-code-scanner"
                  type="material"
                  size={28}
                  color={isDark ? "gray" : "#272729"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.bellCon,
                  { backgroundColor: isDark ? "#18181C" : "#F4F4F8" },
                ]}
                onPress={() => {navigation.navigate("Settings")}}
              >
                <Icon
                  name="settings"
                  type="feather"
                  size={26}
                  color={isDark ? "gray" : "#272729"}
                />
              </TouchableOpacity>
             </View>
            </View>
            <View style={styles.walletSubCon}>
              <Text style={[styles.walletBalText, { color: themeColors.text }]}>
                {state&&state.isTotalInUSDVisible? `$ ${state&&state.totalInUSD===undefined?"0.0":state&&state.totalInUSD}`: "$ X.XX"}
              </Text>
              <Icon
                name={state&&state.isTotalInUSDVisible ? "eye-off" : "eye"}
                type="ionicon"
                size={26}
                color={themeColors.text}
                onPress={() => {dispatch({type: PORTFOLIO_CONFIG,payload: {isTotalInUSDVisible: state&&state.isTotalInUSDVisible===true?false:true,totalInUSD: state&&state.totalInUSD}}) }}
              />
            </View>
          </View>

          <View style={styles.featureCon}>
            {[
              {
                name: "Send",
                icon: "paper-plane-outline",
                type: "ionicon",
                action: ()=>{navigation.navigate("Send")},
              },
              {
                name: "Receive",
                icon: "vertical-align-bottom",
                type: "material",
                action: openModal2,
              },
              {
                name: "Bridge",
                icon: "arrow-u-down-right",
                type: "materialCommunity",
                action: openModal4,
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
                action: () =>
                  navigation.navigate("payout"),
              },
            ].map((item, idx) => (
              <TouchableOpacity key={idx} style={styles.featureCard} onPress={item.action}>
                <View
                  style={[
                    styles.featureIconWrapper,
                    { backgroundColor: themeColors.card },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    type={item.type}
                    size={28}
                    color={themeColors.icon}
                  />
                </View>
                <Text style={[styles.featureText, { color: themeColors.text }]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.navCon} onPress={() => { navigation.navigate("TokensManagement") }}>
            <Text style={[styles.featureText, { color: "#4052D6",marginTop: 0}]}>Manage </Text>
            <Icon name={"options"} type={"ionicon"} size={21} color={"#4052D6"} />
          </TouchableOpacity>
          <InvestmentChart/>
        </View>
      )}


      <RecieveModal modalVisible={modalVisible2} setModalVisible={setModalVisible2} />
      <SwapModal
        modalVisible={modalVisible3}
        setModalVisible={setModalVisible3}
        swapType={swapType}
      />

      <Modal
        isVisible={Wallet_modal}
        onBackdropPress={() => { setWallet_modal(false) }}
        onBackButtonPress={() => { setWallet_modal(false) }}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.5}
        style={{ justifyContent: "flex-end", margin: 0 }}
      >

            <View
              style={[
                styles.modalView,
                {
                  backgroundColor: state.THEME.THEME?"#242426":"#F4F4F8",
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <View style={{marginHorizontal:5}}>
                <Text style={[styles.modalText, { color: themeColors.text }]}>
                  Choose wallet
                </Text>
                <Text style={[styles.modalSubText, { color: themeColors.text }]}>
                Switch active wallet  
                </Text>
                </View>
                <TouchableOpacity
                  onPress={() => [
                    setWallet_modal(false),
                    navigation.navigate("Wallet"),
                  ]}
                  style={{
                    backgroundColor:"#5B65E1",
                    alignItems:"center",
                    padding:10,
                    borderRadius:10,
                    flexDirection:"row"
                  }}
                >
                  <Icon name={"add"} type={"ionicon"} size={24} color={"#fff"} />
                  <Text style={[styles.modalText, { color: "#fff" }]}> Add Wallet</Text>
                </TouchableOpacity>
              </View>
              <Wallet_selection_bottom onClose={handleClosewalletmodal} />
            </View>
      </Modal>
    </ScrollView>
     <WalletConnect visible={walletSyncShow} onClose={()=>{setWalletSyncShow(false)}} isDark={true}/>
    </View>
  );
};

export default MyHeader2;

const styles = StyleSheet.create({
  safeArea: {
    width:"100%",
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
    padding: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  walletNameText: {
    fontSize: 20,
    fontWeight: "800",
    marginRight: 5,
  },
  bellCon: {
    padding: 8,
    borderColor: "gray",
    borderRadius: 10,
  },
  walletSubCon: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  walletBalText: {
    fontSize: 32,
    fontWeight: "800",
    marginRight: 10,
  },
  featureCon: {
    paddingHorizontal: 9,
    flexDirection: "row",
    marginTop: "6%",
    justifyContent: "space-between",
    alignItems: "center",
    height: 90,
  },
  featureCard: {
    alignItems: "center",
    justifyContent: "center",
    width: wp(18),
  },
  featureIconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    height: "80%",
    width: "93%",
    borderRadius: 19,
  },
  featureText: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: "500",
  },
  modalBackground: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor:"rgba(0, 0, 0, 0.2)"
  },
  modalView: {
    width: wp(100),
    height: hp(45),
    borderRadius: 30,
    paddingVertical: hp(1.5),
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    width: wp(100),
    marginTop:5,
    paddingVertical: 5,
    paddingHorizontal: 19,
    justifyContent: "space-between",
    marginBottom:19
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
  },
  navCon: {
    marginVertical:hp(1),
    alignSelf:"flex-end",
    marginHorizontal:wp(5),
    flexDirection:"row",
    alignContent:"center",
    justifyContent:"center"
  },
});