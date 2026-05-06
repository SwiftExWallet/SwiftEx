import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import Icon from '../../icon';
import { FOLIO_BASE_ROUTE } from '../exchange/crypto-exchange-front-end-main/src/ExchangeConstants';
import apiHelper from '../exchange/crypto-exchange-front-end-main/src/apiHelper';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { colors } from '../../Screens/ThemeColorsConfig';

const TIMELINES = [
    { label: '1 Week', value: '1week' },
    { label: '1 Month', value: '1month' },
    { label: '2 Month', value: '2month' },
    { label: '3 Month', value: '3month' },
];

const getDateRange = (timeline) => {
    const to = new Date();
    const from = new Date();

    switch (timeline) {
        case '1week':
            from.setDate(to.getDate() - 7);
            break;
        case '1month':
            from.setMonth(to.getMonth() - 1);
            break;
        case '2month':
            from.setMonth(to.getMonth() - 2);
            break;
        case '3month':
            from.setMonth(to.getMonth() - 3);
            break;
        default:
            break;
    }

    const fmt = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };

    return { from: fmt(from), to: fmt(to) };
};

const PnlOverView = ({ refresh = false, stellarKey, activeTheme }) => {
    const theme = activeTheme ? colors.dark : colors.light;
    const styles = StyleSheet.create({
        wrapper: {
            backgroundColor: theme.cardBg,
            marginHorizontal: wp(2.6),
            marginTop: hp(1),
            borderColor: theme.smallCardBorderColor,
            borderWidth: 1,
            borderRadius: 20,
            paddingVertical: hp(2),
            paddingHorizontal: wp(2.5)
        },
        heading: {
            fontSize: 16,
            fontWeight: "600",
            color: theme.headingTx
        },
        scroll: {
            backgroundColor: theme.cardBg,
        },
        container: {
            flexDirection: 'row',
            paddingVertical: hp(1),
            paddingHorizontal: (0.5),
            gap: 12,
        },
        card: {
            width: wp(26),
            paddingVertical: 14,
            paddingHorizontal: 8,
            backgroundColor: theme.bg,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.smallCardBorderColor,
        },
        iconCon: {
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: 'center',
        },
        topCard: {
            width: wp(89),
            paddingHorizontal: 10,
            paddingVertical: 10,
            backgroundColor: theme.bg,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.smallCardBorderColor,
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: hp(-0.8)
        },
        topCardlabel: {
            fontSize: 11,
            color: theme.headingTx,
            marginBottom: 2,
            fontWeight: "900"
        },
        lossCard: {
            borderColor: 'rgba(235, 59, 59, 0.3)',
            backgroundColor: 'rgba(222, 57, 57, 0.05)',
        },
        profitCard: {
            borderColor: 'rgba(45, 238, 67, 0.3)',
            backgroundColor: 'rgba(57, 222, 74, 0.05)',
        },
        iconBox: {
            width: 36,
            height: 36,
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 10,
        },
        label: {
            fontSize: 11,
            color: theme.headingTx,
            marginBottom: 10,
            fontWeight: "600",
            marginLeft: wp(1.3)
        },
        value: {
            fontSize: 15,
            fontWeight: '700',
            color: theme.inactiveTx,
            alignSelf: "center"
        },
        valueText: {
            color: theme.inactiveTx,
        },
        lossValue: {
            color: '#f06262ff',
            fontSize: 16,
        },
        timelineContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 1,
            gap: 9,
        },
        timelineBtn: {
            flex: 1,
            paddingVertical: 7,
            borderRadius: 10,
            alignItems: 'center',
            backgroundColor: theme.smallCardBg,
            borderWidth: 1,
            borderColor: theme.smallCardBorderColor,
        },
        timelineBtnActive: {
            backgroundColor: 'rgba(86, 88, 233, 0.2)',
            borderColor: '#4052D6',
        },
        timelineText: {
            fontSize: 12,
            color: theme.inactiveTx,
            fontWeight: '500',
        },
        timelineTextActive: {
            color: '#4052D6',
            fontWeight: '700',
        },
    });
    const [pnlInfo, setPnlInfo] = useState(null);
    const [pnlLoading, setPnlLoading] = useState(false);
    const [selectedTimeline, setSelectedTimeline] = useState('1week');

    const getPnl = async (timeline) => {
        setPnlLoading(true);
        const { from, to } = getDateRange(timeline);
        const result = await apiHelper.get(`${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${from}&to=${to}&nocache=true&summary=true`);
        if (result.success) {
            setPnlInfo(result.data);
            setPnlLoading(false);
        } else {
            setPnlInfo(null);
            setPnlLoading(false);
            console.error("error in getPnl", result.error);
        }
    };

    useEffect(() => {
        getPnl(selectedTimeline);
    }, [refresh]);

    const handleTimelineChange = (value) => {
        setSelectedTimeline(value);
        getPnl(value);
    };

    const usdcSpent = pnlInfo?.usdcSpent ?? 0;
    const usdcReceived = pnlInfo?.usdcReceived ?? 0;
    const tradeCount = pnlInfo?.tradeCount ?? 0;
    const positionCount = pnlInfo?.positionCount ?? 0;
    const totalPnL = pnlInfo?.totalPnL ?? 0;

    const formatUSD = (val, decimals = 2) => `$${val.toFixed(decimals)}`;
    const isLoss = totalPnL < 0;
    const topStats = [{
        label: 'Total P&L',
        value: formatUSD(totalPnL, 3),
        icon: isLoss ? 'trending-down-outline' : 'trending-up-outline',
        color: isLoss ? '#ef4444' : '#10b981',
        isPnL: true,
    }]
    const stats = [
        {
            label: `USDC\nSpent`,
            value: formatUSD(usdcSpent, 2),
            icon: 'cloud-upload-outline',
            color: '#6366f1',
        },
        {
            label: `USDC\nReceived`,
            icon: 'cloud-download-outline',
            value: formatUSD(usdcReceived, 3),
            color: '#8b5cf6',
        },
        {
            label: `Total\nTrades`,
            value: tradeCount.toString(),
            icon: 'swap-horizontal-outline',
            color: '#ec4899',
        },
        {
            label: `Total\nPositions`,
            value: positionCount.toString(),
            icon: 'folder-open-outline',
            color: '#f59e0b',
        },
    ];

    return (
        <View style={styles.wrapper}>
            <Text style={styles.heading}>PnL Overview</Text>
            <View style={styles.container}>
                {topStats.map((stat, index) => (
                    <View key={index} style={[styles.topCard, stat.isPnL && isLoss ? styles.lossCard : styles.profitCard]}>
                        <View>
                            <Text style={styles.topCardlabel}>{stat.label}</Text>
                            <Text style={[styles.value, stat.isPnL && isLoss ? styles.lossValue : styles.valueText]}>
                                {pnlLoading ? '...' : stat.value}
                            </Text>
                        </View>
                        <View style={[styles.iconBox, { backgroundColor: `${stat.color}20`, marginBottom: 2 }]}>
                            <Icon name={stat.icon} size={24} color={stat.color} type={"ionicon"} />
                        </View>
                    </View>
                ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
                <View style={styles.container}>
                    {stats.map((stat, index) => (
                        <View key={index} style={[styles.card, stat.isPnL && isLoss && styles.lossCard]}>
                            <View style={styles.iconCon}>
                                <View style={[styles.iconBox, { backgroundColor: `${stat.color}20` }]}>
                                    <Icon name={stat.icon} size={20} color={stat.color} type={"ionicon"} />
                                </View>
                                <Text style={styles.label}>{stat.label}</Text>
                            </View>
                            <Text style={[styles.value, stat.isPnL && isLoss ? styles.lossValue : styles.valueText]}>
                                {pnlLoading ? '...' : stat.value}
                            </Text>
                        </View>
                    ))}
                </View>
            </ScrollView>

            <View style={styles.timelineContainer}>
                {TIMELINES.map((item) => {
                    const isActive = selectedTimeline === item.value;
                    return (
                        <TouchableOpacity
                            key={item.value}
                            onPress={() => handleTimelineChange(item.value)}
                            style={[styles.timelineBtn, isActive && styles.timelineBtnActive]}
                        >
                            <Text style={[styles.timelineText, isActive && styles.timelineTextActive]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

export default PnlOverView;