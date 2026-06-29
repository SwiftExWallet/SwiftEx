import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import Modal from "react-native-modal";
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
import {TOKENS_INFO} from "../../src/pages/stellar/TokensSupportUtil"


const normalizeObject = (obj) => (obj ? Object.values(obj) : []);

const BanxaRampProvider = () => {
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
    const [selectedBlockchain, setSelectedBlockchain] = useState(null);
    const [blockchainModalVisible, setBlockchainModalVisible] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
    const [FindResult, setFindResult] = useState("");
    const [assetFetchloading, setAssetFetchloading] = useState(true);
    const isFocuesd = useIsFocused();

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
        setSelectedBlockchain(null);
        setSelectedPaymentMethod(null);
        setQoutesRes(null);
        setamountSend("");
        setoperationError(null);
    };

    // Fetch initial assets data
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

    useEffect(() => {
        if (selectedCrypto) {
            const defaultChain = selectedCrypto.blockchains?.find((b) => b.isDefaultBlockchain)
                ?? selectedCrypto.blockchains?.[0];
            setSelectedBlockchain(defaultChain);
        } else {
            setSelectedBlockchain(null);
        }
    }, [selectedCrypto]);

    useEffect(() => {
        if (selectedfiat) {
            if (operationType === "BUY") {
                setSelectedPaymentMethod(selectedfiat.supportedPaymentMethods?.[0] || null);
            } else {
                setSelectedPaymentMethod(selectedfiat);
            }
        } else {
            setSelectedPaymentMethod(null);
        }
    }, [selectedfiat, operationType]);

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
                    ? token.id?.toLowerCase().includes(query) || token.description?.toLowerCase().includes(query)
                    : token.name?.toLowerCase().includes(query) || token.supportedFiats?.[0]?.toLowerCase().includes(query);
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
        console.info(item)
        const getFlagUrl = (currencyId) => {
            const code = CURRENCY_TO_COUNTRY[currencyId?.toUpperCase()];
            return code
                ? `https://flagcdn.com/24x18/${code}.png`
                : null;
        };

        return (
            <TouchableOpacity
                style={[
                    styles.tokenItem,
                    { backgroundColor: theme.cardBg }
                ]}
                onPress={() => {
                    tokenModalType === 0
                        ? setSelectedfiat(item)
                        : setSelectedCrypto({...item,icon:TOKENS_INFO[item.id]?.image});

                    setTokenModalVisible(false);
                    setFindResult("");
                }}
            >
                {tokenModalType === 0 ? (
                    (() => {
                        const flagUrl =
                            operationType === "BUY"
                                ? getFlagUrl(item.id)
                                : getFlagUrl(item.supportedFiats?.[0]);

                        return flagUrl ? (
                            <Image
                                source={{ uri: flagUrl }}
                                style={styles.tokenIcon}
                            />
                        ) : (
                            <View
                                style={[
                                    styles.tokenIcon,
                                    {
                                        backgroundColor: "#333",
                                        borderRadius: 16,
                                    },
                                ]}
                            />
                        );
                    })()
                ) : (
                    item.icon || TOKENS_INFO[item.id]?.image ? (
                        <Image
                            source={{
                                uri: item.icon || TOKENS_INFO[item.id]?.image,
                            }}
                            style={styles.tokenIcon}
                        />
                    ) : (
                        <Icon
                            name="ethereum"
                            type="materialCommunity"
                            color={theme.headingTx}
                            size={25}
                        />
                    )
                )}

                <View style={styles.tokenInfo}>
                    <Text
                        style={[
                            styles.tokenSymbol,
                            { color: theme.headingTx },
                        ]}
                    >
                        {tokenModalType === 0
                            ? operationType === "BUY"
                                ? `${item.id} — ${item.description}`
                                : item.name
                            : item.id}
                    </Text>

                    <Text
                        style={[
                            styles.tokenName,
                            { color: theme.inactiveTx },
                        ]}
                    >
                        {item.description}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const fetchQoutes = async (amount, actionType, cryptoSelection, fiatSelection, blockchainSelection, methodSelection) => {
        const payload = actionType === "BUY" ? {
            paymentMethodId: methodSelection?.id || fiatSelection?.supportedPaymentMethods?.[0]?.id,
            crypto: cryptoSelection?.id,
            blockchain: blockchainSelection?.id,
            fiatAmount: amount,
            fiat: fiatSelection?.id,
            orderType: "buy",
        } : {
            paymentMethodId: methodSelection?.id || fiatSelection?.id,
            crypto: cryptoSelection?.id,
            blockchain: blockchainSelection?.id,
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
        debounce((valpayAmount, valoperationType, valselectedCrypto, valselectedfiat, valBlockchain, valMethod) => {
            if (!valpayAmount || valpayAmount === "0" || parseFloat(valpayAmount) === 0) {
                setamountSend("");
                setoperationError("Invalid amount");
                setQoutesRes(null);
                setqoutesLoading(false);
                return;
            }
            if (valselectedCrypto === null || valselectedfiat === null) {
                setoperationError("Fiat & Crypto selections are both required.");
                return;
            }
            setQoutesRes(null);
            setqoutesLoading(true);
            setoperationError(null);
            fetchQoutes(valpayAmount, valoperationType, valselectedCrypto, valselectedfiat, valBlockchain, valMethod);
        }, 1000),
        [],
    );

    const handleChange = (text) => {
        const payAmount = text
            .replace(",", ".")
            .replace(/[^0-9.]/g, "")
            .replace(/(\..*?)\..*/g, "$1");
        setamountSend(payAmount);
        waitAndQoutesFetch(payAmount, operationType, selectedCrypto, selectedfiat, selectedBlockchain, selectedPaymentMethod);
    };

    useEffect(() => {
        if (amountSend && selectedCrypto && selectedfiat && selectedBlockchain) {
            waitAndQoutesFetch(amountSend, operationType, selectedCrypto, selectedfiat, selectedBlockchain, selectedPaymentMethod);
        }
    }, [selectedCrypto, selectedfiat, selectedBlockchain, selectedPaymentMethod, operationType]);

    const handleOprations = async () => {
        try {
            setbtnLoading(true);
            if (operationType === "BUY") {
                await proccedBuy();
            } else {
                await proccedSell();
            }
        } catch (error) {
            console.error("error in handle operations", error);
            CustomInfoProvider.show("error", "!Opps", "Something went wrong");
            setbtnLoading(false);
        }
    };

    const proccedBuy = async () => {
        try {
            const payload = {
                paymentMethodId: selectedPaymentMethod?.id || selectedfiat.supportedPaymentMethods[0].id,
                crypto: selectedBlockchain?.id,
                blockchain: selectedCrypto.id,
                fiat: selectedfiat.id,
                fiatAmount: amountSend.toString(),
                walletAddress: selectedCrypto.id === "XLM" ? state && state.STELLAR_PUBLICK_KEY : state?.wallet?.address,
            };
            const result = await apiHelper.post(REACT_APP_HOST + "/v1/banxa/create-buy-order", payload);
            if (result.success && result.data.success) {
                setbtnLoading(false);
                Linking.openURL(result.data.success.data.checkoutUrl);
            } else {
                setbtnLoading(false);
                CustomInfoProvider.show("error", "Oops!", result.error || "Something went wrong.");
            }
        } catch (error) {
            console.error("error in buy", error);
            setbtnLoading(false);
            CustomInfoProvider.show("error", "Oops!", "Something went wrong.");
        }
    };

    const proccedSell = async () => {
        try {
            const payload = {
                paymentMethodId: selectedPaymentMethod?.id || selectedfiat.id,
                crypto: selectedBlockchain?.id,
                blockchain: selectedCrypto.id,
                fiat: selectedfiat.supportedFiats[0],
                cryptoAmount: amountSend.toString(),
                walletAddress: selectedCrypto.id === "XLM" ? state && state.STELLAR_PUBLICK_KEY : state?.wallet?.address,
            };
            const result = await apiHelper.post(REACT_APP_HOST + "/v1/banxa/create-sell-order", payload);
            if (result.success && result.data.success) {
                setbtnLoading(false);
                Linking.openURL(result.data.success.data.checkoutUrl);
            } else {
                setbtnLoading(false);
                CustomInfoProvider.show("error", "Oops!", result.error || "Something went wrong.");
            }
        } catch (error) {
            console.error("error in sell", error);
            setbtnLoading(false);
            CustomInfoProvider.show("error", "Oops!", "Something went wrong.");
        }
    };

    const getSelectedFiatLabel = () => {
        if (operationType === "BUY") return selectedfiat?.id || "Fiat";
        return selectedfiat?.supportedFiats?.[0] || "Fiat";
    };

    const getFiatFlagUrl = () => {
        const currencyId = operationType === "BUY" ? selectedfiat?.id : selectedfiat?.supportedFiats?.[0];
        const code = CURRENCY_TO_COUNTRY[currencyId?.toUpperCase()];
        return code ? `https://flagcdn.com/24x18/${code}.png` : null;
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

                        <View style={[styles.tabContainer, { backgroundColor: theme.cardBg }]}>
                            <TouchableOpacity
                                style={[styles.tabButton, operationType === "BUY" && styles.activeTabButton]}
                                onPress={() => { setoperationType("BUY"); resetSelections(); }}
                            >
                                <Text style={[styles.tabText, operationType === "BUY" && styles.activeTabText]}>Buy coins</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tabButton, operationType === "SELL" && styles.activeTabButton]}
                                onPress={() => { setoperationType("SELL"); resetSelections(); }}
                            >
                                <Text style={[styles.tabText, operationType === "SELL" && styles.activeTabText]}>Sell coins</Text>
                            </TouchableOpacity>
                        </View>


                        <View style={[styles.inputCard, { backgroundColor: theme.cardBg }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.inputLabel,{color:theme.headingTx}]}>{operationType === "BUY" ? "You Pay" : "You Pay"}</Text>
                                <TextInput
                                    placeholder="100"
                                    placeholderTextColor="#555"
                                    value={amountSend}
                                    style={[styles.mainAmountInput,{color:theme.headingTx}]}
                                    onChangeText={handleChange}
                                    returnKeyType="done"
                                    keyboardType="decimal-pad"
                                />
                            </View>

                            {operationType === "BUY" ? (
                                <TouchableOpacity
                                    style={[styles.currencySelectorInline,{backgroundColor:theme.bg}]}
                                    onPress={() => { settokenModalType(0); setTokenModalVisible(true); }}
                                >
                                    {getFiatFlagUrl() && <Image source={{ uri: getFiatFlagUrl() }} style={styles.smallFlagIcon} />}
                                    <Text style={[styles.currencyCodeText,{color:theme.headingTx}]}>{getSelectedFiatLabel()}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={22} color={theme.headingTx} />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.currencySelectorInline,{backgroundColor:theme.bg}]}
                                    onPress={() => { settokenModalType(1); setTokenModalVisible(true); }}
                                >
                                    {selectedCrypto?.icon ? (
                                        <Image source={{ uri: selectedCrypto.icon }} style={styles.smallFlagIcon} />
                                    ) : (
                                        <Image source={{ uri: selectedCrypto?.icon}} style={styles.smallFlagIcon} />
                                    )}
                                    <Text style={[styles.currencyCodeText,{color:theme.headingTx}]}>{selectedCrypto?.id || "Crypto"}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={22} color={theme.headingTx} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {operationError !== null && (
                            <Text style={styles.errorText}>{operationError}</Text>
                        )}


                        <View style={[styles.inputCard, { backgroundColor: theme.cardBg }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.inputLabel,{color:theme.headingTx}]}>You Get</Text>
                                <TextInput
                                    editable={false}
                                    placeholder="0.00"
                                    placeholderTextColor="#555"
                                    value={
                                        operationType === "BUY"
                                            ? QoutesRes?.cryptoAmount?.toString()
                                            : QoutesRes?.fiatAmount?.toString()
                                    }
                                    style={[styles.mainAmountInput,{color:theme.headingTx}]}
                                />
                            </View>

                            {operationType === "BUY" ? (
                                <TouchableOpacity
                                    style={[styles.currencySelectorInline,{backgroundColor:theme.bg}]}
                                    onPress={() => { settokenModalType(1); setTokenModalVisible(true); }}
                                >
                                    {selectedCrypto?.icon ? (
                                        <Image source={{ uri: selectedCrypto.icon }} style={styles.smallFlagIcon} />
                                    ) : (
                                        <Image source={{ uri: selectedCrypto?.icon}} style={styles.smallFlagIcon} />
                                    )}
                                    <Text style={[styles.currencyCodeText,{color:theme.headingTx}]}>{selectedCrypto?.id || "Crypto"}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={22} color={theme.headingTx} />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.currencySelectorInline,{backgroundColor:theme.bg}]}
                                    onPress={() => { settokenModalType(0); setTokenModalVisible(true); }}
                                >
                                    {getFiatFlagUrl() && <Image source={{ uri: getFiatFlagUrl() }} style={styles.smallFlagIcon} />}
                                    <Text style={[styles.currencyCodeText,{color:theme.headingTx}]}>{getSelectedFiatLabel()}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={22} color={theme.headingTx} />
                                </TouchableOpacity>
                            )}
                        </View>


                        <Text style={[styles.sectionHeading,{color:theme.headingTx}]}>Selected blockchain</Text>
                        <TouchableOpacity
                            style={[styles.blockchainDropdown, { backgroundColor: theme.cardBg }]}
                            onPress={() => {
                                if (selectedCrypto?.blockchains?.length > 1) setBlockchainModalVisible(true);
                            }}
                            disabled={!selectedCrypto || selectedCrypto.blockchains?.length <= 1}
                        >
                            <Text style={[styles.blockchainText,{color:theme.headingTx}]}>
                                {selectedBlockchain ? selectedBlockchain.description : "Select asset first"}
                            </Text>
                            {selectedCrypto?.blockchains?.length > 1 && (
                                <MaterialIcons name="arrow-drop-down" size={24} color="#FFF" />
                            )}
                        </TouchableOpacity>

                        {qoutesLoading && QoutesRes === null ? (
                            <View style={styles.loadingSummaryCon}>
                                <ActivityIndicator color={"#5B65E1"} size={"small"} />
                                <Text style={[styles.loadingSummaryText,{color:theme.headingTx}]}>Fetching Qoutes Details....</Text>
                            </View>
                        ) : QoutesRes !== null ? (
                            <View style={[styles.summaryContainer,{backgroundColor:theme.cardBg}]}>
                                <Text style={[styles.summaryTitle,{color:theme.headingTx}]}>Transaction summary</Text>
                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel,{color:theme.inactiveTx}]}>Fee</Text>
                                    <View style={{ alignItems: "flex-end" }}>
                                        <Text style={[styles.summaryValue,{color:theme.inactiveTx}]}>{QoutesRes.processingFee}</Text>
                                    </View>
                                </View>

                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel,{color:theme.inactiveTx}]}>Network Fee</Text>
                                    <View style={{ alignItems: "flex-end" }}>
                                        <Text style={[styles.summaryValue,{color:theme.inactiveTx}]}>{QoutesRes.networkFee}</Text>
                                    </View>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel,{color:theme.inactiveTx}]}>Partner Fee</Text>
                                    <View style={{ alignItems: "flex-end" }}>
                                        <Text style={[styles.summaryValue,{color:theme.inactiveTx}]}>{QoutesRes.partnerFee}</Text>
                                    </View>
                                </View>
                                </View>
                        ) : null}


                        <TouchableOpacity
                            style={[styles.buyBtn, {
                                backgroundColor:
                                    btnLoading || qoutesLoading || !amountSend || parseFloat(amountSend) === 0 ||
                                        selectedCrypto === null || selectedfiat === null
                                        ? "gray" : "#5B65E1",
                            }]}
                            disabled={
                                btnLoading || qoutesLoading || !amountSend || parseFloat(amountSend) === 0 ||
                                selectedCrypto === null || selectedfiat === null
                            }
                            onPress={handleOprations}
                        >
                            {btnLoading ? (
                                <ActivityIndicator size={"small"} color={"#fff"} />
                            ) : (
                                <Text style={styles.buyBtnText}>
                                    {operationType === "BUY" ? "Buy Crypto" : "Sell Crypto"}
                                </Text>
                            )}
                        </TouchableOpacity>

                        <Text style={{ fontSize: 16, color: theme.inactiveTx, alignSelf: "center", marginTop: hp(2) }}>Powered by Banxa</Text>
                    </ScrollView>


                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={tokenModalVisible}
                        onRequestClose={() => setTokenModalVisible(false)}
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
                            <View style={[styles.modalContent,{backgroundColor:theme.bg}]}>
                                <View style={styles.modalHandle} />
                                {assetFetchloading || buyTokens === null ? (
                                    <ActivityIndicator size="large" color="#5B65E1" />
                                ) : (
                                    <>
                                        <View style={styles.modalHeader}>
                                            <Text style={[styles.modalTitle,{color:theme.headingTx}]}>
                                                Select a {tokenModalType === 0 ? (operationType === "BUY" ? "fiat" : "payout method") : "crypto"}
                                            </Text>
                                            <TouchableOpacity onPress={() => setTokenModalVisible(false)}>
                                                <MaterialIcons name="close" size={24} color="#FFF" />
                                            </TouchableOpacity>
                                        </View>

                                        <TextInput
                                            placeholder={`Search item...`}
                                            placeholderTextColor={"gray"}
                                            value={FindResult}
                                            onChangeText={setFindResult}
                                            style={[styles.searchCon,{backgroundColor:theme.cardBg,color:theme.headingTx}]}
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
                        </Pressable>
                    </Modal>


                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={blockchainModalVisible}
                        onRequestClose={() => setBlockchainModalVisible(false)}
                        useNativeDriver={true}
                        useNativeDriverForBackdrop={true}
                        hideModalContentWhileAnimating
                        onBackdropPress={() => { setBlockchainModalVisible(false) }}
                        onBackButtonPress={() => { setBlockchainModalVisible(false) }}
                        style={styles.assetModal}
                    >
                        <Pressable
                                    style={styles.modalContainer}
                                    onPress={() => setBlockchainModalVisible(false)}
                                  >
                            <View style={[styles.modalContent,{backgroundColor:theme.bg}]}>
                                <View style={styles.modalHandle} />
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle,{color:theme.headingTx}]}>Select Network</Text>
                                    <TouchableOpacity onPress={() => setBlockchainModalVisible(false)}>
                                        <MaterialIcons name="close" size={24} color="#FFF" />
                                    </TouchableOpacity>
                                </View>

                                <FlatList
                                    data={selectedCrypto?.blockchains ?? []}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.tokenItem, { backgroundColor: theme.cardBg }, selectedBlockchain?.id === item.id && styles.activeNetworkItem]}
                                            onPress={() => {
                                                setSelectedBlockchain(item);
                                                setBlockchainModalVisible(false);
                                            }}
                                        >
                                            <View style={styles.tokenInfo}>
                                                <Text style={[styles.tokenSymbol,{color:theme.inactiveTx}]}>{item.description}</Text>
                                                <Text style={[styles.tokenName,{color:theme.inactiveTx}]}>Min Limit: {item.minimum}</Text>
                                            </View>
                                            {selectedBlockchain?.id === item.id && (
                                                <MaterialIcons name="check" size={20} color="#5B65E1" />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        </Pressable>
                    </Modal>

                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </View>
    );
};

