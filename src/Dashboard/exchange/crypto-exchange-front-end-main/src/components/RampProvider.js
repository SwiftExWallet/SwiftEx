import { useCallback, useEffect, useMemo, useState } from "react";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import { useSelector } from "react-redux";
import { debounce } from "lodash";
import { REACT_APP_HOST } from "../ExchangeConstants";
import apiHelper from "../apiHelper";
import CustomInfoProvider from "./CustomInfoProvider";
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Modal from "react-native-modal";

const RampProvider = () => {
  const navigation=useNavigation();
  const state=useSelector((state)=>state)
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const [operationType, setoperationType] = useState("BUY");
  const [currencies, setCurrencies] = useState([]);
  const [selectedCrypto, setSelectedCrypto] = useState(null);
  const [amountSend, setamountSend] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [openingWidget, setOpeningWidget] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [findResult, setFindResult] = useState("");

  useEffect(() => {
    fetchCurrencies();
  }, [operationType]);

  const fetchCurrencies = async () => {
    try {
      const side = operationType === "BUY" ? "buy" : "sell";
      const result = await apiHelper.post(`${REACT_APP_HOST}/v1/moonpay/currencies`, { side: side });
      if (result.success) {
        const groups = result.data.groups || [];
        const flat = groups.flatMap((g) => g.currencies) || [];
        setCurrencies(flat);
        if (flat.length) {
          setSelectedCrypto(flat[0]);
        }
      } else {
        CustomInfoProvider.show("error", "!Opps", "something went wrong");
      }
    } catch (error) {
      CustomInfoProvider.show("error", "!Opps", error || "something went wrong");
      console.log("currency error", error);
    }
  };

  const fetchQuote = async (amount, side, cryptoCode) => {
    try {
      setQuoteLoading(true);
      const result =
        await apiHelper.post(`${REACT_APP_HOST}/v1/moonpay/quote`, {
          side: side.toLowerCase(),
          code: cryptoCode,
          amount: Number(amount),
          fiat: "usd"
        });

      if (result.success) {
        setQuote(result.data);
      } else {
        CustomInfoProvider.show("error", "!Opps", Array.isArray(result.error) ? result.error[0] : result.error || "something went wrong")
        setQuote(null);
      }
    } catch (error) {
      CustomInfoProvider.show("error", "!Opps", error || "something went wrong")
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const waitAndFetchQuote = useCallback(debounce((amount, side, cryptoCode) => {
    if (!amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }
    fetchQuote(amount, side, cryptoCode);
  }, 500), []);

  useEffect(() => {
    if (amountSend && selectedCrypto) {
      waitAndFetchQuote(amountSend, operationType, selectedCrypto.code);
    }
    return () => {
      waitAndFetchQuote.cancel();
    };
  }, [amountSend, operationType, selectedCrypto,]);

  const openMoonPay =
    async () => {
      try {
        setOpeningWidget(true);
        const result =
          await apiHelper.post(`${REACT_APP_HOST}/v1/moonpay/link`, {
            side: operationType.toLowerCase(),
            amount: Number(amountSend),
            code: selectedCrypto.code,
            fiat: "usd",
            wallet: selectedCrypto.network==="stellar"?state&&state.STELLAR_PUBLICK_KEY:state?.ETH_KEY
          });

        if (result.success && result.data.url) {
          await Linking.openURL(
            result.data.url
          );
        } else {
          CustomInfoProvider.show("error", "!Opps", Array.isArray(result.error) ? result.error[0] : result.error || "something went wrong");
        }
      } catch (error) {
        console.info("error",error);
        CustomInfoProvider.show("error", "!Opps", error || "something went wrong")
      } finally {
        setOpeningWidget(false);
      }
    };

  const filteredCurrencies =
    useMemo(() => {
      if (!findResult)
        return currencies;

      const q = findResult.toLowerCase();
      return currencies.filter(
        (item) =>
          item.symbol?.toLowerCase().includes(q) ||
          item.name?.toLowerCase().includes(q) ||
          item.chainLabel?.toLowerCase().includes(q)
      );
    }, [currencies, findResult,]);

  const renderCurrencyItem = ({ item }) => {
    return (
      <TouchableOpacity style={[styles.tokenItem, { backgroundColor: theme.cardBg, },]}
        onPress={() => { setSelectedCrypto(item); setTokenModalVisible(false); setFindResult(""); }}
      >
        <View style={styles.tokenInfo}>
          <Text style={[styles.tokenSymbol, { color: theme.headingTx, }]}>
            {item.symbol}
          </Text>

          <Text style={[styles.tokenName, { color: theme.inactiveTx, }]}>
            {item.name}
          </Text>

          <Text style={[styles.tokenName, { color: theme.inactiveTx, }]}>
            {item.chainLabel}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.mainCom, { backgroundColor: theme.bg, }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Exchange_screen_header title="MoonPay" onLeftIconPress={()=>{navigation.goBack()}}/>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.toggleRow, { backgroundColor: theme.cardBg, }]}>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: operationType === "BUY" ? "#4052D6" : "transparent" }]} onPress={() => { setoperationType("BUY"); setQuote(null); }}>
              <Text style={{ color: operationType === "BUY" ? "#fff" : theme.headingTx,fontSize:16.9 }}>
                Buy
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: operationType === "SELL" ? "#4052D6" : "transparent", }]}
              onPress={() => { setoperationType("SELL"); setQuote(null) }}
            >
              <Text style={{ color: operationType === "SELL" ? "#fff" : theme.headingTx,fontSize:16.9 }}>
                Sell
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[styles.card, { backgroundColor: theme.cardBg }]}>
            <Text style={[styles.cardLabel,{color:theme.headingTx}]}>
              {operationType === "BUY" ? "You Pay (USD)" : `You Sell (${selectedCrypto?.symbol || ""})`}
            </Text>

            <TextInput
              value={amountSend}
              onChangeText={setamountSend}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="gray"
              style={[styles.amountInput, { color: theme.headingTx,backgroundColor:theme.bg }]}
            />
          </View>

          <View style={[styles.card, { backgroundColor: theme.cardBg, }]} >
            <Text style={[styles.cardLabel,{color:theme.headingTx}]}>
              Asset
            </Text>

            <TouchableOpacity
              style={[styles.fullSelectorBtn,{backgroundColor:theme.bg}]}
              onPress={() => setTokenModalVisible(true)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.headingTx, fontSize: 16 }}>
                  {selectedCrypto?.symbol || "Select Asset"}
                </Text>

                <Text style={{ color: theme.inactiveTx, }}>
                  {selectedCrypto?.chainLabel}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {quoteLoading && (
            <View style={[styles.card, { backgroundColor: theme.cardBg, }]}>
              <ActivityIndicator />
            </View>
          )}

          {quote &&
            !quoteLoading && (
              <View style={[styles.card, { backgroundColor: theme.cardBg, }]}>
                <Text style={{ fontSize: 22, fontWeight: "700", color: theme.headingTx, }}>
                  ≈{" "}{operationType === "BUY" ? `${quote.outputAmount} ${selectedCrypto?.symbol}` : `$${quote.outputAmount}`}
                </Text>

                <View style={styles.infoRow}>
                  <Text style={[styles.qouteLable,{color:theme.headingTx}]}>Fee</Text>
                  <Text style={[styles.qouteLable,{color:theme.headingTx}]}>${Number(quote.feeAmount).toFixed(2)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={[styles.qouteLable,{color:theme.headingTx}]}>Network Fee</Text>
                  <Text style={[styles.qouteLable,{color:theme.headingTx}]}>
                    ${Number(quote.networkFeeAmount).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={[styles.qouteLable,{color:theme.headingTx}]}>Total</Text>
                  <Text style={[styles.qouteLable,{color:theme.headingTx}]}>
                    ${Number(quote.totalAmount).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

          <TouchableOpacity
            style={[styles.buyBtn, { backgroundColor: "#5B65E1", opacity: !selectedCrypto || !amountSend ? 0.5 : 1, },]}
            disabled={!selectedCrypto || !amountSend || openingWidget}
            onPress={openMoonPay}
          >
            {openingWidget ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buyBtnText}>
                {operationType === "BUY" ? "Buy" : "Sell"}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={{fontSize:16,color:theme.inactiveTx,alignSelf:"center",marginTop:hp(2)}}>
            Powered by MoonPay
          </Text>
        </ScrollView>

        <Modal
          animationType="slide"
          visible={tokenModalVisible}
          onRequestClose={() => { setTokenModalVisible(false) }}
          useNativeDriver={true}
          useNativeDriverForBackdrop={true}
          hideModalContentWhileAnimating
          onBackdropPress={() => { setTokenModalVisible(false) }}
          onBackButtonPress={() => { setTokenModalVisible(false) }}
          style={styles.assetModal}
        >
          <Pressable
            style={styles.modalContainer}
            onPress={() => setTokenModalVisible(false)}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.bg }]}>
              <Text style={[styles.modalTitle, { color: theme.headingTx }]}>
                Select Asset
              </Text>

              <TextInput
                value={findResult}
                onChangeText={setFindResult}
                placeholder="Search..."
                placeholderTextColor="gray"
                style={[styles.searchInput, { color: theme.headingTx, },]}
              />

              <FlatList
                data={filteredCurrencies}
                renderItem={renderCurrencyItem}
                keyExtractor={(item) => item.code}
              />
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles =
  StyleSheet.create({
    mainCom: {
      flex: 1,
    },
    scrollContent: {
      padding: 12,
      paddingBottom: 40,
    },
    toggleRow: {
      flexDirection: "row",
      borderRadius: 16,
      padding: 6,
      marginTop: 15,
    },
    toggleBtn: {
      flex: 1,
      height: 46,
      justifyContent:"center",
      alignItems: "center",
      borderRadius: 12,
    },
    card: {
      padding: 16,
      borderRadius: 16,
      marginTop: 12,
    },
    crdLabel: {
      marginBottom: 10,
      fontSize:16.9
    },
    amountInput: {
      fontSize: 19,
      fontWeight: "600",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal:13,
      paddingVertical:10,
      width:"103%",
      borderRadius:15,
      marginLeft:-6,
      marginTop:6
    },
    fullSelectorBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal:13,
      paddingVertical:10,
      width:"103%",
      borderRadius:15,
      marginLeft:-6,
      marginTop:6
    },
    buyBtn: {
      height: 59,
      borderRadius: 14,
      justifyContent:"center",
      alignItems: "center",
      marginTop: 20,
    },
    buyBtnText: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "500",
    },
    infoRow: {
      flexDirection: "row",
      justifyContent:"space-between",
      marginTop: 6,
    },
    qouteLable:{
      fontSize:16
    },
    modalContainer: {
      flex: 1,
      justifyContent:"flex-end",
      backgroundColor:"rgba(0,0,0,0.4)",
    },
    modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
    assetModal: {
      justifyContent: "flex-end",
      margin: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)"
    },
    modalContent: {
      height: "75%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 12,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: "#444",
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 12,
      fontSize:18,
      height:45
    },
    tokenItem: {
      padding: 14,
      borderRadius: 12,
      marginBottom: 6,
    },
    tokenInfo: {

    },
    tokenSymbol: {
      fontSize: 16.9,
      fontWeight: "600",
    },
    tokenName: {
      fontSize: 14,
      marginTop: 2,
    },
    cardLabel:{
      fontSize:16
    }
  })

export default RampProvider;