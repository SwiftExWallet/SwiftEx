import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Tabs, SectionHeader, SkeletonRows, Card, Skeleton} from '../components/ui';
import BalanceCard from '../components/BalanceCard';
import EmptyState from '../components/EmptyState';
import {VaultRow, PositionRow, ActivityRow} from '../components/Rows';
import {useVaultStore, getVault} from '../store';
import {useVaultColors, makeStyles, spacing, font} from '../theme';

export default function EarnHomeScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const {status, error, vaults, positions, activity, address, refresh, network} = useVaultStore();
  const [tab, setTab] = useState((route && route.params && route.params.initialTab) || 'earn');

  const initialTab = route && route.params ? route.params.initialTab : undefined;
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const loading = status === 'loading';
  const total = positions.reduce((s, p) => s + p.value, 0);
  const earned = positions.reduce((s, p) => s + p.earnings, 0);
  const principal = positions.reduce((s, p) => s + p.principal, 0);

  const header = (
    <Header title="Earn" rightIcon="refresh-outline" onRightPress={refresh} />
  );

  if (!vaults.length) {
    return (
      <Screen header={header}>
        <EmptyState
          icon="time-outline"
          title="Earn is coming soon"
          message={`No Earn pools are live on Stellar ${network === 'testnet' ? 'Testnet' : 'Mainnet'} yet.`}
        />
      </Screen>
    );
  }

  const renderVaults = () => {
    if (loading) return <SkeletonRows count={2} />;
    if (status === 'error') {
      return (
        <EmptyState
          icon="alert-circle-outline"
          tone="danger"
          title="Earn unavailable"
          message={error || "We couldn't reach the Earn contracts. Check your connection and try again."}
          actionLabel="Try again"
          actionVariant="danger"
          onAction={refresh}
        />
      );
    }
    return (
      <>
        {vaults.map(v => (
          <VaultRow key={v.id} vault={v} onPress={() => navigation.navigate('EarnDetail', {vaultId: v.id})} />
        ))}
        <TouchableOpacity style={styles.exploreLink} onPress={() => navigation.navigate('EarnExplore')}>
          <Text style={styles.exploreText}>Explore all Earn</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accentText} />
        </TouchableOpacity>

        <SectionHeader
          title="Activity"
          actionLabel={activity.length ? 'See all' : undefined}
          onAction={() => navigation.navigate('TradeHistory')}
        />
        {activity.length ? (
          <Card style={styles.activityCard}>
            {activity.slice(0, 4).map((a, i) => (
              <View key={a.id} style={i > 0 && styles.activityDivider}>
                <ActivityRow item={a} />
              </View>
            ))}
          </Card>
        ) : (
          <Card style={styles.noAct}>
            <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
            <Text style={styles.noActText}>Your deposits and withdrawals will appear here.</Text>
          </Card>
        )}
      </>
    );
  };

  const renderPositions = () => {
    if (!address) {
      return (
        <EmptyState
          icon="wallet-outline"
          title="Stellar wallet not found"
          message="Create or import a wallet with a Stellar account to start earning."
        />
      );
    }
    if (loading) {
      return (
        <Card>
          <View style={styles.skRow}>
            <Skeleton width={36} height={36} r={18} />
            <View style={styles.skMid}>
              <Skeleton width="40%" height={12} />
              <Skeleton width="60%" height={10} style={styles.mt8} />
            </View>
          </View>
          <Skeleton height={34} style={styles.mt16} />
        </Card>
      );
    }
    if (status === 'error') {
      return (
        <EmptyState
          icon="alert-circle-outline"
          tone="danger"
          title="Positions unavailable"
          message="We couldn't load your positions right now. Check your connection and try again."
          actionLabel="Try again"
          actionVariant="danger"
          onAction={refresh}
        />
      );
    }
    if (!positions.length) {
      return (
        <EmptyState
          icon="layers-outline"
          title="No positions yet"
          message="Deposit into Earn to start earning yield on your idle assets."
          actionLabel="Explore Earn"
          onAction={() => navigation.navigate('EarnExplore')}
        />
      );
    }
    return positions.map(p => (
      <PositionRow
        key={p.id}
        position={p}
        vault={getVault(p.vaultId)}
        onPress={() => navigation.navigate('Position', {positionId: p.id})}
      />
    ));
  };

  return (
    <Screen header={header}>
      <BalanceCard
        label="Your Earn Balance"
        loading={loading}
        amount={total}
        change={earned}
        changePct={principal > 0 ? (earned / principal) * 100 : 0}
        period="all time"
      />

      <Tabs
        style={styles.tabs}
        active={tab}
        onChange={setTab}
        tabs={[
          {key: 'earn', label: 'Earn'},
          {key: 'positions', label: 'Positions', count: !loading && status === 'ready' && address ? positions.length : undefined},
        ]}
      />

      <View style={styles.body}>{tab === 'earn' ? renderVaults() : renderPositions()}</View>
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  tabs: {marginTop: spacing.xl},
  body: {marginTop: spacing.lg},
  exploreLink: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md},
  exploreText: {color: colors.accentText, fontSize: font.sm, fontWeight: '600', marginRight: 6},
  activityCard: {paddingVertical: 4},
  activityDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
  noAct: {flexDirection: 'row', alignItems: 'center'},
  noActText: {color: colors.textSecondary, fontSize: font.sm, marginLeft: spacing.sm, flex: 1},
  skRow: {flexDirection: 'row', alignItems: 'center'},
  skMid: {flex: 1, marginLeft: spacing.md},
  mt8: {marginTop: 8},
  mt16: {marginTop: 16},
}));
