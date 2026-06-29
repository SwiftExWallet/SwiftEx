import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import Modal from 'react-native-modal';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '../../icon';
import { FOLIO_BASE_ROUTE } from '../exchange/crypto-exchange-front-end-main/src/ExchangeConstants';
import apiHelper from '../exchange/crypto-exchange-front-end-main/src/apiHelper';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { colors } from '../../Screens/ThemeColorsConfig';
import { buildXlsxZip } from '../../utilities/PnlGenrate';
import CustomInfoProvider from '../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';

const TIMELINES = [
    { label: '1 Week', value: '1week' },
    { label: '1 Month', value: '1month' },
    { label: '2 Month', value: '2month' },
    { label: '3 Month', value: '3month' },
];

const getRawDateRange = (timeline) => {
    const to = new Date();
    const from = new Date();
    switch (timeline) {
        case '1week': from.setDate(to.getDate() - 7); break;
        case '1month': from.setMonth(to.getMonth() - 1); break;
        case '2month': from.setMonth(to.getMonth() - 2); break;
        case '3month': from.setMonth(to.getMonth() - 3); break;
        default: break;
    }
    return { from, to };
};

const getDateRange = (timeline) => {
    const { from, to } = getRawDateRange(timeline);
    const fmt = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };
    return { from: fmt(from), to: fmt(to) };
};

const formatDateString = (d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
};

