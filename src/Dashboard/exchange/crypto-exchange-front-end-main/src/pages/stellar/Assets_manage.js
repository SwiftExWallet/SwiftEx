import { useIsFocused, useNavigation } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Image, NativeModules, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from "react-native"
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
import { colors } from "../../../../../../Screens/ThemeColorsConfig";
import { GetStellarTokenList } from "../../../../../../utilities/TokenUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";

const Assets_manage = ({ route }) => {
    const FOCUSED = useIsFocused();
    const navigation = useNavigation();
    const dispatch_ = useDispatch();
    const [TRUST_ASSET, setTRUST_ASSET] = useState(false);
    const [isCustomMode, setIsCustomMode] = useState(false); 
    const [Loading, setLoading] = useState(null);
    const [Loading_assets_bal, setLoading_assets_bal] = useState(false);
    const [isFetchingCustom, setIsFetchingCustom] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [customIssuer, setCustomIssuer] = useState('');
    const [fetchedCustomAssets, setFetchedCustomAssets] = useState([]);
    const [customSearchQuery, setCustomSearchQuery] = useState('');
    const [supportedAssetsList, setSupportedAssetsList] = useState([]);
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
            const tokenList = (supportedAssetsList.length > 0 ? supportedAssetsList : stellarTokens.assets);
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

    const changeTrust = async (domainName, domainIssuerAddress) => {
        setLoading(domainName)
        try {
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
            await server.submitTransaction(transaction);
            
            Snackbar.show({
                text: `${domainName} added successfully`,
                duration: Snackbar.LENGTH_SHORT,
                backgroundColor: 'green',
            });
            refreshAccountBalances();
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
            await server.submitTransaction(transaction);
            
            Snackbar.show({
                text: `${domainName} removed successfully`,
                duration: Snackbar.LENGTH_SHORT,
                backgroundColor: 'green',
            });
            refreshAccountBalances();
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

    const refreshAccountBalances = () => {
        const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
        server.loadAccount(state.STELLAR_PUBLICK_KEY)
            .then(account => {
                setassets(account.balances)
                setLoading(null)
                dispatch_({
                    type: SET_ASSET_DATA,
                    payload: account.balances,
                })
                get_stellar()
            })
            .catch(error => {
                console.log('Error loading account:', error);
                setLoading(null)
                get_stellar()
            });
    };

    const handleFetchIssuerAssets = async () => {
        if (!customIssuer.trim()) {
            Snackbar.show({ text: "Please enter an Issuer Account ID", backgroundColor: "orange" });
            return;
        }

        setIsFetchingCustom(true);
        setFetchedCustomAssets([]);
        try {
            const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
            const assetResponse = await server.assets()
                .forIssuer(customIssuer.trim())
                .limit(50)
                .call();

            if (!assetResponse.records || assetResponse.records.length === 0) {
                throw new Error("No assets discovered for this Issuer ID.");
            }

            const verifiedAssets = assetResponse.records.map((record) => {
                const liveWalletHolding = assets.find(
                    (userBal) => userBal.asset_code === record.asset_code && userBal.asset_issuer === record.asset_issuer
                );

                return {
                    contract: "", 
                    code: record.asset_code,
                    issuer: record.asset_issuer,
                    name: record.asset_code, 
                    domain: record.home_domain || "Custom Asset",
                    icon: "",
                    decimals: 7,
                    balance: liveWalletHolding ? liveWalletHolding.balance : "0.0000000"
                };
            });

            setFetchedCustomAssets(verifiedAssets);
            Snackbar.show({ text: `Found ${verifiedAssets.length} asset(s)`, backgroundColor: "green" });
        } catch (error) {
            console.log("Error issuer assets", error);
            Snackbar.show({ text: "No assets found. Double check Issuer Account ID.", backgroundColor: "red" });
        } finally {
            setIsFetchingCustom(false);
        }
    };

    const handleSaveSelectedAsset = async (selectedAsset) => {
        try {
            const localCustomData = await AsyncStorage.getItem("importedStellarWalletToken");
            let updatedCustomList = localCustomData ? JSON.parse(localCustomData) : [];
            
            if (!updatedCustomList.some(item => item.code === selectedAsset.code && item.issuer === selectedAsset.issuer)) {
                updatedCustomList.push(selectedAsset);
                await AsyncStorage.setItem("importedStellarWalletToken", JSON.stringify(updatedCustomList));
            }

            setSupportedAssetsList(prev => {
                if (!prev.some(item => item.code === selectedAsset.code && item.issuer === selectedAsset.issuer)) {
                    return [...prev, selectedAsset];
                }
                return prev;
            });

            await GetStellarTokenList(true);
            Snackbar.show({ text: `${selectedAsset.code} registered locally!`, backgroundColor: "green" });
            setIsCustomMode(false);
            setCustomIssuer('');
            setFetchedCustomAssets([]);
            setCustomSearchQuery('');
            get_stellar();
        } catch (e) {
            console.log("Failed asset token", e);
        }
    };

    useEffect(() => {
        const init = async () => {
            const tokens = await GetStellarTokenList();
            let finalTokens = Array.isArray(tokens) ? [...tokens] : [];
            if (finalTokens.length > 0) {
                setSupportedAssetsList(finalTokens);
            }
            setTRUST_ASSET(route?.params?.openAssetModal || false);
            setLoading_assets_bal(false)
            get_stellar()
        }
        init()
    }, [FOCUSED])

    const theme = state.THEME.THEME ? colors.dark : colors.light;

    const fillteredAssets = (supportedAssetsList.length > 0 ? supportedAssetsList : stellarTokens?.assets)
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

    const filteredCustomResults = fetchedCustomAssets.filter((item) => {
        if (!customSearchQuery.trim()) return true;
        const query = customSearchQuery.toLowerCase();
        return (
            item.name?.toLowerCase().includes(query) ||
            item.code?.toLowerCase().includes(query)
        );
    });

    return (
        <>
            <Exchange_screen_header title="Assets" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />

            <View style={[styles.main_con, { backgroundColor: theme.bg }]}>
                <View style={styles.assetCon}>
                     <FlatList
                        data={assets}
                        keyExtractor={(item, index) => index.toString()}
                        style={{ marginBottom: hp(5) }}
                        renderItem={({ item, index }) => {
                        return (
                            <TouchableOpacity key={index} style={[styles.assetCard, { backgroundColor: theme.cardBg }]} onPress={() => { navigation.navigate("send_recive", { bala: item.balance, assetIssuer: item.asset_type === "native" ? "native" : item?.asset_issuer, asset_name: item.asset_type === "native" ? "native" : item.asset_code === "USDC" ? "USDC" : item.asset_code }) }}>
                                <View style={{flexDirection: "row",alignItems:"center",justifyContent:"flex-start",width:wp(45)}}>
                                    <View style={styles.assetImgCom}>
                                        {item.asset_type === "native" ? <Image source={{uri:stellarTokens?.assets[0]?.icon}} width={43} height={43}/> :
                                        item.icon===null ? <Text style={[styles.assetLatter,{color:theme.headingTx}]}>{item.asset_type === "native" ? "L" : item?.asset_code[0]?.toUpperCase() }</Text> : <Image source={{uri:item.icon}} width={43} height={43}/>}
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
                visible={TRUST_ASSET}
                animationType="slide"
                transparent
                onRequestClose={() => {
                    setTRUST_ASSET(false);
                    setSearchQuery("");
                    setIsCustomMode(false);
                }}
            >
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    activeOpacity={1}
                    onPress={() => {
                    setTRUST_ASSET(false);
                    setSearchQuery("");
                    setIsCustomMode(false);
                }}
            />
                <View style={[styles.overlay,{backgroundColor:theme.cardBg}]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between",width:wp(90)}}>
                       <View style={{flexDirection:"column"}}>
                            <Text style={[styles.modal_heading,{color:theme.headingTx}]}>Add Asset</Text>
                            <Text style={[styles.modal_heading,{color:theme.inactiveTx,fontSize:14,fontWeight:"300"}]}>
                                {isCustomMode ? "Import Tokens via Stellar Issuer Address" : "Enable Trustline to Hold Asset"}
                            </Text>
                       </View>
                        <TouchableOpacity onPress={() => {
                            setTRUST_ASSET(false)
                            setSearchQuery("");
                            setIsCustomMode(false);
                        }}>
                            <Icon
                                name={"close-circle-outline"}
                                type={"materialCommunity"}
                                size={35}
                                color={theme.headingTx}
                            />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        style={[styles.toggleBtn, { backgroundColor: theme.bg, borderColor: "#4052D6" }]} 
                        onPress={() => setIsCustomMode(!isCustomMode)}
                    >
                        <Text style={{ color: "#4052D6", fontWeight: '600', fontSize: 14 }}>
                            {isCustomMode ? "← Back to Curated Market List" : "+ Import Custom Asset by Issuer ID"}
                        </Text>
                    </TouchableOpacity>

                    {!isCustomMode ? (
                        <>
                            <View style={{flexDirection:"row",paddingHorizontal:16,paddingVertical:10,backgroundColor:"#FEF6D8",borderRadius:13,marginVertical:10,alignItems:"center"}}>
                                <Icon name={"information-circle-outline"} type={"ionicon"} size={28} color={"#ECB742"} />
                                <Text style={{fontSize:13,color:"#ECB742",fontWeight:"300",marginLeft:4}}>{`Trustlines let your wallet accept and hold \n approved assets.`}</Text>
                            </View>
                            
                            <View style={{ width: '100%', marginVertical: hp(1) }}>
                                <TextInput
                                    placeholder="Search by name, code or issuer..."
                                    placeholderTextColor={theme.inactiveTx}
                                    value={searchQuery}
                                    onChangeText={(text) => setSearchQuery(text)}
                                    style={{
                                        backgroundColor: theme.bg,
                                        color: theme.headingTx,
                                        paddingHorizontal: 12,
                                        borderRadius: 10,
                                        fontSize: 16,
                                        width: '100%',
                                        height: hp(5)
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
                                            {item.icon ? (
                                                <Image source={{ uri: item.icon }} style={styles.modal_IMG} />
                                            ) : (
                                                <View style={[styles.modal_IMG, { backgroundColor: 'rgba(64,82,214,0.2)', justifyContent: 'center', alignItems: 'center', borderRadius: 8 }]}>
                                                    <Text style={{ color: '#4052D6', fontWeight: 'bold' }}>{item.code?.[0]}</Text>
                                                </View>
                                            )}
                                            <View>
                                                <Text style={[styles.modal_sub_heading,{color:theme.headingTx}]}>{item.code}</Text>
                                                <Text style={[styles.modal_sub_heading, { fontSize: 11, color: theme.inactiveTx }]} numberOfLines={1}>{item.domain || item.issuer?.slice(0,12) + "..."}</Text>
                                            </View>
                                        </View>
                                        {assets.some((list_item) => list_item.asset_issuer === item.issuer) ?
                                            <TouchableOpacity style={[styles.btn,{backgroundColor:"#E54B4B"}]} disabled={Loading!==null} onPress={()=>{removeTrustLine(item.code, item.issuer)}}>
                                                {Loading === item.code ? <ActivityIndicator color={"#FFF"} /> : <Text style={[styles.modal_sub_heading,{fontSize:14,color:"#fff"}]}>Remove</Text>}
                                            </TouchableOpacity> :
                                            <TouchableOpacity style={[styles.btn,{backgroundColor:"#4052D6"}]} onPress={() => {
                                                changeTrust(item.code, item.issuer)
                                            }} disabled={Loading!==null}>
                                                {Loading === item.code ? <ActivityIndicator color={"#FFF"} /> : <Text style={[styles.modal_sub_heading,{fontSize:14,color:"#fff"}]}>Add Asset</Text>}
                                            </TouchableOpacity>
                                        }
                                    </View>
                                )
                            }}
                                ListEmptyComponent={() => (
                                    <View style={{ alignItems: 'center', paddingVertical: hp(4) }}>
                                        <Text style={{ color: theme.inactiveTx, fontSize: 16, fontWeight: '500' }}>
                                            No assets found
                                        </Text>
                                    </View>
                                )}
                            />
                        </>
                    ) : (

                        <View style={{ flex: 1, marginTop: hp(1) }}>
                            <View style={{ flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                                <TextInput
                                    placeholder="Paste Stellar Issuer Account ID (G...)"
                                    placeholderTextColor={theme.inactiveTx}
                                    value={customIssuer}
                                    onChangeText={setCustomIssuer}
                                    style={[styles.customInput, { backgroundColor: theme.bg, color: theme.headingTx, flex: 1, marginRight: 8, marginBottom: 0 }]}
                                />
                                <TouchableOpacity 
                                    style={[styles.fetchBtn, { backgroundColor: "#4052D6" }]} 
                                    onPress={handleFetchIssuerAssets}
                                    disabled={isFetchingCustom}
                                >
                                    {isFetchingCustom ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Icon name="search" type="feather" size={20} color="white" />
                                    )}
                                </TouchableOpacity>
                            </View>

                            {fetchedCustomAssets.length > 0 && (
                                <>
                                    <View style={{ width: '100%', marginVertical: hp(1.5) }}>
                                        <TextInput
                                            placeholder="Filter fetched assets by name/code..."
                                            placeholderTextColor={theme.inactiveTx}
                                            value={customSearchQuery}
                                            onChangeText={setCustomSearchQuery}
                                            style={{
                                                backgroundColor: theme.bg,
                                                color: theme.headingTx,
                                                paddingHorizontal: 12,
                                                borderRadius: 10,
                                                fontSize: 14,
                                                width: '100%',
                                                height: hp(4.5)
                                            }}
                                            clearButtonMode="while-editing"
                                        />
                                    </View>

                                    <FlatList
                                        data={filteredCustomResults}
                                        keyExtractor={(item, index) => index.toString()}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity 
                                                style={[styles.discoveredCard, { backgroundColor: theme.bg }]}
                                                onPress={() => handleSaveSelectedAsset(item)}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                    <View style={[styles.modal_IMG, { backgroundColor: 'rgba(64,82,214,0.1)', justifyContent: 'center', alignItems: 'center', borderRadius: 8 }]}>
                                                        <Text style={{ color: '#4052D6', fontWeight: 'bold', fontSize: 16 }}>{item.code?.[0]}</Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.discoverCode, { color: theme.headingTx }]}>{item.code}</Text>
                                                        <Text style={{ color: theme.inactiveTx, fontSize: 11 }} numberOfLines={1}>{item.domain}</Text>
                                                    </View>
                                                </View>
                                                
                                                <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                                                    <Text style={{ color: theme.inactiveTx, fontSize: 10 }}>Wallet Holding</Text>
                                                    <Text style={[styles.discoverBalance, { color: parseFloat(item.balance) > 0 ? "#2E7D32" : theme.headingTx }]}>
                                                        {item.balance}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                        ListEmptyComponent={() => (
                                            <View style={{ alignItems: 'center', paddingVertical: hp(4) }}>
                                                <Text style={{ color: theme.inactiveTx, fontSize: 15 }}>No assets match your filter text</Text>
                                            </View>
                                        )}
                                    />
                                </>
                            )}
                        </View>
                    )}
                </View>
                </View>
            </Modal>
            
            <ClaimableBalanceChecker
                publicKey={state.STELLAR_PUBLICK_KEY}
                autoFetch={true}
                isDark={state.THEME.THEME}
                onClose={()=>{get_stellar()}}
            />
        </>
    )
}

const styles = StyleSheet.create({
    btn: {
        width: wp(24),
        height: hp(4.5),
        borderRadius: 10,
        marginRight: 10,
        alignItems: "center",
        justifyContent: "center"
    },
    main_con: {
        height: "100%",
    },
    search_bar: {
        marginVertical: 4,
        padding: 12,
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
        marginHorizontal: 5
    },
    assetLatter:{
        fontSize: 35,
        fontWeight: "800",
        textAlign: "center"
    },
    assetImgCom:{
        padding: 8,
        borderRadius: 13,
        backgroundColor: "rgba(0, 0, 0, 0.15)",
        width: wp(14.5),
        height: hp(7),
        justifyContent: "center",
        alignItems: "center"
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
    modal: {
        flex:1,
    },
    overlay: {
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        height: hp(91),
        paddingTop: hp(3),
        paddingHorizontal: wp(4),
    },
    modal_heading: {
        fontSize: 20,
        color: "#fff",
        fontWeight: "600"
    },
    modal_sub_heading: {
        fontSize: 16,
        color: "#fff",
        fontWeight: "600",
        maxWidth: wp(45)
    },
    modal_IMG: {
        height: hp(5),
        width: wp(10.6),
        marginRight: wp(2)
    },
    toggleBtn: {
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        marginVertical: 12,
        alignItems: 'center'
    },
    customInput: {
        paddingHorizontal: 12,
        borderRadius: 10,
        fontSize: 15,
        height: hp(5),
        marginBottom: hp(1)
    },
    fetchBtn: {
        height: hp(5),
        width: hp(5),
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center'
    },
    discoveredCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        marginVertical: 4
    },
    discoverCode: {
        fontSize: 16,
        fontWeight: 'bold'
    },
    discoverBalance: {
        fontSize: 14,
        fontWeight: '600',
        marginTop: 2
    }
})

export default Assets_manage;