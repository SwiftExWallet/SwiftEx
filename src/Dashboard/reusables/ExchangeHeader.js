import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, Dimensions, Animated, TouchableWithoutFeedback, Alert } from "react-native";
import React, { useCallback, useState } from "react";
import Icon from "../../icon";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import darkBlue from "../../../assets/darkBlue.png";
import { REACT_APP_LOCAL_TOKEN } from "../exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import { useSelector } from "react-redux";
import { createGuestUser } from "../exchange/crypto-exchange-front-end-main/src/api";
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";

export const ExchangeHeaderApp = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.headerContainer}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>Exchange</Text>
      <View style={{ alignItems: "center" }}>
        <Icon
          name={"logout"}
          type={"materialCommunity"}
          size={20}
          color={"#E96A6A"}
          onPress={() => {
            const LOCAL_TOKEN = REACT_APP_LOCAL_TOKEN;
            AsyncStorage.removeItem(LOCAL_TOKEN);
            navigation.navigate("Settings");
          }}
        />
        <Text style={{ color: "#E96A6A" }}>Logout</Text>
      </View>
    </View>
  );
};

export const ExchangeHeaderIcon = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.headerContainer1}>
      <View
        style={{
          justifyContent: "space-around",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Icon
          name={"left"}
          type={"antDesign"}
          size={20}
          color={"#010C66"}
          onPress={() => {
            navigation.goBack();
          }}
        />
        <Image source={darkBlue} style={styles.logoImg} />
      </View>
      <Text style={styles.text}>Exchange</Text>
      <View style={{ alignItems: "center" }}>
        <Icon
          name={"logout"}
          type={"materialCommunity"}
          size={20}
          color={"#E96A6A"}
          onPress={() => {
            const LOCAL_TOKEN = REACT_APP_LOCAL_TOKEN;
            AsyncStorage.removeItem(LOCAL_TOKEN);
            navigation.navigate("Settings");
          }}
        />
        <Text style={{ color: "#E96A6A" }}>Logout</Text>
      </View>
    </View>
  );
};

export const Exchange_screen_header = ({ title, onLeftIconPress, onRightIconPress }) => {
  const [isDrawerVisible, setDrawerVisible] = useState(false);
  const state = useSelector((state) => state);
  const toggleDrawer = () => {
    setDrawerVisible(!isDrawerVisible);
    if (onRightIconPress) {
      onRightIconPress();
    }
  };

  useFocusEffect(
    useCallback(() => {
      setDrawerVisible(false);
      return () => setDrawerVisible(false);
    }, [])
  );

  return (
    <>
      <View style={[styles.exchangeheaderContainer, { height: Platform.OS === "ios" ? hp(8) : hp(6),backgroundColor:state.THEME.THEME?"#1B1B1C":"#FFFFFF" }]}>
        <TouchableOpacity onPress={onLeftIconPress} style={[styles.exchangeleftIconContainer, { marginTop: Platform.OS === "ios" && hp(4) }]}>
          <Icon
            name={"arrow-left"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME?"#FFFFFF":"#1B1B1C"}
          />
        </TouchableOpacity>
        <Text style={[styles.exchangeheaderTitle, { marginTop: Platform.OS === "ios" && hp(4),color:state.THEME.THEME?"#FFFFFF":"#1B1B1C" }]}>{title}</Text>
        <TouchableOpacity disabled={true} onPress={toggleDrawer} style={[styles.exchangerightIconContainer, { marginTop: Platform.OS === "ios" && hp(4) }]}>
          <Icon name={"menu"} type={"materialCommunity"} size={30} color={state.THEME.THEME?"#1B1B1C":"#FFFFFF"} />
        </TouchableOpacity>
      </View>
      <CustomDrawer isVisible={isDrawerVisible} onClose={toggleDrawer} />
    </>
  );
};

const { width } = Dimensions.get('window');

