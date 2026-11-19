import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Card, Button, TokenIcon, Badge, InfoRow, Divider, SectionHeader, IconCircle} from '../components/ui';
import EmptyState from '../components/EmptyState';
import {useVaultStore, getVault} from '../store';
import {useVaultColors, makeStyles, spacing, font, radius} from '../theme';
import {fmt, signed, pct, usd} from '../utils';

export default function PositionScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const {positions, status} = useVaultStore();
  const id = route && route.params ? route.params.positionId : undefined;
  const position = positions.find(x => x.id === id) || (id ? null : positions[0]);

  if (!position) {
    return (
      <Screen header={<Header title="Your Position" onBack={() => navigation.goBack()} />}>
        <EmptyState
          icon="layers-outline"
          title={status === 'loading' ? 'Loading position…' : 'No active position'}
          message={status === 'loading' ? 'Fetching your shares from Stellar.' : 'You have no shares in this Earn pool.'}
          actionLabel="Explore Earn"
          onAction={() => navigation.navigate('EarnExplore')}
        />
      </Screen>
    );
  }

  const vault = getVault(position.vaultId);
  const value = position.value;
  const gainPct = position.principal ? (position.earnings / position.principal) * 100 : 0;
  const dec = value < 10 ? 4 : 2;
  const isUsd = vault.symbol.startsWith('USD');

  return (
    <Screen header={<Header title="Your Position" onBack={() => navigation.goBack()} />}>
      <View style={styles.tokenRow}>
        <TokenIcon symbol={vault.symbol} name={vault.name} size={40} />
        <View style={styles.mid}>
          <Text style={styles.symbol}>{vault.symbol}</Text>
          <Text style={styles.sub}>{vault.name}</Text>
        </View>
        <Badge label="Active" tone="green" icon="ellipse" />
      </View>

      <Card style={styles.valueCard}>
        <View style={styles.valueTop}>
          <Text style={styles.label}>Current value</Text>
          <Badge label={`APY ${vault.apy.toFixed(2)}%`} tone="green" />
        </View>
        <Text style={styles.value}>
          {fmt(value, dec)} <Text style={styles.valueSym}>{vault.symbol}</Text>
        </Text>
        <Text style={styles.gain}>
          {signed(position.earnings, dec)} ({pct(gainPct)}) <Text style={styles.sub}>all time</Text>
        </Text>
        <View style={styles.shareRow}>
          <View style={styles.flex}>
            <Text style={styles.label}>Your shares</Text>
            <Text style={styles.shareValue}>
              {fmt(position.shares, 4)} {vault.shareSymbol}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.label}>Pool share</Text>
            <Text style={styles.shareValue}>{position.poolSharePercent.toFixed(2)}%</Text>
          </View>
        </View>
      </Card>

      <View style={styles.actions}>
        <Button
          label="Add more"
          icon="add"
          size="md"
          style={styles.flex}
          onPress={() => navigation.navigate('EarnDeposit', {vaultId: vault.id})}
        />
        <View style={styles.gap} />
        <Button
          label="Withdraw"
          icon="arrow-up"
          variant="outline"
          size="md"
          style={styles.flex}
          onPress={() => navigation.navigate('Withdraw', {positionId: position.id})}
        />
      </View>

      <SectionHeader title="Breakdown" />
      <Card>
        <View style={styles.bRow}>
          <IconCircle name="wallet-outline" size={32} iconSize={15} />
          <Text style={styles.bLabel}>Principal</Text>
          <View style={styles.right}>
            <Text style={styles.bValue}>
              {fmt(position.principal, dec)} {vault.symbol}
            </Text>
            {isUsd ? <Text style={styles.sub}>{usd(position.principal)}</Text> : null}
          </View>
        </View>
        <View style={[styles.bRow, styles.mt12]}>
          <IconCircle name="trending-up" size={32} iconSize={15} color={colors.success} bg={colors.successSoft} />
          <Text style={styles.bLabel}>Earnings</Text>
          <View style={styles.right}>
            <Text style={[styles.bValue, {color: colors.success}]}>
              {signed(position.earnings, dec)} {vault.symbol}
            </Text>
            <Text style={styles.sub}>{pct(gainPct)} · est.</Text>
          </View>
        </View>
        <Divider />
        <InfoRow label="Total locked value" value={`${fmt(value, dec)} ${vault.symbol}`} bold />
      </Card>

      <SectionHeader title="Position details" />
      <Card>
        <InfoRow icon="git-branch-outline" label="Strategy" value={vault.strategy} />
        <InfoRow icon="calendar-outline" label="Deposited on" value={position.depositedOn} />
        <InfoRow icon="lock-closed-outline" label="Lock period" value="No lock" />
        <InfoRow
          icon="repeat-outline"
          label="Auto-compound"
          value={
            <View style={styles.inline}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.enabled}>Enabled</Text>
            </View>
          }
        />
        <InfoRow icon="layers-outline" label="Pool" value={vault.poolLabel} />
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  flex: {flex: 1},
  gap: {width: spacing.md},
  tokenRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  mid: {flex: 1, marginHorizontal: spacing.md},
  right: {alignItems: 'flex-end'},
  symbol: {color: colors.text, fontSize: font.lg, fontWeight: '700'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  valueCard: {marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.xl},
  valueTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  label: {color: colors.textSecondary, fontSize: font.xs},
  value: {color: colors.text, fontSize: font.xxl, fontWeight: '800', marginTop: 6},
  valueSym: {fontSize: font.md, color: colors.textSecondary, fontWeight: '600'},
  gain: {color: colors.success, fontSize: font.sm, fontWeight: '600', marginTop: 2},
  shareRow: {flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
  shareValue: {color: colors.text, fontSize: font.md, fontWeight: '700', marginTop: 3},
  actions: {flexDirection: 'row', marginTop: spacing.md},
  bRow: {flexDirection: 'row', alignItems: 'center'},
  bLabel: {color: colors.textSecondary, fontSize: font.sm, flex: 1, marginLeft: spacing.md},
  bValue: {color: colors.text, fontSize: font.sm, fontWeight: '600'},
  mt12: {marginTop: spacing.md},
  inline: {flexDirection: 'row', alignItems: 'center'},
  enabled: {color: colors.success, fontSize: font.sm, fontWeight: '500', marginLeft: 4},
}));
