import React, {useState} from 'react';
import {View, Text} from 'react-native';
import {Screen, Header, Card, Button, TokenIcon, InfoRow, Divider} from '../components/ui';
import AmountInput from '../components/AmountInput';
import EmptyState from '../components/EmptyState';
import {useVaultStore, getVault} from '../store';
import {makeStyles, spacing, font} from '../theme';
import {fmt, signed} from '../utils';

export default function WithdrawScreen({navigation, route}) {
  const styles = useStyles();
  const {positions} = useVaultStore();
  const id = route && route.params ? route.params.positionId : undefined;
  const position = positions.find(x => x.id === id);
  const [amount, setAmount] = useState('');

  if (!position) {
    return (
      <Screen header={<Header title="Withdraw" onBack={() => navigation.goBack()} />}>
        <EmptyState icon="alert-circle-outline" tone="danger" title="Position not found" actionLabel="Go back" onAction={() => navigation.goBack()} />
      </Screen>
    );
  }

  const vault = getVault(position.vaultId);
  const available = position.value;
  const dec = available < 10 ? 4 : 2;
  const num = parseFloat(amount) || 0;
  const error = num > available + 1e-6 ? 'Amount exceeds available balance' : null;

  const all = num > 0 && num >= available - 1e-6;

  return (
    <Screen
      keyboard
      header={<Header title={`Withdraw ${vault.symbol}`} onBack={() => navigation.goBack()} />}
      footer={
        <Button
          label="Continue"
          disabled={!num || !!error}
          onPress={() => navigation.navigate('WithdrawConfirm', {positionId: position.id, amount, all})}
        />
      }>
      <Card style={styles.availCard}>
        <View style={styles.flex}>
          <Text style={styles.label}>Available to withdraw</Text>
          <Text style={styles.avail}>
            {fmt(available, dec)} {vault.symbol}
          </Text>
          <Text style={styles.earned}>
            {signed(position.earnings, dec)} {vault.symbol} earned
          </Text>
        </View>
        <TokenIcon symbol={vault.symbol} name={vault.name} size={40} />
      </Card>

      <View style={styles.mt12}>
        <AmountInput
          value={amount}
          onChange={setAmount}
          max={available}
          symbol={vault.symbol}
          balanceLabel="Available"
          error={error}
          decimals={dec}
        />
      </View>

      <Card style={styles.mt12}>
        <Text style={styles.cardTitle}>Transaction summary</Text>
        <InfoRow label="You will receive (est.)" value={`${fmt(num, dec)} ${vault.symbol}`} />
        <InfoRow label="Slippage protection" value="0.5%" />
        <InfoRow label="Remaining in Earn" value={`${fmt(Math.max(0, available - num), dec)} ${vault.symbol}`} />
        <Divider />
        <InfoRow label="Estimated arrival" value="< 1 minute" icon="time-outline" />
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  flex: {flex: 1},
  mt12: {marginTop: spacing.md},
  availCard: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  label: {color: colors.textSecondary, fontSize: font.xs},
  avail: {color: colors.text, fontSize: font.xl + 2, fontWeight: '700', marginTop: 4},
  earned: {color: colors.success, fontSize: font.xs, marginTop: 2, fontWeight: '500'},
  cardTitle: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginBottom: 4},
}));
