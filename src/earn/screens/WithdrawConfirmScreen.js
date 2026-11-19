import React, {useEffect, useState} from 'react';
import {View, Text} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Card, Button, TokenIcon, InfoRow, Divider, Skeleton} from '../components/ui';
import {getVault, getPosition, useVaultStore} from '../store';
import {buildWithdraw, parseUnits, toNumber, humanError} from '../service';
import {useVaultColors, makeStyles, spacing, font} from '../theme';
import {fmt, shortHash} from '../utils';

export default function WithdrawConfirmScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const p = (route && route.params) || {};
  const {address} = useVaultStore();
  const position = getPosition(p.positionId);
  const vault = getVault(position ? position.vaultId : p.positionId);
  const amountStr = String(p.amount || '0');
  const amount = parseFloat(amountStr) || 0;
  const dec = amount < 10 ? 4 : 2;
  const fullExit = !!p.all;

  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setQuote(null);
    setError(null);
    buildWithdraw(getVault(vault.id).config, address, parseUnits(amountStr), {all: fullExit})
      .then(q => alive && setQuote(q))
      .catch(e => alive && setError(humanError(e, 'withdraw')));
    return () => {
      alive = false;
    };
  }, [vault.id, address, amountStr, fullExit, attempt]);

  const onConfirm = () =>
    navigation.replace('TransactionStatus', {
      mode: 'withdraw',
      vaultId: vault.id,
      amount: amountStr,
      all: fullExit,
      prebuilt: quote,
    });

  return (
    <Screen
      header={<Header title={`Withdraw ${vault.symbol}`} onBack={() => navigation.goBack()} />}
      footer={
        <>
          {error ? (
            <Button label="Try again" variant="secondary" icon="refresh" onPress={() => setAttempt(a => a + 1)} />
          ) : (
            <Button label="Confirm Withdraw" icon="lock-closed-outline" loading={!quote} onPress={onConfirm} />
          )}
          <Button label="Cancel" variant="ghost" style={styles.mt8} onPress={() => navigation.goBack()} />
        </>
      }>
      <Card style={styles.mt8}>
        <Text style={styles.label}>You are withdrawing</Text>
        <View style={styles.row}>
          <TokenIcon symbol={vault.symbol} name={vault.name} size={42} />
          <View style={styles.mid}>
            <Text style={styles.amount}>
              {fmt(quote ? toNumber(quote.expectedAssets) : amount, dec)} {vault.symbol}
            </Text>
            <Text style={styles.sub}>from {vault.name}</Text>
          </View>
        </View>
        <Divider />
        <InfoRow label="To" value={`Your Stellar wallet · ${shortHash(address)}`} icon="wallet-outline" />
        <InfoRow
          label="Shares burned"
          value={quote ? `${fmt(toNumber(quote.shares), 4)} ${vault.shareSymbol}` : error ? '—' : <Skeleton width={90} height={12} />}
        />
        <InfoRow label="Slippage protection" value="0.5%" />
        <InfoRow
          label="Network fee"
          icon="flame-outline"
          value={quote ? `~${quote.feeXlm.toFixed(5)} XLM` : error ? '—' : <Skeleton width={70} height={12} />}
        />
        {fullExit ? <Text style={styles.warn}>This will fully close your position and stop earning yield.</Text> : null}
      </Card>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  mt8: {marginTop: spacing.sm},
  label: {color: colors.textSecondary, fontSize: font.xs, marginBottom: spacing.sm},
  row: {flexDirection: 'row', alignItems: 'center'},
  mid: {flex: 1, marginHorizontal: spacing.md},
  amount: {color: colors.text, fontSize: font.xl, fontWeight: '700'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  warn: {color: colors.warning, fontSize: font.xs, marginTop: spacing.sm},
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {color: colors.danger, fontSize: font.sm, marginLeft: 6, flex: 1},
}));
