import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, BackHandler, Linking} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard';
import {Screen, Header, Card, Button, TokenIcon, Spinner} from '../components/ui';
import {getVault, refresh, useVaultStore} from '../store';
import {
  buildDeposit,
  buildWithdraw,
  signXdr,
  submitSigned,
  waitForTx,
  parseUnits,
  toNumber,
  humanError,
} from '../service';
import {getExplorerTxUrl} from '../config';
import {useVaultColors, makeStyles, spacing, font, radius} from '../theme';
import {fmt, nowTime, shortHash} from '../utils';

const PREBUILT_MAX_AGE = 4 * 60 * 1000;

export default function TransactionStatusScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const p = (route && route.params) || {};
  const mode = p.mode === 'withdraw' ? 'withdraw' : 'deposit';
  const {address} = useVaultStore();
  const vault = getVault(p.vaultId);
  const amountStr = String(p.amount || '0');
  const amount = parseFloat(amountStr) || 0;
  const dec = amount < 10 ? 4 : 2;

  const steps =
    mode === 'deposit'
      ? [
          {title: 'Preparing transaction', sub: `Simulating deposit of ${fmt(amount, dec)} ${vault.symbol}`},
          {title: 'Authorize signing', sub: 'Confirm with your device lock'},
          {title: 'Submitting to Stellar', sub: 'Sending signed transaction to Soroban'},
          {title: 'Confirming on-chain', sub: `Minting ${vault.shareSymbol} shares`},
        ]
      : [
          {title: 'Preparing transaction', sub: `Simulating withdrawal of ${fmt(amount, dec)} ${vault.symbol}`},
          {title: 'Authorize signing', sub: 'Confirm with your device lock'},
          {title: 'Submitting to Stellar', sub: 'Sending signed transaction to Soroban'},
          {title: 'Confirming on-chain', sub: `Burning ${vault.shareSymbol} shares`},
        ];

  const [done, setDone] = useState(0);
  const [times, setTimes] = useState({});
  const [error, setError] = useState(null);
  const [hash, setHash] = useState(null);
  const [received, setReceived] = useState(null);
  const [copied, setCopied] = useState(false);
  const running = useRef(false);

  const submitted = useRef(null);
  const finished = done >= steps.length;
  const busy = !finished && !error;

  const mark = i => {
    setTimes(t => ({...t, [i]: nowTime()}));
    setDone(i + 1);
  };

  const finish = async (cfg, built, txHash) => {
    if (mode === 'deposit') {
      setReceived(`${fmt(toNumber(built.expectedShares), 4)} ${vault.shareSymbol}`);
    } else {
      setReceived(`${fmt(toNumber(built.expectedAssets), dec)} ${vault.symbol}`);
    }
    mark(3);
    refresh(address);
    setTimeout(() => refresh(address), 6000);
  };

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    const cfg = vault.config;
    try {
      if (submitted.current) {

        const {txHash, built} = submitted.current;
        await waitForTx(txHash);
        await finish(cfg, built, txHash);
        return;
      }
      setDone(0);
      setHash(null);

      let built = p.prebuilt && Date.now() - p.prebuilt.builtAt < PREBUILT_MAX_AGE ? p.prebuilt : null;
      if (!built) {
        built =
          mode === 'deposit'
            ? await buildDeposit(cfg, address, parseUnits(amountStr))
            : await buildWithdraw(cfg, address, parseUnits(amountStr), {all: !!p.all});
      }
      mark(0);

      const signed = await signXdr(built.xdr);
      mark(1);

      const txHash = await submitSigned(signed);
      submitted.current = {txHash, built};
      setHash(txHash);
      mark(2);

      await waitForTx(txHash);
      await finish(cfg, built, txHash);
    } catch (e) {
      console.warn('[Earn] tx failed', e && e.message);
      setError(humanError(e, mode));
    } finally {
      running.current = false;
    }
  }, [address, amountStr, mode, p.all, p.prebuilt, vault.id]);

  useEffect(() => {
    run();
  }, [run]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => busy);
    return () => sub.remove();
  }, [busy]);

  const navigated = useRef(false);
  const goSuccess = () => {
    if (navigated.current) return;
    navigated.current = true;
    navigation.replace('Success', {
      title: 'Success',
      message:
        mode === 'deposit'
          ? `${fmt(amount, dec)} ${vault.symbol} deposited into ${vault.name}. You're now earning ${vault.apy.toFixed(2)}% APY.`
          : `${received || `${fmt(amount, dec)} ${vault.symbol}`} withdrawn to your Stellar wallet.`,
      hash,
      primaryLabel: mode === 'withdraw' && p.all ? 'Explore Earn' : 'View Position',
      primaryRoute: mode === 'withdraw' && p.all ? 'EarnExplore' : 'Position',
      primaryParams: mode === 'withdraw' && p.all ? undefined : {positionId: vault.id},
      secondaryLabel: 'Back to Earn',
      secondaryRoute: 'EarnHome',
    });
  };

  const goSuccessRef = useRef(goSuccess);
  goSuccessRef.current = goSuccess;
  useEffect(() => {
    if (!finished || error) return undefined;
    const t = setTimeout(() => goSuccessRef.current(), 600);
    return () => clearTimeout(t);
  }, [finished, error]);

  const heroTitle = error
    ? 'Transaction failed'
    : finished
    ? mode === 'deposit'
      ? 'Your deposit is live'
      : 'Withdrawal complete'
    : mode === 'deposit'
    ? 'Depositing to Earn'
    : 'Withdrawing from Earn';
  const heroSub = error
    ? 'No funds were moved unless the transaction was confirmed.'
    : finished
    ? received
      ? `You received ${received}.`
      : 'Confirmed on Stellar.'
    : 'This usually takes less than a minute.';

  return (
    <Screen
      header={
        <Header
          title="Transaction Details"
          backIcon="close"
          onBack={busy ? undefined : () => navigation.navigate('EarnHome')}
        />
      }
      footer={
        error ? (
          <>
            <Button label={hash ? 'Check status again' : 'Try again'} icon="refresh" onPress={run} />
            <Button label="Back to Earn" variant="ghost" style={styles.mt8} onPress={() => navigation.navigate('EarnHome')} />
          </>
        ) : (
          <Button label={finished ? 'Continue' : 'Processing...'} disabled={!finished} onPress={goSuccess} />
        )
      }>
      <View style={styles.hero}>
        <View style={styles.ringOuter}>
          <View style={styles.ringInner}>
            {error ? (
              <Ionicons name="close" size={34} color={colors.danger} />
            ) : finished ? (
              <Ionicons name="checkmark" size={34} color={colors.success} />
            ) : (
              <TokenIcon symbol={vault.symbol} name={vault.name} size={46} />
            )}
          </View>
          {busy ? (
            <View style={styles.spinnerAbs}>
              <Spinner size={108} thickness={3} color={colors.primary} track="transparent" />
            </View>
          ) : null}
        </View>
        <Text style={styles.heroTitle}>{heroTitle}</Text>
        <Text style={styles.heroSub}>{heroSub}</Text>
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      <Card>
        {steps.map((s, i) => {
          const state = i < done ? 'done' : i === done ? (error ? 'failed' : 'active') : 'pending';
          const last = i === steps.length - 1;
          return (
            <View key={s.title} style={styles.step}>
              <View style={styles.stepRail}>
                <View
                  style={[
                    styles.stepDot,
                    state === 'done' && styles.stepDotDone,
                    state === 'active' && styles.stepDotActive,
                    state === 'failed' && styles.stepDotFailed,
                  ]}>
                  {state === 'done' ? <Ionicons name="checkmark" size={12} color={colors.successButtonText} /> : null}
                  {state === 'failed' ? <Ionicons name="close" size={12} color={colors.onPrimary} /> : null}
                  {state === 'active' ? <View style={styles.activeInner} /> : null}
                </View>
                {!last ? <View style={[styles.stepLine, i < done - 1 && styles.stepLineDone]} /> : null}
              </View>
              <View style={styles.stepBody}>
                <View style={styles.stepTop}>
                  <Text style={[styles.stepTitle, state === 'pending' && styles.muted]}>{s.title}</Text>
                  <Text style={styles.stepTime}>
                    {state === 'done'
                      ? times[i]
                      : state === 'active'
                      ? 'In progress'
                      : state === 'failed'
                      ? 'Failed'
                      : 'Pending'}
                  </Text>
                </View>
                <Text style={styles.stepSub}>{s.sub}</Text>
              </View>
            </View>
          );
        })}
      </Card>

      {hash ? (
        <View style={styles.hashRow}>
          <Text style={styles.hashLabel}>Tx hash</Text>
          <TouchableOpacity
            style={styles.hashBtn}
            onPress={() => {
              Clipboard.setString(hash);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}>
            <Text style={styles.hash}>{shortHash(hash)}</Text>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? colors.success : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.hashBtn} onPress={() => Linking.openURL(getExplorerTxUrl(hash))}>
            <Text style={styles.explorer}>Explorer</Text>
            <Ionicons name="open-outline" size={13} color={colors.accentText} />
          </TouchableOpacity>
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  mt8: {marginTop: spacing.sm},
  hero: {alignItems: 'center', paddingVertical: spacing.xxl},
  ringOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  spinnerAbs: {position: 'absolute'},
  heroTitle: {color: colors.text, fontSize: font.xl, fontWeight: '700', marginTop: spacing.lg},
  heroSub: {color: colors.textSecondary, fontSize: font.sm, marginTop: 4, textAlign: 'center'},

  errorCard: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, backgroundColor: colors.dangerSoft},
  errorText: {color: colors.danger, fontSize: font.sm, marginLeft: spacing.sm, flex: 1},

  step: {flexDirection: 'row'},
  stepRail: {width: 22, alignItems: 'center'},
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {backgroundColor: colors.success, borderColor: colors.success},
  stepDotActive: {borderColor: colors.primary},
  stepDotFailed: {backgroundColor: colors.danger, borderColor: colors.danger},
  activeInner: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary},
  stepLine: {width: 2, flex: 1, backgroundColor: colors.elevated, marginVertical: 2},
  stepLineDone: {backgroundColor: colors.success},
  stepBody: {flex: 1, marginLeft: spacing.md, paddingBottom: spacing.lg},
  stepTop: {flexDirection: 'row', justifyContent: 'space-between'},
  stepTitle: {color: colors.text, fontSize: font.sm, fontWeight: '600', flex: 1},
  muted: {color: colors.textMuted},
  stepTime: {color: colors.textMuted, fontSize: font.xs},
  stepSub: {color: colors.textMuted, fontSize: font.xs, marginTop: 2},

  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  hashLabel: {color: colors.textMuted, fontSize: font.xs, flex: 1},
  hashBtn: {flexDirection: 'row', alignItems: 'center', marginLeft: spacing.md},
  hash: {color: colors.textSecondary, fontSize: font.xs, marginRight: 4},
  explorer: {color: colors.accentText, fontSize: font.xs, marginRight: 4, fontWeight: '600'},
}));
