import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from "../icon";
import { GetPrivateKeyModal } from "./Modals/getPrivateKeyModal";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
import BackupWallet from "./exchange/crypto-exchange-front-end-main/src/components/BackupWallet";
import AuthRequest from "./reusables/AuthRequest";
import AccessNativeStorage from "./Wallets/AccessNativeStorage";
import CustomInfoProvider from "./exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setCurrentWallet } from "../components/Redux/actions/auth";
import { checkWalletExistOrNot } from "./Wallets/WalletManagement";

const MyWallet = (props) => {
  const dispatch=useDispatch();
  const navigation = useNavigation();
  const state = useSelector((state) => state);
  const [user, setUser] = useState("");
  const [visible, setVisible] = useState(false);
  const [backupVisible, setbackupVisible] = useState(false);
  const [showAuthRequest,setshowAuthRequest] = useState(false);
  const [walletName, setWalletName] = useState("");
  const [editWalletName, setEditWalletName] = useState(false);
  const [updatingLoading, setUpdatingLoading] = useState(false);

  useEffect(() => {
    const fetch_wallet_name = async () => {
      try {
        const user = await state.wallet.name;
        setUser(user);
      } catch (error) {
        console.log("[=-=", error)
      }
    }
    fetch_wallet_name()
  }, [updatingLoading]);

  const handleWalletNameChange = (text) => {
    const formattedUsername = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '');
    setWalletName(formattedUsername);
  };

  const updateUI = async (walletAddress, updatedName) => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys);
    const updatedPairs = pairs.map(([key, value]) => {
      if (!value) return [key, value];

      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (e) {
        return [key, value];
      }

      if (Array.isArray(parsed)) {
        parsed = parsed.map(item =>
          item.address === walletAddress ? { ...item, name: updatedName } : item
        );
      } else if (typeof parsed === "object" && parsed !== null) {
        if (parsed.address === walletAddress) {
          parsed = { ...parsed, name: updatedName };
        }
      }
      return [key, JSON.stringify(parsed)];
    });
    await AsyncStorage.multiSet(updatedPairs);
    await AsyncStorage.setItem("currentWallet",updatedName);
    dispatch(
      setCurrentWallet(
        walletAddress,
        updatedName,
        ""
      )
    );
    return {
      status:true,
      response:"wallet name updated success."
    }
  } catch (error) {
    console.error("Error:", error);
    return {
      status:false,
      response:error
    }
  }
  }

  const handleWalletNameUpdaing = async () => {
    try {
      const checkWalletName=await checkWalletExistOrNot(walletName);
      if(checkWalletName){
        return;
      }
      setUpdatingLoading(true);
      const activeWallet = await AccessNativeStorage.getWalletAddress();
      if (activeWallet.success) {
        const walletUpdate = await AccessNativeStorage.walletRename(activeWallet.wallet.walletId, walletName);
        const responseOfupdateUI = await updateUI(activeWallet.wallet.address, walletName);
        setUpdatingLoading(false);
        setEditWalletName(false);
        setWalletName("");
        if (walletUpdate.success && responseOfupdateUI.status) {
          CustomInfoProvider.show("success", "Hurray", "Wallet name updated successfully.");
        } else {
          CustomInfoProvider.show("error", "!Opps", "unable to update wallet name.");
        }
      }
    } catch (error) {
      setUpdatingLoading(false);
      CustomInfoProvider.show("error", "!Opps", "unable to update wallet name.");
      console.error("error in handleWalletNameUpdaing: ", error);
    }
  }

  return (
    <View style={[styles.mainView, { backgroundColor: state.THEME.THEME === false ? "#fff" : "#1B1B1C" }]}>
      <Wallet_screen_header title="Wallet" onLeftIconPress={() => navigation.goBack()} />
      <View style={[styles.card, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}>
        <Text style={[styles.label, { color: state.THEME.THEME === false ? "#6C757D" : "#8B93A7" }]}>
          Wallet Name
        </Text>
        <View style={[styles.inputContainer, {
          backgroundColor: state.THEME.THEME === false ? "#FFFFFF" : "#1B1B1C",
        }]}>
          <TextInput
            placeholder={user ? user : "Main Wallet 1"}
            placeholderTextColor={state.THEME.THEME === false ? "black" : "#FFFFFF"}
            style={{
              color: state.THEME.THEME === false ? "black" : "#FFFFFF",
              fontSize: 19, width: editWalletName?wp(90):wp(74.3)
            }}
            value={walletName}
            editable={editWalletName}
            onChangeText={(text) => {handleWalletNameChange(text)}}
          />
          {!editWalletName&&
            <TouchableOpacity onPress={()=>{setEditWalletName(editWalletName?false:true)}}>
              <Icon name="pencil" type={"materialCommunity"} color={"#4052D6"} size={25}/>
            </TouchableOpacity>
          }
        </View>
        {editWalletName &&
          <View style={styles.updateBtnsCon}>
            <TouchableOpacity style={[styles.updateBtn, { backgroundColor: "gray" }]} disabled={updatingLoading} onPress={() => { setEditWalletName(false), setUpdatingLoading(false), setWalletName("") }}>
              <Text style={styles.updateBtnTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.updateBtn} disabled={updatingLoading} onPress={()=>{handleWalletNameUpdaing()}}>
              {updatingLoading ? <ActivityIndicator color={"#fff"} size={"small"} /> : <Text style={styles.updateBtnTxt}>Update</Text>}
            </TouchableOpacity>
          </View>
        }
      </View>
      
      <TouchableOpacity onPress={() => { setshowAuthRequest(!showAuthRequest) }} style={[styles.btnCard, { backgroundColor: state.THEME.THEME === false ? "#F4F4F8" : "#242426" }]}>
        <View style={{ flexDirection: "row", }}>
          <View style={[styles.iconCon,{backgroundColor:"#5B65E133"}]}>
            <Icon name="eye" type={"materialCommunity"} color={"#5B65E1"} size={24} />
          </View>
          <View style={styles.iconContainer}>
            <Text style={[styles.secretText, { color: state.THEME.THEME === false ? "black" : "#fff" }]}>Show Secret Phrase</Text>
            <Text style={[styles.secretSubText, { color: state.THEME.THEME === false ? "black" : "#AAAAAA" }]}>View and manage your wallet</Text>
          </View>
        </View>
        <View style={styles.rightIcon}>
          <Icon name="right" type={"antDesign"} color={state.THEME.THEME === false ? "black" : "#fff"} size={20}/>
        </View>
      </TouchableOpacity>


      <View style={styles.infoCard}>
        <View style={{padding:5,borderRadius:50,backgroundColor:"#ECB742",marginRight:4}}>
        <Icon name="info" type={"antDesign"} color={"#fff"} size={18}/>
        </View>
        <Text style={{fontSize:12,color:"#ECB742",textAlign:"left",marginLeft:10, maxWidth:wp(70)}}>If you lose access to this device, your funds will be lost unless you back up your wallet.</Text>
      </View>

      <Text style={styles.text}>Your secret phrase is the only way to recover your wallet. Never share it with anyone.</Text>
      <GetPrivateKeyModal
        visible={visible}
        setVisible={setVisible}
        onCrossPress={() => {
          setVisible(false);
        }}
      />
      <AuthRequest visible={showAuthRequest} heading={"Account Access"} subHeading={"Authentication required to view account information."} proccedNextStep={()=>{setshowAuthRequest(false),setVisible(!visible)}}/>
      <BackupWallet open={backupVisible} close={() => setbackupVisible(false)} />
    </View>

  );
};

