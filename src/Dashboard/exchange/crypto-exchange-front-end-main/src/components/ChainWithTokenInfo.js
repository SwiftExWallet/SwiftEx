import { View, StyleSheet, TouchableOpacity, Image, FlatList, Text, TextInput, ActivityIndicator, Platform } from "react-native"
import { useSelector } from "react-redux";
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import { Wallet_screen_header } from "../../../../reusables/ExchangeHeader";
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";
import { CHAINS, TemporaryTokens } from "../../../../../utilities/TokenUtils";
import { useEffect, useMemo, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import Modal from "react-native-modal";
import { GetCryptoList } from "../../../../TokensManagement";

export const ChainSupportedToken = ({ visible, onclose, selectedToken,showOnlyEvm=true }) => {
    const focused = useIsFocused();
    const state = useSelector((state) => state);
    const theme = state.THEME.THEME ? colors.dark : colors.light;
    const [chainId, setChainId] = useState("ETH");
    const [headerHeading, setheaderHeading] = useState("Ethereum");
    const [listData, setListData] = useState([]);
    const [findBar, setFindBar] = useState("");
    const [loading, setLoading] = useState(false);
    const styles = StyleSheet.create({
        modalCon: {
            width: wp(100),
            alignSelf: "center",
            backgroundColor: theme.bg,
        },
        container: {
            justifyContent: "flex-end",
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
            justifyContent: "space-between",
            alignItems:"center"
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
            height: hp(80),
            width: wp(100),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.bg
        }
    });

    useEffect(() => {
        setFindBar("");
    }, [focused])

    useEffect(() => {
        const initChainInfo = async () => {
            setLoading(true);
            const response = await GetCryptoList(chainId, state);
            if (response.status) {
                setListData(response.processedTokens);
            }
            setLoading(false);
        }
        initChainInfo();
    }, [chainId,visible])

    const refineInfo = useMemo(() => {
        if (!findBar) return listData;
        return listData?.filter(item =>
            (item.symbol || item.code)?.toLowerCase()?.includes(findBar?.toLowerCase()) ||
            (item.name || item.domain)?.toLowerCase()?.includes(findBar?.toLowerCase())
        );
    }, [listData, findBar]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onclose}
            style={styles.modalCon}
        >
            <View style={{paddingTop:Platform.OS==="ios"?hp(4):0}}>
            
            <Wallet_screen_header elementestID={"Select"} title={`Selected `+headerHeading} onLeftIconPress={onclose} />
            <View style={styles.container}>
                <View style={styles.chainCon}>
                    <FlatList
                        horizontal={true}
                        data={showOnlyEvm?TemporaryTokens.slice(1,8):TemporaryTokens}
                        keyExtractor={(item, index) => index}
                        renderItem={({ item, index }) => {
                            return (
                                <TouchableOpacity onPress={() => { setChainId(item.symbol),setheaderHeading(item.name) }} >
                                    <Image source={{ uri: item.imageUrl }} style={[styles.chainImg, { borderColor: chainId === item.symbol ? "#4052D6" : theme.smallCardBorderColor, borderWidth: wp(1) }]} />
                                </TouchableOpacity>
                            );
                        }}
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
                {loading ? <View style={styles.loadingCon}>
                    <ActivityIndicator size={"large"} color={theme.headingTx} />
                </View> :
                    <FlatList
                        style={styles.listCon}
                        contentContainerStyle={{ flexGrow: 1 }}
                        data={refineInfo}
                        keyExtractor={(item, index) => index}
                        renderItem={({ item, index }) => {
                            return (
                                <TouchableOpacity style={styles.card} onPress={() => { selectedToken(item) }}>
                                    <View style={styles.flatView}>
                                        <Image source={{ uri: item.logoURI || item.icon }} style={styles.img} />
                                        <View>
                                            <Text style={styles.cardTitel}>{item.symbol || item.code}</Text>
                                            <Text style={styles.cardSubTitel}>{item.name || item.domain}</Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.cardSubTitel,{marginRight:wp(3)}]}>{item.chain}</Text>
                                </TouchableOpacity>
                            );
                        }}
                        ListEmptyComponent={
                            <View style={styles.listEmptyCom}>
                                <Text style={styles.listEmptyComTxt}>No data found.</Text>
                            </View>
                        }
                    />}
            </View>
            </View>
        </Modal>
    )
}