import { useEffect, useRef, useState } from "react";
import { View, Animated } from "react-native";
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";

export const PORTFOLIO_SKELETON_MAX_MS = 20000;
const SKELETON_ROWS = 7;

export const isPortfolioPending = (state) => {
    const walletAddress = state?.wallet?.address;
    const load = state?.portfolioLoad;
    const status = load?.walletKey === walletAddress ? load?.status : null;
    return status === "loading" || (status == null && !Array.isArray(state?.activeWalletPortFolio));
};

export const SLOW_LOAD_SKELETON_DELAY_MS = 300;

export const useDelayedTrue = (value, delayMs = SLOW_LOAD_SKELETON_DELAY_MS) => {
    const [delayed, setDelayed] = useState(false);
    useEffect(() => {
        if (!value) {
            setDelayed(false);
            return undefined;
        }
        const timer = setTimeout(() => setDelayed(true), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return delayed;
};

export const shouldShowListSkeleton = ({ portfolioPending, skeletonTimedOut, loading, slowLoading, hasList }) =>
    (portfolioPending && !skeletonTimedOut) || (loading && (!hasList || slowLoading));

export const TokenListSkeleton = ({ theme }) => {
    const pulse = useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [pulse]);
    const block = { backgroundColor: theme.smallCardBorderColor || theme.inactiveTx, borderRadius: 6 };
    return (
        <View style={{ alignSelf: "center", marginVertical: hp(1) }} testID="token-list-skeleton">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <Animated.View key={i} style={{
                    width: wp(93), borderRadius: hp(2), paddingVertical: hp(1.4), paddingHorizontal: wp(4),
                    marginTop: hp(1), backgroundColor: theme.cardBg, flexDirection: "row",
                    justifyContent: "space-between", alignItems: "center", opacity: pulse,
                }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={[block, { width: 46, height: 46, borderRadius: 23, marginRight: wp(3) }]} />
                        <View>
                            <View style={[block, { width: wp(22), height: 14, marginBottom: 8 }]} />
                            <View style={[block, { width: wp(32), height: 11 }]} />
                        </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                        <View style={[block, { width: wp(12), height: 12, marginBottom: 8 }]} />
                        <View style={[block, { width: wp(8), height: 11 }]} />
                    </View>
                </Animated.View>
            ))}
        </View>
    );
};

