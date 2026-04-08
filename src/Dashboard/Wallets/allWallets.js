import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import title_icon2 from "../../../assets/multicoin_wallet.png";
import Bnbimage from "../../../assets/bnb-icon2_2x.png";
import Etherimage from "../../../assets/ethereum.png";
import Xrpimage from "../../../assets/xrp.png";
import Maticimage from "../../../assets/matic.png";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { ScrollView } from "react-native-gesture-handler";
import { useDispatch, useSelector } from "react-redux";
import {
  setCurrentWallet,
  setWalletType,
  getEthBalance,
  getXrpBalance,
  getMaticBalance,
} from "../../components/Redux/actions/auth";
import { urls } from "../constants";
import { useNavigation } from "@react-navigation/native";
import { alert } from "../reusables/Toasts";
import Icon from "../../icon";
import { Wallet_screen_header } from "../reusables/ExchangeHeader";
import AccessNativeStorage from "./AccessNativeStorage";
import apiHelper from "../exchange/crypto-exchange-front-end-main/src/apiHelper";
import AuthRequest from "../reusables/AuthRequest";
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";

const WALLET_ICONS = {
  BSC: Bnbimage,
  Ethereum: Etherimage,
  Matic: Maticimage,
  Xrp: Xrpimage,
  "Multi-coin": title_icon2,
};

const ANIMATION_DURATION = 1000;
const NAVIGATION_DELAY = 400;

