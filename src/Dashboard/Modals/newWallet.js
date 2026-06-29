import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { TextInput, Checkbox, Switch } from "react-native-paper";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import title_icon from "../../../assets/title_icon.png";
import { useDispatch, useSelector } from "react-redux";
import { Generate_Wallet2 } from "../../components/Redux/actions/auth";
import Modal from "react-native-modal";
import NewWalletPrivateKey from "./newWalletPrivateKey";
import ModalHeader from "../reusables/ModalHeader";
import { alert } from "../reusables/Toasts";
//import { TouchableOpacity } from "react-native-gesture-handler";
import { LinearGradient } from "react-native-linear-gradient";
import darkBlue from "../../../assets/darkBlue.png";
import Icon from "../../icon";
import AsyncStorageLib from "@react-native-async-storage/async-storage";

const NewWalletModal = ({ props,onCrossPress, visible, setVisible, setModalVisible }) => {
  const state=useSelector((state)=>state);
  const [loading, setLoading] = useState(false);
  const [newWalletPrivateKey, setNewWalletPrivateKey] = useState(false);
  const [Wallet, setWallet] = useState();
  const dispatch = useDispatch();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const Spin = new Animated.Value(0);
  const SpinValue = Spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const closeModal = () => {
    setVisible(false);
  };
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();

    Animated.timing(Spin, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, Spin]);
  return (
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim }}
    >
         <Modal
            isVisible={visible}
            onBackdropPress={() => setVisible(false)}
            onBackButtonPress={() => setVisible(false)}
            animationIn="slideInUp"
            animationOut="slideOutDown"
            useNativeDriver
            hideModalContentWhileAnimating
            style={style.modal}
            >
              <Animated.View style={[style.overlay]}>
                <View style={[style.Body, { backgroundColor: state.THEME.THEME ? "#242426" : "#F4F4F8" }]}>
          <TouchableOpacity disabled={loading} onPress={()=>{onCrossPress()}} style={style.crossIcon}>
          <Icon type={'entypo'} name='cross' color={"black"} size={28}/>
          </TouchableOpacity>
          <View style={{alignSelf:"center",alignItems:"center"}}>
          <Animated.Image
            style={{
              width: 202.16,
              height: 212,
              padding: 30,
              marginTop:19
            }}
            source={darkBlue}
          />

          <Text style={[style.welcomeText,{color:state.THEME.THEME ?"#fff":"black"}]}>Back up you wallet now</Text>
          <Text style={[style.welcomeSubText,{color:state.THEME.THEME ?"#fff":"black"}]}>
            In the next page, you will see your secret phrase
          </Text>
          <TouchableOpacity
            style={{
              display: "flex",
              flexDirection: "row",
              marginTop: hp(5),
              alignItems: "center",
            }}
            disabled={true}
          >
            <Icon
            name={"check-circle"}
            type={"materialCommunity"}
            size={25}
            color={"green"}
            />
            <View style={{ marginLeft: 10 }}>
            <Text style={[style.welcomeText2,{marginTop: hp(0),color:state.THEME.THEME ?"#fff":"black"}]}>
              If I loose my private key, my funds will be lost
            </Text>
              {/* <Switch
                value={Checked}
                onValueChange={() => setCheckBox(!Checked)}
              /> */}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              display: "flex",
              flexDirection: "row",
              marginTop: hp(3),
              alignItems: "center",
            }}
            disabled={true}
          >
            <Icon
          name={"check-circle"}
          type={"materialCommunity"}
          size={25}
          color={"green"}
          />
            <View style={{ marginLeft: 10 }}>
            <Text style={[style.welcomeText2,{color:state.THEME.THEME ?"#fff":"black"}]}>
              If I share my private key, my funds can get stolen
            </Text>
              {/* <Switch
                value={Checked2}
                onValueChange={() => setCheckBox2(!Checked2)}
              /> */}
            </View>
          </TouchableOpacity>
         
            <>
            <View style={style.infoCon}>
            <Icon
          name={"information"}
          type={"materialCommunity"}
          size={25}
          color={"#F7CC49"}
          />
          <Text style={{width:wp(80),fontSize:13,color:"#ECB742"}}>
          Your private key is solely your responsibility SwiftEx cannot be held liable for any loss or sharing of your private key.
          </Text>

            </View>
