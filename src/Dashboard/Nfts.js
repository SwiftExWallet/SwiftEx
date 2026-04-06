import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Image, TouchableOpacity, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ethers } from 'ethers';
import { useSelector } from 'react-redux';
import { Paste } from '../utilities/utilities';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from '../icon';
import CustomInfoProvider from './exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import { colors } from '../Screens/ThemeColorsConfig';
import { ERC20_ABI } from './exchange/crypto-exchange-front-end-main/src/utils/constants';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Wallet_screen_header } from "./reusables/ExchangeHeader";

const Nfts = () => {
  const { params } = useRoute();
  const navigation = useNavigation();
  const state = useSelector((state) => state);
  const [isLoading, setIsLoading] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const WALLET_ADDRESS = state.wallet.address;
  const tokensStorageKey = `user-custom-tokens-${WALLET_ADDRESS}`;

  const getTokensInfo = async (tokenAddress, networkRpc, networkName, walletAddress) => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(networkRpc);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [tokenBalance, decimals, symbol, name] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name()
      ]);
      return {
        status: true,
        chain: networkName,
        name: name,
        symbol: symbol,
        balance: Number(tokenBalance),
        balanceUSD: 0.00,
        decimals: Number(decimals),
        contractAddress: tokenAddress,
        price: 0.0000,
        imageUrl: ""
      };
    } catch (error) {
      console.error("error",error);
      return { status: false }
    }
  }

  const fetchTokenInfo = async (address, networkType) => {
    try {
      if (address && WALLET_ADDRESS && networkType) {
        const fetchedTokens = await getTokensInfo(address, params.selectedChain.rpcUrl, params.selectedChain.symbol, WALLET_ADDRESS);
        if (fetchedTokens.status) {
          return {
            status: fetchedTokens.status,
            tokenInfo: fetchedTokens
          }
        } else {
          return {
            status: false,
            tokenInfo: []
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching token info for ${address}:`, error);
      return {
        status: false,
        tokenInfo: []
      }
    }
  };


  const handleAddToken = async (addRequestAddress, selectedTokenNetwork) => {
    if (!ethers.utils.isAddress(addRequestAddress) || !addRequestAddress) {
      setNewTokenAddress('');
      CustomInfoProvider.show('error', 'Please enter a valid token contract address.');
      return;
    }
    const storedTokensAddresses = await getStoreTokes();
    if (storedTokensAddresses.status === false) {
      CustomInfoProvider.show('error', 'Unable to token add.');
      return;
    } else {
      if (storedTokensAddresses.data.some((token) => token.address === addRequestAddress)) {
        setNewTokenAddress('');
        CustomInfoProvider.show('error', 'Token already added.');
        return;
      }
    }
    setIsLoading(true);
    const newToken = await fetchTokenInfo(addRequestAddress, selectedTokenNetwork);
    if (newToken.status) {
      const saveResponse = await storeToken(newToken.tokenInfo)
      if (saveResponse.status) {
        setNewTokenAddress('');
        CustomInfoProvider.show("success", "Token Adding completed.")
        setIsLoading(false);
      } else {
        setNewTokenAddress('');
        CustomInfoProvider.show("error", "Token Adding faild.")
        setIsLoading(false);
        return;
      }
    } else {
      CustomInfoProvider.show('error', 'Please check the token address.');
      setNewTokenAddress('');
      setIsLoading(false);
      return;
    }
  };


  const storeToken = async (data) => {
    try {
      const allTokens = await getStoreTokes();
      const existingTokens = allTokens.status ? allTokens.data : [];
      const addedTimeStamp = {
        ...data,
        timestamp: data?.timestamp ?? Date.now(),
      };
      const updatedTokens = [...existingTokens, addedTimeStamp];
      await AsyncStorage.setItem(tokensStorageKey, JSON.stringify(updatedTokens));
      console.log('storeToke save true.');
      return {
        status: true,
        data: updatedTokens
      };
    } catch (error) {
      console.error('storeToke error on save ', error);
      return {
        status: false,
        data: []
      };
    }
  }

  const getStoreTokes = async () => {
    try {
      const data = await AsyncStorage.getItem(tokensStorageKey);
      if (data) {
        const allParsedToken = JSON.parse(data);
        return {
          status: true,
          data: allParsedToken
        };
      } else {
        return {
          status: true,
          data: []
        };
      }
    } catch (error) {
      console.error('getStoreTokes error get all data', error);
      return {
        status: false,
        data: []
      };
    }
  }

  return (
        <View style={[styles.content, { backgroundColor: theme.bg }]}>
          <Wallet_screen_header elementestID={"addToken"} title="Add Token" onLeftIconPress={() => { navigation.goBack(); }}/>
          <View style={styles.infoBox}>
            <Icon
              name="information-outline"
              type="materialCommunity"
              size={18}
              color="#ECB742"
              style={styles.infoIcon}
            />
            <Text style={styles.infoText}>
              Make sure to verify the contract address before adding.
            </Text>
          </View>
          <View style={[styles.section, { backgroundColor: theme.cardBg }]}>
            <Text style={[styles.label, { color: theme.headingTx }]}>
              Select Network
            </Text>
            <View style={styles.networkContainer}>
              <View style={styles.networkCard}>
                <View style={styles.networkIconContainer}>
                  <Image source={{ uri: params.selectedChain.imageUrl }} style={styles.networkIcon} />
                </View>
                <View style={{ alignItems: "flex-start", justifyContent: "center" }}>
                  <Text style={styles.networkName}>{params.selectedChain.name}</Text>
                  <Text style={styles.networkSubtext}>Token</Text>
                </View>
              </View>
              <Icon name="check-circle" type="materialCommunity" size={25} color="#F3BA2F" />
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: theme.cardBg, }]}>
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  { color: theme.headingTx },
                ]}
                placeholder="Enter Contract Address"
                placeholderTextColor={state.THEME.THEME ? '#666666' : '#999999'}
                value={newTokenAddress}
                onChangeText={setNewTokenAddress}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.pasteButton} onPress={() => { Paste(setNewTokenAddress) }}>
                <Text style={styles.pasteText}>Paste</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            disabled={!newTokenAddress || isLoading}
            style={[
              styles.addButton,
              {
                backgroundColor: !newTokenAddress
                  ? state.THEME.THEME
                    ? '#2C2C2C'
                    : '#4052D6'
                  : '#4052D6',
              },
            ]}
            onPress={() => {
              Keyboard.dismiss();
              handleAddToken(newTokenAddress, params.selectedChain.symbol)
            }}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.addButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 10,
    flex:1
  },
  scrollViewCon: {
    flexGrow: 1
  },
  section: {
    paddingHorizontal: wp(2),
    paddingVertical: hp(1.4),
    borderRadius: 19,
    marginVertical: hp(0.5)
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: -3
  },
  networkContainer: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: "center",
    backgroundColor: "#4052D6",
    justifyContent: "space-between"
  },
  networkCard: {
    flexDirection: "row",
  },
  networkIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  networkIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  networkName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
    marginLeft: 5,
    color:"#fff"
  },
  networkSubtext: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 5,
    color:"#fff"
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  pasteButton: {
    alignItems: 'center',
    paddingHorizontal: 19,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#4052D6"
  },
  pasteText: {
    color: '#fff',
    fontSize: 16,
    textAlign: "center",
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: hp(6),
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#FEF6D8"
  },
  infoIcon: {
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#ECB742"
  }
});

export default Nfts;