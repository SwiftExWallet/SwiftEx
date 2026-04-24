import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  NativeModules,
  ScrollView,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import { useSelector } from "react-redux";
import { alert } from "./reusables/Toasts";
import Clipboard from "@react-native-clipboard/clipboard";
import Icon from "../icon";
import { Button } from "native-base";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../Screens/ThemeColorsConfig";
const MyPrivateKey = () => {
  const navi = useNavigation()
  const state = useSelector((state) => state)
  const [walletInfo, setWalletInfo] = useState([])
  const [dydxWalletInfo, setdydxWalletInfo] = useState([])
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const copyToClipboard = (string) => {
    Clipboard.setString(string);
    alert("success", "Copied");
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();

    const getWallet = async () => {
      try {
        const walletInfo = await NativeModules.StorageModule.getWalletInfo();
        if (walletInfo?.success) {
          let walletData;
          if (typeof walletInfo.wallet === "string") {
            walletData = JSON.parse(walletInfo.wallet);
          } else {
            walletData = walletInfo.wallet;
          }
          const refineMnemonic = {
            ...walletData,
            mnemonic: walletData.mnemonic.match(/\b(\w+)'?(\w+)?\b/g),
            mnemonicInWords: walletData.mnemonic
          };
          setWalletInfo(refineMnemonic);
          const refineDydxMnemonic = {
            ...walletData,
            mnemonic: walletData.dydxMnemonic.match(/\b(\w+)'?(\w+)?\b/g),
            mnemonicInWords: walletData.dydxMnemonic
          };
          setdydxWalletInfo(refineDydxMnemonic)
        }
      } catch (error) {
        console.log("=error=", error)
      }
    }
    getWallet()
  }, []);

  const RenderItem = ({ item, index }) => {
    return (
      <Pressable style={[style.pressable, { backgroundColor: theme.cardBg }]} disabled={true}>
        <Text style={[style.pressText, { color: theme.headingTx }]}>{index + 1}</Text>
        <Text style={[style.itemText, { color: theme.headingTx }]}>{item}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ backgroundColor: theme.bg,height:"100%" }}>
      <Wallet_screen_header title="Secret Key" onLeftIconPress={() => navi.goBack()} />
    <ScrollView>
        <View style={style.Body}>
          <Text style={[style.backupText, { color: theme.headingTx }]}>Backup Mnemonic Phrase</Text>
          <Text style={[style.welcomeText1, { color: theme.headingTx }]}>
            Please select the Mnemonic in order to ensure the backup is
            correct.
          </Text>
        </View>
        <View style={{ marginTop: hp(3), backgroundColor: theme.smallCardBg }}>
          {walletInfo?.mnemonic?.length > 0 ?
            <FlatList
              data={walletInfo?.mnemonic}
              renderItem={RenderItem}
              numColumns={3}
              contentContainerStyle={{
                alignSelf: "center",
              }}
            />
            : <Text style={[style.welcomeText1, { color: theme.headingTx }]}>{walletInfo?.privatekey}</Text>
          }
        </View>
        <View style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
          <Button
            onPress={() => {
              if (walletInfo.mnemonic) {
                copyToClipboard(walletInfo?.mnemonicInWords)
              } else {
                copyToClipboard(walletInfo?.privatekey)
              }
            }}
            backgroundColor={"#4052D6"}
            width={wp(90)}
            borderRadius={10}
            style={{ marginVertical: 15 }}
          >Copy</Button>
        </View>

        <View style={{backgroundColor: theme.smallCardBg }}>
          <Text style={{ color: theme.headingTx, marginLeft: wp(4.7),marginVertical:hp(1.5) }}>
          dydx mnemonic
        </Text>
          {dydxWalletInfo?.mnemonic?.length > 0 &&
            <FlatList
              data={dydxWalletInfo?.mnemonic}
              renderItem={RenderItem}
              numColumns={3}
              contentContainerStyle={{
                alignSelf: "center",
              }}
            />
          }
        </View>
         <View style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
          <Button
            onPress={() => {
                copyToClipboard(dydxWalletInfo?.mnemonicInWords)
            }}
            backgroundColor={"#4052D6"}
            width={wp(90)}
            borderRadius={10}
            style={{ marginVertical: 15 }}
          >Copy</Button>
        </View>
        <Text style={{ color: theme.headingTx, marginLeft: wp(4.7), }}>
          Stellar Private Key
        </Text>
        <View style={{ marginLeft: wp(1), flexDirection: "row", justifyContent: "space-around", alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: theme.headingTx, width: wp(70) }}>
            {walletInfo?.stellarPrivateKey}
          </Text>
          <Button
            onPress={async () => {
              copyToClipboard(walletInfo?.stellarPrivateKey)
            }}
            backgroundColor={"#4052D6"}
          >Copy</Button>
        </View>
        <View style={style.dotView}>
          <Icon name="dot-single" type={"entypo"} size={20} color={theme.headingTx} />
          <Text style={{ color: theme.headingTx }}>
            Keep your mnemonic in a safe place, isolated from any network.
          </Text>
        </View>
        <View style={style.dotView1}>
          <Icon name="dot-single" type={"entypo"} size={20} color={theme.headingTx} />
          <Text style={[{ color: theme.headingTx }]}>
            Do not share it through email, photos, social media, apps, etc.
          </Text>
        </View>

    </ScrollView>
    </View>
  );
};

export default MyPrivateKey;

const style = StyleSheet.create({
  Body: {
    width: wp(100),
    alignItems: "center",
    textAlign: "center",
  },
  welcomeText1: {
    marginLeft: wp(4.7),
    marginLeft: wp(4),
    width: wp(90),
  },
  welcomeText2: {
    fontSize: 20,
    fontWeight: "200",
  },
  pressable: {
    borderColor: "#D7D7D7",
    borderWidth: 0.5,
    width: wp(30),
    justifyContent: "center",
    paddingVertical: hp(2),
    paddingHorizontal: 3,
    position: "relative",
  },
  pressText: {
    alignSelf: "flex-end",
    paddingRight: 5,
    top: 0,
    position: "absolute",
  },
  itemText: {
    textAlign: "left",
    marginVertical: 6,
    marginHorizontal: wp(1.5),
  },
  backupText: {
    fontWeight: "bold",
    fontSize: 17,
    marginLeft: 20,
    marginTop: hp(1),
    marginBottom: hp(2),
  },
  dotView: {
    flexDirection: "row",
    alignItems: "center",
    width: wp(90),
    marginLeft: 18,
    marginTop: hp(4),
  },
  dotView1: {
    flexDirection: "row",
    alignItems: "center",
    width: wp(90),
    marginLeft: 18,
    marginTop: hp(2),
  },
});
