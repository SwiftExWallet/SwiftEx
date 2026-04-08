import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import { MULTICHAIN_PORTFOLIO } from '../components/Redux/actions/type';

export const  getAssetId = (asset) => `${asset.symbol}_${asset.contractAddress.toLowerCase()}`;

export const useAssetManager = (walletAddress) => {
    const dispatch = useDispatch();
    const mergeWithApiTokens = async (apiTokens) => {
        try {
            const stored = await AsyncStorage.getItem(walletAddress);
            const savedTokens = stored ? JSON.parse(stored) : [];
            const savedMap = new Map(savedTokens.map(t => [getAssetId(t), t]));

            const merged = apiTokens.map(apiToken => {
                const id = getAssetId(apiToken);
                const savedToken = savedMap.get(id);

                if (savedToken) {
                    return {
                        ...apiToken,
                        active: savedToken.active,
                    };
                }

                return apiToken;
            });
            const apiIds = new Set(apiTokens.map(getAssetId));
            const customTokens = savedTokens.filter(t => !apiIds.has(getAssetId(t)));

            dispatch({
                type: MULTICHAIN_PORTFOLIO,
                payload: {
                    activeWalletPortFolio: [...merged, ...customTokens]
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

            const idx = existing.findIndex(t => getAssetId(t) === getAssetId(token));

            let updated;
            if (idx !== -1) {
                updated = existing.map((t, i) => i === idx ? { ...t, active: true } : t);
            } else {
                updated = [...existing, token];
            }

            await AsyncStorage.setItem(walletAddress, JSON.stringify(updated));
        } catch (e) {
            console.error('addToken error', e);
        }
    };

    const dropToken = async (token) => {
        try {
            const stored = await AsyncStorage.getItem(walletAddress);
            if (!stored) return;

            const existing = JSON.parse(stored);

            const updated = existing.map(t =>
                getAssetId(t) === getAssetId(token)
                    ? { ...t, active: false }
                    : t
            );

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