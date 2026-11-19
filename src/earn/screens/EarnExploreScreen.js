import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Card, SectionHeader, Skeleton, SkeletonRows, TokenIcon, Badge} from '../components/ui';
import {useVaultStore, getVault} from '../store';
import {useVaultColors, makeStyles, spacing, font, radius} from '../theme';
import {compactUsd, fmt, signed} from '../utils';

export default function EarnExploreScreen({navigation}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const {positions, vaults, status, refresh} = useVaultStore();
  const loading = status === 'loading';

  const totalTvl = vaults.reduce((s, v) => s + v.tvl, 0);
  const avgApy = vaults.length ? vaults.reduce((s, v) => s + v.apy, 0) / vaults.length : 0;

  return (
    <Screen
      header={
        <Header
          title="Earn"
          onBack={() => navigation.goBack()}
          rightIcon="refresh-outline"
          onRightPress={refresh}
        />
      }>

      <Card style={styles.stats}>
        {loading ? (
          [0, 1, 2].map(i => (
            <View key={i} style={styles.stat}>
              <Skeleton width={50} height={10} />
              <Skeleton width={64} height={14} style={styles.mt6} />
            </View>
          ))
        ) : (
          <>
            <Stat label="Total TVL" value={compactUsd(totalTvl)} />
            <View style={styles.vline} />
            <Stat label="Active pools" value={String(vaults.length)} />
            <View style={styles.vline} />
            <Stat label="Avg. APY" value={`${avgApy.toFixed(2)}%`} color={colors.success} />
          </>
        )}
      </Card>

      <SectionHeader title="Your positions" />
      {loading ? (
        <Card>
          <Skeleton width="50%" height={12} />
          <Skeleton height={40} style={styles.mt12} />
        </Card>
      ) : positions.length ? (
        positions.slice(0, 2).map(p => {
          const v = getVault(p.vaultId);
          return (
            <Card key={p.id} style={styles.posCard} onPress={() => navigation.navigate('Position', {positionId: p.id})}>
              <View style={styles.posRow}>
                <TokenIcon symbol={v.symbol} name={v.name} />
                <View style={styles.posMid}>
                  <Text style={styles.title}>{v.symbol}</Text>
                  <Text style={styles.sub}>{v.name}</Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.title}>
                    {fmt(p.value)} {v.symbol}
                  </Text>
                  <Text style={styles.green}>{signed(p.earnings)} earned</Text>
                </View>
              </View>
              <View style={styles.posFooter}>
                <Mini label="APY" value={`${v.apy.toFixed(2)}%`} color={colors.success} />
                <Mini label="Deposited" value={fmt(p.principal)} />
                <Mini label="Since" value={p.depositedOn} />
              </View>
            </Card>
          );
        })
      ) : (
        <Card style={styles.noPos}>
          <Ionicons name="layers-outline" size={18} color={colors.textMuted} />
          <Text style={styles.noPosText}>You have no active positions yet.</Text>
        </Card>
      )}
      {!loading && positions.length ? (
        <TouchableOpacity
          style={styles.viewAll}
          onPress={() => navigation.navigate('EarnHome', {initialTab: 'positions'})}>
          <Text style={styles.viewAllText}>View all positions</Text>
        </TouchableOpacity>
      ) : null}

      <SectionHeader title="All Earn pools" />
      {loading ? (
        <SkeletonRows count={3} />
      ) : (
        <Card style={styles.listCard}>
          {vaults.map((v, i) => (
            <TouchableOpacity
              key={v.id}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('EarnDetail', {vaultId: v.id})}
              style={[styles.vaultRow, i > 0 && styles.divTop]}>
              <TokenIcon symbol={v.symbol} name={v.name} size={34} />
              <View style={styles.posMid}>
                <View style={styles.inline}>
                  <Text style={styles.title}>{v.symbol}</Text>
                  <Badge label={v.poolLabel} tone="primary" style={styles.ml6} />
                </View>
                <Text style={styles.sub}>
                  {v.name} · TVL {compactUsd(v.tvl)}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.apy}>{v.apy.toFixed(2)}%</Text>
                <Text style={styles.sub}>APY</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const Stat = ({label, value, color}) => {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && {color}]}>{value}</Text>
    </View>
  );
};

const Mini = ({label, value, color}) => {
  const styles = useStyles();
  return (
    <View style={styles.mini}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.miniValue, color && {color}]}>{value}</Text>
    </View>
  );
};

const useStyles = makeStyles(colors => ({
  stats: {flexDirection: 'row', paddingVertical: 14},
  stat: {flex: 1, alignItems: 'center'},
  vline: {width: StyleSheet.hairlineWidth, backgroundColor: colors.border},
  statLabel: {color: colors.textMuted, fontSize: font.xs},
  statValue: {color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: 4},
  mt6: {marginTop: 6},
  mt12: {marginTop: 12},
  posCard: {marginBottom: spacing.sm},
  posRow: {flexDirection: 'row', alignItems: 'center'},
  posMid: {flex: 1, marginHorizontal: spacing.md},
  right: {alignItems: 'flex-end'},
  title: {color: colors.text, fontSize: font.md, fontWeight: '600'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  green: {color: colors.success, fontSize: font.xs, marginTop: 2, fontWeight: '500'},
  posFooter: {
    flexDirection: 'row',
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  mini: {flex: 1},
  miniValue: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginTop: 2},
  noPos: {flexDirection: 'row', alignItems: 'center'},
  noPosText: {color: colors.textSecondary, fontSize: font.sm, marginLeft: spacing.sm},
  viewAll: {alignItems: 'center', paddingVertical: spacing.md},
  viewAllText: {color: colors.accentText, fontSize: font.sm, fontWeight: '600'},
  listCard: {paddingVertical: 4},
  vaultRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12},
  divTop: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
  inline: {flexDirection: 'row', alignItems: 'center'},
  ml6: {marginLeft: 6},
  apy: {color: colors.success, fontSize: font.md, fontWeight: '700'},
}));
