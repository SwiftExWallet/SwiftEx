import { View, StyleSheet, TouchableOpacity, Image, FlatList, Text, TextInput, Keyboard, Platform, NativeModules, ActivityIndicator } from "react-native"
import { PPOST, proxyRequest } from '../exchange/crypto-exchange-front-end-main/src/api';
import { useDispatch, useSelector } from "react-redux";
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";
import { Wallet_screen_header } from "../reusables/ExchangeHeader";
import { CHAINS } from "../../utilities/TokenUtils";
import { colors } from "../../Screens/ThemeColorsConfig";
import Icon from "../../icon";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ethers } from "ethers";
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import { AddToAllWallets, getBalance, setCurrentWallet, setToken, setUser, setWalletType } from "../../components/Redux/actions/auth";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { alert } from "../reusables/Toasts";
import { checkWalletExistOrNot } from "../Wallets/WalletManagement";
import * as StellarSdk from '@stellar/stellar-sdk';
import Modal from "react-native-modal";
const { EthereumWallet } = NativeModules;


export const WalletNetworkSelection = (props) => {
    const isFocused = useIsFocused();
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const state = useSelector((state) => state);
    const [showImportOptions, setshowImportOptions] = useState(false);
    const [chainInfo, setChainInfo] = useState(null);
    const [accountName, setaccountName] = useState("");
    const [keys, setKeys] = useState("");
    const [loading, setLoading] = useState(false);
    const [label, setLabel] = useState(0);
    const [showChooseLable, setShowChooseLable] = useState(false);
    const importTypeOptions = [
        { name: "Mnemonic Phrase", labelId: 0, iconName: "shield-key-outline" },
        { name: "Private Key", labelId: 1, iconName: "key" },
    ];
    const walletMultiChain = {
        imageUrl: "../../../assets/walletImage.png",
        name: "Muti-Chain",
        symbol: "Recommended",
        chainName: "Recommended",
        importForSetupApp: true,
        importForSetupedApp: true,
    }
    const theme = state.THEME.THEME ? colors.dark : colors.light;
    const styles = StyleSheet.create({
        mainCon: {
            alignItems: "center",
            backgroundColor: theme.bg,
            flex: 1
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
            paddingVertical: hp(2),
            paddingHorizontal: wp(3),
            marginTop: hp(1),
            backgroundColor: theme.cardBg,
            flexDirection: "row",
            alignItems: "center",
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
        cardCon: {
            flexDirection: "row",
            justifyContent: "space-between"
        },
        txtCard: {
            borderRadius: 16,
            padding: wp(3),
            backgroundColor: theme.cardBg,
            width: wp(90),
            marginTop: hp(1.5)
        },
        walletTypeSelectionCon: {
            flexDirection: "row",
            justifyContent: "space-between"
        },
        txtLabel: {
            fontSize: 15,
            fontWeight: '600',
            marginBottom: hp(1.5),
            letterSpacing: 0.3,
            paddingVertical: 1.5,
            color: theme.inactiveTx
        },
        inputContainer: {
            alignItems: "flex-start",
            borderRadius: 12,
            paddingHorizontal: wp(2),
            paddingVertical: hp(1.5),
            backgroundColor: theme.bg,
            fontSize: 16,
            color: theme.headingTx
        },
        submitBtn: {
            borderRadius: 16,
            padding: wp(3),
            width: wp(90),
            marginVertical: hp(2.5),
            alignItems: "center",
            backgroundColor: (accountName && keys) ? "#4052D6" : "gray"
        },
        submitBtnTxt: {
            fontSize: 18,
            fontWeight: "400",
            color: "#fff"
        },
        modalCon: {
            justifyContent: "flex-end",
            margin: 0,
        },
        modalContainer: {
            backgroundColor: theme.cardBg,
            padding: 20,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            minHeight: 250,
        },
        chooseModalTitle: {
            fontSize: 21,
            color: theme.headingTx,
            fontWeight: "bold",
            marginBottom: hp(1)
        },
        importTypeCon: {
            flexDirection: "row",
            paddingHorizontal: wp(3),
            paddingVertical: hp(2),
            backgroundColor: theme.bg,
            marginVertical: hp(0.4),
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "space-between"
        },
        importTypeTitle: {
            color: theme.headingTx,
            fontSize: 18,
            fontWeight: "400",
            marginLeft: wp(2)
        }
    });

    useEffect(() => {
        setaccountName("");
        setKeys("");
        setLoading(false);
        setChainInfo(null);
        setshowImportOptions(false);
        setLabel(0);
        setShowChooseLable(false);
    }, [isFocused])

    const getExistingWallets = async (user) => {
        let wallets = [];
        await AsyncStorage.getItem(`${user}-wallets`)
            .then((response) => {
                const parsed = JSON.parse(response);
                if (Array.isArray(parsed)) {
                    wallets = parsed;
                }
            })
            .catch((e) => {
                console.log(e);
            });
        return wallets;
    };

    const publicWalletFromNative = (nativeWallet) => ({
        address: nativeWallet.address,
        xrp: {
            address: nativeWallet.xrp?.address || "000000000",
        },
        stellarWallet: {
            publicKey: nativeWallet.stellarPublicKey || nativeWallet.stellarWallet?.publicKey,
        },
        walletType: nativeWallet.walletType || "Multi-coin",
    });

    const syncWalletApi = async (wallet) => {
        const resultApi = await proxyRequest('/v1/wallet', PPOST, {
            "addresses": {
                "eth": wallet.address,
                "xlm": wallet.stellarWallet.publicKey,
                "bnb": wallet.address,
                "multi": wallet.address
            },
            "isPrimary": true
        });
        console.log("result---result", resultApi)

        if (resultApi.success) {
            alert("success", "wallet synced!");
        } else {
            alert("error", "unable to sync wallet.");
            console.log('Error:', resultApi.error, 'Status:', resultApi.status);
        }
    };

    const finishSetupImport = async (wallet) => {
        const accounts = {
            address: wallet.address,
            name: accountName,
            xrp: {
                address: wallet.xrp.address,
            },
            stellarWallet: {
                publicKey: wallet.stellarWallet.publicKey,
            },
            walletType: "Multi-coin",
            wallets: [],
        };
        const wallets = [accounts];
        const allWallets = [
            {
                address: wallet.address,
                name: accountName,
                xrp: {
                    address: wallet.xrp.address,
                },
                stellarWallet: {
                    publicKey: wallet.stellarWallet.publicKey,
                },
                walletType: "Multi-coin",
            },
        ];

        AsyncStorage.setItem("wallet", JSON.stringify(allWallets[0]));
        AsyncStorage.setItem(`${accountName}-wallets`, JSON.stringify(allWallets));
        AsyncStorage.setItem("user", accountName);
        AsyncStorage.setItem("currentWallet", accountName);
        dispatch(setUser(accountName));
        dispatch(setCurrentWallet(wallet.address, accountName, "", "Multi-coin"));
        dispatch(AddToAllWallets(wallets, accountName));
        dispatch(getBalance(wallet.address));
        dispatch(setWalletType("Multi-coin"));
        await syncWalletApi(wallet);
        setLoading(false);
        navigation.navigate("HomeScreen");
    };

    const finishExistingUserImport = async (wallet, user) => {
        const wallets = await getExistingWallets(user);
        const allWallets = [
            {
                address: wallet.address,
                name: accountName,
                xrp: {
                    address: wallet.xrp.address,
                },
                stellarWallet: {
                    publicKey: wallet.stellarWallet.publicKey
                },
                walletType: "Multi-coin",
                wallets: wallets,
            },
        ];

        await syncWalletApi(wallet);

        dispatch(AddToAllWallets(allWallets, user)).then(async (response) => {
            if (response) {
                if (response.status === "Already Exists") {
                    alert("error", "Account with same name already exists");
                    setLoading(false);
                    return;
                } else if (response.status === "success") {
                    dispatch(setCurrentWallet(wallet.address, accountName, "", "Multi-coin"));
                    setTimeout(() => {
                        setLoading(false);
                        AsyncStorage.setItem("currentWallet", accountName);
                        navigation.navigate(props.route.params.selectionType === "importForSetupApp" ? "HomeScreen" : "Home");
                    }, 0);
                } else {
                    alert("error", "failed please try again");
                    setLoading(false);
                }
            }
        });
    };

    const validateImportStart = async () => {
        Keyboard.dismiss()
        const checkWalletName = await checkWalletExistOrNot(accountName);
        if (checkWalletName) {
            return false;
        }
        if (!accountName) {
            alert("error", "Please enter an wallet name to proceed");
            return false;
        }
        setLoading(true);
        return true;
    };

    const restoreWalletUsingPrivateKey = async (key) => {
        try {
            if (!(await validateImportStart())) return false;
            const user = await AsyncStorage.getItem("user");
            const check = ethers.utils.isHexString(key, 32);
            if (!check) {
                setLoading(false);
                return alert(
                    "error",
                    "Incorrect Private Key. Please provide a valid Private Key"
                );
            }
            const accountFromMnemonic = await NativeModules.EthereumWallet.importEthPrivateKey(key, accountName);
            await finishExistingUserImport(publicWalletFromNative(accountFromMnemonic), user);
        } catch (e) {
            console.error(e);
            setLoading(false);
            CustomInfoProvider.show("error", "!Opps", e);
        }
    }

    const restoreWallet = async (key) => {
        try {
            if (!(await validateImportStart())) return false;
            const user = await AsyncStorage.getItem("user");
            const check = ethers.utils.isValidMnemonic(key);
            if (!check) {
                setLoading(false);
                return alert(
                    "error",
                    "Incorrect Mnemonic. Please provide a valid Mnemonic"
                );
            }
            const accountFromMnemonic = Platform.OS === "android" ? await EthereumWallet.recoverMultiChainWallet(key, accountName) : await EthereumWallet.recoverWallet(key, "", accountName);
            await finishExistingUserImport(publicWalletFromNative(accountFromMnemonic), user);
        } catch (e) {
            console.error(e);
            setLoading(false);
            CustomInfoProvider.show("error", "!Opps", e);
        }
    }

    const restoreSetupWallet = async (key) => {
        try {
            if (!(await validateImportStart())) return false;
            const check = ethers.utils.isValidMnemonic(key);
            if (!check) {
                setLoading(false);
                return alert(
                    "error",
                    "Incorrect Mnemonic. Please provide a valid Mnemonic"
                );
            }
            const accountFromMnemonic = Platform.OS === "android" ? await EthereumWallet.recoverMultiChainWallet(key, accountName) : await EthereumWallet.recoverWallet(key, "", accountName);
            await finishSetupImport(publicWalletFromNative(accountFromMnemonic));

        } catch (e) {
            console.error(e);
            setLoading(false);
            CustomInfoProvider.show("error", "!Opps", e);
        }
    }

    const validateStellarKey = async (keys) => {
        try {
            const key = StellarSdk.Keypair.fromSecret(keys);
            return {
                validateStellarKey: true,
                publicKey: key.publicKey(),
            };
        } catch {
            return {
                validateStellarKey: false,
                publicKey: null,
            };
        }
    }

    const restoreSetupStellarWallet = async (key) => {
        try {
            if (!(await validateImportStart())) return false;
            const check = await validateStellarKey(key);
            if (!check.validateStellarKey) {
                setLoading(false);
                return alert(
                    "error",
                    "Incorrect Secret Key. Please provide a valid Secret Key"
                );
            }
            const accountFromMnemonic = await NativeModules.EthereumWallet.importStellarPrivateKey(key, accountName);
            await finishSetupImport(publicWalletFromNative(accountFromMnemonic));

        } catch (e) {
            console.error(e);
            setLoading(false);
            CustomInfoProvider.show("error", "!Opps", e);
        }
    }

    const restoreStellarWallet = async (key) => {
        try {
            if (!(await validateImportStart())) return false;
            const user = await AsyncStorage.getItem("user");
            const check = await validateStellarKey(key);
            if (!check.validateStellarKey) {
                setLoading(false);
                return alert(
                    "error",
                    "Incorrect Secret Key. Please provide a valid Secret Key"
                );
            }
            const accountFromMnemonic = await NativeModules.EthereumWallet.importStellarPrivateKey(key, accountName);
            await finishExistingUserImport(publicWalletFromNative(accountFromMnemonic), user);
        } catch (e) {
            console.error(e);
            setLoading(false);
            CustomInfoProvider.show("error", "!Opps", e);
        }
    }

    const manageImportWays = async () => {
        const finalClean = keys.trim().replace(/\s+/g, ' ');
        setKeys(finalClean);

        if (chainInfo.symbol !== "STR" && props.route.params.selectionType === "importForSetupApp") {
            await restoreSetupWallet(finalClean);
            return 0;
        }
        if (chainInfo.symbol === "STR") {
            if (props.route.params.selectionType === "importForSetupApp") {
                await restoreSetupStellarWallet(finalClean);
                return 0;
            } else {
                await restoreStellarWallet(finalClean);
                return 0;
            }
        }
        if (label === 1) {
            await restoreWalletUsingPrivateKey(finalClean);
            return 0;
        } else {
            await restoreWallet(finalClean);
            return 0;
        }
    };
    
    const chains = Object.values(CHAINS).filter(item => item[props.route.params.selectionType]===true);
    const stellar = chains.find(item => item.name === "Stellar");
    const others = chains.filter(item => item.name !== "Stellar").sort((a, b) => a.name.localeCompare(b.name));

    return (
        <View style={styles.mainCon}>
            <Wallet_screen_header elementestID={"Select"} title={!showImportOptions ? "Select Network" : "Import " + chainInfo.name + " Wallet"} onLeftIconPress={() => { showImportOptions ? setshowImportOptions(false) : navigation.navigate(props.route.params.backScreenName) }} />
            {!showImportOptions ? <FlatList
                data={[walletMultiChain,...(stellar ? [stellar] : []),...others]}
                keyExtractor={(item, index) => index}
                renderItem={({ item, index }) => {
                    return (
                        <TouchableOpacity key={index} style={styles.card} onPress={() => { setChainInfo(item), setshowImportOptions(showImportOptions ? false : true) }}>
                            <View style={styles.cardCon}>
                                <Image source={item.name === "Muti-Chain"?require('../../../assets/walletImage.png'):{ uri: item.imageUrl }} style={styles.chainImg} />
                                <View>
                                    <Text style={styles.cardTitel}>{item.name}</Text>
                                    <Text style={styles.cardSubTitel}>{item.chainName==="SRB"?"XLM":item.chainName}</Text>
                                </View>
                            </View>
                            <Icon type={"materials"} name="chevron-right" size={20} color={theme.inactiveTx} />
                        </TouchableOpacity>
                    );
                }}
                contentContainerStyle={{ paddingBottom: hp(5) }}
            /> : <View>
                <View style={styles.txtCard}>
                    <Text style={styles.txtLabel}>Wallet Name</Text>
                    <TextInput
                        value={accountName}
                        maxLength={20}
                        onChangeText={(text) => {
                          const formattedUsername = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
                          setaccountName(formattedUsername)
                        }}
                        style={styles.inputContainer}
                        placeholder={"Wallet 1"}
                        placeholderTextColor={"gray"}
                        autoFocus={true}
                        editable={!loading}
                    />
                </View>
                {chainInfo.symbol !== "STR" ?
                    <View style={styles.txtCard}>
                        <View style={styles.walletTypeSelectionCon}>
                            <Text style={styles.txtLabel}>{label === 0 ? "Mnemonic" : "Private Key"}</Text>
                            <TouchableOpacity onPress={() => { setShowChooseLable(true) }}>
                                <Icon type={"materials"} name="chevron-down" size={19} color={theme.inactiveTx} />
                            </TouchableOpacity>
                        </View>
                        {label === 0 ?
                            <TextInput
                                value={keys}
                                onChangeText={(value) => {
                                    const typingClean = value.replace(/[^a-zA-Z\s]/g, '').toLowerCase();
                                    setKeys(typingClean)
                                }}
                                style={styles.inputContainer}
                                placeholder={"Mnemonic"}
                                placeholderTextColor={"gray"}
                                editable={!loading}
                                multiline={true}
                            /> : <TextInput
                                value={keys}
                                onChangeText={(text) => { setKeys(text) }}
                                style={styles.inputContainer}
                                placeholder={"Private Key"}
                                placeholderTextColor={"gray"}
                                editable={!loading}
                                multiline={true}
                            />}
                    </View> : <View style={styles.txtCard}>
                        <Text style={styles.txtLabel}>Secret Key</Text>
                        <TextInput
                            value={keys}
                            onChangeText={(text) => {
                                setKeys(text)
                            }}
                            multiline={true}
                            style={styles.inputContainer}
                            placeholder={"Secret Key"}
                            placeholderTextColor={"gray"}
                            editable={!loading}
                        />
                    </View>}

                {loading ? <ActivityIndicator color={"green"} style={{ marginTop: hp(2) }} size={"large"} /> : <TouchableOpacity style={styles.submitBtn} disabled={loading} onPress={() => { manageImportWays() }}>
                    <Text style={styles.submitBtnTxt}>Restore Wallet</Text>
                </TouchableOpacity>}
            </View>}

            <Modal
                isVisible={showChooseLable}
                onBackdropPress={() => { setShowChooseLable(false) }}
                onBackButtonPress={() => { setShowChooseLable(false) }}
                swipeDirection={"down"}
                onSwipeComplete={() => { setShowChooseLable(false) }}
                style={styles.modalCon}
            >
                <View style={styles.modalContainer}>
                    <Text style={styles.chooseModalTitle}>Select Method</Text>
                    <FlatList
                        data={importTypeOptions}
                        keyExtractor={(index) => index.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity onPress={() => { setLabel(item.labelId); setShowChooseLable(false); }}
                                style={styles.importTypeCon}
                            >
                                <View style={{ flexDirection: "row" }}>
                                    <Icon type={"materialCommunity"} name={item.iconName} size={24} color={theme.inactiveTx} />
                                    <Text style={styles.importTypeTitle}>{item.name}</Text>
                                </View>
                                {label === item.labelId && <Icon type={"materialCommunity"} name={"check-circle-outline"} size={24} color={"green"} />}
                            </TouchableOpacity>
                        )
                        }
                    />
                </View>
            </Modal>
        </View>
    )
}