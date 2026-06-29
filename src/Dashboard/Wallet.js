import React, { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  StyleSheet,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  View,
  Pressable,
  Button,
  Modal,
  FlatList,
  TouchableOpacity,
  Alert,StatusBar,Platform,
  ScrollView
} from "react-native";
import { TextInput } from "react-native-paper";
import { useDispatch, useSelector } from "react-redux";
import { Animated, AppState } from "react-native";
import walletImage from "../../assets/walletImage.png";
import { LinearGradient } from "react-native-linear-gradient";

import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import SelectWallet from "./Modals/SelectWallet";
import "react-native-get-random-values";
import "@ethersproject/shims";
import NewWalletModal from "./Modals/newWallet";
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useIsFocused } from "@react-navigation/native";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import Icon from "../icon";
var ethers = require("ethers");
const xrpl = require("xrpl");

const Wallet = ({ navigation }) => {
  const foucuse=useIsFocused();
  const [visible, setVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newWalletModal, setNewWalletModal] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const state=useSelector((state)=>state);
  useEffect(()=>{
      setNewWalletModal(false);
  },[foucuse])
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View>
      <Wallet_screen_header title="Wallet" onLeftIconPress={() => navigation.goBack()} />
        <View style={{
          paddingBottom:hp(13),
          backgroundColor: state.THEME.THEME===false?"#fff":"#1B1B1C",
        }}>
        
      <ScrollView>
        <View style={[styles.topCon,{backgroundColor:state.THEME.THEME?"#242426":"#F4F4F8",}]}>
        <Animated.Image
          style={styles.imageCon}
          source={walletImage}
        />
        <View
          style={[styles.bigCard,{backgroundColor:state.THEME.THEME?"black":"#FFFFFF",}]}
        >
          <Text style={{ fontSize: 18, color: state.THEME.THEME===false?"black":"#fff",fontWeight:"500"}}>
            Private and Secure
          </Text>
          <Text style={{ color: state.THEME.THEME===false?"black":"#fff",fontWeight:"400",fontSize: 16 }}>
            Private Keys never leave your device
          </Text>
        </View>
        </View>
        <TouchableOpacity onPress={() => {navigation.navigate("MyWallet")}} style={[styles.wallet,{backgroundColor:state.THEME.THEME===false?"#F4F4F8":"#242426"}]}>
            <View style={styles.ConHeading}>
              <View style={[styles.iconCon,{backgroundColor:state.THEME.THEME?"#1B1B1C":"#FFFFFF"}]}>
              <MaterialCommunityIcon name="wallet-outline" size={hp("3")} color={state.THEME.THEME?"#E6E8EB":"#272729"}/>
              </View>
            <View>
            <Text style={[styles.Heading,{color:state.THEME.THEME===false?"black":"#fff"}]}>My Wallet</Text>
            <Text style={styles.subHeadinng}>View and manage your wallet</Text>
            </View>
            </View>
          <Icon
            name={"arrow-right"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME===false?"black":"#fff"}
          />

        </TouchableOpacity>
        <View>
        <TouchableOpacity onPress={() => {setNewWalletModal(true)}} style={[styles.wallet,{backgroundColor:state.THEME.THEME===false?"#F4F4F8":"#242426"}]}>
            <View style={styles.ConHeading}>
              <View style={[styles.iconCon,{backgroundColor:state.THEME.THEME?"#1B1B1C":"#FFFFFF"}]}>
              <MaterialCommunityIcon name="plus" size={hp("3")} color={state.THEME.THEME?"#E6E8EB":"#272729"}/>
              </View>
            <View>
            <Text style={[styles.Heading,{color:state.THEME.THEME===false?"black":"#fff"}]}>Create Wallet</Text>
            <Text style={styles.subHeadinng}>Start fresh with new wallet</Text>
            </View>
            </View>
          <Icon
            name={"arrow-right"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME===false?"black":"#fff"}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => {navigation.navigate("WalletNetworkSelection",{selectionType:"importForSetupedApp",backScreenName:"Home"})}} style={[styles.wallet,{backgroundColor:state.THEME.THEME===false?"#F4F4F8":"#242426"}]}>
            <View style={styles.ConHeading}>
              <View style={[styles.iconCon,{backgroundColor:state.THEME.THEME?"#1B1B1C":"#FFFFFF"}]}>
              <MaterialCommunityIcon name="cloud-download-outline" size={hp("3")} color={state.THEME.THEME?"#E6E8EB":"#272729"}/>
              </View>
            <View>
            <Text style={[styles.Heading,{color:state.THEME.THEME===false?"black":"#fff"}]}>Import Wallet</Text>
            <Text style={styles.subHeadinng}>Restore from seed or private key</Text>
            </View>
            </View>
          <Icon
            name={"arrow-right"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME===false?"black":"#fff"}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => {navigation.navigate("AllWallets")}} style={[styles.wallet,{backgroundColor:state.THEME.THEME===false?"#F4F4F8":"#242426"}]}>
            <View style={styles.ConHeading}>
              <View style={[styles.iconCon,{backgroundColor:state.THEME.THEME?"#1B1B1C":"#FFFFFF"}]}>
              <MaterialCommunityIcon name="swap-horizontal" size={hp("3")} color={state.THEME.THEME?"#E6E8EB":"#272729"}/>
              </View>
            <View>
            <Text style={[styles.Heading,{color:state.THEME.THEME===false?"black":"#fff"}]}>Choose Wallet</Text>
            <Text style={styles.subHeadinng}>Select an existing wallet</Text>
            </View>
            </View>
          <Icon
            name={"arrow-right"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME===false?"black":"#fff"}
          />
        </TouchableOpacity>
        </View>
      </ScrollView>
      <SelectWallet
        visible={visible}
        setVisible={setVisible}
        setModalVisible={setModalVisible}
        />
      <NewWalletModal
        visible={newWalletModal}
        onCrossPress={()=>{setNewWalletModal(false)}}
        setVisible={setNewWalletModal}
        setModalVisible={setModalVisible}
        />
        </View>
    </Animated.View>
  );
};