const styles = StyleSheet.create({
    mainCom: { flex: 1, backgroundColor: "#000" },
    scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 30 },

    tabContainer: { flexDirection: "row", backgroundColor: "#111", borderRadius: 16, padding: 4, marginVertical: 16 },
    tabButton: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12 },
    activeTabButton: { backgroundColor: "#5B65E1" },
    tabText: { fontSize: 16, color: "#8E8E93", fontWeight: "600" },
    activeTabText: { color: "#FFF" },

    inputCard: { backgroundColor: "#111", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", marginBottom: 12 },
    inputLabel: { color: "#8E8E93", fontSize: 14, marginBottom: 6 },
    mainAmountInput: { color: "#FFF", fontSize: 28, fontWeight: "500", padding: 0 },
    currencySelectorInline: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,maxWidth:wp(30) },
    currencyCodeText: { color: "#FFF", fontSize: 16, fontWeight: "600", marginLeft: 6, marginRight: 2 },
    smallFlagIcon: { width: 22, height: 22, borderRadius: 11 },
    errorText: { fontSize: 14, color: "red", fontWeight: "500", marginBottom: 8, marginLeft: 4 },

    sectionHeading: { color: "#FFF", fontSize: 15, fontWeight: "500", marginTop: 14, marginBottom: 8 },
    addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    addressInput: { flex: 1, backgroundColor: "#111", borderRadius: 16, padding: 16, color: "#FFF", fontSize: 14 },
    autofillButton: { backgroundColor: "#1D4ED8", width: 50, height: 50, borderRadius: 16, justifyContent: "center", alignItems: "center" },
    blockchainDropdown: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111", borderRadius: 16, padding: 16 },
    blockchainText: { color: "#FFF", fontSize: 16 },

    paymentMethodsRow: { flexDirection: "row", marginTop: 2 },
    paymentCard: { width: wp(42), backgroundColor: "#111", borderRadius: 16, padding: 14, marginRight: 12, borderWidth: 1, borderColor: "transparent" },
    activePaymentCard: { backgroundColor: "#1C1C1E", borderColor: "#555" },
    cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    mockCardIcon: { backgroundColor: '#FFF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
    mockCardText: { fontSize: 10, fontWeight: '800', color: '#000' },
    paymentCardTitle: { color: "#FFF", fontSize: 14, fontWeight: "500" },
    paymentCardSub: { color: "#8E8E93", fontSize: 11, marginTop: 2 },

    loadingSummaryCon: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 16, gap: 10 },
    loadingSummaryText: { color: "#8E8E93", fontSize: 14 },
    summaryContainer: { backgroundColor: "#111", borderRadius: 16, padding: 16, marginTop: 12 },
    summaryTitle: { color: "#8E8E93", fontSize: 14, fontWeight: "500", marginBottom: 12 },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    summaryLabel: { color: "#FFF", fontSize: 14, fontWeight: "400" },
    summaryValue: { color: "#FFF", fontSize: 14, fontWeight: "600", textAlign: "right" },
    summarySubValue: { color: "#8E8E93", fontSize: 12, textAlign: "right", marginTop: 2 },

    buyBtn: { height: hp(6.5), borderRadius: 16, justifyContent: "center", alignItems: "center", alignSelf: "center", width: "100%", marginTop: 24 },
    buyBtnText: { fontSize: 20, color: "#FFFFFF", fontWeight: "400" },
    powerLabel: { fontSize: 14, color: "#555", alignSelf: "center", marginTop: hp(2) },

    modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.6)" },
    modalContent: { backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: "75%" },
    modalHandle: { width: 40, height: 5, backgroundColor: "#444", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: "600", color: "#FFF" },
    searchCon: { fontSize: 18, color: "#FFF", height: 46, borderColor: "#333", borderWidth: 1, paddingHorizontal: 14, marginBottom: 14, borderRadius: 14, backgroundColor: "#000" },
    tokenItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6 },
    activeNetworkItem: { borderWidth: 1, borderColor: "#5B65E1" },
    tokenIcon: { width: 32, height: 32, borderRadius: 16 },
    tokenInfo: { flex: 1, marginLeft: 12 },
    tokenSymbol: { fontSize: 16, color: "#FFF", fontWeight: "600" },
    tokenName: { fontSize: 13, color: "#666", marginTop: 2 },
    assetModal: {
      justifyContent: "flex-end",
      margin: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)"
    },
});

export default BanxaRampProvider;