const CustomDrawer = ({ isVisible, onClose }) => {
  const naviagtion=useNavigation();
  const translateX = React.useRef(new Animated.Value(width)).current;
  React.useEffect(() => {
    Animated.timing(translateX, {
      toValue: isVisible ? 0 : width,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isVisible]);

  const handle_nav=async(addres)=>{
    onClose()
    naviagtion.navigate(addres)
  }

  const handle_logout=async()=>{
    try {
      onClose()
      await AsyncStorage.removeItem("UserAuthID");
      // createGuestUser()
     CustomInfoProvider.show("You're in Guest Mode.");
      // naviagtion.navigate("Home");
    } catch (error) {
      console.log("--===9",error)
    }
  }
  return (
    <TouchableWithoutFeedback onPress={onClose}>
    <Animated.View style={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        width: "100%",
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        zIndex: 100,
        transform: [{ translateX }]
      }}>
      <TouchableWithoutFeedback>
        <Animated.View style={[styles.exchangedrawerContainer, { transform: [{ translateX }] }]}>
          <TouchableOpacity onPress={onClose} style={[styles.exchangecloseButton, { alignSelf: Platform.OS === "ios" ? "flex-end" : "flex-start" }]}>
            <Icon name={"arrow-right-circle-outline"} type={"materialCommunity"} size={33} color={"#fff"} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangetextcont}>
            <Icon name={"anchor"} type={"materialCommunity"} size={28} color={"gray"} />
            <Text style={[styles.exchangedrawerText,{color:"gray"}]}>Anchor Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangetextcont}>
            <Icon name={"card-account-details"} type={"materialCommunity"} size={28} color={"gray"} />
            <Text style={[styles.exchangedrawerText,{color:"gray"}]}>KYC</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangetextcont} onPress={() => {handle_nav("Wallet")}}>
          <Icon name={"wallet"} type={"materialCommunity"} size={28} color={"#fff"} />
            <Text style={styles.exchangedrawerText}>Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangetextcont} onPress={() => {handle_logout()}}>
        <Icon name={"logout"} type={"materialCommunity"} size={28} color={"#fff"} />
        <Text style={styles.exchangedrawerText}>Logout</Text>
      </TouchableOpacity>

        </Animated.View>
      </TouchableWithoutFeedback>
    </Animated.View >
  </TouchableWithoutFeedback>
  );
};


export const Wallet_screen_header = ({ title, onLeftIconPress,rightIcon, onRightIconPress }) => {
  const state = useSelector((state) => state);
  return (
    <>
      <View style={[styles.exchangeheaderContainer, { backgroundColor:state.THEME.THEME===false?"#fff":"#1B1B1C",height: Platform.OS === "ios" ? hp(8) : hp(6) }]}>
        <TouchableOpacity onPress={onLeftIconPress} style={[styles.exchangeleftIconContainer, { marginTop: Platform.OS === "ios" && hp(4) }]}>
          <Icon
            name={"arrow-left"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME===false?"black":"#fff"}
          />
        </TouchableOpacity>
        <Text style={[styles.exchangeheaderTitle, { marginTop: Platform.OS === "ios" && hp(4),color:state.THEME.THEME===false?"black":"#fff" }]}>{title}</Text>
        {rightIcon !== null ? <TouchableOpacity onPress={onRightIconPress} style={[styles.exchangeleftIconContainer, { marginTop: Platform.OS === "ios" && hp(4) }]}>
          <Icon
            name={rightIcon}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME === false ? "black" : "#fff"}
          />
        </TouchableOpacity> : <View style={styles.exchangerightIconContainer} />}
      </View>
    </>
  );
};

export const Exchange_Login_screen = ({ title, onLeftIconPress }) => {
  const state = useSelector((state) => state);
  return (
    <>
      <View style={[styles.exchangeheaderContainer, { backgroundColor:"#131E3A",height: Platform.OS === "ios" ? hp(8) : hp(6) }]}>
        <TouchableOpacity onPress={onLeftIconPress} style={[styles.exchangeleftIconContainer, { marginTop: Platform.OS === "ios" && hp(4) }]}>
          <Icon
            name={"arrow-left"}
            type={"materialCommunity"}
            size={30}
            color={"#fff"}
          />
        </TouchableOpacity>
        <Text style={[styles.exchangeheaderTitle, { marginTop: Platform.OS === "ios" && hp(4),color:state.THEME.THEME===false?"black":"#fff" }]}>{title}</Text>
      <View style={styles.exchangerightIconContainer} />
      </View>
    </>
  );
};

