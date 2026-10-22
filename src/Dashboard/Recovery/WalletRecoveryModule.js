import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {useSelector} from 'react-redux';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types as documentTypes,
} from '@react-native-documents/picker';
import {
  fetchRecoveryAssets,
  isStellarWalletActivated,
  isValidStellarAddress,
  normalizeEmail,
  signAndBroadcastRecoveryTransaction,
} from './stellarRecoveryApi';
import defaultRecoveryApi from './proofApi';
import {
  isRecoveryWalletRegistered,
  rememberRecoveryWallet,
} from './recoveryStorage';
import {
  nextRecoveryStep,
  recoveryStatusNotice,
  recoveryStepOnResume,
  RECOVERY_STEPS as STEPS,
} from './recoveryState';
import {createRecoveryTheme} from './recoveryTheme';
import {formatRecoveryError} from './recoveryError';
const emailPattern = /^\S+@\S+\.\S+$/;
export const RECOVERY_EMAIL_RECIPIENT = 'claim@swiftexwallet.in';
const RecoveryStylesContext = React.createContext(null);

function useRecoveryStyles() {
  return useContext(RecoveryStylesContext) || fallbackStyles;
}

export function buildRecoveryMailUrl(walletAddress) {
  return `mailto:${RECOVERY_EMAIL_RECIPIENT}?subject=${encodeURIComponent(
    String(walletAddress || '').trim(),
  )}`;
}

function toMillis(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

const Button = ({title, onPress, secondary = false, disabled = false}) => (
  <ThemedButton title={title} onPress={onPress} secondary={secondary} disabled={disabled} />
);

const ThemedButton = ({title, onPress, secondary, disabled}) => {
  const styles = useRecoveryStyles();
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

export const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'none',
  multiline = false,
  disabled = false,
}) => (
  <View style={fallbackStyles.fieldWrap}>
    <Text style={fallbackStyles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={fallbackStyles.placeholder.color}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      editable={!disabled}
      multiline={multiline}
      style={[fallbackStyles.input, multiline && fallbackStyles.multiline]}
    />
  </View>
);

const ThemedField = props => {
  const styles = useRecoveryStyles();
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={styles.placeholder.color}
        autoCapitalize={props.autoCapitalize}
        autoCorrect={false}
        editable={!props.disabled}
        multiline={props.multiline}
        style={[styles.input, props.multiline && styles.multiline]}
      />
    </View>
  );
};

const ErrorText = ({message}) => {
  const styles = useRecoveryStyles();
  return message ? <Text selectabl={true} style={styles.error}>{message}</Text> : null;
};