export default MyWallet;
const styles = StyleSheet.create({
  mainView: { 
     height: hp(100),
  },
  iconContainer: {
    alignItems: "flex-start",
    marginLeft: wp(0.5),
  },
  text: {
    color: "gray",
    marginHorizontal: wp(4),
    marginTop: hp(3),
    fontSize:15,
    textAlign:"center"
  },
  rightIcon: {
    marginRight: wp(3)
  },
  secretText: {
    marginHorizontal: wp(3),
    fontSize: 18
  },
  secretSubText: {
    marginHorizontal: wp(3),
    fontSize: 14
  },
  card: {
    borderRadius: 16,
    padding: wp(3),
    marginBottom: hp(1.5),
    marginHorizontal:19,
  },
  btnCard: {
    borderRadius: 16,
    padding: wp(3),
    paddingVertical:hp(2),
    marginBottom: hp(1.5),
    marginHorizontal:19,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoCard: {
    backgroundColor:"#FEF6D8",
    borderRadius: 16,
    padding: wp(3),
    paddingVertical:hp(2),
    marginTop: hp(1.5),
    marginHorizontal:19,
    flexDirection: "row",
    alignItems:"flex-start",
    borderRadius:15
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: hp(1.5),
    letterSpacing: 0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: wp(2),
    paddingVertical: hp(1),
  },
  iconCon:{
    justifyContent:"center",
    alignItems:"center",
    borderRadius:10,
    padding:10
  },
  updateBtn:{
    width:wp(40),
    paddingVertical:hp(1),
    marginVertical:hp(1),
    alignSelf:"center",
    borderRadius:30,
    alignItems:"center",
    backgroundColor:"#4052D6"
  },
  updateBtnTxt:{
    fontSize:16,
    fontWeight:"500",
    color:"#fff"
  },
  updateBtnsCon:{
    flexDirection:"row",
    justifyContent:"space-around"
  }
});
