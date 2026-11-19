import React, {useMemo, useState} from 'react';
import {View, Text, ScrollView, StatusBar, TouchableOpacity} from 'react-native';
import {Card, ChipGroup, TokenIcon, Badge} from '../components/ui';
import AccountBar from '../components/AccountBar';
import EmptyState from '../components/EmptyState';
import {futuresPositions} from '../mockData';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useVaultColors, makeStyles, useBottomInset, spacing, font, radius} from '../theme';
import {fmt, signedUsd, pct} from '../utils';

export default function PositionsListScreen({navigation}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const [filter, setFilter] = useState('All');
  const [list, setList] = useState(futuresPositions);
  const data = useMemo(() => (filter === 'All' ? list : list.filter(p => p.side === filter)), [filter, list]);
  const total = data.reduce((s, p) => s + p.pnl, 0);

  return (
    <View style={[styles.safe, {paddingTop: insets.top}]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
      <AccountBar onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, {paddingBottom: spacing.xxl + bottomInset}]}>
        <View style={styles.head}>
          <View>
            <Text style={styles.h1}>Positions ({data.length})</Text>
            <Text style={[styles.sub, {color: total >= 0 ? colors.success : colors.danger}]}>
              Unrealized {signedUsd(total)}
            </Text>
          </View>
          {list.length ? (
            <TouchableOpacity onPress={() => setList([])}>
              <Text style={styles.closeAll}>Close all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <ChipGroup options={['All', 'Long', 'Short']} value={filter} onChange={setFilter} style={styles.chips} />

        {!data.length ? (
          <EmptyState icon="analytics-outline" title="No open positions" message="Your open futures positions will appear here." />
        ) : (
          data.map(p => {
            const up = p.pnl >= 0;
            return (
              <Card key={p.id} style={styles.card}>
                <View style={styles.row}>
                  <TokenIcon symbol={p.symbol} size={32} />
                  <View style={styles.mid}>
                    <View style={styles.inline}>
                      <Text style={styles.title}>{p.pair}</Text>
                      <Badge label={`${p.side} ${p.leverage}x`} tone={p.side === 'Long' ? 'green' : 'red'} style={styles.ml6} />
                    </View>
                    <Text style={styles.sub}>Perpetual · Cross</Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={[styles.title, {color: up ? colors.success : colors.danger}]}>{signedUsd(p.pnl)}</Text>
                    <Text style={[styles.sub, {color: up ? colors.success : colors.danger}]}>{pct(p.pnlPct)}</Text>
                  </View>
                </View>
                <View style={styles.grid}>
                  <Cell label="Size" value={`${p.size} ${p.symbol}`} />
                  <Cell label="Entry" value={fmt(p.entry)} />
                  <Cell label="Mark" value={fmt(p.mark)} />
                  <Cell label="Margin" value={fmt(p.margin)} />
                  <Cell label="Liq. price" value={fmt(p.liq)} color={colors.warning} />
                  <Cell label="ROE" value={pct(p.pnlPct)} color={up ? colors.success : colors.danger} />
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.smallBtn}>
                    <Text style={styles.smallBtnText}>TP / SL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, styles.ml8]} onPress={() => setList(l => l.filter(x => x.id !== p.id))}>
                    <Text style={styles.smallBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const Cell = ({label, value, color}) => {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.sub}>{label}</Text>
      <Text style={[styles.cellValue, color && {color}]}>{value}</Text>
    </View>
  );
};

const useStyles = makeStyles(colors => ({
  safe: {flex: 1, backgroundColor: colors.bg},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  h1: {color: colors.text, fontSize: font.lg, fontWeight: '700'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  closeAll: {color: colors.danger, fontSize: font.sm, fontWeight: '600'},
  chips: {marginTop: spacing.md, marginBottom: spacing.md, width: 200},
  card: {marginBottom: spacing.sm},
  row: {flexDirection: 'row', alignItems: 'center'},
  inline: {flexDirection: 'row', alignItems: 'center'},
  mid: {flex: 1, marginHorizontal: spacing.md},
  right: {alignItems: 'flex-end'},
  title: {color: colors.text, fontSize: font.sm, fontWeight: '600'},
  ml6: {marginLeft: 6},
  ml8: {marginLeft: 8},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md},
  cell: {width: '33.33%', paddingVertical: 6},
  cellValue: {color: colors.text, fontSize: font.sm, fontWeight: '500', marginTop: 2},
  btnRow: {flexDirection: 'row', marginTop: spacing.sm},
  smallBtn: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: {color: colors.text, fontSize: font.xs, fontWeight: '600'},
}));
