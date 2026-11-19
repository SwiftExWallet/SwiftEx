import React, {useEffect, useState} from 'react';
import {View, Text} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Card, Button, TokenIcon, InfoRow, Divider, IconCircle, Skeleton} from '../components/ui';
import {getVault, useVaultStore} from '../store';
import {buildDeposit, parseUnits, toNumber, humanError} from '../service';
import {useVaultColors, makeStyles, spacing, font} from '../theme';
import {fmt, usd} from '../utils';

export default function ReviewDepositScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const params = (route && route.params) || {};
  const {address} = useVaultStore();
  const vault = getVault(params.vaultId);
  const amountStr = String(params.amount || '0');
  const amount = parseFloat(amountStr) || 0;
  const dec = amount < 10 ? 4 : 2;
  const yearly = (amount * vault.apy) / 100;

  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setQuote(null);
    setError(null);

    buildDeposit(getVault(vault.id).config, address, parseUnits(amountStr))
      .then(q => alive && setQuote(q))
      .catch(e => alive && setError(humanError(e, 'deposit')));
    return () => {
      alive = false;
    };
  }, [vault.id, address, amountStr, attempt]);

  const onConfirm = () =>
    navigation.replace('TransactionStatus', {
      mode: 'deposit',
      vaultId: vault.id,
      amount: amountStr,
      prebuilt: quote,
    });

  return (
    <Screen
      header={
        <Header
          title={`Earn ${vault.symbol}`}
          onBack={() => navigation.goBack()}
          rightIcon="close"
          onRightPress={() => navigation.navigate('EarnHome')}
        />
      }
      footer={
        <>
          {error ? (
            <Button label="Try again" variant="secondary" icon="refresh" onPress={() => setAttempt(a => a + 1)} />
          ) : (
            <Button label="Confirm Deposit" icon="lock-closed-outline" loading={!quote} onPress={onConfirm} />
          )}
          <Text style={styles.terms}>You will be asked to authorize signing. Funds go to the Soroban vault contract.</Text>
        </>
      }>
      <Card style={styles.mt8}>
        <Text style={styles.label}>You deposit</Text>
        <View style={styles.row}>
          <TokenIcon symbol={vault.symbol} name={vault.name} size={40} />
          <View style={styles.mid}>
            <Text style={styles.amount}>
              {fmt(amount, dec)} {vault.symbol}
            </Text>
            <Text style={styles.sub}>≈ {usd(amount * vault.price)}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.arrowWrap}>
        <IconCircle name="arrow-down" size={32} iconSize={16} color={colors.accentText} bg={colors.surfaceAlt} style={styles.arrow} />
      </View>

      <Card>
        <Text style={styles.label}>Into</Text>
        <View style={styles.row}>
          <IconCircle name="layers" size={40} iconSize={18} />
          <View style={styles.mid}>
            <Text style={styles.title}>{vault.name}</Text>
            <Text style={styles.sub}>{vault.strategy}</Text>
          </View>
          <Ionicons name="shield-checkmark" size={18} color={colors.success} />
        </View>
      </Card>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Card style={styles.mt12}>
        <Text style={styles.cardTitle}>Transaction summary</Text>
        <InfoRow label="APY" value={`${vault.apy.toFixed(2)}%`} valueColor={colors.success} />
        <InfoRow label="Est. yearly earnings" value={`+${fmt(yearly, dec)} ${vault.symbol}`} valueColor={colors.success} />
        <InfoRow
          label="You receive (est.)"
          value={quote ? `${fmt(toNumber(quote.expectedShares), 4)} ${vault.shareSymbol}` : <Skeleton width={90} height={12} />}
        />
        <InfoRow label="Slippage protection" value="0.5%" />
        <InfoRow
          label="Network fee"
          icon="flame-outline"
          value={quote ? `~${quote.feeXlm.toFixed(5)} XLM` : error ? '—' : <Skeleton width={70} height={12} />}
        />
        <Divider />
        <InfoRow label="Total" value={`${fmt(amount, dec)} ${vault.symbol}`} bold />
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  mt8: {marginTop: spacing.sm},
  mt12: {marginTop: spacing.md},
  label: {color: colors.textSecondary, fontSize: font.xs, marginBottom: spacing.sm},
  row: {flexDirection: 'row', alignItems: 'center'},
  mid: {flex: 1, marginHorizontal: spacing.md},
  amount: {color: colors.text, fontSize: font.xl, fontWeight: '700'},
  title: {color: colors.text, fontSize: font.md, fontWeight: '600'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  arrowWrap: {alignItems: 'center', marginVertical: -12, zIndex: 2},
  arrow: {borderWidth: 3, borderColor: colors.bg},
  cardTitle: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginBottom: 4},
  terms: {color: colors.textMuted, fontSize: font.xs, textAlign: 'center', marginTop: spacing.sm},
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