const AllWallets = () => {
  const state = useSelector((state) => state);
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAuthRequest, setOpenAuthRequest] = useState(false);
  const [removeWallet, setRemoveWallet] = useState(null);

  const isDarkTheme = state.THEME?.THEME === true;
  const currentWalletName = state.wallet?.name;

  const containerStyle = useMemo(
    () => [
      style.body,
      { backgroundColor: isDarkTheme ? "#1B1B1C" : "#FFFFFF" }
    ],
    [isDarkTheme]
  );

  const fetchMultiCoinBalances = useCallback(async (address, xrpAddress) => {
    try {
      await Promise.all([
        dispatch(getMaticBalance(address)),
        dispatch(getEthBalance(address)),
        xrpAddress && dispatch(getXrpBalance(xrpAddress)),
      ]);
    } catch (error) {
      console.error("Error fetching multi-coin balances:", error);
    }
  }, [dispatch]);

  const handleBalanceFetch = useCallback(async (walletType, address, xrpAddress) => {
    try {
      switch (walletType) {
        case "Ethereum":
          await dispatch(getEthBalance(address));
          break;
        case "Multi-coin":
          await fetchMultiCoinBalances(address, xrpAddress);
          break;
        case "BSC":
          break;
        default:
          console.log("Unknown wallet type:", walletType);
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  }, [dispatch, fetchMultiCoinBalances]);

  const handleWalletSelect = useCallback(async (item) => {
    try {
      await AsyncStorageLib.setItem("currentWallet", item.name);

      const walletData = {
        address: item.address,
        name: item.name,
        walletType: item.walletType,
      };

      const response = await dispatch(
        setCurrentWallet(
          walletData.address,
          walletData.name,
          walletData.walletType
        )
      );

      if (response?.status === "success" || response) {
        await AsyncStorageLib.setItem(
          "walletType",
          JSON.stringify(walletData.walletType)
        );

        dispatch(setWalletType(walletData.walletType));

        await handleBalanceFetch(
          walletData.walletType,
          walletData.address,
          walletData.xrpAddress
        );
        await AccessNativeStorage.updateActiveWallet(item.walletId)

        // await apiHelper.post(REACT_APP_HOST + '/v1/wallet', {
        //   "addresses": {
        //     "eth": item?.address,
        //     "xlm": item?.stellarPublicKey,
        //     "bnb": item?.address,
        //     "multi": item?.address
        //   },
        //   "isPrimary": true
        // });
        alert("success", `Wallet selected: ${item.name}`);
        setTimeout(() => {
          navigation.navigate("Home");
        }, NAVIGATION_DELAY);
      } else {
        throw new Error("Wallet selection failed");
      }
    } catch (error) {
      console.error("Error selecting wallet:", error);
      alert("error", "Error while selecting wallet. Please try again");
    }
  }, [dispatch, navigation, handleBalanceFetch]);

  const fetchAllWallets = useCallback(async () => {
    try {
      setLoading(true);
      const user = await AsyncStorageLib.getItem("user");
      if (!user) {
        setWallets([]);
        return;
      }

      const parsedWallets = await AccessNativeStorage.getAllWallets();
      setWallets(parsedWallets);
      return parsedWallets;
    } catch (error) {
      console.error("Error fetching wallets:", error);
      setWallets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getWalletIcon = useCallback((walletType) => {
    return WALLET_ICONS[walletType] || title_icon2;
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();

    fetchAllWallets();
  }, [fadeAnim, fetchAllWallets]);

  const ManageDeleteWallet=(deleteRequest)=>{
    setRemoveWallet(deleteRequest)
    CustomInfoProvider.show("warning", "Before you go", "This action will permanently erase your wallet information from the app. We recommend backup your wallet information before proceeding.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove Wallet", style: "destructive", onPress: () => {setOpenAuthRequest(true)} },
    ]);
  }

  const performeDeleteWalletAction=async(removeWalletReq)=>{
    const response=await AccessNativeStorage.delete(removeWalletReq.walletId);
    if(response==="wallet_removed"||response.wallet_removed==="wallet_removed"){
      if(wallets.length===1){
        const res = await AsyncStorageLib.getItem("AppStatusChecks");
        const parseres = JSON.parse(res);
        await AsyncStorageLib.clear();
        await AsyncStorageLib.setItem("AppStatusChecks", JSON.stringify(parseres));
        navigation.navigate("Passcode");
      }
      const walletUpdates= await fetchAllWallets();
      if(removeWalletReq.name === currentWalletName){
        handleWalletSelect(walletUpdates[0]);
      }
      CustomInfoProvider.show("success","Wallet Deleted","wallet deleted successfully!");
    }else{
      CustomInfoProvider.show("error","Wallet Deleted Faild","wallet deleted Faild!");
    }
  }

  const renderWalletItem = useCallback((item, index) => {
    const walletIcon = getWalletIcon(item.walletType);
    const isActive = item.name === currentWalletName;

    return (
      <View
        key={`${item.name}-${index}`}
        style={[style.box, { backgroundColor: isDarkTheme ? isActive?"#4052D6":"#242426" : isActive?"#4052D6":"#F4F4F8" }]}
      >
        <TouchableOpacity style={style.walletContainer} onPress={() => handleWalletSelect(item)}>
          <View style={style.walletInfo}>
            <Image
              style={style.img}
              source={walletIcon}
            />
            <Text
              style={[
                style.walletName,
                { color: isDarkTheme ? "#fff" : isActive?"#fff":"black" }
              ]}
            >
              {item.name}
            </Text>
          </View>

        </TouchableOpacity>
        {isActive ? (
          <View style={style.activeContainer}>
            <Icon
              name="check-decagram"
              type="materialCommunity"
              size={hp(3)}
              style={{ marginLeft: Platform.OS === "android" && wp(-7) }}
              color="green"
            />
            {Platform.OS === "android" &&
              <TouchableOpacity onPress={() => { ManageDeleteWallet(item) }}>
                <Icon
                  name="delete-circle-outline"
                  type="materialCommunity"
                  size={40}
                  color={"#dd1515bb"}
                />
              </TouchableOpacity>}
          </View>
        ) : <TouchableOpacity onPress={() => { ManageDeleteWallet(item) }}>
          <Icon
            name="delete-circle-outline"
            type="materialCommunity"
            size={40}
            color={"#dd1515bb"}
          />
        </TouchableOpacity>}
      </View>
    );
  }, [currentWalletName, isDarkTheme, getWalletIcon, handleWalletSelect]);

  if (loading) {
    return (
      <View style={[containerStyle, style.centerContent]}>
        <Wallet_screen_header
          title="All Wallets"
          onLeftIconPress={() => navigation.goBack()}
        />
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={containerStyle}>
      <Wallet_screen_header
        title="All Wallets"
        onLeftIconPress={() => navigation.goBack()}
      />
      <View style={{ marginTop: 10 }}>
        {wallets.length > 0 ? (
          wallets.map(renderWalletItem)
        ) : (
          <Text style={[style.noText, { color: isDarkTheme ? "#fff" : "black" }]}>
            No wallets found
          </Text>
        )}
      </View>
      <AuthRequest visible={openAuthRequest} heading={"Account Access"} subHeading={"Authentication required for account actions."} proccedNextStep={()=>{setOpenAuthRequest(false),performeDeleteWalletAction(removeWallet)}}/>
    </ScrollView>
  );
};

const style = StyleSheet.create({
  body: {
    minHeight: hp(100),
    paddingBottom: hp(2),
  },
  centerContent: {
    // justifyContent: "center",
    alignItems: "center",
  },
  noText: {
    textAlign: "center",
    marginTop: hp(2),
    fontSize: 16,
  },
  box: {
    margin:4,
    flexDirection:"row",
    borderRadius: 19,
    width:wp(90),
    alignItems:"center",
    alignContent:"center",
    alignSelf:"center"
  },
  walletContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width:wp(78),
    padding: wp(3),
  },
  walletInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  walletName: {
    marginHorizontal: wp(3),
    fontSize: 16,
  },
  img: {
    height: hp(4.5),
    width: hp(4.5),
    borderRadius: hp(2.25),
  },
  activeContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  activeBadge: {
    backgroundColor: "green",
    padding: wp(1),
    marginRight: wp(2),
    borderRadius: 8,
  },
  activeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default AllWallets;