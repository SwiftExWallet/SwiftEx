import React, { useState, useEffect, useRef } from 'react';
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
import PnlShareCard from './PnlShareCard';

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

const formatUSD = (val, decimals = 2) => {
    const num = Number(val) || 0;
    const sign = num < 0 ? '-' : '';
    return `${sign}$${Math.abs(num).toFixed(decimals)}`;
};

const inFlightRequests = new Map();

const dedupedGet = (url) => {
    if (inFlightRequests.has(url)) {
        return inFlightRequests.get(url);
    }

    const promise = apiHelper.get(url)
        .finally(() => {
            inFlightRequests.delete(url);
        });

    inFlightRequests.set(url, promise);
    return promise;
};

const PnlOverView = ({ refresh = false, stellarKey, activeTheme, onSummaryUpdate, selectedTimeline }) => {
    const pnlCardRef = useRef();
    const lastFetchKey = useRef(null);
    const [hideTotalPnL,setHideTotalPnL]=useState(false);
    const [isPnlVisible, setIsPnlVisible] = useState(false);
    const theme = activeTheme ? colors.dark : colors.light;
    const [pnlInfo, setPnlInfo] = useState(null);
    const [pnlLoading, setPnlLoading] = useState(false);
    const [isSheetVisible, setIsSheetVisible] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [fromDate, setFromDate] = useState(() => getRawDateRange('1week').from);
    const [toDate, setToDate] = useState(() => getRawDateRange('1week').to);
    const [showDownloadFromPicker, setShowDownloadFromPicker] = useState(false);
    const [showDownloadToPicker, setShowDownloadToPicker] = useState(false);
    const [showShareFromPicker, setShowShareFromPicker] = useState(false);
    const [showShareToPicker, setShowShareToPicker] = useState(false);

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

        const summaryUrl = `${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${from}&to=${to}&nocache=true&summary=true`;
        const excelUrl = `${FOLIO_BASE_ROUTE}/pnl?address=${stellarKey}&from=${from}&to=${to}&nocache=true&summary=false&excel=true`;

        try {
            const result = await dedupedGet(summaryUrl);
            const excleData = await dedupedGet(excelUrl);

            if (!isActiveSignal.current) return;
            if (result.success) {
                const summary = {
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
                };
                setPnlInfo(summary);
                onSummaryUpdate?.(summary);
            } else {
                setPnlInfo(null);
                onSummaryUpdate?.(null);
            }
        } catch (error) {
            console.error("Network crash in getPnl:", error);
            CustomInfoProvider.show("error","error getPnl:", error)
        } finally {
            if (isActiveSignal.current) setPnlLoading(false);
        }
    };

    useEffect(() => {
        if (!stellarKey) return;

        const fetchKey = `${stellarKey}-${selectedTimeline}-${refresh}`;
        if (lastFetchKey.current === fetchKey) return;
        lastFetchKey.current = fetchKey;

        setHideTotalPnL(false);
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

    const tradeCount = pnlInfo?.tradeCount ?? 0;
    const totalPnL = pnlInfo?.totalPnL ?? 0;

    return (
        <View >

                <View style={{flexDirection:"row",alignSelf:"flex-end"}}>
                    <TouchableOpacity
                        style={[styles.downloadBtn, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor, marginRight: wp(3) }]}
                        disabled={pnlInfo === null || pnlLoading}
                        onPress={() => {setIsPnlVisible(true)}}
                    >
                        <Text style={styles.timelineTextActive}>Share </Text>
                        <Icon name={'share-outline'} size={20} color={'#4052D6'} type={'ionicon'} />
                    </TouchableOpacity>

                    {pnlInfo && (
                        <View style={styles.hiddenCardWrapper} pointerEvents="none">
                            <PnlShareCard
                                ref={pnlCardRef}
                                brandName="SwiftEx Wallet"
                                days={selectedTimeline}
                                totalPnlPercent={pnlInfo?.openPnLPct}
                                totalPnlDollar={formatUSD(totalPnL, 3)}
                                winRate={pnlInfo?.winRate}
                                trades={tradeCount}
                                bestTrade={pnlInfo?.bestTrade?.pnl}
                                hideTotal={hideTotalPnL}
                            />
                        </View>
                    )}
                <TouchableOpacity
                    style={[styles.downloadBtn, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}
                    disabled={pnlInfo === null || pnlLoading}
                    onPress={() => setIsSheetVisible(true)}
                >
                    <Text style={styles.timelineTextActive}>Download</Text>
                </TouchableOpacity>

                </View>


           

            <Modal
                isVisible={isSheetVisible}
                onBackdropPress={() => {
                    if (isDownloading) return;
                    setShowDownloadFromPicker(false);
                    setShowDownloadToPicker(false);
                    setIsSheetVisible(false);
                }}
                onBackButtonPress={() => {
                    if (isDownloading) return;
                    setShowDownloadFromPicker(false);
                    setShowDownloadToPicker(false);
                    setIsSheetVisible(false);
                }}
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
                        <TouchableOpacity style={[styles.dateInputBox, { backgroundColor: theme.bg, borderColor: theme.smallCardBorderColor }]} onPress={() => setShowDownloadFromPicker(true)}>
                            <Text style={styles.inputBoxSub}>From Date</Text>
                            <Text style={[styles.dateValueText, { color: theme.headingTx }]}>{fromDate?.toLocaleDateString()}</Text>
                        </TouchableOpacity>

                        <Icon name="arrow-forward-outline" size={20} color={theme.inactiveTx} type="ionicon" style={{ alignSelf: 'center' }} />

                        <TouchableOpacity style={[styles.dateInputBox, { backgroundColor: theme.bg, borderColor: theme.smallCardBorderColor }]} onPress={() => setShowDownloadToPicker(true)}>
                            <Text style={styles.inputBoxSub}>To Date</Text>
                            <Text style={[styles.dateValueText, { color: theme.headingTx }]}>{toDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    </View>

                    {showDownloadFromPicker && (
                        <DateTimePicker
                            value={fromDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                                setShowDownloadFromPicker(Platform.OS === 'ios');
                                if (selectedDate) setFromDate(selectedDate);
                            }}
                        />
                    )}

                    {showDownloadToPicker && (
                        <DateTimePicker
                            value={toDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            minimumDate={fromDate}
                            onChange={(event, selectedDate) => {
                                setShowDownloadToPicker(Platform.OS === 'ios');
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

            <Modal
                isVisible={isPnlVisible}
                onBackdropPress={() => {
                    setShowShareFromPicker(false);
                    setShowShareToPicker(false);
                    setIsPnlVisible(false);
                }}
                onBackButtonPress={() => {
                    setShowShareFromPicker(false);
                    setShowShareToPicker(false);
                    setIsPnlVisible(false);
                }}
                style={styles.modalStructure}
                backdropOpacity={0.5}
                useNativeDriverForBackdrop
            >
                <View style={[styles.sheetContent, { backgroundColor: theme.bg }]}>
                    <View style={styles.dragHandle} />
                    <Text style={[styles.sheetTitle, { color: theme.headingTx }]}>Share</Text>

                    <Text style={{ color: isValidRange ? theme.inactiveTx : '#ef4444', fontSize: 12, marginBottom: hp(2.5), textAlign: 'center', fontWeight: isValidRange ? '400' : '600' }}>
                        {isValidRange ? "Select an exact period. Maximum statements up to 3 months supported." : "⚠️ Error: Selected window exceeds the 3-month limit!"}
                    </Text>

                    <View style={[styles.calendarInputContainer,{ marginBottom: hp(0),}]}>
                        <TouchableOpacity style={[styles.dateInputBox, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]} onPress={() => setShowShareFromPicker(true)}>
                            <Text style={styles.inputBoxSub}>From Date</Text>
                            <Text style={[styles.dateValueText, { color: theme.headingTx }]}>{fromDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>

                        <Icon name="arrow-forward-outline" size={20} color={theme.inactiveTx} type="ionicon" style={{ alignSelf: 'center' }} />

                        <TouchableOpacity style={[styles.dateInputBox, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]} onPress={() => setShowShareToPicker(true)}>
                            <Text style={styles.inputBoxSub}>To Date</Text>
                            <Text style={[styles.dateValueText, { color: theme.headingTx }]}>{toDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    </View>

                    {showShareFromPicker && (
                        <DateTimePicker
                            value={fromDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                                setShowShareFromPicker(Platform.OS === 'ios');
                                if (selectedDate) setFromDate(selectedDate);
                            }}
                        />
                    )}

                    {showShareToPicker && (
                        <DateTimePicker
                            value={toDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            minimumDate={fromDate}
                            onChange={(event, selectedDate) => {
                                setShowShareToPicker(Platform.OS === 'ios');
                                if (selectedDate) setToDate(selectedDate);
                            }}
                        />
                    )}

                    <View style={styles.pnlDisplay}>
                        <Text style={{ color: theme.inactiveTx, fontSize: 16, fontWeight: '400',marginRight:wp(14)}}>
                            Do not display the total P&L amount
                        </Text>
                        <TouchableOpacity
                            onPress={() => setHideTotalPnL(prev => !prev)}
                            style={{
                                width: 44,
                                height: 26,
                                borderRadius: 13,
                                backgroundColor: hideTotalPnL ? 'green' : 'gray',
                                padding: 2,
                                justifyContent: 'center',
                            }}
                        >
                            <View
                                style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 11,
                                    backgroundColor: '#fff',
                                    alignSelf: hideTotalPnL ? 'flex-end' : 'flex-start',
                                }}
                            />
                        </TouchableOpacity>
                    </View>


                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: isValidRange ? '#4052D6' : 'rgba(100,100,100,0.4)' }]}
                        onPress={async () => {
                            try {
                                await pnlCardRef.current?.share();
                            } catch (err) {
                                console.log('Share error:', err);
                            }
                            setTimeout(() => setIsPnlVisible(false), 300);
                        }}
                    >
                            <Text style={styles.actionBtnText}>Share</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    timelineTextActive: {
        color: '#4052D6',
        fontWeight: '700'
    },
    downloadBtn: {
        width: wp(20),
        paddingVertical: 4,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        flexDirection:"row",
        justifyContent:"center",
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
    hiddenCardWrapper: {
        position: 'absolute',
        top: -9999,
        left: -9999,
    },
    pnlDisplay:{
        flexDirection:"row",
        paddingVertical:hp(2)
    },
});
export default React.memo(PnlOverView);