import { View, StyleSheet, TouchableOpacity, Image, FlatList, Text, TextInput, ActivityIndicator } from "react-native"
import { useDispatch, useSelector } from "react-redux";
import { colors } from "../Screens/ThemeColorsConfig";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";
import { CHAINS, isNativeTokenAddress, TemporaryTokens, UI_CHAIN_NAME } from "../utilities/TokenUtils";
import { useEffect, useMemo, useState } from "react";
import ToggleSwitch from "toggle-switch-react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { MULTICHAIN_PORTFOLIO } from "../components/Redux/actions/type";
import { getAssetId, useAssetManager } from "../utilities/TokenManageHook";

export const GetCryptoList = async (chainId, state) => {
    try {
        const getListPath = await CHAINS[chainId].supportedTokenList;
        const response = chainId === CHAINS["DYDX"].symbol ? getListPath : await fetch(getListPath);
        const cryptoList = chainId === CHAINS["DYDX"].symbol ? response : await response.json();
        const activeWalletTokens = (state.activeWalletPortFolio || state.activeWalletPortFolio.tokens)
            .filter(addr => addr.active)
            .map(addr => addr.contractAddress?.toLowerCase());

        const tokenList = cryptoList.tokens || cryptoList.assets || cryptoList;
        const processedTokens = tokenList
            .map(token => {
                const tokenAddr = (token.address || token.issuer)?.toLowerCase();
                const isActive = activeWalletTokens.includes(tokenAddr);

                return {
                    ...token,
                    active: isActive,
                    chain: chainId
                };
            })
            .sort((a, b) => {
                if (a.active !== b.active) {
                    return b.active ? 1 : -1;
                }
                const balanceA = parseFloat(a.balance || '0');
                const balanceB = parseFloat(b.balance || '0');
                if (balanceA !== balanceB) {
                    return balanceB - balanceA;
                }
                return a.symbol||a.code.localeCompare(b.symbol||b.code);
            });

        return {
            status: true,
            processedTokens
        };
} catch (error) {
    console.error("error: ", error);
    return {
        status: false
    };
}
}

    export const GetCryptoListWtihFilter = async (chainId, state) => {
        try {
            const getListPath = await CHAINS[chainId].supportedTokenList;
            const response = chainId === CHAINS["DYDX"].symbol ? getListPath : await fetch(getListPath);
            const cryptoList = chainId === CHAINS["DYDX"].symbol ? response : await response.json();
            const activeWalletTokens = (state.activeWalletPortFolio || state.activeWalletPortFolio.tokens)
            const tokenList = cryptoList.tokens || cryptoList.assets || cryptoList;
            const processedTokens = tokenList.map(token => {
                const tokenAddr = (token.address || token.issuer)?.toLowerCase();
                const isNative =
                    token.type === 'NATIVE' ||
                    !tokenAddr ||
                    tokenAddr === '0x0000000000000000000000000000000000000000';

                const normalizeChain = (chain) => chain === 'STR' ? 'Stellar' : chain;
                const portfolioToken = isNative
                    ? activeWalletTokens.find(t =>
                        normalizeChain(t.chain) === normalizeChain(chainId) &&
                        (
                            t.contractAddress?.toLowerCase() === 'native' ||
                            t.symbol?.toLowerCase() === token.symbol?.toLowerCase() ||
                            t.symbol?.toLowerCase() === token.code?.toLowerCase()
                        )
                    )
                    : activeWalletTokens.find(t =>
                        normalizeChain(t.chain) === normalizeChain(chainId) &&
                        t.contractAddress?.toLowerCase() === tokenAddr
                    );

                return {
                    ...token,
                    balance: portfolioToken?.balance || '0',
                    chain: chainId
                };
            })
                .sort((a, b) => {
                    const aIsNative = a.type === 'NATIVE' || !a.address && !a.issuer;
                    const bIsNative = b.type === 'NATIVE' || !b.address && !b.issuer;

                    if (aIsNative !== bIsNative) {
                        return aIsNative ? -1 : 1;
                    }

                    const balanceA = parseFloat(a.balance || '0');
                    const balanceB = parseFloat(b.balance || '0');

                    if (balanceA > 0 || balanceB > 0) {
                        return balanceB - balanceA;
                    }

                    return (a.symbol || a.code || '').localeCompare(b.symbol || b.code || '');
                });

        return {
            status: true,
            processedTokens
        };
    } catch (error) {
        console.error("error: ", error);
        return {
            status: false
        };
    }
}

