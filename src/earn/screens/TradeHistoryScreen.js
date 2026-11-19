import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, Linking, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Card, ChipGroup} from '../components/ui';
import {ActivityRow} from '../components/Rows';
import EmptyState from '../components/EmptyState';
import {useVaultStore, getVault} from '../store';
import {getExplorerTxUrl} from '../config';
import {useVaultColors, makeStyles, spacing, font} from '../theme';
import {shortHash} from '../utils';

const FILTERS = [
  {key: 'all', label: 'All'},
  {key: 'deposit', label: 'Deposits'},
  {key: 'withdraw', label: 'Withdrawals'},
];

export default function TradeHistoryScreen({navigation}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const {activity} = useVaultStore();
  const [filter, setFilter] = useState('all');
  const data = useMemo(() => (filter === 'all' ? activity : activity.filter(a => a.type === filter)), [activity, filter]);

  return (
    <Screen header={<Header title="Earn Activity" onBack={() => navigation.goBack()} />}>
      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} style={styles.chips} />

      {!data.length ? (
        <EmptyState
          icon="receipt-outline"
          title="No activity yet"
          message="Deposits and withdrawals you make from this device will appear here."
        />
      ) : (
        <Card style={styles.list}>
          {data.map((a, i) => (
            <View key={a.id} style={i > 0 && styles.divider}>
              <ActivityRow item={a} />
              <View style={styles.meta}>
                <Text style={styles.metaText} numberOfLines={1}>
                  {getVault(a.vaultId) ? getVault(a.vaultId).name : a.vaultId}
                </Text>
                {a.hash ? (
                  <TouchableOpacity style={styles.link} onPress={() => Linking.openURL(getExplorerTxUrl(a.hash))}>
                    <Text style={styles.linkText}>{shortHash(a.hash)}</Text>
                    <Ionicons name="open-outline" size={12} color={colors.accentText} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  chips: {marginTop: spacing.sm, marginBottom: spacing.md},
  list: {paddingVertical: 4},
  divider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
  meta: {flexDirection: 'row', alignItems: 'center', paddingLeft: 46, paddingBottom: 10, marginTop: -4},
  metaText: {color: colors.textMuted, fontSize: font.xs, flex: 1},
  link: {flexDirection: 'row', alignItems: 'center', marginLeft: spacing.sm},
  linkText: {color: colors.accentText, fontSize: font.xs, marginRight: 4, fontWeight: '600'},
}));