<TouchableOpacity
            style={[style.PresssableBtn,{backgroundColor:"#5B65E1"}]}
              disabled={loading ? true : false}
              onPress={async() => {
                await AsyncStorageLib.setItem('wallet_backup',await state.wallet.address);
                setLoading(true);
                setTimeout(() => {
                  dispatch(Generate_Wallet2()).then((response) => {
                    if (response) {
                      if (response.status === "success") {
                        setLoading(false);

                        console.log(response.wallet);
                        const wallet = response.wallet;
                        setWallet(wallet);
                        setNewWalletPrivateKey(true);
                      } else {
                        setLoading(false);

                        alert(
                          "error",
                          "wallet generation failed. Please try again"
                        );
                      }
                    } else {
                      setLoading(false);

                      alert(
                        "error",
                        "Wallet creation failed . Please try again"
                      );
                    }
                  });
                }, 1);
              }}
            >
          {/* <LinearGradient
            start={[1, 0]}
            end={[0, 1]}
            colors={
              Checked && Checked2
                ? ["rgba(33, 43, 83, 1)","rgba(28, 41, 77, 1)"]
                : ["gray", "gray"]
            }
            // style={style.PresssableBtn}
          > */}

{loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
              <Text style={{ color: "white",fontSize:16 }}>Continue</Text>)}
          {/* </LinearGradient> */}
            </TouchableOpacity>
            </>

          </View>
          {/* <ModalHeader Function={closeModal} name={"Import"} /> */}
          
        </View>
        </Animated.View>
        {newWalletPrivateKey&&
        <NewWalletPrivateKey
          Wallet={Wallet}
          onCrossPress={()=>{setNewWalletPrivateKey(false)}}
          SetVisible={setNewWalletPrivateKey}
          Visible={newWalletPrivateKey}
          setModalVisible={setModalVisible}
          setNewWalletVisible={setVisible}
        />}
      </Modal>
    </Animated.View>
  );
};

export default NewWalletModal;

const style = StyleSheet.create({
  modal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  overlay: {
    justifyContent: "flex-end",
  },
  Body: {
    width: wp(100),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    alignSelf: "center",
    paddingHorizontal: 15,
  },
  welcomeText: {
    marginTop: hp(1.5),
    fontSize:16,
    fontWeight:"600"
  },
  welcomeSubText: {
    fontSize:14,
    fontWeight:"600"
  },
  welcomeText2: {
    fontSize: 15,
    fontWeight: "300",
    color: "white",
    marginTop: hp(1),
    width: wp(75),
  },
  Button: {
    marginTop: hp(10),
  },
  tinyLogo: {
    width: wp("5"),
    height: hp("5"),
    padding: 30,
    marginTop: hp(10),
  },
  Text: {
    marginTop: hp(5),
    fontSize: 15,
    fontWeight: "200",
    color: "white",
  },
  input: {
    height: hp("5%"),
    marginBottom: hp("2"),
    color: "black",
    marginTop: hp("2"),
    width: wp("70"),
    paddingRight: wp("7"),
    backgroundColor: "white",
  },
  PresssableBtn: {
    width:wp(90),
    padding:16,
    alignItems:"center",
    alignSelf: "center",
    paddingHorizontal: wp(3),
    borderRadius: 50,
    marginBottom: hp(4),
    alignItems: "center",
  },
  crossIcon: {
    marginTop:10,
    padding: 3,
    borderRadius: 30,
    alignSelf:"flex-end",
    backgroundColor: "#FFFFFF"
  },
  infoCon:{
    marginVertical:hp(4),
    flexDirection:"row",
    alignItems:"center",
    backgroundColor:"#FEF6D8",
    padding:5,
    width:wp(90),
    justifyContent:"space-around",
    borderRadius:20
  }
});
