import { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Share,
  Image,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import { useSelector } from "react-redux";
import Bnbimage from "../../../assets/bnb-icon2_2x.png";
import Etherimage from "../../../assets/ethereum.png";
import maticImage from "../../../assets/matic.png";
import xrpImage from "../../../assets/xrp.png";
import stellar from "../../../assets/Stellar_(XLM).png";
import Modal from "react-native-modal";
import QRCode from "react-native-qrcode-svg";
import  Clipboard from "@react-native-clipboard/clipboard";
import { alert } from "../reusables/Toasts";
import Icon from "../../icon";

const RecieveAddress = ({ modalVisible, setModalVisible, iconType }) => {
  const state = useSelector((state) => state);
  const WalletAddress = useSelector((state) =>
    iconType === "Xrp" && state.wallet.xrp
      ? state.wallet.xrp.address
      : state.wallet.address
  );
  const [qrvalue, setQrvalue] = useState("");
  const [Stellar_add, setStellar_add] = useState("");

  const get_stellar = async () => {
    setStellar_add(state.STELLAR_PUBLICK_KEY)
  }

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const onShare = async () => {
    try {
       await Share.share({
        message: `${iconType==="XLM"?Stellar_add:state.wallet.address}`,
      });
    } catch (error) {
      alert("error", error.message);
    }
  };

  const copyToClipboard = () => {
    Clipboard.setString(
      iconType==="XLM"?Stellar_add:iconType === "Xrp" && state.wallet.xrp
        ? state.wallet.xrp.address
        : state.wallet.address
    );
    alert("success", "Copied");
    closeModal()
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    const fetch_address=async()=>{
      try {
        if (WalletAddress) {
          setQrvalue(WalletAddress);
        }
      } catch (error) {
        console.log("--.-",error)
      }
    }
    fetch_address()
  }, []);

  useEffect( () => {
    const fetch_str = async () => {
      try {
        get_stellar()
      } catch (error) {
        console.log("---", error)
      }
    }
    fetch_str()
  }, []);


  const closeModal = () => {
    setModalVisible(false);
  };

  return (
    <Animated.View 
      style={{ opacity: fadeAnim }}
    >
      <Modal
        animationIn="slideInUp"
        animationOut="slideOutDown"
        animationInTiming={500}
        animationOutTiming={650}
        isVisible={modalVisible}
        useNativeDriver={true}
        useNativeDriverForBackdrop={true}
        backdropTransitionOutTiming={0}
        hideModalContentWhileAnimating
        statusBarTranslucent={true}
        style={[style.modal,{backgroundColor:state.THEME.THEME===false?"#fff":"black"}]}
        onBackButtonPress={() => {
          setModalVisible(false);
        }}
      >
        <TouchableOpacity
          onPress={() => {
            setModalVisible(false);
          }}
          style={{
            position: "absolute",
            top: 0,
            alignSelf: "flex-start",
            alignItems: "flex-start",
            padding: 15,
            width: "100%",
          }}
        >
         <View style={{flexDirection:"row",alignItems:"center"}}>
         <Icon
            name={"arrow-left"}
            type={"materialCommunity"}
            size={30}
            color={state.THEME.THEME===false?"black":"#fff"}
            onPress={() => {
              setModalVisible(false);
            }}
          />
          <Text style={{fontSize:22,fontWeight: 'bold',color:state.THEME.THEME===false?"black":"#fff",marginLeft:wp(3)}}>Recieve {iconType}</Text>
         </View>
        </TouchableOpacity>
          <TouchableOpacity style={style.flatView}>
            <Image
              style={{ width: wp(14.3), height: hp(7) }}
              source={
                iconType === "BNB"? Bnbimage: iconType === "ETH"? Etherimage: iconType === "Xrp"? xrpImage: iconType==="XLM"?stellar:maticImage
              }
            />
          </TouchableOpacity>
        <View style={[style.barCode,{backgroundColor:state.THEME.THEME===false?"#fff":"black",borderColor: "#4169e",borderWidth:1}]}>

          <View style={{ alignSelf: "center", marginTop: hp(1) }}>
            <QRCode
              value={iconType==="XLM"?Stellar_add:qrvalue ? qrvalue : "NA"}
              size={250}
              color={state.THEME.THEME===false?"black":"#4169e1"}
              backgroundColor={state.THEME.THEME===false?"#fff":"black"}
              logo={{
                url: "https://raw.githubusercontent.com/AboutReact/sampleresource/master/logosmalltransparen.png",
              }}
              logoSize={30}
              logoMargin={2}
              logoBorderRadius={15}
            />
          </View>
          <Text style={[style.addressTxt,{color:state.THEME.THEME===false?"black":"#fff"}]}>
            {iconType==="XLM"?Stellar_add:WalletAddress ? WalletAddress :""}
          </Text>
        </View>

        <View style={style.btnView}>
          <View style={{ alignItems: "center" }}>
            <TouchableOpacity
              style={style.copyBtn}
              onPress={() => {
                copyToClipboard();
              }}
            >
              <Icon
                name="content-copy"
                type={"materialCommunity"}
                size={20}
                color={"white"}
              />
            </TouchableOpacity>
            <Text style={style.btnTextColor}>Copy</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => {
                onShare();
              }}
              style={style.amount}
            >
              <Icon name="share" type={"feather"} size={20} color={"#4169e1"} />
            </TouchableOpacity>

            <Text style={style.btnTextColor}>Share</Text>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

export default RecieveAddress;

const style = StyleSheet.create({
  Body: {
    backgroundColor: "white",
    height: hp(90),
    width: wp(95),
    alignSelf: "center",
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: "200",
    color: "black",
    marginTop: hp(5),
  },
  welcomeText2: {
    fontSize: 15,
    fontWeight: "200",
    color: "white",
    marginTop: hp(1),
  },
  Button: {
    marginTop: hp(10),
    width: wp(20),
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    alignContent: "center",
    justifyContent: "space-between",
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
  Box: {
    height: hp("15%"),
    width: wp("75"),
    fontSize: 20,
    fontWeight: "200",
    color: "white",
    marginTop: hp(1),
    display: "flex",
    alignItems: "center",
    alignContent: "center",
    backgroundColor: "white",
  },
  Box2: {
    height: hp("15%"),
    width: wp("75"),
    fontSize: 20,
    fontWeight: "200",
    color: "white",
    marginTop: hp(1),
    display: "flex",
    alignItems: "center",
    alignContent: "center",
    backgroundColor: "white",
  },
  Box3: {
    height: hp("17%"),
    width: wp("75"),
    fontSize: 20,
    fontWeight: "200",
    alignSelf: "center",
    color: "white",
    marginTop: hp(2),
    alignItems: "center",
    alignContent: "center",
    backgroundColor: "white",
    borderTopWidth: 1,
  },
  modal: {
    backgroundColor: "#fff",
    width: wp(100),
    top: 20,
    alignSelf: "center",
    alignItems: "center",
  },
  barCode: {
    backgroundColor: "#fff",
    height: hp(50),
    borderRadius: hp(1),
    width: wp(80),
    justifyContent: "center",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
    shadowRadius: wp(1),
    overflow: "hidden",
    shadowOpacity: 0.2,
    shadowColor: "#000",
    backgroundColor: "white",
    borderColor: "rgba(238, 227, 232,1)",
  },
  flatView: {
    flexDirection: "row",
    marginHorizontal: wp(5),
    padding: 10,
    alignItems: "center",
    alignSelf: "center",
  },
  addressTxt: {
    marginTop: hp(3),
    width: wp(54),
    alignSelf: "center",
    color: "black",
    fontWeight:"600"
  },
  btnView: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: wp(56),
    marginTop: hp(3),
  },
  copyBtn: {
    height: hp(6),
    width: hp(6),
    backgroundColor: "#4169e1",
    borderRadius: hp(3),
    alignItems: "center",
    justifyContent: "center",
  },
  amount: {
    height: hp(6),
    width: hp(6),
    backgroundColor: "rgba(115, 167, 242, 0.2)",
    borderRadius: hp(3),
    alignItems: "center",
    justifyContent: "center",
  },
  btnTextColor: { color: "#4169e1" },
});