const PnlOverView = ({ refresh = false, stellarKey, activeTheme }) => {
    const theme = activeTheme ? colors.dark : colors.light;

    const [pnlInfo, setPnlInfo] = useState(null);
    const [pnlLoading, setPnlLoading] = useState(false);
    const [selectedTimeline, setSelectedTimeline] = useState('1week');
    const [isSheetVisible, setIsSheetVisible] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Default dates managed by selected timeline initially
    const [fromDate, setFromDate] = useState(() => getRawDateRange('1week').from);
    const [toDate, setToDate] = useState(() => getRawDateRange('1week').to);

    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    // Jab bhi user screen par timeline badlega, calendar ki dates automatic us timeline ke hisab se set ho jayengi
    useEffect(() => {
        const { from, to } = getRawDateRange(selectedTimeline);
        setFromDate(from);
        setToDate(to);
    }, [selectedTimeline]);

    const validateDateRange = () => {
        const maxLimitDate = new Date(fromDate);
        maxLimitDate.setMonth(maxLimitDate.getMonth() + 3);
        return toDate <= maxLimitDate;
    };

    const isValidRange = validateDateRange();

    const getPnl = async (timeline, isActiveSignal = { current: true }) => {
        if (!stellarKey) return;
        setPnlLoading(true);
        const { from, to } = getDateRange(timeline);

        try {
            const result = await apiHelper.get(`${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${from}&to=${to}&nocache=true&summary=true`);
            const excleData = await apiHelper.get(`${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${from}&to=${to}&nocache=true&summary=false&excel=true`);

            if (!isActiveSignal.current) return;
            if (result.success) {
                setPnlInfo({
                    address: excleData.data?.address || result.data?.address,
                    rawCount: result.data?.rawCount,
                    collapsedCount: result.data?.collapsedCount,
                    skippedCount: result.data?.skippedCount,
                    noPriceCount: result.data?.noPriceCount,
                    unpricedAssets: excleData.data?.unpricedAssets || [],
                    scamCount: result.data?.scamCount,
                    possiblyScam: excleData.data?.possiblyScam,
                    costBasisWarning: excleData.data?.costBasisWarning,
                    usdcSpent: result.data?.usdcSpent,
                    usdcReceived: result.data?.usdcReceived,
                    netUSDCFlow: result.data?.netUSDCFlow,
                    totalRealized: result.data?.totalRealized,
                    totalUnrealized: result.data?.totalUnrealized,
                    totalPnL: result.data?.totalPnL,
                    winRate: result.data?.winRate,
                    bestTrade: result.data?.bestTrade,
                    worstTrade: result.data?.worstTrade,
                    firstTradeDate: result.data?.firstTradeDate,
                    lastTradeDate: result.data?.lastTradeDate,
                    activeDays: result.data?.activeDays,
                    mostTradedAsset: result.data?.mostTradedAsset,
                    totalPortfolioValue: result.data?.totalPortfolioValue,
                    totalCostBasis: result.data?.totalCostBasis,
                    openPnLPct: result.data?.openPnLPct,
                    largestPosition: result.data?.largestPosition,
                    tradeCount: result.data?.tradeCount,
                    positionCount: result.data?.positionCount,
                    disposals: result.data?.disposals,
                    positions: result.data?.positions,
                    trades: result.data?.trade
                });
            } else {
                setPnlInfo(null);
            }
        } catch (error) {
            console.error("Network crash in getPnl:", error);
            CustomInfoProvider.show("error","error getPnl:", error)
        } finally {
            if (isActiveSignal.current) setPnlLoading(false);
        }
    };

    useEffect(() => {
        const isActiveSignal = { current: true };
        getPnl(selectedTimeline, isActiveSignal);
        return () => { isActiveSignal.current = false; };
    }, [refresh, selectedTimeline, stellarKey]);

    const handleDownloadExecute = async () => {
        if (!isValidRange) return;
        setIsDownloading(true);

        const fromStr = formatDateString(fromDate);
        const toStr = formatDateString(toDate);

        try {
            const excleData = await apiHelper.get(`${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${fromStr}&to=${toStr}&nocache=true&summary=false&excel=true`);
            if (excleData?.success) {
                if(!excleData.data){
                    Alert.alert("!Oops","There are no records available for the chosen time range.")
                }else{
                    await buildXlsxZip(excleData.data,fromStr+"->"+toStr);
                }
            }
        } catch (err) {
            console.error("Download custom calendar fetch failed:", err);
        }

        setIsDownloading(false);
        setIsSheetVisible(false);
    };

    const usdcSpent = pnlInfo?.usdcSpent ?? 0;
    const usdcReceived = pnlInfo?.usdcReceived ?? 0;
    const tradeCount = pnlInfo?.tradeCount ?? 0;
    const positionCount = pnlInfo?.positionCount ?? 0;
    const totalPnL = pnlInfo?.totalPnL ?? 0;
    const netUSDCFlow = pnlInfo?.netUSDCFlow ?? 0;
    const totalRealized = pnlInfo?.totalRealized ?? 0;
    const totalUnrealized = pnlInfo?.totalUnrealized ?? 0;

    const formatUSD = (val, decimals = 2) => `$${val.toFixed(decimals)}`;
    const isLoss = totalPnL < 0;

    const topStats = [{
        label: 'Total P&L',
        value: formatUSD(totalPnL, 3),
        icon: isLoss ? 'trending-down-outline' : 'trending-up-outline',
        color: isLoss ? '#ef4444' : '#10b981',
        isPnL: true,
    }];

    const stats = [
        { label: `USDC\nSpent`, value: formatUSD(usdcSpent, 2), icon: 'cloud-upload-outline', color: '#6366f1' },
        { label: `USDC\nReceived`, icon: 'cloud-download-outline', value: formatUSD(usdcReceived, 3), color: '#8b5cf6' },
        { label: `Total\nTrades`, value: tradeCount.toString(), icon: 'swap-horizontal-outline', color: '#ec4899' },
        { label: `Total\nPositions`, value: positionCount.toString(), icon: 'folder-open-outline', color: '#f59e0b' },
        { label: `Net USDC\nFlow`, value: netUSDCFlow.toString(), icon: 'git-compare-outline', color: '#06b6d4' },
        { label: `Total\nRealized`, value: totalRealized.toString(), icon: 'cash-outline', color: '#10b981' },
        { label: `Total\nUnrealized`, value: totalUnrealized.toString(), icon: 'trending-up-outline', color: '#3b82f6' },
    ];

    return (
        <View style={[styles.wrapper, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[styles.heading, { color: theme.headingTx }]}>PnL Overview</Text>
                <TouchableOpacity
                    style={[styles.downloadBtn, { backgroundColor: theme.smallCardBg, borderColor: theme.smallCardBorderColor }]}
                    disabled={pnlInfo === null || pnlLoading}
                    onPress={() => setIsSheetVisible(true)}
                >
                    <Text style={styles.timelineTextActive}>Download</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.container}>
                {topStats.map((stat, index) => (
                    <View key={index} style={[styles.topCard, { backgroundColor: theme.bg, borderColor: theme.smallCardBorderColor }, stat.isPnL && isLoss ? styles.lossCard : styles.profitCard]}>
                        <View>
                            <Text style={[styles.topCardlabel, { color: theme.headingTx }]}>{stat.label}</Text>
                            <Text style={[styles.value, stat.isPnL && isLoss ? styles.lossValue : { color: theme.inactiveTx }]}>
                                {pnlLoading ? '...' : stat.value}
                            </Text>
                        </View>
                        <View style={[styles.iconBox, { backgroundColor: `${stat.color}20`, marginBottom: 2 }]}>
                            <Icon name={stat.icon} size={24} color={stat.color} type={"ionicon"} />
                        </View>
                    </View>
                ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: theme.cardBg }}>
                <View style={styles.container}>
                    {stats.map((stat, index) => (
                        <View key={index} style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.smallCardBorderColor }, stat.isPnL && isLoss && styles.lossCard]}>
                            <View style={styles.iconCon}>
                                <View style={[styles.iconBox, { backgroundColor: `${stat.color}20` }]}>
                                    <Icon name={stat.icon} size={16} color={stat.color} type={"ionicon"} />
                                </View>
                                <Text style={[styles.label, { color: theme.headingTx }]}>{stat.label}</Text>
                            </View>
                            <Text style={[styles.value, { color: theme.inactiveTx }]} numberOfLines={1}>
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
                            onPress={() => setSelectedTimeline(item.value)}
                            style={[styles.timelineBtn, { backgroundColor: theme.smallCardBg, borderColor: theme.smallCardBorderColor }, isActive && styles.timelineBtnActive]}
                        >
                            <Text style={[styles.timelineText, { color: theme.inactiveTx }, isActive && styles.timelineTextActive]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <View style={styles.warningCon}>
                <Icon name="alert-circle-outline" size={20} color={"#ed920aff"} type="ionicon" />
                <Text style={styles.warningTxt}><Text style={{ fontSize: 14, fontWeight: "600" }}>Cost Basis Warning:</Text> Some asset prices were estimated or missing.</Text>
            </View>

            <Modal
                isVisible={isSheetVisible}
                onBackdropPress={() => !isDownloading && setIsSheetVisible(false)}
                onBackButtonPress={() => !isDownloading && setIsSheetVisible(false)}
                style={styles.modalStructure}
                backdropOpacity={0.5}
                useNativeDriverForBackdrop
            >
                <View style={[styles.sheetContent, { backgroundColor: theme.bg }]}>
                    <View style={styles.dragHandle} />
                    <Text style={[styles.sheetTitle, { color: theme.headingTx }]}>Export Custom Range</Text>

                    <Text style={{ color: isValidRange ? theme.inactiveTx : '#ef4444', fontSize: 12, marginBottom: hp(2.5), textAlign: 'center', fontWeight: isValidRange ? '400' : '600' }}>
                        {isValidRange ? "Select an exact period. Maximum statements up to 3 months supported." : "⚠️ Error: Selected window exceeds the 3-month limit!"}
                    </Text>

                    <View style={styles.calendarInputContainer}>
                        <TouchableOpacity style={[styles.dateInputBox, { backgroundColor: theme.smallCardBg, borderColor: theme.smallCardBorderColor }]} onPress={() => setShowFromPicker(true)}>
                            <Text style={styles.inputBoxSub}>From Date</Text>
                            <Text style={[styles.dateValueText, { color: theme.headingTx }]}>{fromDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>

                        <Icon name="arrow-forward-outline" size={20} color={theme.inactiveTx} type="ionicon" style={{ alignSelf: 'center' }} />

                        <TouchableOpacity style={[styles.dateInputBox, { backgroundColor: theme.smallCardBg, borderColor: theme.smallCardBorderColor }]} onPress={() => setShowToPicker(true)}>
                            <Text style={styles.inputBoxSub}>To Date</Text>
                            <Text style={[styles.dateValueText, { color: theme.headingTx }]}>{toDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    </View>

                    {showFromPicker && (
                        <DateTimePicker
                            value={fromDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                                setShowFromPicker(Platform.OS === 'ios');
                                if (selectedDate) setFromDate(selectedDate);
                            }}
                        />
                    )}

                    {showToPicker && (
                        <DateTimePicker
                            value={toDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            minimumDate={fromDate}
                            onChange={(event, selectedDate) => {
                                setShowToPicker(Platform.OS === 'ios');
                                if (selectedDate) setToDate(selectedDate);
                            }}
                        />
                    )}

                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: isValidRange ? '#4052D6' : 'rgba(100,100,100,0.4)' }]}
                        onPress={handleDownloadExecute}
                        disabled={isDownloading || !isValidRange}
                    >
                        {isDownloading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.actionBtnText}>Generate Custom Statement</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </Modal>
            <View style={styles.betaTagCon}>
                <Text style={styles.betaTagTxt}>BETA</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        marginHorizontal: wp(2.6),
        marginTop: hp(1),
        borderWidth: 1,
        borderRadius: 20,
        paddingVertical: hp(2),
        paddingHorizontal: wp(2.5)
    },
    heading: {
        marginTop:hp(0.7),
        fontSize: 16,
        fontWeight: "600"
    },
    container: {
        flexDirection: 'row',
        paddingVertical: hp(1),
        paddingHorizontal: 0.5,
        gap: 12
    },
    card: {
        width: wp(26),
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 16,
        borderWidth: 1
    },
    iconCon: {
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: 'center'
    },
    topCard: {
        width: wp(89),
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: hp(-0.8)
    },
    topCardlabel: {
        fontSize: 11,
        marginBottom: 2,
        fontWeight: "900"
    },
    lossCard: {
        borderColor: 'rgba(235, 59,59,0.3)',
        backgroundColor: 'rgba(222, 57,57,0.05) '
    },
    profitCard: {
        borderColor: 'rgba(45, 238,67,0.3) ',
        backgroundColor: 'rgba(57, 222,74,0.05) '
    },
    iconBox: {
        width: 30,
        height: 30,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10
    },
    label: {
        fontSize: 11,
        marginBottom: 10,
        fontWeight: "600",
        marginLeft: wp(1.3)
    },
    value: {
        fontSize: 15,
        fontWeight: '700',
        alignSelf: "center"
    },
    lossValue: {
        color: '#f06262ff',
        fontSize: 16
    },
    timelineContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 1,
        gap: 9
    },
    timelineBtn: {
        flex: 1,
        paddingVertical: 7,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1
    },
    timelineBtnActive: {
        backgroundColor: 'rgba(86, 88,233,0.2) ',
        borderColor: '#4052D6'
    },
    timelineText: {
        fontSize: 12,
        fontWeight: '500'
    },
    timelineTextActive: {
        color: '#4052D6',
        fontWeight: '700'
    },
    downloadBtn: {
        width: wp(20),
        paddingVertical: 7,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1
    },
    modalStructure: {
        justifyContent: 'flex-end',
        margin: 0
    },
    sheetContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: wp(5),
        paddingBottom: hp(4),
        paddingTop: hp(1.5),
        alignItems: 'center'
    },
    dragHandle: {
        width: wp(12),
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(150,150,150,0.4)',
        marginBottom: hp(2)
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: hp(0.5)
    },
    calendarInputContainer: {
        flexDirection: 'row',
        width: '100%',
        gap: 10,
        marginBottom: hp(4),
        justifyContent: 'space-between'
    },
    dateInputBox: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1
    },
    inputBoxSub: {
        fontSize: 11,
        color: '#8e8e93',
        marginBottom: 4,
        fontWeight: '500'
    },
    dateValueText: {
        fontSize: 14,
        fontWeight: '600'
    },
    actionBtn: {
        width: '100%',
        paddingVertical: hp(1.8),
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center'
    },
    actionBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600'
    },
    betaTagCon: {
        backgroundColor: '#e6eef5ff',
        borderColor: '#a2afc4ff',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        alignSelf: 'flex-start',
        justifyContent: 'center',
        alignItems: 'center',
        position:"absolute",
        marginTop:hp(-0.8)
    },
    betaTagTxt: {
        color: '#333d50ff',
        fontSize: 11,
        fontWeight: '700'
    },
    warningCon:{
        marginTop:hp(1.4),
        marginBottom:hp(-0.4),
        paddingVertical:hp(1),
        paddingHorizontal:wp(3),
        backgroundColor:"#fe980035",
        borderRadius:10,
        flexDirection:"row",
        alignItems:"flex-start"
    },
    warningTxt:{
        fontSize:14,
        fontWeight:"300",
        color:"#ed920aff",
        textAlign:"left",
        marginLeft:4
    }
});
export default React.memo(PnlOverView);