export const TokensManagement = () => {
    const focused = useIsFocused();
    const navigation = useNavigation();
    const state = useSelector((state) => state);
    const theme = state.THEME.THEME ? colors.dark : colors.light;
    const [chainId, setChainId] = useState("ETH");
    const [listData, setListData] = useState([]);
    const [findBar, setFindBar] = useState("");
    const [loading, setLoading] = useState(false);
    const dispatch = useDispatch();
    const { addToken, dropToken } = useAssetManager(`${state?.wallet?.address}_${state?.STELLAR_PUBLICK_KEY}`);
    const styles = StyleSheet.create({
        container: {
            justifyContent: "flex-end",
            margin: 0,
            backgroundColor: theme.bg,
        },
        flatView: {
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: wp(2),
        },
        img: {
            height: 50,
            width: 50,
            borderRadius: 30,
            marginRight: wp(2)
        },
        chainImg: {
            height: 40,
            width: 40,
            borderRadius: 30,
            marginRight: wp(2)
        },
        card: {
            width: wp(93),
            borderRadius: hp(2),
            paddingVertical: hp(1),
            paddingHorizontal: wp(2),
            marginTop: hp(1),
            backgroundColor: theme.cardBg,
            flexDirection: "row",
            justifyContent: "space-between"
        },
        cardTitel: {
            color: theme.headingTx,
            fontSize: 16,
            fontWeight: "600"
        },
        cardSubTitel: {
            color: theme.inactiveTx,
            fontSize: 14,
            fontWeight: "400"
        },
        listCon: {
            alignSelf: "center",
            marginVertical: hp(1)
        },
        chainCon: {
            flexDirection: "row",
            marginLeft: wp(5)
        },
        searchCon: {
            paddingHorizontal: wp(4),
            marginTop: hp(1),
            width: wp(90),
            borderColor: theme.inactiveTx,
            borderWidth: 0.5,
            borderRadius: 30,
            alignSelf: "center"
        },
        searchBar: {
            fontSize: 18,
            color: theme.headingTx,
            height:hp(5)
        },
        listEmptyCom: {
            justifyContent: "center",
            alignItems: "center",
            marginTop: hp(30)
        },
        listEmptyComTxt: {
            fontSize: 19,
            color: theme.headingTx,
            fontWeight: "400"
        },
        loadingCon: {
            height: 1000,
            width: wp(100),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.bg
        }
    });

    useEffect(() => {
        setFindBar("");
    }, [focused]);

    useEffect(() => {
        const initChainInfo = async () => {
            setLoading(true);
            const response = await GetCryptoList(chainId, state);
            if (response.status) {
                setListData(response.processedTokens);
            }
            setLoading(false);
        };
        initChainInfo();
    }, [chainId]);

    const updatePortfolio = async (token) => {
        try {
            const currentTokens = state.activeWalletPortFolio || [];
            const actualIndex = listData.findIndex(
                item =>
                    (item.symbol || item.code) === (token.symbol || token.code) &&
                    (item.address || item.issuer || '') === (token.address || token.issuer || '')
            );

            const existingToken = currentTokens.find(
                t => getAssetId(t) === getAssetId({
                    symbol: token.symbol || token.code,
                    contractAddress: token.address || token.issuer || ''
                })
            );

            if (existingToken) {
                const isActive = existingToken.active;

                if (isActive) {
                    await dropToken({ ...existingToken, active: false });
                    dispatch({
                        type: MULTICHAIN_PORTFOLIO,
                        payload: {
                            activeWalletPortFolio: currentTokens.map(t =>
                                getAssetId(t) === getAssetId(existingToken)
                                    ? { ...t, active: false }
                                    : t
                            )
                        }
                    });
                } else {
                    await addToken({ ...existingToken, active: true });
                    dispatch({
                        type: MULTICHAIN_PORTFOLIO,
                        payload: {
                            activeWalletPortFolio: currentTokens.map(t =>
                                getAssetId(t) === getAssetId(existingToken)
                                    ? { ...t, active: true }
                                    : t
                            )
                        }
                    });
                }

                if (actualIndex !== -1) {
                    setListData(lastData => {
                        const newData = [...lastData];
                        newData[actualIndex] = { ...newData[actualIndex], active: !isActive };
                        return newData;
                    });
                }

            } else {
                const tokenData = {
                    chain: chainId,
                    name: token.name || token.code,
                    symbol: token.symbol || token.code,
                    balance: 0,
                    balanceUSD: 0,
                    decimals: token.decimals,
                    contractAddress: token.address || token.issuer || '',
                    price: 0,
                    imageUrl: token.logoURI || token.icon || '',
                    active: true,
                };

                await addToken(tokenData);
                dispatch({
                    type: MULTICHAIN_PORTFOLIO,
                    payload: {
                        activeWalletPortFolio: [...currentTokens, tokenData]
                    }
                });
                if (actualIndex !== -1) {
                    setListData(lastData => {
                        const newData = [...lastData];
                        newData[actualIndex] = { ...newData[actualIndex], active: true };
                        return newData;
                    });
                }
            }

        } catch (error) {
            console.error("error in updatePortfolio: ", error);
        }
    };

    const refineInfo = useMemo(() => {
        if (!findBar) return listData;
        return listData?.filter(item =>
            (item.symbol || item.code)?.toLowerCase()?.includes(findBar?.toLowerCase()) ||
            (item.name || item.domain)?.toLowerCase()?.includes(findBar?.toLowerCase()) ||
            (item.address)?.toLowerCase()?.includes(findBar?.toLowerCase())||
            (item.issuer)?.toLowerCase()?.includes(findBar?.toLowerCase())
        );
    }, [listData, findBar]);

    return (
        <View style={styles.container}>
            <Wallet_screen_header
                elementestID={"tokensManagement"}
                title="Manage Assets"
                onLeftIconPress={() => { navigation.goBack(); }}
                rightIcon={"plus"}
                onRightIconPress={() => {
                    CHAINS[chainId]?.subName === "STR"
                        ? navigation.navigate("Assets_manage")
                        : navigation.navigate("Nfts", { selectedChain: CHAINS[chainId] })
                }}
            />
            <View style={styles.chainCon}>
                <FlatList
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    data={TemporaryTokens}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity onPress={() => { setChainId(item.symbol) }}>
                            <Image
                                source={{ uri: item.imageUrl }}
                                style={[
                                    styles.chainImg,
                                    {
                                        borderColor: chainId === item.symbol ? "#4052D6" : theme.smallCardBorderColor,
                                        borderWidth: wp(1)
                                    }
                                ]}
                            />
                        </TouchableOpacity>
                    )}
                />
            </View>
            <View style={styles.searchCon}>
                <TextInput
                    placeholder="Find tokens"
                    placeholderTextColor={theme.inactiveTx}
                    style={styles.searchBar}
                    autoCapitalize="none"
                    autoComplete="off"
                    value={findBar}
                    onChangeText={(value) => { setFindBar(value) }}
                />
            </View>
             <FlatList
                    style={styles.listCon}
                    contentContainerStyle={{ flexGrow: 1 }}
                    data={refineInfo}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.flatView}>
                                <Image source={{ uri: item.logoURI || item.icon }} style={styles.img} />
                                <View>
                                    <Text style={styles.cardTitel}>{UI_CHAIN_NAME[item.symbol || item.code] || item.symbol || item.code}</Text>
                                    <Text style={styles.cardSubTitel}>{item.name || item.domain}</Text>
                                </View>
                            </View>
                            {item?.address !== isNativeTokenAddress &&
                                item?.code !== "XLM" && (
                                    <ToggleSwitch
                                        isOn={item.active}
                                        onColor="#4052D6"
                                        offColor="gray"
                                        size="medium"
                                        onToggle={() => updatePortfolio(item)}
                                    />
                                )}
                        </View>
                    )}
                    ListEmptyComponent={
                        <View style={styles.listEmptyCom}>
                            <Text style={styles.listEmptyComTxt}>No data found.</Text>
                        </View>
                    }
                />
        </View>
    );
};