export const TransactionForStellar = ({ title, onLeftIconPress,activeBackgroundColor,activeTxColor }) => {
  return (
    <>
      <View style={[styles.exchangeheaderContainer, { backgroundColor:activeBackgroundColor||"#011434",height: Platform.OS === "ios" ? hp(8) : hp(6) }]}>
        <TouchableOpacity onPress={onLeftIconPress} style={[styles.exchangeleftIconContainer, { marginTop: Platform.OS === "ios" && hp(4) }]}>
          <Icon
            name={"arrow-left"}
            type={"materialCommunity"}
            size={30}
            color={activeTxColor}
          />
        </TouchableOpacity>
        <Text style={[styles.exchangeheaderTitle, { marginTop: Platform.OS === "ios" && hp(4),color:activeTxColor }]}>{title}</Text>
      <View style={styles.exchangerightIconContainer} />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    backgroundColor: "#fff",
    height: hp(47),
  },
  iconContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: hp(40),
    alignSelf: "center",
    marginTop: hp(3),
  },
  dollarText: {
    textAlign: "center",
    color: "black",
    fontSize: 30,
    marginTop: hp(3),
  },
  textwithIcon: {
    flexDirection: "row",
    alignSelf: "center",
    marginTop: hp(2),
  },
  textColor: {
    color: "gray",
  },
  iconsContainer: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: hp(5),
  },
  iconTextContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  iconmainContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: hp(42),
    alignSelf: "center",
    marginTop: hp(5),
    height: hp(9),
    alignItems: "center",
    borderRadius: hp(2),
    padding: hp(2),
    backgroundColor: "#e8f0f8",
  },
  numberContainer: {
    backgroundColor: "#9bbfde",
    width: hp(4.3),
    height: hp(4.3),
    borderRadius: hp(10),
    justifyContent: "center",
    alignItems: "center",
  },
  number: {
    textAlign: "center",
    color: "#fff",
    backgroundColor: "#145DA0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: hp(10),
  },
  headerContainer: {
    backgroundColor: "#010C66",
    height: hp(10),
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    width: wp(100),
    paddingHorizontal: wp(5),
  },
  headerContainer1: {
    backgroundColor: "#4CA6EA",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    width: wp(100),
    paddingHorizontal: wp(2),
  },
  logoImg: {
    height: hp("9"),
    width: wp("12"),
    marginLeft: wp(1.5),
  },
  text: {
    color: "#010C66",
    fontWeight: "700",
    alignSelf: "center",
    textAlign: "center",
    marginRight: wp(10),
  },
  exchangeheaderContainer: {
    flexDirection: 'row',       
    alignItems: 'center',       
    justifyContent: 'space-between', 
    paddingHorizontal: 17,
  },
  exchangeleftIconContainer: {
    width: 40,                  
    justifyContent: 'center',    
  },
  exchangeheaderTitle: {
    flex: 1,                    
    textAlign: 'center',         
    fontSize: 21,                
    fontWeight: 'bold',          
    color: '#fff',               
  },
  exchangerightIconContainer: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',               
  },
  exchangedrawerContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: '100%',
    width: width * 0.75,
    backgroundColor: 'rgba(33, 43, 83, 1)',
    padding: 20,
    zIndex: 100,
  },
  exchangecloseButton: {
    marginBottom: 20,
    alignSelf:"flex-end"
  },
  exchangecloseButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  exchangedrawerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight:"600",
    marginLeft:wp(2)
  },
  exchangetextcont:{
    marginVertical: 10,
    flexDirection:"row",
    alignItems:"center"
  }
});
