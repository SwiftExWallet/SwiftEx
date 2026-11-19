import React, { useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PGET, proxyRequest } from './exchange/crypto-exchange-front-end-main/src/api';
import { useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,StatusBar,
  FlatList,
  Platform
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useNavigation } from "@react-navigation/native";
import Icon from "../icon";
import { alert } from "./reusables/Toasts";
import { useSelector } from "react-redux";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { Wallet_market_loading } from "./reusables/Exchange_loading";
import monkey from "../../assets/monkey.png"
import apiHelper from "./exchange/crypto-exchange-front-end-main/src/apiHelper";
import { colors } from "../Screens/ThemeColorsConfig";

const MARKET_DATA_CACHE_KEY = "MARKET_DATA_CACHE";

const Market = (props) => {
  const state=useSelector((state)=>state);
  const [data, setData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedData, setUpdatedData] = useState([])
  const [Load_new_data,setLoad_new_data]=useState(true);
  const navigation = useNavigation();
  const hasFreshData = useRef(false);
  const fetchKline = async (
    setData,
  ) => {
      const result = await proxyRequest('/v1/market-data', PGET);
      if (result?.res?.marketData) {
        hasFreshData.current = true;
        setData(result.res.marketData);
         setUpdatedData(result.res.marketData)
         setLoad_new_data(false)
        AsyncStorage.setItem(MARKET_DATA_CACHE_KEY, JSON.stringify(result.res.marketData))
          .catch((error) => console.log("Market cache write failed:", error));
      } else {
        alert("error","Unable to load discover.");
      }
  };

  const loadCachedData = async () => {
    try {
      const cached = await AsyncStorage.getItem(MARKET_DATA_CACHE_KEY);
      if (!cached || hasFreshData.current) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setData(parsed);
        setUpdatedData(parsed);
        setLoad_new_data(false);
      }
    } catch (error) {
      console.log("Market cache read failed:", error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(async () => {
      await fetchKline(
        setData,
      );
      setRefreshing(false);
    }, 2000);
  };

  useEffect(() => {
   const fetch_token_data=async()=>{
    loadCachedData();
    try {
      await fetchKline(
        setData,
      );
    } catch (error) {
      console.log("::::***-",error)
    } finally {
      setLoad_new_data(false)
    }
   }
   fetch_token_data()
  }, []);


  return (
    <View style={{ backgroundColor: state.THEME.THEME===false?colors.light.bg:colors.dark.bg }}>
    <Wallet_screen_header elementestID={"market_back"} title="Discover" onLeftIconPress={() => navigation.goBack()} />
      <View style={{ height: hp(100) }}>
        <View style={[Styles.searchContainer,{backgroundColor:state.THEME.THEME===false?"#F4F4F8":"#242426",borderColor:"rgba(255, 255, 255, 0.2)"}]}>
          <Icon name="search1" type="antDesign" size={25} color={state.THEME.THEME===false?"black":"gray"} />
          <TextInput
            placeholder="search your coin"
            placeholderTextColor={"gray"}
            style={[Styles.input,{width:wp(80),fontSize:18,color:state.THEME.THEME===false?"black":"#ebebeb"}]}
            onChangeText={(input) => {
              let UpdatedData = []
              updatedData.filter((item) => {
                if (item.name.toLowerCase().includes(input.toLowerCase()) || item.symbol.toLowerCase().includes(input.toLowerCase())) {
                  UpdatedData.push(item)
                }

                setData(UpdatedData)
                return UpdatedData
              })

            }}
          />
        </View>

        {Load_new_data ? (
  <Wallet_market_loading />
) : (
  <View style={{ height: Platform.OS==="android"?hp(85):hp(80), paddingBottom: hp(5) }}>
    <FlatList
      data={data}
      keyExtractor={(item, index) => item.id?.toString() || index.toString()}
      keyboardShouldPersistTaps="always"
      style={{ marginBottom: hp(5) }}
      refreshControl={
        <RefreshControl
          tintColor={"#4CA6EA"}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
      ListEmptyComponent={() => refreshing ? null : (
        <View>
          <Image source={monkey} style={Styles.noItemImg} />
          <Text
            style={{
              color: state.THEME.THEME === false ? "black" : "#fff",
              alignSelf: "center",
              fontSize: 18,
              marginTop: hp(2),
            }}
          >
            No results found.
          </Text>
        </View>
      )}
      renderItem={({ item, index }) => {
        const image = item.image;
        const color = item.priceChange24h > 0 ? "green" : "red";
        const backgroundColor =
          state.THEME.THEME === false ? colors.light.cardBg : colors.dark.cardBg;
        const imgBgColor =
          state.THEME.THEME === false ? "#fff" : "#23262F1A";

        return (
          <TouchableOpacity
            style={[Styles.container, { backgroundColor }]}
            onPress={() => {
              props.navigation.navigate("CoinDetails", { data: item });
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[Styles.imgCon, { backgroundColor: imgBgColor }]}>
                <Image source={{ uri: image }} style={Styles.img} />
              </View>
              <View style={Styles.flatContainerText}>
                <Text style={{ fontSize:16,fontWeight:"500",color: state.THEME.THEME === false ? "black" : "#fff",maxWidth:wp(50) }}>
                  {item.name}
                </Text>
                <Text
                  style={{
                    color: "gray",
                    fontSize: 14,
                    marginTop: hp(0.2),
                  }}
                >
                  {item?.symbol?.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={Styles.flatContainerPrice}>
              <Text
                style={{
                  color: state.THEME.THEME === false ? "black" : "#fff",
                  fontSize:16,
                  fontWeight:"500"
                }}
              >
                {`$ ${item.currentPrice ? item.currentPrice.toFixed(2) : "0"}`}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Icon
                  name={item.priceChangePercentage24h >= 0 ?"menu-up":"menu-down"||"menu-down"}
                  type="materialCommunity"
                  size={20}
                  color={
                    item.priceChangePercentage24h >= 0 ? "green" : "red"
                  }
                />
                <Text
                  style={{
                    color: item.priceChangePercentage24h >= 0 ? "green" : "red",
                    fontSize: 13,
                  }}
                >
                  {`${item.priceChangePercentage24h
                    ? item.priceChangePercentage24h.toFixed(3)
                    : "0"
                  }%`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  </View>
)}

      </View>
    </View>
  );
};
const Styles = StyleSheet.create({
  container: {
    width: wp(90),
    paddingHorizontal: wp(2),
    paddingVertical:hp(1),
    alignSelf: "center",
    marginTop: hp(1),
    alignItems: "center",
    flexDirection: "row",
    justifyContent:"space-between",
    borderRadius:15,
    borderColor:"rgba(255, 255, 255, 0.2)",
  },
  flatContainerText: {
    marginHorizontal: wp(2),
  },
  flatContainerPrice: {
    alignItems:"flex-end"
  },
  img: {
    height: hp(5.1),
    width: wp(10.5),
  },
  imgCon: {
    height: hp(6),
    width: wp(13),
    justifyContent:"center",
    alignItems:"center",
    borderRadius:10
  },
  noItemImg:{
    width:hp(20),
    height:hp(20),
    alignSelf:"center",
    marginTop:hp(13)
  },
  searchContainer: {
    flexDirection: "row",
    width: wp(90),
    borderWidth: StyleSheet.hairlineWidth * 1,
    alignItems: "center",
    paddingLeft: wp(3),
    borderRadius: wp(4),
    alignSelf: "center",
    marginTop: hp(2),
    paddingVertical: hp(1),
    marginVertical: hp(2),
  },
  input: {
    marginHorizontal: hp(1.5),
    padding: hp(0.6),
  },
});
export default Market;