export default function WalletRecoveryModule({
  walletAddress = '',
  onExit,
  onComplete,
  recoveryApi = defaultRecoveryApi,
  initialStep = STEPS.WELCOME,
}) {
  const isDarkTheme = useSelector(state => state?.THEME?.THEME === true);
  const styles = useMemo(
    () => createRecoveryStyles(createRecoveryTheme(isDarkTheme)),
    [isDarkTheme],
  );
  const [step, setStep] = useState(initialStep);
  const [storageReady, setStorageReady] = useState(false);
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [targetWallet, setTargetWallet] = useState(walletAddress);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [registration, setRegistration] = useState(null);
  const [pending, setPending] = useState(null);
  const [selectedEml, setSelectedEml] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState(5);
  const [statusChecking, setStatusChecking] = useState(false);
  const [recoveryAssets, setRecoveryAssets] = useState([]);
  const [recoveryAssetsLoading, setRecoveryAssetsLoading] = useState(false);
  const [recoveryAssetsError, setRecoveryAssetsError] = useState('');
  const [selectedAssetKeys, setSelectedAssetKeys] = useState([]);
  const selectedRecoveryAssets = recoveryAssets.filter(asset => selectedAssetKeys.includes(asset.key)).map(({key, balance, ...asset}) => asset);

  useEffect(() => {
    if (step !== STEPS.SETUP || !isValidStellarAddress(walletAddress)) return undefined;
    let mounted = true;
    setRecoveryAssetsLoading(true);
    setRecoveryAssetsError('');
    fetchRecoveryAssets(walletAddress)
      .then(assets => {
        if (mounted) setRecoveryAssets(assets);
      })
      .catch(() => {
        if (mounted) {
          setRecoveryAssets([]);
          setRecoveryAssetsError('Could not load wallet assets from Horizon. Please try again.');
        }
      })
      .finally(() => {
        if (mounted) setRecoveryAssetsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [step, walletAddress]);

  useEffect(() => {
    const available = new Set(recoveryAssets.map(asset => asset.key));
    const nativeKeys = recoveryAssets
      .filter(asset => asset.type === 'native')
      .map(asset => asset.key);
    setSelectedAssetKeys(keys => Array.from(new Set([
      ...keys.filter(key => available.has(key)),
      ...nativeKeys,
    ])));
  }, [recoveryAssets]);
  const stepRef = useRef(initialStep);
  const pollInFlight = useRef(false);
  const commitStep = useCallback(nextStep => {
    stepRef.current = nextStep;
    setStep(nextStep);
  }, []);

  const title = useMemo(
    () =>
      ({
        [STEPS.WAITING]: 'Recovery email',
        [STEPS.TIMELOCK]: 'Safety timelock',
        [STEPS.EXECUTING]: 'Completing recovery',
        [STEPS.READY]: 'Ready to recover',
        [STEPS.COMPLETE]: 'Recovery complete',
      }[step] || 'Wallet recovery'),
    [step],
  );

  const syncPending = useCallback(async (address, statusResult) => {
    const result = statusResult || await recoveryApi.getRecoveryStatus(address);
    const status = result?.status || '';
    const nextStep = nextRecoveryStep({
      currentStep: stepRef.current,
      status,
      hasUnlockAt: Boolean(result?.unlockAt),
    });

    const statusNotice = recoveryStatusNotice(status);
    if (statusNotice) setNotice(statusNotice);

    if (status === 'PENDING' && result?.unlockAt && nextStep === STEPS.TIMELOCK) {
      const normalized = {
        isPending: true,
        destination: result.destination,
        unlockAt: toMillis(result.unlockAt),
      };
      setPending(normalized);
      setRemaining(
        Math.max(0, Math.ceil((normalized.unlockAt - Date.now()) / 1000)),
      );
      commitStep(nextStep);
    } else if (status === 'STARTED') {
      commitStep(nextStep);
    } else if (status === 'EXECUTING') {
      commitStep(nextStep);
    } else if (status === 'COMPLETED') {
      commitStep(nextStep);
    } else if (status === 'FAILED') {
      setPending(null);
      setError(result.error || 'Recovery failed. Please try again.');
      commitStep(nextStep);
    }
    return {
      isPending: status === 'PENDING',
      isActive: result.isActive,
      status,
      attempt: result,
    };
  }, [recoveryApi, commitStep]);

  useEffect(() => {
    let mounted = true;
    setStorageReady(false);
    commitStep(initialStep);
    setEmail('');
    setConfirmEmail('');
    setRegistration(null);

    const restore = async () => {
      let isRegistered = false;
      try {
        isRegistered = await isRecoveryWalletRegistered(walletAddress);
        if (!mounted) return;
        if (!isRegistered) {
          commitStep(initialStep);
          return;
        }

        const statusResult = await recoveryApi.getRecoveryStatus(walletAddress);
        if (!mounted) return;
        const restoredStep = recoveryStepOnResume({
          isRegistered,
          initialStep,
          status: statusResult?.status,
          unlockAt: statusResult?.unlockAt,
        });
        commitStep(restoredStep);
        await syncPending(walletAddress, statusResult);
      } catch {
        if (mounted) {
          commitStep(
            recoveryStepOnResume({isRegistered, initialStep, status: ''}),
          );
        }
      } finally {
        if (mounted) setStorageReady(true);
      }
    };

    restore();
    return () => {
      mounted = false;
    };
  }, [walletAddress, initialStep, recoveryApi, syncPending, commitStep]);

  const refreshRecoveryStatus = useCallback(async () => {
    if (!targetWallet || pollInFlight.current) return;
    pollInFlight.current = true;
    setStatusChecking(true);
    try {
      await syncPending(targetWallet);
    } catch {
      setNotice('Could not check recovery status. Retrying automatically.');
    } finally {
      pollInFlight.current = false;
      setStatusChecking(false);
    }
  }, [targetWallet, syncPending]);

  useEffect(() => {
    if (![STEPS.WAITING, STEPS.TIMELOCK, STEPS.EXECUTING].includes(step))
      return undefined;
    refreshRecoveryStatus();
    const timer = setInterval(refreshRecoveryStatus, 6000);
    return () => clearInterval(timer);
  }, [step, refreshRecoveryStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        nextAppState === 'active' &&
        [STEPS.WAITING, STEPS.TIMELOCK, STEPS.EXECUTING].includes(step)
      ) {
        refreshRecoveryStatus();
      }
    });
    return () => subscription.remove();
  }, [step, refreshRecoveryStatus]);

  useEffect(() => {
    if (step !== STEPS.TIMELOCK || !pending?.unlockAt) return undefined;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((pending.unlockAt - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) commitStep(STEPS.READY);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [step, pending, commitStep]);

  const showError = useCallback(
    errorValue => {
      if (typeof __DEV__ !== 'undefined' && __DEV__)
        console.warn('Recovery operation failed:', errorValue);
      setError(formatRecoveryError(errorValue));
    },
  );

  const register = async () => {
    setError('');
    setNotice('');
    if (!isValidStellarAddress(walletAddress))
      return setError(
        'Connect a valid Stellar wallet before setting up recovery.',
      );
    if (!emailPattern.test(normalizeEmail(email)))
      return setError('Enter a valid recovery email.');
    if (normalizeEmail(email) !== normalizeEmail(confirmEmail))
      return setError('Recovery emails do not match.');
    setBusy(true);
    try {
      if (recoveryAssetsLoading)
        throw new Error('Wallet assets are still loading from Horizon.');
      if (recoveryAssetsError) throw new Error(recoveryAssetsError);
      if (!selectedRecoveryAssets.length)
        throw new Error('Select at least one asset to protect.');
      const prepared = await recoveryApi.prepareRecoveryRegistration({email, walletAddress, assets: selectedRecoveryAssets});
      const transactionHash = await signAndBroadcastRecoveryTransaction(prepared.unsignedXdr);
      const result = await recoveryApi.confirmRecoveryRegistration({email, walletAddress, transactionHash});
      await rememberRecoveryWallet(walletAddress);
      setRegistration(result);
      commitStep(STEPS.ACTIVE);
      onComplete?.(result);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const beginRecovery = async () => {
    setError('');
    setNotice('');
    if (!isValidStellarAddress(targetWallet))
      return setError('Enter the original Stellar wallet address.');
    if (!emailPattern.test(normalizeEmail(email)))
      return setError('Enter the registered recovery email.');
    setBusy(true);
    try {
      const originalWallet = targetWallet.trim();
      const isActivated = await isStellarWalletActivated(originalWallet);
      if (!isActivated) {
        setError(
          'This Stellar wallet is not activated. Fund it with XLM before starting recovery.',
        );
        return;
      }
      const existing = await syncPending(originalWallet);
      if (existing.isActive) return;
      commitStep(STEPS.WAITING);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const pickEml = async () => {
    setError('');
    try {
      const [file] = await pick({
        mode: 'import',
        type: [documentTypes.allFiles],
      });
      setSelectedEml({
        uri: file.uri,
        name: file.name || 'recovery.eml',
        type: file.type || 'message/rfc822',
      });
    } catch (e) {
      if (!isErrorWithCode(e) || e.code !== errorCodes.OPERATION_CANCELED)
        showError(e);
    }
  };

  const submitProof = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!selectedEml) {
        throw new Error('Select the delivered .eml file first.');
      }
      const result = await recoveryApi.startRecovery({
        owner: targetWallet,
        file: selectedEml,
      });
      setDestinationAddress(result.destination || '');
      setNotice(
        result.userOpTx
          ? `Recovery transaction submitted: ${result.userOpTx.slice(0, 12)}…`
          : 'Recovery transaction submitted.',
      );
      await syncPending(targetWallet);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await recoveryApi.executeRecovery(targetWallet);
      setNotice(
        result.userOpTx
          ? `Transaction: ${result.userOpTx}`
          : 'Funds swept to the destination wallet.',
      );
      await syncPending(targetWallet);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const header =
    step === STEPS.WELCOME || step === STEPS.ACTIVE ? null : (
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={styles.iconColor.color} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{width: 22}} />
      </View>
    );

  const renderBody = () => {
    if (step === STEPS.WELCOME)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.icon}>
            <Feather name="shield" size={30} color={styles.accent.color} />
          </View>
          <Text style={styles.heading}>Protect your wallet</Text>
          <Text style={styles.subheading}>
            Register an email guardian and recover funds to a new Stellar wallet
            if you lose access.
          </Text>
          <Button
            title="Set up recovery"
            onPress={() => commitStep(STEPS.SETUP)}
          />
          <Button
            title="Recover my funds"
            secondary
            onPress={() => commitStep(STEPS.RECOVER)}
          />
        </ScrollView>
      );
    if (step === STEPS.SETUP)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Register recovery email</Text>
          <Text style={styles.subheading}>
            Only the email commitment and salt are stored on-chain; your private
            key never leaves the device.
          </Text>
          <ThemedField
            label="Recovery email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <ThemedField
            label="Confirm email"
            value={confirmEmail}
            onChangeText={setConfirmEmail}
            placeholder="Re-enter email"
          />
          <Text style={styles.label}>Assets to protect</Text>
          {recoveryAssetsLoading && (
            <Text style={styles.muted}>Loading live wallet assets…</Text>
          )}
          {recoveryAssets.map(asset => (
            <TouchableOpacity key={asset.key} disabled={asset.type === 'native'} onPress={() => setSelectedAssetKeys(keys => keys.includes(asset.key) ? keys.filter(key => key !== asset.key) : [...keys, asset.key])} style={styles.assetOption}>
              <Text style={styles.assetOptionText}>{selectedAssetKeys.includes(asset.key) ? '☑' : '☐'} {asset.code} — {asset.balance}{asset.type === 'native' ? ' (required)' : ''}</Text>
            </TouchableOpacity>
          ))}
          <ErrorText message={recoveryAssetsError} />
          <Button
            title={busy ? 'Signing…' : 'Register on Stellar'}
            disabled={busy || recoveryAssetsLoading || Boolean(recoveryAssetsError)}
            onPress={register}
          />
          <ErrorText message={error} />
        </ScrollView>
      );
    if (step === STEPS.ACTIVE)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.icon}>
            <Feather name="check" size={30} color={styles.success.color} />
          </View>
          <Text style={styles.heading}>Recovery is active</Text>
          <Text style={styles.subheading}>
            {email
              ? `${email} is linked to this wallet.`
              : 'A recovery email is linked to this wallet.'}
          </Text>
          <Text style={styles.muted}>
            Guardian:{' '}
            {registration?.commitmentHex
              ? `${registration.commitmentHex.slice(0, 12)}…`
              : 'On-chain verified'}
          </Text>
          <Button
            title="Recover my funds"
            onPress={() => commitStep(STEPS.RECOVER)}
          />
          <Button title="Back" secondary onPress={onExit} />
        </ScrollView>
      );
    if (step === STEPS.RECOVER)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Start wallet recovery</Text>
          <Text style={styles.subheading}>
            The email must already be registered on the original wallet.
          </Text>
          <ThemedField
            label="Original wallet"
            value={targetWallet}
            onChangeText={setTargetWallet}
            placeholder="G..."
            autoCapitalize="characters"
            disabled={busy}
          />
          <ThemedField
            label="Registered email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <Button
            title={busy ? 'Checking ledger…' : 'Continue'}
            disabled={busy}
            onPress={beginRecovery}
          />
          <ErrorText message={error} />
        </ScrollView>
      );
    if (step === STEPS.WAITING)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Send recovery email</Text>
          <Text style={styles.subheading}>
            Send the prepared email from your registered inbox. The backend
            webhook will verify it and start recovery automatically.
          </Text>
          <Text style={styles.muted}>
            If the webhook is unavailable, use the delivered signed `.eml` file
            as a manual fallback. The Sent copy usually has no DKIM signature.
          </Text>
          <Button
            title={selectedEml ? `Selected: ${selectedEml.name}` : 'Use .eml fallback'}
            secondary
            disabled={busy}
            onPress={pickEml}
          />
          <Button
            title={busy ? 'Submitting…' : 'Submit manual recovery proof'}
            disabled={busy || !selectedEml}
            onPress={submitProof}
          />
          <Button
            title="Refresh status"
            secondary
            disabled={busy}
            onPress={() => syncPending(targetWallet)}
          />
          <Button
            title="Open mail app"
            secondary
            onPress={() => Linking.openURL(buildRecoveryMailUrl(walletAddress))}
          />
          <Text style={styles.notice}>
            {statusChecking ? 'Checking recovery status…' : notice}
          </Text>
          <ErrorText message={error} />
        </ScrollView>
      );
    if (step === STEPS.TIMELOCK)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Safety timelock active</Text>
          <Text style={styles.subheading}>
            Funds remain protected while the on-chain cancellation window is
            open.
          </Text>
          <Text style={styles.timer}>{remaining}s</Text>
          <Text style={styles.notice}>
            {statusChecking ? 'Checking recovery status…' : notice}
          </Text>
          <ErrorText message={error} />
        </ScrollView>
      );
    if (step === STEPS.EXECUTING)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Completing recovery</Text>
          <Text style={styles.subheading}>
            The recovery transaction is being finalized. This screen will
            update automatically.
          </Text>
          <Text style={styles.notice}>
            {statusChecking ? 'Checking recovery status…' : notice}
          </Text>
          <ErrorText message={error} />
        </ScrollView>
      );
    if (step === STEPS.READY)
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Ready to complete recovery</Text>
          <Text style={styles.subheading}>
            The timelock has elapsed. Execute the smart contract sweep to move
            protected assets.
          </Text>
          <Button
            title={busy ? 'Executing…' : 'Execute recovery'}
            disabled={busy}
            onPress={execute}
          />
          <ErrorText message={error} />
        </ScrollView>
      );
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.icon}>
          <Feather name="check-circle" size={30} color={styles.success.color} />
        </View>
        <Text style={styles.heading}>Wallet recovery complete</Text>
        <Text style={styles.subheading}>
          The smart contract execution finished. Check the destination wallet
          for the swept balances.
        </Text>
        <Text style={styles.notice}>{notice}</Text>
        <Button title="Done" onPress={onExit} />
      </ScrollView>
    );
  };

  const screen = !storageReady ? (
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subheading}>Checking recovery status…</Text>
        </ScrollView>
      </SafeAreaView>
  ) : (
    <SafeAreaView style={styles.root}>
      {header}
      {renderBody()}
    </SafeAreaView>
  );

  return (
    <RecoveryStylesContext.Provider value={styles}>
      {screen}
    </RecoveryStylesContext.Provider>
  );
}

