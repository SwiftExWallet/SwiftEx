import OffersButton from "../../../../../Dashboard/offersButton";
import { useEffect, useState } from "react";
import { authRequest, GET } from "../api";
import { NewBidModal } from "../components/newBid.modal";
import { OfferBidsView } from "../components/offerBids.modal";
import { TabView, SceneMap } from "react-native-tab-view";
import { ActivityIndicator, DataTable } from "react-native-paper";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Image,
  Linking,
  Modal,
  Platform
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { CHAIN_ID_TO_SCANNER } from "../web3";
import { LinearGradient } from "react-native-linear-gradient";
import Icon from "../../../../../icon";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native";
import darkBlue from "../../../../../../assets/darkBlue.png";
import Bridge from "../../../../../../assets/Bridge.png";
import { REACT_APP_LOCAL_TOKEN } from "../ExchangeConstants";
import { useIsFocused } from '@react-navigation/native';
import WebView from "react-native-webview";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import Offers_manages from "./Offers_manages";
import CustomOrderBook from "./stellar/CustomOrderBook";
import { STELLAR_URL } from "../../../../constants";
import { useSelector } from "react-redux";



export const OfferListView = ({ self = false, offers, profile, setChange }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    OfferListViewHome()
    OfferListView()
  }, [open, offers, profile, setChange])

  return (
    <View style={{ backgroundColor: "#131E3A" }}>
      <LinearGradient
        style={styles.linearStyle}
        start={[1, 0]}
        end={[0, 1]}
        colors={["rgba(1, 12, 102, 1)", "rgba(224, 93, 154, 1)"]}
      >
        <ScrollView nestedScrollEnabled horizontal>
          <ScrollView nestedScrollEnabled>
            <View style={styles.tableHeader}>
              <Text style={styles.AssetText}>Asset</Text>
              <Text style={styles.AssetText}>Amount</Text>
              <Text style={styles.AssetText}>Unit Price (of Eth)</Text>
              <Text style={styles.AssetText}>Total Price (In INR)</Text>
              <Text style={styles.AssetText}>Currency</Text>
              <View style={{ position: "relative" }}>
                <Icon
                  name={"info"}
                  type={"feather"}
                  style={styles.infoIcon}
                  color={"#DBAFC9"}
                />
                <Text style={styles.textColor}>Status</Text>
              </View>
            </View>
            <ScrollView>
              {offers ? (
                offers.map((offer) => {
                  if (self)
                    return (
                      offer.issuer === profile._id && (
                        <>
                          <View key={offer._id}>
                            <ScrollView key={offer._id}>
                              <View
                                key={offer._id}
                                style={styles.Table1Container}
                              >
                                <View>
                                  <Text style={styles.textColor}>
                                    {offer.assetName}
                                  </Text>
                                  <Text style={styles.textColor}>
                                    {offer.amount}
                                  </Text>
                                </View>

                                <Text style={styles.textColor}>
                                  {offer.pricePerUnit}
                                </Text>
                                <Text
                                  style={styles.textColor}
                                  numberOfLines={1}
                                >
                                  {offer.totalPrice}
                                </Text>
                                <Text style={styles.textColor}>
                                  {offer.currencyName}
                                </Text>
                                <Text style={styles.textColor}>
                                  {offer.status}
                                </Text>
                              </View>
                            </ScrollView>
                            <OfferBidsView
                              offer={offer}
                              self={self}
                              setChange={setChange}
                            />
                          </View>
                        </>
                      )
                    );
                  return (
                    offer.issuer !== profile._id && (
                      <>
                        <ScrollView>
                          <View key={offer._id} style={styles.Table1Container}>
                            <Text style={styles.textColor}>
                              {offer.assetName}
                            </Text>
                            <Text style={styles.textColor}>
                              {offer.amount} {"Bid"}
                            </Text>
                            <Text style={styles.textColor}>
                              {Number(offer.pricePerUnit).toFixed(2)}
                            </Text>
                            <Text style={styles.textColor}>
                              {Number(offer.totalPrice).toFixed(2)}
                            </Text>
                            <Text style={styles.textColor}>
                              {offer.currencyName}
                            </Text>

                            <Text style={styles.statusColor}>
                              {offer.status}
                            </Text>
                          </View>
                        </ScrollView>
                        <View style={{ flexDirection: "row" }}>
                          <View style={{ marginRight: 20 }}>
                            <OfferBidsView
                              offer={offer}
                              setChange={setChange}
                            />
                          </View>
                          <NewBidModal offer={offer} />
                        </View>
                      </>
                    )
                  );
                })
              ) : (
                <View>
                  <ActivityIndicator size={"small"} color={"blue"} />
                </View>
              )}
            </ScrollView>
          </ScrollView>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};
