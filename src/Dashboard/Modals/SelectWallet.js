import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import darkBlue from "../../../assets/multicoin_wallet.png"
import { useSelector } from "react-redux";
import Bnbimage from "../../../assets/bnb-icon2_2x.png";
import Etherimage from "../../../assets/ethereum.png";
import stellarImg from "../../../assets/Stellar_(XLM).png"
import Modal from "react-native-modal";
import ImportBinanceWallet from "./importBinance";
import ImportEthereumModal from "./importEthereumModal";
import ImportMultiCoinWalletModal from "./importMultiCoinWalletModal";
import ImportStellarModal from "./importStellarModal";
import { Wallet_screen_header } from "../reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
const SelectWallet = ({ props, visible, setVisible, setModalVisible }) => {
  const navi = useNavigation();
  const state = useSelector((state) => state);
  const [MultiCoinModal, setMultiCoinMoodal] = useState(false);
  const [BscWallet, setBscWalletVisible] = useState(false);
  const [EthereumWallet, setEthereumWallet] = useState(false);
  const [PolygonWallet, setPolygonwallet] = useState(false);
  const [XrpWallet, setXrpWallet] = useState(false);
  const [Stellar_wallet, setStellar_wallet] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const Spin = new Animated.Value(0);

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
    <Modal
      animationIn="slideInRight"
      animationOut="slideOutRight"
      animationInTiming={100}
      animationOutTiming={650}
      isVisible={visible}
      onBackdropPress={() => setVisible(false)}
      useNativeDriver={true}
      useNativeDriverForBackdrop={true}
      backdropTransitionOutTiming={0}
      hideModalContentWhileAnimating
      onBackButtonPress={() => {
        setVisible(false);
      }}
    >
      <View style={[style.body, { backgroundColor: state.THEME.THEME === false ? "#fff" : "#1B1B1C" }]}>
        <View style={{ marginTop: Platform.OS==="android"?hp(4.5):hp(3) }}>
          <Wallet_screen_header title="Select Wallet" onLeftIconPress={() => setVisible(false)} />
        </View>
        <TouchableOpacity
          style={[style.box, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}
          onPress={() => {
            setMultiCoinMoodal(true);
          }}
        >
          <Image source={darkBlue} style={style.img} />
          <Text style={[style.text, { color: state.THEME.THEME === false ? "black" : "#fff" }]}>Multi Chain </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[style.box, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}
          onPress={() => {
            setBscWalletVisible(true);
          }}
        >
          <Image source={Bnbimage} style={style.img} />
          <Text style={[style.text, { color: state.THEME.THEME === false ? "black" : "#fff" }]}>Binance</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[style.box, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}
          onPress={() => {
            setEthereumWallet(true);
          }}
        >
          <Image source={Etherimage} style={style.img} />
          <Text style={[style.text, { color: state.THEME.THEME === false ? "black" : "#fff" }]}>Ethereum</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[style.box, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}
          onPress={() => {
            setStellar_wallet(true);
          }}
        >
          <Image source={stellarImg} style={style.img} />
          <Text style={[style.text, { color: state.THEME.THEME === false ? "black" : "#fff" }]}>Stellar</Text>
        </TouchableOpacity>
      </View>
      <View>
        <ImportBinanceWallet
          Visible={BscWallet}
          onCrossPress={() => { setBscWalletVisible(false) }}
          setWalletVisible={setBscWalletVisible}
          setModalVisible={setVisible}
          setVisible={setVisible}
        />
        <ImportEthereumModal
          onCrossPress={() => { setEthereumWallet(false) }}
          Visible={EthereumWallet}
          setWalletVisible={setEthereumWallet}
          setModalVisible={setVisible}
          setVisible={setVisible}
        />
        <ImportMultiCoinWalletModal
          Visible={MultiCoinModal}
          onCrossPress={() => { setMultiCoinMoodal(false) }}
          setWalletVisible={setMultiCoinMoodal}
          setModalVisible={setVisible}
          setVisible={setVisible}
        />
        <ImportStellarModal
          Visible={Stellar_wallet}
          onCrossPress={() => { setStellar_wallet(false) }}
          setWalletVisible={setStellar_wallet}
          setModalVisible={setVisible}
          setVisible={setVisible}
        />
      </View>
    </Modal>
  );
};

export default SelectWallet;

const style = StyleSheet.create({
  body: {
    height: hp(102.9),
    borderRadius: hp(1),
    width: wp(100),
    alignSelf: "center",
  },
  box: {
    alignSelf: "center",
    width: wp(93),
    height:hp(9),
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius:19,
    marginTop:10,
  },
  img: {
    height: hp(5.5),
    width: wp(11),
  },
  text: {
    marginHorizontal: wp(2),
    fontSize: 16,
    fontWeight:"500"
  },
});