export default Wallet;

const styles = StyleSheet.create({
  btn: {
    backgroundColor: "red",
    width: wp(80),
  },
  Text: {
    marginTop: hp(1),
    fontSize: 15,
    fontWeight: "200",
    color: "black",
    fontWeight:"300"
  },
  Button: {
    display: "flex",
    alignContent: "center",
    alignItems: "center",
    marginTop: hp(2),
  },
  addButton: {
    position: "absolute",
    zIndex: 11,
    right: 20,
    bottom: 40,
    backgroundColor: "red",
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
  },
  addButton2: {
    position: "absolute",
    zIndex: 11,
    left: 20,
    bottom: 40,
    backgroundColor: "green",
    width: 80,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 18,
  },
  accountBox: {
    alignItems: "center",
    backgroundColor: "red",
    width: wp(80),
    alignSelf: "center",
  },
  text: {
    color: "white",
    fontSize: hp("2.3"),
    fontWeight: "bold",
    marginLeft: wp("20"),
  },
  PresssableBtn: {
    backgroundColor: "#4CA6EA",
    // padding: hp(),
    height:hp(5),
    justifyContent:"center",
    width: wp(28),
    alignSelf: "center",
    paddingHorizontal: Platform.OS==="android"?wp(1):wp(2),
    borderRadius: hp(0.8),
    marginBottom: hp(2),
    alignItems: "center",
  },
  wallet:{
    borderRadius:19,
    flexDirection:"row",
    alignSelf:"center",
    alignItems:"center",
    justifyContent:"space-between",
    marginTop:hp(0.9),
    width:wp(95),
    padding:hp(2),
  },
  ConHeading:{
    flexDirection:"row",
    alignItems:"center"
  },
  iconCon:{
    backgroundColor:"#2164C140",
    marginRight:wp(2.5),
    borderRadius:20,
    alignItems:"center",
    justifyContent:"center",
    padding:10
  },
  Heading:{
    fontWeight:"600",
    fontSize:16
  },
  subHeadinng:{
    color:"gray",
    fontWeight:"400",
    fontSize:14
  },
  topCon:{
    marginHorizontal:10,
    borderRadius:20,
    paddingVertical:hp(0.5),
    marginBottom:hp(0.5)
  },
  imageCon:{
    width: wp("70"),
    height: hp(25),
    alignSelf:"center"
  },
  bigCard:{
    marginTop: hp(-2),
    alignItems: "center",
    alignSelf:"center",
    paddingVertical:hp(2),
    width:wp(80),
    shadowColor: '#5B65E1',
    shadowOffset: { width: 10, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 20,
    marginBottom:10,
    borderRadius:20
  }
});
