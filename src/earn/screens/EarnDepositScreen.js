import React, {useState} from 'react';
import {View, Text} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Header, Card, Button, TokenIcon, InfoRow, Badge} from '../components/ui';
import AmountInput from '../components/AmountInput';
import {getVault, useVaultStore} from '../store';
import {useVaultColors, makeStyles, spacing, font} from '../theme';
import {fmt} from '../utils';

export default function EarnDepositScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const vault = getVault(route && route.params ? route.params.vaultId : undefined);
  const {wallet, status} = useVaultStore();
  const balance = wallet[vault.id] || 0;
  const [amount, setAmount] = useState('');
  const num = parseFloat(amount) || 0;
  const dec = balance < 10 ? 4 : 2;

  let error = null;
  if (num > balance + 1e-9) error = balance > 0 ? 'Insufficient balance' : `No ${vault.symbol} in your Stellar wallet`;

  const yearly = (num * vault.apy) / 100;

  return (
    <Screen
      keyboard
      header={
        <Header
          title={`Earn ${vault.symbol}`}
          onBack={() => navigation.goBack()}
          rightIcon="information-circle-outline"
          onRightPress={() => navigation.navigate('EarnDetail', {vaultId: vault.id})}
        />
      }
      footer={
        <Button
          label="Continue"
          disabled={!num || !!error}
          onPress={() => navigation.navigate('ReviewDeposit', {vaultId: vault.id, amount})}
        />
      }>
      <Card style={styles.vaultCard}>
        <TokenIcon symbol={vault.symbol} name={vault.name} />
        <View style={styles.mid}>
          <Text style={styles.title}>{vault.name}</Text>
          <Text style={styles.sub}>{vault.strategy}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.apy}>{vault.apy.toFixed(2)}%</Text>
          <Badge label={vault.poolLabel} tone="primary" style={styles.mt4} />
        </View>
      </Card>

      <View style={styles.mt12}>
        <AmountInput
          value={amount}
          onChange={setAmount}
          max={balance}
          symbol={vault.symbol}
          balanceLabel={status === 'loading' ? 'Loading' : 'Wallet'}
          error={error}
          decimals={dec}
        />
      </View>

      <Card style={styles.mt12}>
        <View style={styles.estHead}>
          <Ionicons name="sparkles-outline" size={15} color={colors.accentText} />
          <Text style={styles.estTitle}>Estimated earnings</Text>
        </View>
        <InfoRow label="Daily" value={`+${fmt(yearly / 365, dec)} ${vault.symbol}`} valueColor={num ? colors.success : undefined} />
        <InfoRow label="Monthly" value={`+${fmt(yearly / 12, dec)} ${vault.symbol}`} valueColor={num ? colors.success : undefined} />
        <InfoRow label="Yearly" value={`+${fmt(yearly, dec)} ${vault.symbol}`} valueColor={num ? colors.success : undefined} />
        <InfoRow label="Current APY" value={`${vault.apy.toFixed(2)}%`} />
        <Text style={styles.note}>APY is variable and may change based on market conditions.</Text>
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  vaultCard: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  mid: {flex: 1, marginHorizontal: spacing.md},
  right: {alignItems: 'flex-end'},
  title: {color: colors.text, fontSize: font.md, fontWeight: '600'},
  sub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},
  apy: {color: colors.success, fontSize: font.md, fontWeight: '700'},
  mt4: {marginTop: 4},
  mt12: {marginTop: spacing.md},
  estHead: {flexDirection: 'row', alignItems: 'center', marginBottom: 4},
  estTitle: {color: colors.text, fontSize: font.sm, fontWeight: '600', marginLeft: 6},
  note: {color: colors.textMuted, fontSize: font.xs, marginTop: spacing.sm},
}));
