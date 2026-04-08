import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  AddToAllWallets,
  setCurrentWallet,
} from "../../components/Redux/actions/auth";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import Modal from "react-native-modal";
import Icon from "../../icon";
import { colors } from "../../Screens/ThemeColorsConfig";
import { checkWalletExistOrNot } from "../Wallets/WalletManagement";
import apiHelper from "../exchange/crypto-exchange-front-end-main/src/apiHelper";
import { REACT_APP_HOST } from "../exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import AccessNativeStorage from "../Wallets/AccessNativeStorage";
import { alert } from "../reusables/Toasts";
import { useNavigation } from "@react-navigation/native";

const NewWalletPrivateKey = ({
  props,
  Wallet,
  Visible,
  SetVisible,
  setModalVisible,
  setNewWalletVisible,
  onCrossPress,
}) => {
  const state=useSelector((state)=>state);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dispatch = useDispatch();
  const navigation=useNavigation();

  useEffect(() => {
    const initWalletLoad=async()=>{
      try {
       setTimeout(async()=>{
         const parsedWallets = await AccessNativeStorage.getAllWallets();
        let wallet = Wallet;
        wallet.accountName = `Main-Wallet ${parsedWallets.length+1} ${Math.floor(Math.random() * 10)}`;
        await handleWallet();
       },0)
      } catch (error) {
        console.error("error in initWalletLoad:- ",error)
      }
    }
    initWalletLoad()
  }, []);

  const theme = state.THEME.THEME ? colors.dark : colors.light;

  const handleWallet = async () => {
    try {
      setLoading(true);
      const user = await AsyncStorageLib.getItem("user");
      let wallets = [];
      const data = await AsyncStorageLib.getItem(
        `${user}-wallets`
      )
        .then((response) => {
          JSON.parse(response).map((item) => {
            wallets.push(item);
          });
        })
        .catch((e) => {
          setModalVisible(false);
          console.log(e);
        });

      const allWallets = [
        {
          address: Wallet.address,
          name: Wallet.accountName,
          walletType: "Multi-coin",
          xrp: {
            address: Wallet.xrp.address,
          },
          stellarWallet: {
            publicKey: Wallet.stellarWallet.publicKey,
          },
          wallets: wallets,
        },
      ];

      dispatch(AddToAllWallets(allWallets, user)).then(
        async (response) => {
          if (response) {
            if (response.status === "Already Exists") {
              alert(
                "error",
                "Account with same name already exists"
              );
              setLoading(false);
              return;
            } else if (response.status === "success") {
              const result = await apiHelper.post(REACT_APP_HOST + '/v1/wallet', {
                "addresses": {
                  "eth": Wallet.address,
                  "xlm": Wallet.stellarWallet.publicKey,
                  "bnb": Wallet.address,
                  "multi": Wallet.address
                },
                "isPrimary": true
              });
              if (result.success) {
                alert("success", "wallet synced!");
              } else {
                alert("error", "unable to sync wallet.");
                console.log('Error:', result.error, 'Status:', result.status);
              }
              AsyncStorageLib.setItem("currentWallet", Wallet?.accountName)
              await AccessNativeStorage.saveWallet({
                name: Wallet.accountName,
                address: Wallet.address,
                privatekey: Wallet.privateKey,
                stellarPublicKey: Wallet.stellarWallet.publicKey,
                stellarPrivateKey: Wallet.stellarWallet.secretKey,
                mnemonic: Wallet.mnemonic,
                walletType: "Multi-coin"
              })
              dispatch(
                setCurrentWallet(
                  Wallet?.address,
                  Wallet?.accountName,
                )
              )
              setTimeout(() => {
                setLoading(false);
                SetVisible(false);
                setModalVisible(false);
                setNewWalletVisible(false);
                navigation.navigate("AllWallets");
              }, 1000);
            } else {
              alert("error", "failed please try again");
              return;
            }
          }
        }
      );
    } catch (e) {
      setLoading(false);
      SetVisible(false);
      setModalVisible(false);
      setNewWalletVisible(false);
      alert("error", "Failed to import wallet. Please try again");
    }
  }

  return (
    <Animated.View
      style={{ opacity: fadeAnim }}
    >
      <Modal
        animationIn="slideInUp"
        animationOut="slideOutDown"
        animationInTiming={500}
        animationOutTiming={650}
        isVisible={Visible}
        statusBarTranslucent={true}
        useNativeDriverForBackdrop={true}
        backdropTransitionOutTiming={0}
        hideModalContentWhileAnimating
        onBackdropPress={() => {
          SetVisible(false);
        }}
        onBackButtonPress={() => {
          SetVisible(false);
        }}
        style={style.modalCon}
      >

        <View style={[style.Body,{backgroundColor:theme.bg}]}>
          <Icon
            name={"close-circle-outline"} 
            type={"materialCommunity"}
            color={theme.headingTx}
            size={30}
            style={style.croosIcon}
            onPress={onCrossPress}
          />
          <Icon
            name={"check-circle-outline"} 
            type={"materialCommunity"}
            color={"#4052D6"}
            size={190}
            style={style.successIcon}
          />
          <Text style={[style.headingTx,{color:theme.headingTx}]}>You're All Set</Text>
          <Text style={[style.subHeadingTx,{color:theme.headingTx}]}>Your wallet has been created successfully. Continue to explore features, manage your wallet, and enjoy a seamless experience.</Text>
        </View>
      </Modal>
    </Animated.View>
  );
};

export default NewWalletPrivateKey;

const style = StyleSheet.create({
  modalCon:{
    justifyContent: "flex-end",
    margin: 0,
  },
  Body: {
    borderTopLeftRadius:20,
    borderTopRightRadius:20,
    justifyContent: "flex-end",
    width:wp(100)
  },
  croosIcon: {
    alignSelf: "flex-end",
    padding: 10,
  },
  successIcon: {
    alignSelf: "center",
    marginTop:hp(10),
    marginBottom:hp(5)
  },
  headingTx:{
    alignSelf:"center",
    fontSize:20,
    fontWeight:"500"
  },
  subHeadingTx:{
    marginTop:hp(1),
    textAlign:"center",
    alignSelf:"center",
    fontSize:17,
    fontWeight:"300",
    marginBottom:hp(30),
    paddingHorizontal:20
  }
});