export const OfferListViewHome = () => {
  const isFocused = useIsFocused();
  const [history, sethistory] = useState([]);
  const [open_details, setopen_details] = useState(false);
  const [id,setid]=useState("");
  const getAllTransactions = async () => {
    try {
      const transactions = await AsyncStorageLib.getItem("offer_data");

      if (transactions) {
        const parsedTransactions = JSON.parse(transactions);
        sethistory(parsedTransactions)
        console.log("<<<<<>", parsedTransactions)
        return parsedTransactions;
      } else {
        console.log("No transactions found.");
        return [];
      }
    } catch (error) {
      console.error("Error getting all transactions:", error);
      throw error;
    }
  };

  useEffect(() => {
    getAllTransactions();
    setid("");
  }, [isFocused])
  return (
    // <View style={{ backgroundColor: "#131E3A" }}>
    <View style={{ backgroundColor: "#011434", flex: 1 }}>

      <Text style={{ color: "white", marginLeft: 13, marginTop: 13, fontWeight: "bold", fontSize: 19 }}>Created Offers</Text>
      {/* <LinearGradient
        style={styles.linearStyle1}
        start={[1, 0]}
        end={[0, 1]}
        colors={["rgba(1, 12, 102, 1)", "rgba(224, 93, 154, 1)"]}
      > */}
      <View style={[styles.linearStyle1, { backgroundColor: "rgba(33, 43, 83, 1)rgba(28, 41, 77, 1)" }]}>
        <ScrollView nestedScrollEnabled horizontal>
          <ScrollView nestedScrollEnabled={true}>
            <View style={styles.tableHeader}>
              <Text style={styles.AssetText}>View</Text>
              <Text style={styles.AssetText}>Asset</Text>
              <Text style={styles.AssetText}>Amount</Text>
              <Text style={styles.AssetText}>Price</Text>
              <Text style={styles.AssetText}>Type</Text>
              <Text style={styles.textColor}>Status</Text>
            </View>
            <>
              {history.length === 0 ? <Text style={{ color: "white", margin: 10, fontWeight: "bold", fontSize: 19 }}>{"No Offer Records."}</Text> :
                history.map((offer, index) => {
                  return (
                    <>
                      <View key={index}>
                        <ScrollView horizontal={true} key={offer._id}>
                          <View
                            key={index}
                            style={styles.mainDataContainer}
                          >
                            <Text
                              style={{
                                textAlign: "center",
                                width: wp(20),
                                color: "#4CA6EA",
                              }}
                              //  onPress={()=>{ Linking.openURL("https://stellar.expert/explorer/testnet/tx/"+offer.date);}}
                              onPress={() => { setopen_details(true),setid(offer.date) }}
                            >
                              Details
                            </Text>

                            <Text style={styles.textColor}>
                              {offer.asset.code}
                            </Text>

                            <Text style={styles.textColor}>
                              {offer.amount}
                            </Text>

                            <Text style={styles.textColor}>
                              {offer.price}
                            </Text>
                            <Text style={styles.textColor}>
                              {offer.forTransaction}
                            </Text>
                            <Text style={[styles.textColor, { color: "green", fontWeight: "bold", }]}>
                              {offer.status}
                            </Text>
                            <Modal
                              animationType="slide"
                              transparent={true}
                              visible={open_details}
                            >
                              <View style={{ height: hp(70.8), width: "94%", backgroundColor: "white", margin: 10, borderRadius: 10, marginTop: hp(15) }}>
                                <TouchableOpacity style={{ alignSelf: "flex-end", marginRight: 10, marginTop: 10 }} onPress={() => { setopen_details(false); }}>
                                  <Icon name={"close"} type={"antDesign"} size={28} color={"black"} />
                                </TouchableOpacity>
                                <WebView source={{ uri: `${STELLAR_URL.EXPERT_URL}/tx/${id}`}} />
                              </View>
                            </Modal>
                          </View>
                        </ScrollView>
                      </View>
                    </>
                  )
                })
              }
            </>
          </ScrollView>
        </ScrollView>
      </View>
      {/* </LinearGradient> */}
    </View>
  )
};

