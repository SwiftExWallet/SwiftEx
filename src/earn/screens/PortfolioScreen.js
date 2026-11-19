import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Card, ChipGroup, SectionHeader, TokenIcon, Badge} from '../components/ui';
import AreaChart from '../components/AreaChart';
import AccountBar from '../components/AccountBar';
import BottomNav from '../components/BottomNav';
import {account, holdings, openOrders, analysis} from '../mockData';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useVaultColors, makeStyles, spacing, font, radius} from '../theme';
import {fmt, usd, signedUsd, pct} from '../utils';

export default function PortfolioScreen({navigation, onTabChange}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('USD');
  const [hidden, setHidden] = useState(false);
  const up = account.pnlToday >= 0;
  const pnlColor = up ? colors.success : colors.danger;

  const ACTIONS = [
    {icon: 'arrow-down-circle-outline', label: 'Deposit'},
    {icon: 'arrow-up-circle-outline', label: 'Withdraw'},
    {icon: 'swap-horizontal-outline', label: 'Transfer'},
    {icon: 'layers-outline', label: 'Earn', onPress: () => navigation.navigate('EarnHome')},
    {icon: 'time-outline', label: 'History', onPress: () => navigation.navigate('TradeHistory')},
    {icon: 'analytics-outline', label: 'Positions', onPress: () => navigation.navigate('PositionsList')},
    {icon: 'repeat-outline', label: 'Convert'},
    {icon: 'grid-outline', label: 'More'},
  ];

  const onTab = key => {
    if (onTabChange) return onTabChange(key);
    if (key === 'earn') navigation.navigate('EarnHome');
  };

  return (
    <View style={[styles.safe, {paddingTop: insets.top}]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
      <AccountBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.balTop}>
          <TouchableOpacity style={styles.inline} onPress={() => setHidden(h => !h)}>
            <Text style={styles.label}>Total value ({mode})</Text>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={14} color={colors.textMuted} style={styles.ml4} />
          </TouchableOpacity>
          <ChipGroup options={['USD', 'BTC']} value={mode} onChange={setMode} style={styles.modeChips} />
        </View>
        <Text style={styles.total}>
          {hidden ? '••••••' : mode === 'USD' ? usd(account.total) : `${(account.total / 67250).toFixed(5)} BTC`}
        </Text>
        <View style={styles.inline}>
          <Badge label={pct(account.pnlPct)} tone={up ? 'green' : 'red'} icon={up ? 'caret-up' : 'caret-down'} />
          <Text style={[styles.pnl, {color: pnlColor}]}>{signedUsd(account.pnlToday)} today</Text>
        </View>

        <View style={styles.statRow}>
          <Stat label="Available" value={usd(account.available)} />
          <Stat label="In orders" value={usd(account.inOrders)} />
          <Stat label="Unrealized PnL" value={signedUsd(account.unrealized)} color={pnlColor} />
        </View>

        <Card style={styles.chartCard}>
          <View style={styles.chartHead}>
            <Text style={styles.cardTitle}>PnL (7D)</Text>
            <Text style={[styles.pnl, {color: pnlColor}]}>{signedUsd(-75.64)}</Text>
          </View>
          <AreaChart data={account.pnlHistory} height={120} color={colors.danger} style={styles.mt12} />
        </Card>

        <View style={styles.actions}>
          {ACTIONS.map(a => (
            <TouchableOpacity key={a.label} style={styles.action} onPress={a.onPress} activeOpacity={0.75}>
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon} size={20} color={colors.text} />
              </View>
              <Text style={styles.actionText}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHeader title="Open orders" actionLabel="View all" onAction={() => navigation.navigate('TradeHistory')} />
        <Card style={styles.listCard}>
          {openOrders.map((o, i) => (
            <View key={o.id} style={[styles.listRow, i > 0 && styles.divTop]}>
              <View style={styles.flex}>
                <View style={styles.inline}>
                  <Text style={styles.title}>{o.pair}</Text>
                  <Badge label={`${o.type} ${o.side}`} tone={o.side === 'Buy' ? 'green' : 'red'} style={styles.ml6} />
                </View>
                <Text style={styles.sub}>{o.time}</Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.title}>{fmt(o.price)}</Text>
                <Text style={styles.sub}>
                  {o.qty} · {o.filled}% filled
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionHeader title="Holdings" actionLabel="Manage" onAction={() => {}} />
        <Card style={styles.listCard}>
          {holdings.map((h, i) => (
            <View key={h.symbol} style={[styles.listRow, i > 0 && styles.divTop]}>
              <TokenIcon symbol={h.symbol} size={32} />
              <View style={[styles.flex, styles.ml10]}>
                <Text style={styles.title}>{h.symbol}</Text>
                <Text style={styles.sub}>
                  {h.qty} {h.symbol}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.title}>{usd(h.value)}</Text>
                <Text style={[styles.sub, {color: h.change >= 0 ? colors.success : colors.danger}]}>{pct(h.change)}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionHeader title="Portfolio analysis" actionLabel="30D" onAction={() => {}} />
        <View style={styles.grid}>
          {analysis.map(a => (
            <View key={a.label} style={styles.gridItem}>
              <Text style={styles.sub}>{a.label}</Text>
              <Text
                style={[
                  styles.gridValue,
                  a.tone === 'up' && {color: colors.success},
                  a.tone === 'down' && {color: colors.danger},
                ]}>
                {a.value}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <BottomNav active="portfolio" onChange={onTab} />
    </View>
  );
}

const Stat = ({label, value, color}) => {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.sub}>{label}</Text>
      <Text style={[styles.statValue, color && {color}]}>{value}</Text>
    </View>
  );
};

const useStyles = makeStyles(colors => ({
  safe: {flex: 1, backgroundColor: colors.bg},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  flex: {flex: 1},
  inline: {flexDirection: 'row', alignItems: 'center'},
  right: {alignItems: 'flex-end'},
  ml4: {marginLeft: 4},
  ml6: {marginLeft: 6},
  ml10: {marginLeft: 10},
  mt12: {marginTop: 12},
  balTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm},
  modeChips: {width: 110},
  label: {color: colors.textSecondary, fontSize: font.sm},
  total: {color: colors.text, fontSize: font.display, fontWeight: '800', marginVertical: 6, letterSpacing: -0.5},
  pnl: {fontSize: font.sm, fontWeight: '600', marginLeft: 8},
  statRow: {flexDirection: 'row', marginTop: spacing.lg, marginHorizontal: -4},
  stat: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statValue: {color: colors.text, fontSize: font.sm, fontWeight: '700', marginTop: 4},
  chartCard: {marginTop: spacing.md},
  chartHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {color: colors.text, fontSize: font.sm, fontWeight: '600'},
  actions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, marginHorizontal: -4},
  action: {width: '25%', alignItems: 'center', paddingVertical: 10},
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionText: {color: colors.textSecondary, fontSize: font.xs, marginTop: 6},
  listCard: {paddingVertical: 4},
  listRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12},
  divTop: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
  title: {color: colors.text, fontSize: font.sm, fontWeight: '600'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4},
  gridItem: {
    width: '31.3%',
    margin: '1%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  gridValue: {color: colors.text, fontSize: font.md, fontWeight: '700', marginTop: 4},
}));
