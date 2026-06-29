import { useIsFocused, useNavigation } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Image, NativeModules, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useEffect, useState } from "react";
import Icon from "../../../../../../icon";
import { useDispatch, useSelector } from "react-redux";
import Snackbar from "react-native-snackbar";
import { SET_ASSET_DATA } from "../../../../../../components/Redux/actions/type";
import { STELLAR_URL } from "../../../../../constants";
import { Exchange_screen_header } from "../../../../../reusables/ExchangeHeader";
import * as StellarSdk from '@stellar/stellar-sdk';
import ClaimableBalanceChecker from "./ClaimableBalanceChecker";
import stellarTokens from "./Tokens.json";
import Modal from "react-native-modal";
import { colors } from "../../../../../../Screens/ThemeColorsConfig";

const Assets_manage = ({ route }) => {
    const FOCUSED = useIsFocused();
    const navigation = useNavigation();
    const dispatch_ = useDispatch();
    const [TRUST_ASSET, setTRUST_ASSET] = useState(false);
    const [Loading, setLoading] = useState(null);
    const [Loading_assets_bal, setLoading_assets_bal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [assets, setassets] = useState([
        {
            "asset_type": "native",
            "balance": "0.0000000",
            "buying_liabilities": "0.0000000",
            "selling_liabilities": "0.0000000",
        },
    ]);
    const state = useSelector((state) => state);

    const get_stellar = async () => {
        try {
            setLoading_assets_bal(true);
            StellarSdk.Networks.PUBLIC;
            const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
            const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
            const tokenList = stellarTokens.assets;
            const updatedAssets = account.balances.map((bal) => {
                const match = tokenList.find(
                    (res) =>
                        res.code === bal.asset_code &&
                        (res.issuer === bal.asset_issuer || !res.issuer)
                );
                return {
                    ...bal,
                    icon: match?.icon || null,
                    name: match?.name || bal.asset_code || "Unknown",
                    org: match?.org || "Unknown",
                };
            });
            setassets(updatedAssets);
            dispatch_({
                type: SET_ASSET_DATA,
                payload: updatedAssets,
            });
            setLoading_assets_bal(false);
        } catch (error) {
            console.log("Error in get_stellar", error);
            setLoading_assets_bal(false);
        }
    };
    

    const AVL_ASSETS = [
        { name: 'USDC', domain: "USDC (center.io)", img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png", issuerAddress: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
        { name: 'BTC', domain: "BTC (ultracapital.xyz)", img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png", issuerAddress: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM" },
        { name: 'ETH', domain: "ETH (ultracapital.xyz)", img:  "https://tokens.pancakeswap.finance/images/0x2170Ed0880ac9A755fd29B2688956BD959F933F8.png", issuerAddress: "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC" },
        { name: 'EURC', domain: "EURC (circle.com)", img: "https://assets.coingecko.com/coins/images/26045/thumb/euro-coin.png?1655394420", issuerAddress: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2" },
        { name: 'yUSDC', domain: "yUSDC (ultracapital.xyz)", img: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png", issuerAddress: "GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF" },
        { name: 'yXLM', domain: "yXLM (ultracapital.xyz)", img: "https://stellar.myfilebase.com/ipfs/QmSTXU2wn1USnmd5ZypA5zMze259wEPSDP3i8wivyr9qiq", issuerAddress: "GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55" },
    ];

    const changeTrust = async (domainName, domainIssuerAddress) => {
        setLoading(domainName)
        try {
            console.log(":++++ Entered into trusting ++++:")
            const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
            StellarSdk.Networks.PUBLIC
            const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
            const transaction = new StellarSdk.TransactionBuilder(account, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.PUBLIC,
            })
                .addOperation(
                    StellarSdk.Operation.changeTrust({
                        asset: new StellarSdk.Asset(domainName, domainIssuerAddress),
                    })
                )
                .setTimeout(30)
                .build();
            const txXDR = transaction.toXDR();
            const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
            const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
            transaction.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
            const result = await server.submitTransaction(transaction);
            console.log(`Trustline updated successfully`);
            Snackbar.show({
                text: `${domainName} added successfully`,
                duration: Snackbar.LENGTH_SHORT,
                backgroundColor: 'green',
            });
            server.loadAccount(state.STELLAR_PUBLICK_KEY)
                .then(account => {
                    console.log('Balances for account:', state.STELLAR_PUBLICK_KEY);
                    account.balances.forEach(balance => {
                        setassets(account.balances)
                        setLoading(null)
                        dispatch_({
                            type: SET_ASSET_DATA,
                            payload: account.balances,
                        })
                        get_stellar()
                    });
                })
                .catch(error => {
                    console.log('Error loading account:', error);
                    setLoading(null)
                    Snackbar.show({
                        text: `${domainName} failed to be added`,
                        duration: Snackbar.LENGTH_SHORT,
                        backgroundColor: 'red',
                    });
                    get_stellar()
                });
        } catch (error) {
            console.error(`Error changing trust:`, error);
            setLoading(null)
            Snackbar.show({
                text: `${domainName} failed to be added`,
                duration: Snackbar.LENGTH_SHORT,
                backgroundColor: 'red',
            });
            get_stellar()
        }
    };

    const removeTrustLine = async (domainName, domainIssuerAddress) => {
        setLoading(domainName)
        try {
            console.log(":++++ Entered into remove trusting ++++:")
            const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
            StellarSdk.Networks.PUBLIC
            const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
            const transaction = new StellarSdk.TransactionBuilder(account, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.PUBLIC,
            })
                .addOperation(
                    StellarSdk.Operation.changeTrust({
                        asset: new StellarSdk.Asset(domainName, domainIssuerAddress),
                        limit:"0"
                    })
                )
                .setTimeout(30)
                .build();
            const txXDR = transaction.toXDR();
            const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
            const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
            transaction.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
            const result = await server.submitTransaction(transaction);
            console.log("Trustline remove aand updated successfully",result);
            Snackbar.show({
                text: `${domainName} removed successfully`,
                duration: Snackbar.LENGTH_SHORT,
                backgroundColor: 'green',
            });
            server.loadAccount(state.STELLAR_PUBLICK_KEY)
                .then(account => {
                    console.log('Balances for account:', state.STELLAR_PUBLICK_KEY);
                    account.balances.forEach(balance => {
                        setassets(account.balances)
                        setLoading(null)
                        dispatch_({
                            type: SET_ASSET_DATA,
                            payload: account.balances,
                        })
                        get_stellar()
                    });
                })
                .catch(error => {
                    console.log('Error loading account:', error);
                    setLoading(null)
                    Snackbar.show({
                        text: `${domainName} failed to remove.`,
                        duration: Snackbar.LENGTH_SHORT,
                        backgroundColor: 'red',
                    });
                    get_stellar()
                });
        } catch (error) {
            console.error(`Error changing trust:`, error);
            setLoading(null)
            Snackbar.show({
                text: `${domainName} failed to remove.`,
                duration: Snackbar.LENGTH_SHORT,
                backgroundColor: 'red',
            });
            get_stellar()
        }
    };

    useEffect(() => {
        setTRUST_ASSET(route?.params?.openAssetModal || false);
        setLoading_assets_bal(false)
        get_stellar()
    }, [FOCUSED])


    const theme = state.THEME.THEME ? colors.dark : colors.light;

    const fillteredAssets = stellarTokens?.assets
        ?.slice(1)
        ?.filter((item) => {
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return (
                item.name?.toLowerCase().includes(query) ||
                item.code?.toLowerCase().includes(query) ||
                item.issuer?.toLowerCase().includes(query)
            );
        })
        ?.sort((a, b) => {
            const first = assets.some((x) => x.asset_issuer === a.issuer);
            const exist = assets.some((x) => x.asset_issuer === b.issuer);

            if (first === exist) return 0;
            return first ? -1 : 1;
        });

    return (
        <>
            <Exchange_screen_header title="Assets" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />

            <View style={[styles.main_con, { backgroundColor: theme.bg }]}>
                <View style={styles.assetCon}>
                     <FlatList
                        data={assets}
                        keyExtractor={(item, index) => index}
                        style={{ marginBottom: hp(5) }}
                        renderItem={({ item, index }) => {
                        return (
                            <TouchableOpacity key={index} style={[styles.assetCard, { backgroundColor: theme.cardBg }]} onPress={() => { navigation.navigate("send_recive", { bala: item.balance, assetIssuer: item.asset_type === "native" ? "native" : item?.asset_issuer, asset_name: item.asset_type === "native" ? "native" : item.asset_code === "USDC" ? "USDC" : item.asset_code }) }}>
                                <View style={{flexDirection: "row",alignItems:"center",justifyContent:"flex-start",width:wp(45)}}>
                                    <View style={styles.assetImgCom}>
                                        {item.asset_type === "native"?<Image source={{uri:stellarTokens?.assets[0]?.icon}} width={43} height={43}/>:
                                        item.icon===null?<Text style={[styles.assetLatter,{color:theme.headingTx}]}>{item.asset_type === "native" ? "L" : item?.asset_code[0]?.toUpperCase() }</Text>:<Image source={{uri:item.icon}} width={43} height={43}/>}
                                    </View>
                                    <View style={{ flexDirection: "column",marginLeft:10 }}>
                                        <Text style={[styles.assetName, { color: theme.headingTx }]}>{item.asset_type === "native" ? "XLM" : item.asset_code}</Text>
                                        <Text style={[styles.domainName, { color: theme.inactiveTx }]}>{item?.asset_issuer ? item?.asset_issuer?.slice(0, 3) + "...." + item?.asset_issuer?.slice(-3) : "Native Lumens"}</Text>
                                    </View>
                                </View>
                                {Loading_assets_bal === true ? <ActivityIndicator color={"#4052D6"} /> : <Text style={[styles.assetValue, { color: theme.headingTx }]} numberOfLines={1}>{item.balance}</Text>}
                            </TouchableOpacity>
                        )
                    }}
                    />
                </View>
                <TouchableOpacity style={styles.addAssets} onPress={() => { setTRUST_ASSET(true) }}>
                    <Icon name={"plus"} type={"antDesign"} size={24} color={"white"} />
                    <Text style={[styles.addAssetsText, { color: "#fff" }]}> Add Asset </Text>
                </TouchableOpacity>
            </View>
            <Modal
                isVisible={TRUST_ASSET}
                onBackdropPress={() => setTRUST_ASSET(false)}
                onBackButtonPress={() => setTRUST_ASSET(false)}
                animationIn="slideInUp"
                animationOut="slideOutDown"
                useNativeDriver
                hideModalContentWhileAnimating
                style={styles.modal}
            >
                <View style={[styles.overlay,{backgroundColor:theme.cardBg}]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between",width:wp(90)}}>
                       <View style={{flexDirection:"column"}}>
                       <Text style={[styles.modal_heading,{color:theme.headingTx}]}>Add Asset</Text>
                       <Text style={[styles.modal_heading,{color:theme.inactiveTx,fontSize:16,fontWeight:"300"}]}>Enable Trustline to Hold Asset</Text>
                       </View>
                        <TouchableOpacity onPress={() => { setTRUST_ASSET(false) }}>
                            <Icon
                                name={"close-circle-outline"}
                                type={"materialCommunity"}
                                size={35}
                                color={theme.headingTx}
                            />
                        </TouchableOpacity>
                    </View>
                    <View style={{flexDirection:"row",paddingHorizontal:16,paddingVertical:10,backgroundColor:"#FEF6D8",borderRadius:13,marginVertical:10,alignItems:"center"}}>
                    <Icon name={"information-circle-outline"} type={"ionicon"} size={28} color={"#ECB742"} />
                        <Text style={{fontSize:13,color:"#ECB742",fontWeight:"300",marginLeft:4}}>{`Trustlines let your wallet accept and hold \n approved assets.`}</Text>
                    </View>
                    <></>
                    <View style={{ width: '100%', marginVertical: hp(1) }}>
                        <TextInput
                            placeholder="Search assets"
                            placeholderTextColor={theme.inactiveTx}
                            value={searchQuery}
                            onChangeText={(text) => setSearchQuery(text)}
                            style={{
                                backgroundColor: theme.bg,
                                color: theme.headingTx,
                                paddingHorizontal: 12,
                                paddingVertical: hp(1),
                                borderRadius: 10,
                                fontSize: 19,
                                width: '100%',
                                height:hp(4.5)
                            }}
                            clearButtonMode="while-editing"
                        />
                    </View>
                    <FlatList
                        data={fillteredAssets}
                        keyExtractor={(item, index) => index.toString()}
                        style={{ marginBottom: hp(1) }}
                        renderItem={({ item, index }) => {
                        return (
                            <View key={index} style={[styles.search_bar, { flexDirection: "row", justifyContent: "space-between", alignItems: "center",backgroundColor:theme.bg }]}>
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <Image source={{ uri: item.icon }} style={styles.modal_IMG} />
                                    <View>
                                        <Text style={[styles.modal_sub_heading,{color:theme.headingTx}]}>{item.name}</Text>
                                        <Text style={[styles.modal_sub_heading, { fontSize: 10, color: theme.inactiveTx }]}>{item.domain}</Text>
                                    </View>
                                </View>
                                {assets.some((list_item) => list_item.asset_issuer === item.issuer) ?
                                    <TouchableOpacity style={[styles.btn,{backgroundColor:"#4052D6"}]} disabled={Loading!==null} onPress={()=>{removeTrustLine(item.code, item.issuer)}}>
                                        {Loading === item.code ? <ActivityIndicator color={"#FFF"} /> : <Text style={[styles.modal_sub_heading,{fontSize:15,color:"#fff"}]}>Remove</Text>}
                                    </TouchableOpacity> :
                                    <TouchableOpacity style={[styles.btn,{backgroundColor:"#4052D6"}]} onPress={() => {
                                        changeTrust(item.code, item.issuer)
                                    }} disabled={Loading!==null}>
                                        {Loading === item.code ? <ActivityIndicator color={"#FFF"} /> : <Text style={[styles.modal_sub_heading,{fontSize:15,color:"#fff"}]}>Add Asset</Text>}
                                    </TouchableOpacity>
                                }
                            </View>
                        )
                    }}
                        ListEmptyComponent={() => (
                            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: hp(4) }}>
                                <Text style={{ color: theme.inactiveTx, fontSize: 19, fontWeight: '500' }}>
                                    No assets found
                                </Text>
                            </View>
                        )}
                    />
                </View>
            </Modal>
            {/* <ClaimableBalanceChecker
                publicKey={state.STELLAR_PUBLICK_KEY}
                autoFetch={true}
                isDark={state.THEME.THEME}
            /> */}
        </>
    )
}
const styles = StyleSheet.create({
    btn: {
        width:wp(24),
        height:hp(5),
        padding:10,
        borderRadius: 10,
        marginRight: 10,
        alignItems:"center",
        justifyContent:"center"
    },
    main_con: {
        height: "100%",
    },
    search_bar: {
        marginVertical:4,
        padding: 15,
        borderRadius: 10,
        color: "#fff"
    },
    assetCard: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 10,
        borderRadius: 10,
        paddingHorizontal: wp(3),
        paddingVertical: hp(1.3),
        marginHorizontal:5
    },
    assetLatter:{
        fontSize:35,
        fontWeight:"800",
        textAlign:"center"
    },
    assetImgCom:{
        padding:8,
        borderRadius:13,
        backgroundColor:"rgba(0, 0, 0, 0.15)",
        width:wp(14.5),
        height:hp(7),
        justifyContent:"center",
        alignItems:"center"
    },
    assetCon: {
        width: wp(100),
        marginTop: 10,
        padding: 10,
    },
    addAssets: {
        flexDirection: "row",
        bottom: hp(10),
        position: "absolute",
        right: wp(5),
        padding: 10,
        backgroundColor: "#4052D6",
        borderRadius: 10
    },
    addAssetsText: {
        fontSize: 18,
        fontWeight: "500"
    },
    assetName: {
        textAlign: "left",
        fontSize: 18,
    },
    assetValue: {
        width: wp(40),
        textAlign: "right",
        fontSize: 18,
    },
    domainName: {
        fontSize: 14
    },
    headerHeading: {
        color: "#fff",
        textAlign: "left",
        fontSize: 20,
        fontWeight: "400",
        paddingLeft: wp(5.5),
        paddingVertical: hp(1.2),
        marginTop: hp(2)
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
        alignSelf: "center",
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        paddingTop: hp(3),
    },
    modalContainer_option_top: {
        alignSelf: "flex-end",
        alignItems: 'center',
        width: "100%",
        height: "60%",
    },
    modalContainer_option_sub: {
        alignSelf: "flex-end",
        backgroundColor: 'rgba(33, 43, 83, 1)',
        padding: 10,
        borderRadius: 10,
        width: "65%",
        height: "70%"
    },
    modalContainer_option_view: {
        flexDirection: "row",
        marginTop: 25,
        alignItems: "center",
    },
    modalContainer_option_text: {
        fontSize: 20,
        fontWeight: "bold",
        color: "gray",
        marginStart: 5
    },
    modal: {
        justifyContent: "flex-end",
        margin: 0,
      },
    overlay: {
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        height: hp(80),
        paddingTop: hp(3),
        paddingHorizontal: wp(4),
    },
    modal_heading: {
        fontSize: 21,
        color: "#fff",
        fontWeight: "600"
    },
    modal_sub_heading: {
        fontSize: 18,
        color: "#fff",
        fontWeight: "600",
        maxWidth:wp(45)
    },
    modal_IMG: {
        height: hp(5),
        width: wp(10.6),
        marginRight: wp(2)
    },
})
export default Assets_manage;