export const OfferView = () => {
  const navigation = useNavigation();
  const state = useSelector((state) => state);
  return (
    <>
      <Exchange_screen_header title="Pending Adv.Swaps" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />
      <View style={{ height: hp(100),backgroundColor:state.THEME.THEME ? "#0B0B0F" : "#FFFFFF", paddingBottom: hp(15) }}>
        <Offers_manages />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  mainDataContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: wp(90),
    alignItems: "center",
    alignSelf: "center",
    marginTop: hp(1),
  },
  linearStyle: {
    width: wp(95),
    height: hp(62),
    marginBottom: hp(3),
    marginVertical: hp(2),
    borderRadius: 10,
    alignSelf: "center",
    paddingBottom: hp(2),
  },
  transactionBtn: {
    width: wp(40),
    alignSelf: "center",
    borderRadius: 8,
    borderColor: "#EE96DF",
    borderWidth: StyleSheet.hairlineWidth * 1,
    padding: 8,
    alignItems: "center",
    marginTop: hp(2),
  },
  linearStyle1: {
    width: wp(94),
    height: hp(70),
    marginBottom: hp(3),
    marginVertical: hp(2),
    borderRadius: 10,
    paddingBottom: hp(1),
    alignSelf: "center",
  },

  container2: {
    width: wp(100),
    height: hp(57),
    color: "black",
  },
  scrollView: {
    // width: wp(100),
    alignSelf: "center",
  },
  tableHeader: {
    // width: wp(90),
    alignSelf: "center",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth * 1,
    borderColor: "#EE96DF",
    paddingVertical: hp(1),
  },
  table: {
    display: "flex",
    alignContent: "center",
    alignItems: "center",
    textAlign: "center",
    backgroundColor: "white",
  },
  content: {
    display: "flex",
    alignContent: "center",
    alignItems: "center",
    textAlign: "center",
    height: hp(100),
    backgroundColor: "white",
  },
  textColor: {
    color: "#fff",
    width: wp(20),
    textAlign: "center",
  },
  Table1Container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // width: wp(90),
    marginTop: hp(2),
    marginBottom: hp(1),
    alignSelf: "center",
  },
  statusColor: {
    color: "#38B0EA",
    width: wp(17),
    textAlign: "center",
  },
  PriceText: {
    color: "#fff",
    width: wp(15),
  },
  AssetText: {
    color: "#fff",
    width: wp(20),
    textAlign: "center",
  },
  currencyText: {
    color: "#fff",
    width: wp(15),
    marginLeft: wp(10),
  },
  amountText: {
    color: "#fff",
    width: wp(10),
    textAlign: "center",
    marginHorizontal: wp(5),
  },
  amountText1: {
    color: "#fff",
    width: wp(10),
    marginHorizontal: wp(5),
    textAlign: "center",
  },

  infoIcon: {
    alignSelf: "flex-end",
    position: "absolute",
    // left:10,
    top: -8,
    right: 5,
  },
  seeBidStyle: {
    flexDirection: "row",
    width: wp(20),
    marginHorizontal: wp(4),
  },
  offersText: {
    color: "#fff",
    textAlign: "center",
    marginTop: hp(2),
    fontSize: hp(2.1),
  },
  mainDataContainer: {
    alignSelf: "center",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: hp(1),
    margin: 10,
  },
  headerContainer1_TOP: {
    backgroundColor: "#4CA6EA",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    width: wp(100),
    paddingHorizontal: wp(2),
  },
  logoImg_TOP: {
    height: hp("8"),
    width: wp("12"),
    marginLeft: wp(22),
  },
  text_TOP: {
    color: "white",
    fontSize: 19,
    fontWeight: "bold",
    alignSelf: "center",
    marginStart: wp(34)
  },
  text1_ios_TOP: {
    alignSelf:"center",
      fontSize: 20,
      fontWeight: 'bold',
      color: 'white',
      paddingTop:hp(3),
  },
  modalContainer_option_top: {
    // flex: 1,
    alignSelf:"flex-end",
    alignItems: 'center',
    // backgroundColor: 'rgba(0, 0, 0, 0.3)',
    width:"100%",
    height:"60%",
  },
  modalContainer_option_sub:{
    alignSelf:"flex-end",
    backgroundColor: 'rgba(33, 43, 83, 1)',
  padding: 10,
  borderRadius: 10,
  width:"65%",
  height:"70%"
},
modalContainer_option_view:{
  flexDirection:"row",
  marginTop:25,
  alignItems:"center",
},
modalContainer_option_text:{
fontSize:20,
fontWeight:"bold",
color:"gray",
marginStart:5
},
tabContainer: {
  flexDirection: "row",
  justifyContent: "space-between",
  paddingVertical: 0.1,
  paddingHorizontal:10,
  width:wp(100)
},
tabButton: {
  paddingVertical: 12,
  width:wp(45),
  marginHorizontal: 5,
  borderRadius: 10,
  backgroundColor: "gray",
  alignItems:"center"
},
activeTab: {
  backgroundColor: "rgba(33, 43, 83, 1)rgba(28, 41, 77, 1)",
  borderColor:"rgba(72, 93, 202, 1)rgba(67, 89, 205, 1)",
  borderWidth:1,
},
tabText: {
  fontSize: 16,
  fontWeight: "bold",
  color: "white",
},
activeText: {
  color: "#fff",
},
content: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
},
contentText: {
  fontSize: 20,
  fontWeight: "bold",
  color: "#333",
},
});