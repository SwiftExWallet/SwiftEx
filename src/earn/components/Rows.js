import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Card, TokenIcon, Badge, IconCircle} from './ui';
import {useVaultColors, makeStyles, spacing, font} from '../theme';
import {fmt, compactUsd, signed, pct} from '../utils';

export function VaultRow({vault, onPress, style}) {
  const styles = useStyles();
  return (
    <Card onPress={onPress} style={[styles.row, style]}>
      <TokenIcon symbol={vault.symbol} name={vault.name} />
      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={1}>
          {vault.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          TVL {compactUsd(vault.tvl)} · {vault.protocol}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.apy}>{vault.apy.toFixed(2)}%</Text>
        <Badge label={vault.poolLabel} tone="primary" style={styles.mt4} />
      </View>
    </Card>
  );
}

export function PositionRow({position, vault, onPress, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const value = position.value;
  const p = position.principal ? (position.earnings / position.principal) * 100 : 0;
  return (
    <Card onPress={onPress} style={[styles.posCard, style]}>
      <View style={styles.rowInner}>
        <TokenIcon symbol={vault.symbol} name={vault.name} />
        <View style={styles.mid}>
          <Text style={styles.title}>{vault.symbol}</Text>
          <Text style={styles.sub}>{vault.name}</Text>
        </View>
        <Badge label="Active" tone="green" icon="ellipse" />
      </View>
      <View style={styles.statsRow}>
        <Stat label="Value" value={`${fmt(value)} ${vault.symbol}`} />
        <Stat label="APY" value={`${vault.apy.toFixed(2)}%`} color={colors.success} />
        <Stat label="Earned" value={`${signed(position.earnings)} (${pct(p, 1)})`} color={colors.success} />
      </View>
    </Card>
  );
}

const Stat = ({label, value, color}) => {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && {color}]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
};

const getAct = colors => ({
  deposit: {icon: 'arrow-down', color: colors.success, bg: colors.successSoft, label: 'Deposit'},
  withdraw: {icon: 'arrow-up', color: colors.danger, bg: colors.dangerSoft, label: 'Withdraw'},
  reward: {icon: 'gift-outline', color: colors.accentText, bg: colors.primarySoft, label: 'Reward'},
});

export function ActivityRow({item, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const ACT = getAct(colors);
  const a = ACT[item.type] || ACT.deposit;
  const plus = item.type !== 'withdraw';
  return (
    <View style={[styles.actRow, style]}>
      <IconCircle name={a.icon} color={a.color} bg={a.bg} size={34} iconSize={16} />
      <View style={styles.mid}>
        <View style={styles.inline}>
          <Text style={styles.title}>
            {a.label} {item.symbol}
          </Text>
          <Badge label={item.status} tone="green" style={styles.ml6} />
        </View>
        <Text style={styles.sub}>{item.date}</Text>
      </View>
      <Text style={[styles.amount, {color: plus ? colors.success : colors.text}]}>
        {plus ? '+' : '-'}
        {fmt(item.amount, item.amount < 1 ? 4 : 2)} {item.symbol}
      </Text>
    </View>
  );
}

export function ListChevron() {
  const colors = useVaultColors();
  return <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />;
}

const useStyles = makeStyles(colors => ({
  row: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, paddingVertical: 14},
  rowInner: {flexDirection: 'row', alignItems: 'center'},
  posCard: {marginBottom: spacing.sm},
  mid: {flex: 1, marginHorizontal: spacing.md},
  right: {alignItems: 'flex-end'},
  title: {color: colors.text, fontSize: font.md, fontWeight: '600'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  apy: {color: colors.success, fontSize: font.md, fontWeight: '700'},
  mt4: {marginTop: 4},
  ml6: {marginLeft: 6},
  statsRow: {flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
  stat: {flex: 1},
  statLabel: {color: colors.textMuted, fontSize: font.xs},
  statValue: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginTop: 3},
  actRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10},
  inline: {flexDirection: 'row', alignItems: 'center'},
  amount: {fontSize: font.sm, fontWeight: '600'},
}));
