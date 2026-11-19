import React, {useState} from 'react';
import {View, Text, TouchableOpacity, Linking, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard';
import {Screen, Header, Card, Button, TokenIcon, Badge, InfoRow, SectionHeader, ChipGroup, Skeleton} from '../components/ui';
import AreaChart from '../components/AreaChart';
import {useSharePriceHistory, buildSeries} from '../history';
import {getVault, useVaultStore} from '../store';
import {getExplorerContractUrl} from '../config';
import {useVaultColors, makeStyles, spacing, font, radius} from '../theme';
import {compactUsd, fmt, shortHash} from '../utils';

export default function EarnDetailScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const {address} = useVaultStore();
  const vault = getVault(route && route.params ? route.params.vaultId : undefined);

  if (!vault) {
    return <Screen header={<Header title="Earn" onBack={() => navigation.goBack()} />} />;
  }

  const cfg = vault.config;
  const investedPct = vault.tvlUnits > 0 ? (vault.invested / vault.tvlUnits) * 100 : 0;

  return (
    <Screen
      header={<Header title="Earn" onBack={() => navigation.goBack()} />}
      footer={
        <Button
          label={address ? `Earn ${vault.symbol}` : 'Stellar wallet required'}
          variant="success"
          icon="trending-up"
          disabled={!address || !vault.live}
          onPress={() => navigation.navigate('EarnDeposit', {vaultId: vault.id})}
        />
      }>
      <View style={styles.tokenRow}>
        <TokenIcon symbol={vault.symbol} name={vault.name} size={44} />
        <View style={styles.tokenMid}>
          <Text style={styles.symbol}>{vault.name}</Text>
          <Text style={styles.sub}>
            {vault.symbol} · receive {vault.shareSymbol} shares
          </Text>
        </View>
        <Badge label={vault.poolLabel} tone="primary" />
      </View>
      <Text style={styles.desc}>{vault.description}</Text>

      <Card style={styles.keyCard}>
        <View style={styles.keyRow}>
          <View style={styles.keyCol}>
            <Text style={styles.label}>Net APY</Text>
            <Text style={styles.apyBig}>{vault.apy.toFixed(2)}%</Text>
            <Text style={styles.sub}>Target {vault.targetApy.toFixed(2)}%</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.label}>Total value locked</Text>
            <Text style={styles.keyValue}>{vault.live ? compactUsd(vault.tvl) : '—'}</Text>
            <Text style={styles.label}>Share price</Text>
            <Text style={styles.keyValueSm}>
              {vault.sharePrice.toFixed(6)} {vault.symbol}
            </Text>
          </View>
        </View>
      </Card>

      <Performance vault={vault} />

      <SectionHeader title="Supply & utilization" />
      <Card>
        <View style={styles.utilTop}>
          <Text style={styles.label}>Utilization</Text>
          <Text style={styles.utilValue}>{vault.utilization.toFixed(2)}%</Text>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, {width: `${Math.max(0, Math.min(100, investedPct))}%`}]} />
        </View>
        <View style={styles.legend}>
          <Legend color={colors.primary} label="Invested" value={`${fmt(vault.invested)} ${vault.symbol}`} />
          <Legend color={colors.elevated} label="Idle" value={`${fmt(vault.idle)} ${vault.symbol}`} />
        </View>
        <InfoRow label="Total shares" value={`${fmt(vault.totalShares)} ${vault.shareSymbol}`} style={styles.mt8} />
        <InfoRow label="Oracle price" value={`$${vault.price.toFixed(2)}`} />
      </Card>

      <SectionHeader title="Strategy" />
      <Card>
        <InfoRow label="Strategy" value={vault.strategyName} />
        <InfoRow label="Protocol" value={vault.protocol} />
        <InfoRow label="Lock" value="No lock" />
        <InfoRow label="Performance fee" value={vault.feeBps ? `${(vault.feeBps / 100).toFixed(2)}%` : '0%'} />
      </Card>

      <SectionHeader title="On-chain contracts" />
      <Card>
        <AddressRow label="Vault" address={cfg.vaultAddress} />
        <AddressRow label="Strategy" address={cfg.strategyAddress} />
        <AddressRow label={`${vault.symbol} token`} address={cfg.underlyingAsset.contractId} />
      </Card>

      <View style={styles.features}>
        <Feature icon="shield-checkmark-outline" title="Non-custodial" sub="Soroban contracts" />
        <Feature icon="flash-outline" title="Instant" sub="Withdrawals" />
        <Feature icon="repeat-outline" title="Auto" sub="Compounding" />
      </View>
    </Screen>
  );
}

const PERIODS = [
  {key: '24H', label: '24H', ms: 24 * 3600 * 1000},
  {key: '3D', label: '3D', ms: 3 * 24 * 3600 * 1000},
  {key: '7D', label: '7D', ms: 7 * 24 * 3600 * 1000},
];

const fmtTick = (ts, periodMs) => {
  const d = new Date(ts);
  return periodMs <= 24 * 3600 * 1000
    ? d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})
    : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
};

