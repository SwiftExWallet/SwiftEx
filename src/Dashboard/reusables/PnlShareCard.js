import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import darkBlue from "../../../assets/Dark-Blue.png";

const CHART_WIDTH = 350;
const CHART_HEIGHT = 140;

function getPath(dataPoints) {
  const stepX = CHART_WIDTH / (dataPoints.length - 1);
  let path = '';
  dataPoints.forEach((point, i) => {
    const x = i * stepX;
    const y = CHART_HEIGHT - point * CHART_HEIGHT;
    path += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  });
  return path;
}

function getAreaPath(dataPoints) {
  const linePath = getPath(dataPoints);
  return `${linePath} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`;
}

const PnlShareCard = forwardRef(function PnlShareCard(
  {
    brandName = 'SwiftEx Wallet',
    days = 30,
    totalPnlPercent = 0,
    totalPnlDollar = '0.00',
    winRate = 0,
    trades = 0,
    bestTrade = 0,
    dataPoints = [0.05, 0.15, 0.08, 0.35, 0.28, 0.55, 0.45, 0.65, 0.6, 0.85, 0.95],
    website = 'swiftexwallet.com',
    hideTotal
  },
  ref
) {
  const viewShotRef = useRef();

  useImperativeHandle(ref, () => ({
    share: async () => {
      try {
        const uri = await viewShotRef.current.capture();
        await Share.open({
          url: uri,
          type: 'image/png',
          failOnCancel: false,
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    },
  }));

  const isPositive = totalPnlPercent >= 0;
  const themeColor = isPositive ? '#34d399' : '#f87171';

  const lastX = CHART_WIDTH;
  const lastY = CHART_HEIGHT - dataPoints[dataPoints.length - 1] * CHART_HEIGHT;

  const formatPercent = (val) => `${val >= 0 ? '+' : ''}${Number(val).toFixed(1)}%`;

  return (
    <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
      <LinearGradient
        colors={['#0d0b1f', '#171335', '#0d0b1f']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={styles.card}
      >

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={darkBlue}
              style={styles.logoCircle}
            />
            <View style={{ marginLeft: -5 }}>
              <Text style={styles.brandName}>{brandName}</Text>
              <Text style={styles.brandSubtitle}>P&L REPORT</Text>
            </View>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{days}</Text>
          </View>
        </View>

        <Text style={styles.label}>TOTAL P&L</Text>
        <Text style={[styles.bigPercent, { color: themeColor }]}>
          {formatPercent(totalPnlPercent)}
        </Text>
        {!hideTotal&&
        <Text style={[styles.dollarAmount, { color: themeColor }]}>
          {totalPnlPercent >= 0 ? '+' : '-'}{totalPnlDollar}
        </Text>}

        <View style={styles.chartWrapper}>
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 10}>
            <Defs>
              <SvgGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={themeColor} stopOpacity="0.4" />
                <Stop offset="1" stopColor={themeColor} stopOpacity="0" />
              </SvgGradient>
            </Defs>
            <Path d={getAreaPath(dataPoints)} fill="url(#areaFill)" />
            <Path
              d={getPath(dataPoints)}
              fill="none"
              stroke={themeColor}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Circle cx={lastX - 3} cy={lastY} r="6" fill={themeColor} />
          </Svg>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Win rate</Text>
            <Text style={styles.statValue}>{winRate}%</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Trades</Text>
            <Text style={styles.statValue}>{trades}</Text>
          </View>
          <View style={[styles.statBox, { marginRight: 0 }]}>
            <Text style={styles.statLabel}>Best trade</Text>
            <Text style={[styles.statValue, { color: '#34d399' }]}>
              {formatPercent(bestTrade)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLink}>{website}</Text>
          <Text style={styles.footerNote}>Tracked with FIFO cost basis</Text>
        </View>
      </LinearGradient>
    </ViewShot>
  );
});

export default PnlShareCard;

const styles = StyleSheet.create({
  card: {
    width: 380,
    borderRadius: 28,
    padding: 24,
    alignSelf: 'center'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  logoCircle: {
    width: 73,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  brandName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold'
  },
  brandSubtitle: {
    color: '#8b8ba7',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  pillText: {
    color: '#c7c7e0',
    fontSize: 13
  },
  label: {
    color: '#8b8ba7',
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 8
  },
  bigPercent: {
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 68
  },
  dollarAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 20
  },
  chartWrapper: {
    marginBottom: 24
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    marginRight: 8
  },
  statLabel: {
    color: '#8b8ba7',
    fontSize: 13,
    marginBottom: 6
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)'
  },
  footerLink: {
    color: '#7ec8ff',
    fontSize: 13
  },
  footerNote: {
    color: '#6b6b85',
    fontSize: 12
  },
});