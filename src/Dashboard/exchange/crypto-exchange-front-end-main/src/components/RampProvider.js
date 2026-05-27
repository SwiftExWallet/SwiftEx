import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import Icon from "../../../../../icon";
import { useSelector } from "react-redux";
import { debounce } from "lodash";
import { REACT_APP_HOST } from "../ExchangeConstants";
import apiHelper from "../apiHelper";
import CustomInfoProvider from "./CustomInfoProvider";
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";


const normalizeObject = (obj) => (obj ? Object.values(obj) : []);

const RampProvider = () => {
    const state = useSelector((state) => state);
    const navigation = useNavigation();
    const [buyTokens, setBuyTokens] = useState(null);
    const [sellTokens, setSellTokens] = useState(null);
    const [btnLoading, setbtnLoading] = useState(false);
    const [qoutesLoading, setqoutesLoading] = useState(false);
    const [amountSend, setamountSend] = useState("");
    const [operationType, setoperationType] = useState("BUY");
    const [operationError, setoperationError] = useState(null);
    const [QoutesRes, setQoutesRes] = useState(null);
    const [tokenModalVisible, setTokenModalVisible] = useState(false);
    const [tokenModalType, settokenModalType] = useState(0);
    const [selectedfiat, setSelectedfiat] = useState(null);
    const [selectedCrypto, setSelectedCrypto] = useState(null);
    const [FindResult, setFindResult] = useState("");
    const [assetFetchloading, setAssetFetchloading] = useState(true);
    const isFocuesd = useIsFocused();
    const normalizeObject = (obj) => (obj ? Object.values(obj) : []);

    const CURRENCY_TO_COUNTRY = {
        EUR: 'eu', USD: 'us', AUD: 'au', INR: 'in', NOK: 'no',
        BRL: 'br', CAD: 'ca', CLP: 'cl', COP: 'co', NZD: 'nz',
        CZK: 'cz', DKK: 'dk', GBP: 'gb', HKD: 'hk', IDR: 'id',
        JPY: 'jp', KRW: 'kr', ZAR: 'za', CHF: 'ch', MXN: 'mx',
        NGN: 'ng', PHP: 'ph', PLN: 'pl', QAR: 'qa', SAR: 'sa',
        SGD: 'sg', SEK: 'se', TWD: 'tw', THB: 'th', TRY: 'tr',
        AED: 'ae', VND: 'vn',
    };

    const resetSelections = () => {
        setSelectedfiat(null);
        setSelectedCrypto(null);
        setQoutesRes(null);
        setamountSend("");
        setoperationError(null);
    };


    useEffect(() => {
        const initService = async () => {
            try {
                const THIRTY_MINUTES = 30 * 60 * 1000;
                const cached = await AsyncStorage.getItem("BANXA_INFO_TOKENS");
                const parsed = cached ? JSON.parse(cached) : null;

                if (parsed && Date.now() - parsed.lastFetched < THIRTY_MINUTES) {
                    setBuyTokens(parsed.buy);
                    setSellTokens(parsed.sell);
                    return;
                }

                const [buy, sell] = await Promise.all([
                    apiHelper.get(REACT_APP_HOST + "/v1/banxa/fetch-assets?orderType=buy"),
                    apiHelper.get(REACT_APP_HOST + "/v1/banxa/fetch-assets?orderType=sell"),
                ]);

                if (buy.success === true && sell.success === true) {
                    const buyData = {
                        crypto_assets: normalizeObject(buy.data.data.crypto_assets),
                        fiat_currencies: normalizeObject(buy.data.data.fiat_currencies),
                    };
                    const sellData = {
                        crypto_assets: normalizeObject(sell.data.data.crypto_assets),
                        payout_methods: normalizeObject(sell.data.data.payout_methods),
                    };
                    await AsyncStorage.setItem(
                        "BANXA_INFO_TOKENS",
                        JSON.stringify({ buy: buyData, sell: sellData, lastFetched: Date.now() }),
                    );
                    setBuyTokens(buyData);
                    setSellTokens(sellData);
                } else {
                    CustomInfoProvider.hide();
                    CustomInfoProvider.show("error", "!Opps", "failed to load assets");
                }
            } catch (error) {
                CustomInfoProvider.hide();
                CustomInfoProvider.show("error", "!Opps", "failed to load assets");
            } finally {
                CustomInfoProvider.hide();
                setAssetFetchloading(false);
            }
        };
        initService();
    }, [isFocuesd]);




    const listManager = useMemo(() => {
        if (assetFetchloading) return [];
        if (tokenModalType === 0) {
            return operationType === "BUY"
                ? (buyTokens?.fiat_currencies ?? [])
                : (sellTokens?.payout_methods ?? []);
        } else {
            return operationType === "BUY"
                ? (sellTokens?.crypto_assets ?? [])
                : (buyTokens?.crypto_assets ?? []);
        }
    }, [tokenModalType, operationType, assetFetchloading, buyTokens, sellTokens]);

    const listManagerData = useMemo(() => {
        if (!FindResult) return listManager;
        const query = FindResult.toLowerCase();
        return listManager.filter((token) => {
            if (tokenModalType === 0) {

                return operationType === "BUY"
                    ? token.id?.toLowerCase().includes(query) ||
                    token.description?.toLowerCase().includes(query)
                    : token.name?.toLowerCase().includes(query) ||
                    token.supportedFiats?.[0]?.toLowerCase().includes(query);
            } else {

                return (
                    token.id?.toLowerCase().includes(query) ||
                    token.description?.toLowerCase().includes(query) ||
                    token.blockchains?.[0]?.id?.toLowerCase().includes(query)
                );
            }
        });
    }, [FindResult, listManager, tokenModalType, operationType]);



    const renderTokenItem = ({ item }) => {
        const defaultChain = item.blockchains?.find((b) => b.isDefaultBlockchain) ?? item.blockchains?.[0];


        const getFlagUrl = (currencyId) => {
            const code = CURRENCY_TO_COUNTRY[currencyId?.toUpperCase()];
            return code ? `https://flagcdn.com/24x18/${code}.png` : null;
        };

        return (
            <TouchableOpacity
                style={[styles.tokenItem, { backgroundColor: theme.cardBg }]}
                onPress={() => {
                    tokenModalType === 0 ? setSelectedfiat(item) : setSelectedCrypto(item);
                    setTokenModalVisible(false);
                    setFindResult("");
                }}
            >
                {tokenModalType === 0 ? (

                    (() => {
                        const flagUrl = operationType === "BUY"
                            ? getFlagUrl(item.id)
                            : getFlagUrl(item.supportedFiats?.[0]);
                        return flagUrl
                            ? <Image source={{ uri: flagUrl }} style={styles.tokenIcon} />
                            : <View style={[styles.tokenIcon, { backgroundColor: "#333", borderRadius: 16 }]} />;
                    })()
                ) : (
                    item.icon
                        ? <Image source={{ uri: item.icon }} style={styles.tokenIcon} />
                        : <Icon name="ethereum" type="materialCommunity" color={theme.headingTx} size={25} />
                )}

                <View style={styles.tokenInfo}>
                    <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>
                        {tokenModalType === 0
                            ? operationType === "BUY"
                                ? `${item.id} — ${item.description}`
                                : item.name
                            : item.id
                        }
                    </Text>
                    <Text style={[styles.tokenName, { color: theme.inactiveTx }]}>
                        {item.description}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };


    const fetchQoutes = async (amount, actionType, cryptoSelection, fiatSelection) => {
        const defaultChain = cryptoSelection?.blockchains?.find((b) => b.isDefaultBlockchain)
            ?? cryptoSelection?.blockchains?.[0];

        const payload = actionType === "BUY" ? {
            paymentMethodId: fiatSelection?.supportedPaymentMethods?.[0]?.id,
            crypto: defaultChain?.id,
            blockchain: cryptoSelection?.id,
            fiatAmount: amount,
            fiat: fiatSelection?.id,
            orderType: "buy",
        } : {
            paymentMethodId: fiatSelection?.id,
            crypto: defaultChain?.id,
            blockchain: cryptoSelection?.id,
            fiat: fiatSelection?.supportedFiats?.[0],
            cryptoAmount: amount,
            orderType: "sell",
        };

        const result = await apiHelper.post(REACT_APP_HOST + "/v1/banxa/fetch-quotes", payload);
        if (result.success) {
            setQoutesRes(result.data.data);
            setqoutesLoading(false);
        } else {
            setqoutesLoading(false);
            setamountSend("");
            CustomInfoProvider.show("error", "!Opps", result.error || "Something went wrong..");
        }
    };

    const waitAndQoutesFetch = useCallback(
        debounce((valpayAmount, valoperationType, valselectedCrypto, valselectedfiat) => {
            if (!valpayAmount || valpayAmount === "0" || parseFloat(valpayAmount) === 0) {
                setamountSend("");
                setoperationError("Invalid amount");
                setQoutesRes(null);
                setqoutesLoading(false);
                return;
            }
            if (valselectedCrypto === null || valselectedfiat === null) {
                setoperationError("fiat & crypto both selection required.");
                return;
            }
            setQoutesRes(null);
            setqoutesLoading(true);
            setoperationError(null);
            fetchQoutes(valpayAmount, valoperationType, valselectedCrypto, valselectedfiat);
        }, 1000),
        [],
    );

    const handleChange = (text) => {
        const payAmount = text
            .replace(",", ".")
            .replace(/[^0-9.]/g, "")
            .replace(/(\..*?)\..*/g, "$1");
        setamountSend(payAmount);
        waitAndQoutesFetch(payAmount, operationType, selectedCrypto, selectedfiat);
    };

    const handleOprations = async () => {
        try {
            setbtnLoading(true);
            if (operationType === "BUY") {
                await proccedBuy();
            } else {
                await proccedSell();
            }
        } catch (error) {
            console.error("error in handle oprations", error);
            CustomInfoProvider.show("error", "!Opps", "Somthing went wrong");
            setbtnLoading(false);
        }
    };

    const proccedBuy = async () => {
        try {
            const payload = {
                paymentMethodId: selectedfiat.supportedPaymentMethods[0].id,
                crypto: selectedCrypto.blockchains?.find((b) => b.isDefaultBlockchain)?.id ??item.blockchains?.[0]?.id,
                blockchain: selectedCrypto.id,
                fiat: selectedfiat.id,
                fiatAmount: amountSend.toString(),
                walletAddress: selectedCrypto.blockchains?.find((b) => b.isDefaultBlockchain)?.id ??item.blockchains?.[0]?.id==="XLM" ? state && state.STELLAR_PUBLICK_KEY : state?.ETH_KEY,
            }
            const result = await apiHelper.post(REACT_APP_HOST + "/v1/banxa/create-buy-order", payload);
            console.info(result)
            if (result.success && result.data.success) {
                setbtnLoading(false);
                Linking.openURL(result.data.success.data.checkoutUrl)
            } else {
                setbtnLoading(false);
                CustomInfoProvider.show("error", "Oops!", result.error || "Somthing went wrong.");
            }
        } catch (error) {
            console.error("error in buy", error);
            setbtnLoading(false);
            CustomInfoProvider.show("error", "Oops!", "Somthing went wrong.");
        }
    };

    const proccedSell = async () => {
        try {
            const payload = {
                paymentMethodId: selectedfiat.id,
                crypto: selectedCrypto.blockchains?.find((b) => b.isDefaultBlockchain)?.id ??item.blockchains?.[0]?.id,
                blockchain: selectedCrypto.id,
                fiat: selectedfiat.supportedFiats[0],
                cryptoAmount: amountSend.toString(),
                walletAddress: selectedCrypto?.network === "XLM" ? state && state.STELLAR_PUBLICK_KEY : state?.ETH_KEY,
            }
            const result = await apiHelper.post(REACT_APP_HOST + "/v1/banxa/create-sell-order", payload);
            console.info(result)
            if (result.success && result.data.success) {
                setbtnLoading(false);
                Linking.openURL(result.data.success.data.checkoutUrl)
            } else {
                setbtnLoading(false);
                CustomInfoProvider.show("error", "Oops!", result.error || "Somthing went wrong.");
            }
        } catch (error) {
            console.error("error in sell", error);
            setbtnLoading(false);
            CustomInfoProvider.show("error", "Oops!", "Somthing went wrong.");
        }
    };

    const theme = state.THEME.THEME ? colors.dark : colors.light;

    return (
        <View style={[styles.mainCom, { backgroundColor: theme.bg }]}>
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
                >
                    <Exchange_screen_header
                        title={"Fiat Access"}
                        onLeftIconPress={() => navigation.goBack()}
                        onRightIconPress={() => console.log("Pressed")}
                    />

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                        bounces={false}
                    >
                        <View style={[styles.pariViewCon, { width: "100%", paddingHorizontal: 6, backgroundColor: theme.cardBg }]}>
                            <TouchableOpacity
                                style={[styles.pairNameCon, { backgroundColor: operationType === "BUY" ? "#4052D6" : theme.cardBg, width: wp(40) }]}
                                onPress={() => { setoperationType("BUY"); resetSelections(); }}
                            >
                                <Text style={[styles.pairNameText, { color: operationType === "BUY" ? "#fff" : theme.headingTx }]}>Buy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.pairNameCon, { backgroundColor: operationType === "SELL" ? "#4052D6" : theme.cardBg, width: wp(40) }]}
                                onPress={() => { setoperationType("SELL"); resetSelections(); }}
                            >
                                <Text style={[styles.pairNameText, { color: operationType === "SELL" ? "#fff" : theme.headingTx }]}>Sell</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.amountInfoCon, { backgroundColor: theme.cardBg }]}>
                            <View style={styles.amountInfoHeader}>
                                <Text style={styles.amountInfoText}>You Pay</Text>
                                <View style={styles.amountInputCon}>
                                    <View style={[styles.amountSubCon, { width: wp(50), borderColor: theme.smallCardBorderColor }]}>
                                        <TextInput
                                            placeholder="0.00"
                                            placeholderTextColor="gray"
                                            value={amountSend}
                                            style={[styles.amountInput, { color: theme.headingTx }]}
                                            onChangeText={handleChange}
                                            returnKeyType="done"
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                </View>
                            </View>

                            {operationType === "BUY" ? (

                                <TouchableOpacity
                                    style={[styles.amountFlagCon, { backgroundColor: theme.bg }]}
                                    onPress={() => { settokenModalType(0); setTokenModalVisible(true); }}
                                >
                                    <View style={styles.currencySelector}>
                                        <Image
                                            source={{
                                                uri: CURRENCY_TO_COUNTRY[selectedfiat?.id]
                                                    ? `https://flagcdn.com/24x18/${CURRENCY_TO_COUNTRY[selectedfiat.id]}.png`
                                                    : undefined
                                            }}
                                            style={styles.tokenIcon}
                                        />
                                        <Text style={[styles.currencyText, { color: theme.headingTx }]}>
                                            {selectedfiat?.id || "Fiat"}
                                        </Text>
                                    </View>
                                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                                </TouchableOpacity>
                            ) : (

                                <TouchableOpacity
                                    style={[styles.amountFlagCon, { backgroundColor: theme.bg }]}
                                    onPress={() => { settokenModalType(1); setTokenModalVisible(true); }}
                                >
                                    <View style={styles.currencySelector}>
                                        {selectedCrypto?.icon
                                            ? <Image source={{ uri: selectedCrypto.icon }} style={styles.tokenIcon} />
                                            : <Icon name="ethereum" type="materialCommunity" color={theme.headingTx} size={25} />
                                        }
                                        <View style={{ flexDirection: "column" }}>
                                            <Text style={[styles.currencyText, { color: theme.headingTx }]}>
                                                {selectedCrypto?.id || "Crypto"}
                                            </Text>
                                            {selectedCrypto?.blockchains?.[0]?.id && (
                                                <Text style={styles.currencySubText}>
                                                    {selectedCrypto.blockchains?.find((b) => b.isDefaultBlockchain)?.id ??item.blockchains?.[0]?.id}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {operationError !== null && (
                            <Text style={styles.errorText}>{operationError}</Text>
                        )}

                        <View style={[styles.amountInfoCon, { backgroundColor: theme.cardBg, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                            <View style={styles.amountInfoHeader}>
                                <Text style={styles.amountInfoText}>You Get</Text>
                                <View style={styles.amountInputCon}>
                                    <View style={[styles.amountSubCon, { width: wp(50), borderColor: theme.smallCardBorderColor }]}>
                                        <TextInput
                                            editable={false}
                                            placeholder="0.0"
                                            placeholderTextColor="gray"
                                            value={
                                                operationType === "BUY"
                                                    ? QoutesRes?.cryptoAmount?.toString()
                                                    : QoutesRes?.fiatAmount?.toString()
                                            }
                                            style={[styles.amountInput, { color: "gray" }]}
                                        />
                                    </View>
                                </View>
                            </View>

                            {operationType === "SELL" ? (

                                <TouchableOpacity
                                    style={[styles.amountFlagCon, { backgroundColor: theme.bg }]}
                                    onPress={() => { settokenModalType(0); setTokenModalVisible(true); }}
                                >
                                    <View style={styles.currencySelector}>
                                        <Image
                                            source={{
                                                uri: CURRENCY_TO_COUNTRY[selectedfiat?.supportedFiats?.[0]]
                                                    ? `https://flagcdn.com/24x18/${CURRENCY_TO_COUNTRY[selectedfiat.supportedFiats[0]]}.png`
                                                    : undefined
                                            }}
                                            style={styles.tokenIcon}
                                        />
                                        <Text style={[styles.currencyText, { color: theme.headingTx }]}>
                                            {selectedfiat?.supportedFiats?.[0] || "Payout"}
                                        </Text>
                                    </View>
                                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                                </TouchableOpacity>
                            ) : (

                                <TouchableOpacity
                                    style={[styles.amountFlagCon, { backgroundColor: theme.bg }]}
                                    onPress={() => { settokenModalType(1); setTokenModalVisible(true); }}
                                >
                                    <View style={styles.currencySelector}>
                                        {selectedCrypto?.icon
                                            ? <Image source={{ uri: selectedCrypto.icon }} style={styles.tokenIcon} />
                                            : <Icon name="ethereum" type="materialCommunity" color={theme.headingTx} size={25} />
                                        }
                                        <View style={{ flexDirection: "column" }}>
                                            <Text style={[styles.currencyText, { color: theme.headingTx }]}>
                                                {selectedCrypto?.id || "Crypto"}
                                            </Text>
                                            {selectedCrypto?.blockchains?.[0]?.id && (
                                                <Text style={styles.currencySubText}>
                                                    {selectedCrypto.blockchains?.find((b) => b.isDefaultBlockchain)?.id ??item.blockchains?.[0]?.id}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <Icon name="chevron-down" type="materialCommunity" color={theme.headingTx} size={25} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {qoutesLoading && QoutesRes === null ? (
                            <View style={[styles.infoCon, { paddingVertical: 19, alignItems: "center", borderColor: theme.inactiveTx }]}>
                                <ActivityIndicator color={"#5B65E1"} size={"large"} />
                                <Text style={[styles.addressText, { fontSize: 16, color: theme.inactiveTx }]}>
                                    Fetching Quotes Details....
                                </Text>
                            </View>
                        ) : QoutesRes !== null ? (
                            <View style={[styles.providerCon, { backgroundColor: theme.cardBg, borderColor: theme.inactiveTx }]}>
                                <View style={styles.providerSubCon}>
                                    <Text style={{ fontSize: 16, fontWeight: "400", color: theme.inactiveTx }}>Provider:</Text>
                                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                                        <Image source={require("../../../../../../assets/BANXA.png")} style={styles.image} resizeMode="cover" />
                                        <Text style={{ fontSize: 16, fontWeight: "600", color: theme.headingTx }}>Banxa</Text>
                                    </View>
                                </View>

                                <View style={[styles.infoCon, { backgroundColor: theme.cardBg, borderColor: theme.inactiveTx }]}>
                                    <Text style={[styles.amountInfoText, { color: theme.headingTx, marginBottom: hp(1) }]}>
                                        Transaction summary
                                    </Text>

                                    <View style={styles.infoRow}>
                                        <Text style={[styles.infoText, { color: theme.headingTx }]}>Your Order</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: wp(30), paddingVertical: 1 }}>
                                            {operationType === "BUY" ? (
                                                <Text style={[styles.infoText, { color: theme.headingTx }]}>
                                                    {amountSend} {QoutesRes?.fiat || selectedfiat?.id} to {QoutesRes?.cryptoAmount || "0.0"} {QoutesRes?.crypto || selectedCrypto?.id}
                                                </Text>
                                            ) : (
                                                <Text style={[styles.infoText, { color: theme.headingTx }]}>
                                                    {amountSend} {selectedCrypto?.id} to {QoutesRes?.fiatAmount || "0.0"} {QoutesRes?.fiat || selectedfiat?.supportedFiats?.[0]}
                                                </Text>
                                            )}
                                        </ScrollView>
                                    </View>

                                    <View style={styles.infoRow}>
                                        <Text style={[styles.infoText, { color: theme.headingTx }]}>Processing fee</Text>
                                        <Text style={[styles.infoText, { color: theme.headingTx }]}>
                                            {QoutesRes?.processingFee || "0.0"} {QoutesRes?.fiat || selectedfiat?.id || selectedfiat?.supportedFiats?.[0]}
                                        </Text>
                                    </View>

                                    <View style={styles.infoRow}>
                                        <Text style={[styles.infoText, { color: theme.headingTx }]}>Network fee</Text>
                                        <Text style={[styles.infoText, { color: theme.headingTx }]}>
                                            {QoutesRes?.networkFee || "0.0"} {QoutesRes?.crypto || selectedCrypto?.id}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.buyBtn, {
                                width: "100%",
                                backgroundColor:
                                    btnLoading || qoutesLoading ||
                                        !amountSend || parseFloat(amountSend) === 0 ||
                                        selectedCrypto === null || selectedfiat === null
                                        ? "gray" : "#5B65E1",
                            }]}
                            disabled={
                                btnLoading || qoutesLoading ||
                                !amountSend || parseFloat(amountSend) === 0 ||
                                selectedCrypto === null || selectedfiat === null
                            }
                            onPress={handleOprations}
                        >
                            {btnLoading
                                ? <ActivityIndicator size={"small"} color={"#fff"} />
                                : <Text style={styles.buyBtnText}>{operationType === "BUY" ? "Buy Crypto" : "Sell Crypto"}</Text>
                            }
                        </TouchableOpacity>

                        <Text style={{ fontSize: 16, color: theme.inactiveTx, alignSelf: "center", marginTop: hp(2) }}>
                            Powered by Banxa
                        </Text>
                    </ScrollView>

                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={tokenModalVisible}
                        onRequestClose={() => setTokenModalVisible(false)}
                    >
                        <View style={styles.modalContainer}>
                            <View style={[styles.modalContent, { backgroundColor: theme.bg }]}>
                                <View style={styles.modalHandle} />

                                {assetFetchloading || buyTokens === null ? (
                                    CustomInfoProvider.show("waiting", "Please Wait", "Collecting information.")
                                ) : (
                                    <>
                                        <View style={styles.modalHeader}>
                                            <Text style={[styles.modalTitle, { color: theme.headingTx }]}>
                                                Select a{" "}
                                                {tokenModalType === 0
                                                    ? operationType === "BUY" ? "fiat" : "payout method"
                                                    : "crypto"
                                                }
                                            </Text>
                                            <TouchableOpacity onPress={() => setTokenModalVisible(false)}>
                                                <MaterialIcons name="close" size={24} color={theme.headingTx} />
                                            </TouchableOpacity>
                                        </View>

                                        <TextInput
                                            placeholder={`Search ${tokenModalType === 0 ? (operationType === "BUY" ? "fiat" : "payout") : "crypto"}...`}
                                            placeholderTextColor={"gray"}
                                            value={FindResult}
                                            onChangeText={setFindResult}
                                            style={[styles.searchCon, { color: theme.headingTx }]}
                                        />

                                        <FlatList
                                            data={listManagerData}
                                            renderItem={renderTokenItem}
                                            keyExtractor={(item, index) => `${item.id}-${index}`}
                                            showsVerticalScrollIndicator={false}
                                        />
                                    </>
                                )}
                            </View>
                        </View>
                    </Modal>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </View>
    );
};

const styles = StyleSheet.create({
    mainCom: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: 10, paddingBottom: 20 },
    pariViewCon: { marginTop: 20, marginBottom: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 62, alignSelf: "center", borderRadius: 16, paddingHorizontal: 4 },
    pairNameCon: { height: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#1F2937" },
    pairNameText: { fontSize: 16, fontWeight: "500" },
    amountInfoCon: { borderRadius: 16, paddingHorizontal: wp(4), paddingVertical: hp(1), alignSelf: "center", flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: hp(1.5) },
    amountInfoHeader: { flexDirection: "column", justifyContent: "space-between", marginBottom: 10 },
    amountInfoText: { fontSize: 16, color: "gray", fontWeight: "500" },
    amountInputCon: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    amountSubCon: { borderBottomWidth: 1, marginTop: hp(2) },
    amountInput: { fontSize: 20, fontWeight: "500", color: "#fff", padding: 0 },
    amountFlagCon: { maxWidth: wp(55), height: hp(6), width: wp(35), paddingHorizontal: wp(2), flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginLeft: 5, borderRadius: 15, bottom: hp(-2) },
    currencySelector: { flexDirection: "row", alignItems: "center" },
    currencyText: { fontSize: 16, color: "#fff", fontWeight: "500", marginLeft: 8 },
    currencySubText: { fontSize: 14, color: "#999", marginLeft: 8 },
    errorText: { fontSize: 16, color: "red", fontWeight: "600", marginLeft: 1 },
    downBoxCon: { alignItems: "center", justifyContent: "center" },
    infoCon: { marginVertical: -4, borderRadius: 16, borderWidth: 1, borderColor: "#FFFFFF33", padding: 14 },
    providerCon: { marginVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: "#FFFFFF33" },
    providerSubCon: { flexDirection: "row", paddingHorizontal: 14, justifyContent: "space-between", alignItems: "center", paddingVertical: hp(1.6) },
    infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: hp(1) },
    infoText: { fontSize: 13, color: "#fff" },
    addressText: { fontSize: 16, color: "#fff" },
    buyBtn: { backgroundColor: "#2164C1", height: hp(6.9), borderRadius: 15, justifyContent: "center", alignItems: "center", alignSelf: "center", marginTop: 30 },
    buyBtnText: { fontSize: 20, color: "#FFFFFF" },
    modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.1)" },
    modalContent: { backgroundColor: "#1E1E1E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: "70%" },
    modalHandle: { width: 40, height: 5, backgroundColor: "#666", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: "600", color: "#FFFFFF" },
    tokenItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, marginBottom: 2, paddingHorizontal: wp(2), borderRadius: 10 },
    tokenIcon: { width: 32, height: 32, borderRadius: 16 },
    tokenInfo: { flex: 1, marginLeft: 12 },
    tokenSymbol: { fontSize: 16, color: "#FFFFFF", fontWeight: "500" },
    tokenName: { fontSize: 14, color: "#999" },
    searchCon: { color: "#fff", height: 40, borderColor: "gray", borderWidth: 1, paddingHorizontal: 10, marginBottom: 10, borderRadius: 15 },
    image: { width: wp(13), height: hp(5), alignSelf: "center", borderRadius: 10, marginRight: 9 },
});

export default RampProvider;