function Performance({vault}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const [period, setPeriod] = useState('7D');
  const {status, points} = useSharePriceHistory(vault);
  const per = PERIODS.find(p => p.key === period);
  const series = status === 'ready' && vault.live ? buildSeries(points, vault.sharePrice, per.ms) : null;
  const change = series && series.first > 0 ? (series.last / series.first - 1) * 100 : 0;
  const min = series ? Math.min(...series.data) : 0;
  const max = series ? Math.max(...series.data) : 0;

  return (
    <>
      <SectionHeader title="Performance" />
      <Card>
        <ChipGroup options={PERIODS} value={period} onChange={setPeriod} />
        {status === 'loading' ? (
          <View style={styles.chartLoading}>
            <Skeleton height={130} />
          </View>
        ) : !series ? (
          <View style={styles.chartEmpty}>
            <Ionicons name="pulse-outline" size={18} color={colors.textMuted} />
            <Text style={styles.chartEmptyText}>
              {status === 'error'
                ? "Couldn't load on-chain history."
                : 'No on-chain activity in this period yet.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.rangeRow}>
              <View>
                <Text style={styles.label}>Share price</Text>
                <Text style={styles.perfValue}>
                  {vault.sharePrice.toFixed(6)} {vault.symbol}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.label}>
                  {series.start > Date.now() - per.ms + 3600 * 1000
                    ? `Change (since ${fmtTick(series.start, per.ms)})`
                    : `Change (${period})`}
                </Text>
                <Text style={[styles.perfValue, {color: change >= 0 ? colors.success : colors.danger}]}>
                  {change >= 0 ? '+' : ''}
                  {change.toFixed(3)}%
                </Text>
              </View>
            </View>
            <AreaChart
              data={series.data}
              height={130}
              color={colors.primary}
              xLabels={[fmtTick(series.start, per.ms), fmtTick((series.start + series.end) / 2, per.ms), 'Now']}
              yLabels={[max.toFixed(4), ((max + min) / 2).toFixed(4), min.toFixed(4)]}
              style={styles.mt12}
            />
            <Text style={styles.chartNote}>
              Based on {series.events} on-chain deposit/withdraw event{series.events === 1 ? '' : 's'}. Stellar RPC keeps ~7 days of history.
            </Text>
          </>
        )}
      </Card>
    </>
  );
}

const Legend = ({color, label, value}) => {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <View>
        <Text style={styles.sub}>{label}</Text>
        <Text style={styles.legendValue}>{value}</Text>
      </View>
    </View>
  );
};

export function AddressRow({label, address}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.addrRow}>
      <Text style={styles.addrLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.addrBtn}
        onPress={() => {
          Clipboard.setString(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}>
        <Text style={styles.addr}>{shortHash(address)}</Text>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? colors.success : colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.addrBtn} onPress={() => Linking.openURL(getExplorerContractUrl(address))}>
        <Ionicons name="open-outline" size={14} color={colors.accentText} />
      </TouchableOpacity>
    </View>
  );
}

const Feature = ({icon, title, sub}) => {
  const colors = useVaultColors();
  const styles = useStyles();
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={colors.accentText} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSub}>{sub}</Text>
    </View>
  );
};

const useStyles = makeStyles(colors => ({
  tokenRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  tokenMid: {flex: 1, marginHorizontal: spacing.md},
  symbol: {color: colors.text, fontSize: font.lg, fontWeight: '700'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  desc: {color: colors.textSecondary, fontSize: font.sm, lineHeight: 18, marginTop: spacing.md},
  keyCard: {marginTop: spacing.lg},
  keyRow: {flexDirection: 'row'},
  keyCol: {flex: 1},
  label: {color: colors.textSecondary, fontSize: font.xs, marginTop: 2},
  apyBig: {color: colors.success, fontSize: font.xxl, fontWeight: '800', marginTop: 4},
  keyValue: {color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: 2, marginBottom: 8},
  keyValueSm: {color: colors.text, fontSize: font.sm, fontWeight: '700', marginTop: 2},
  utilTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  utilValue: {color: colors.accentText, fontSize: font.md, fontWeight: '700'},
  bar: {height: 8, borderRadius: 4, backgroundColor: colors.elevated, marginTop: spacing.sm, overflow: 'hidden'},
  barFill: {height: 8, borderRadius: 4, backgroundColor: colors.primary},
  legend: {flexDirection: 'row', marginTop: spacing.md},
  legendItem: {flex: 1, flexDirection: 'row', alignItems: 'center'},
  dot: {width: 8, height: 8, borderRadius: 4, marginRight: 6},
  legendValue: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginTop: 1},
  mt8: {marginTop: spacing.sm},
  mt12: {marginTop: spacing.md},
  right: {alignItems: 'flex-end'},
  rangeRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md},
  perfValue: {color: colors.text, fontSize: font.md, fontWeight: '700', marginTop: 2},
  chartLoading: {marginTop: spacing.md},
  chartEmpty: {flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xl, justifyContent: 'center'},
  chartEmptyText: {color: colors.textSecondary, fontSize: font.sm, marginLeft: spacing.sm},
  chartNote: {color: colors.textMuted, fontSize: font.xs, marginTop: spacing.md},
  addrRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 7},
  addrLabel: {color: colors.textSecondary, fontSize: font.sm, flex: 1},
  addrBtn: {flexDirection: 'row', alignItems: 'center', marginLeft: spacing.md},
  addr: {color: colors.text, fontSize: font.sm, fontWeight: '500', marginRight: 4},
  features: {flexDirection: 'row', marginTop: spacing.md, marginHorizontal: -4},
  feature: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginTop: 6},
  featureSub: {color: colors.textMuted, fontSize: font.xs, marginTop: 1},
}));
