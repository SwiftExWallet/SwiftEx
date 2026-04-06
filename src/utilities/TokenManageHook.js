import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import { MULTICHAIN_PORTFOLIO } from '../components/Redux/actions/type';

const getAssetId = (asset) => `${asset.symbol}_${asset.contractAddress.toLowerCase()}`;

export const useAssetManager = (walletAddress) => {
    const dispatch = useDispatch();
    const mergeWithApiTokens = async (apiTokens) => {
        try {
            const stored = await AsyncStorage.getItem(walletAddress);
            const customTokens = stored ? JSON.parse(stored) : [];
            const apiIds = new Set(apiTokens.map(getAssetId));
            const uniqueCustom = customTokens.filter(t => apiIds.has(getAssetId(t)));
            const merged = [...apiTokens, ...uniqueCustom];
            dispatch({
              type: MULTICHAIN_PORTFOLIO,
              payload: {
                activeWalletPortFolio: merged
              }
            }); 
        } catch (e) {
            console.error('merge error', e);
        }
    };

    const addToken = async (token) => {
        try {
            const stored = await AsyncStorage.getItem(walletAddress);
            const existing = stored ? JSON.parse(stored) : [];
            const alreadySaved = existing.find(t => getAssetId(t) === getAssetId(token));
            if (!alreadySaved) {
                const updated = [...existing, token];
                await AsyncStorage.setItem(walletAddress, JSON.stringify(updated));
            }
        } catch (e) {
            console.error('addToken error', e);
        }
    };

    const dropToken = async (token) => {
        try {
            const stored = await AsyncStorage.getItem(walletAddress);
            if (!stored) return;

            const existing = JSON.parse(stored);
            const updated = existing.filter(t => getAssetId(t) === getAssetId(token));
            await AsyncStorage.setItem(walletAddress, JSON.stringify(updated));
        } catch (e) {
            console.error('dropToken error', e);
        }
    };

    const isCustomToken = (token, apiTokens) => {
        const apiIds = new Set(apiTokens.map(getAssetId));
        return !apiIds.has(getAssetId(token));
    };

    return { addToken, dropToken, isCustomToken, mergeWithApiTokens };
};