const createRecoveryStyles = theme => StyleSheet.create({
  root: {flex: 1, backgroundColor: theme.background},
  content: {
    padding: 22,
    paddingBottom: 44,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {color: theme.text, fontSize: 16, fontWeight: '700'},
  iconColor: {color: theme.text},
  accent: {color: theme.primary},
  success: {color: theme.success},
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  heading: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  subheading: {
    color: theme.subtext,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 26,
  },
  fieldWrap: {marginBottom: 16},
  label: {color: theme.text, fontSize: 13, fontWeight: '600', marginBottom: 7},
  assetOption: {padding: 13, marginBottom: 8, borderRadius: 10, backgroundColor: theme.input},
  assetOptionText: {color: theme.text, fontSize: 14},
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: theme.text,
    backgroundColor: theme.input,
  },
  multiline: {minHeight: 130, paddingTop: 13, textAlignVertical: 'top'},
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButton: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  buttonText: {color: '#FFF', fontSize: 15, fontWeight: '700'},
  secondaryButtonText: {color: theme.text},
  disabled: {opacity: 0.45},
  error: {color: theme.error, textAlign: 'center', marginTop: 12, lineHeight: 19},
  notice: {
    color: theme.muted,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 19,
  },
  muted: {
    color: theme.muted,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 12,
  },
  timer: {
    color: theme.primary,
    fontSize: 68,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: 24,
  },
  placeholder: {color: theme.muted},
});

const fallbackStyles = createRecoveryStyles(createRecoveryTheme(true));
