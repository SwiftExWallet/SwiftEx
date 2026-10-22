import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  NativeModules,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {REACT_APP_HOST} from '../ExchangeConstants';
import {useDispatch, useSelector} from 'react-redux';
import {CHAINS} from '../../../../../utilities/TokenUtils';
import {
  ENVIRONMENT,
  STELLAR_USDC_ISSUER,
  STELLAR_URL,
} from '../../../../constants';
import {activateStellarAccountFlow} from '../utils/WalletActivationComponent';
import {
  hasMinimumSepoliaEth,
  MINIMUM_SEPOLIA_ETH_FOR_MINT,
} from './bridgeRequirements';
import {
  clearSavedBridgeTransfer,
  getSavedBridgeTransfer,
  isInsufficientGasError,
  isMissingBridgeTransferError,
  isTerminalBridgeStatus,
  saveBridgeTransfer,
} from './bridgeTransferStorage';
import * as StellarSdk from '@stellar/stellar-sdk';

const {TransactionSigner, StellarSigner} = NativeModules;
const API_BASE_URL = REACT_APP_HOST;
const EVM_TO_STELLAR = 'EVM_TO_STELLAR';
const STELLAR_TO_EVM = 'STELLAR_TO_EVM';
const BRIDGE_UI_DEMO_MODE = false;
const WALLET_ACTIVATION_FEE_USDC = '0.91';
const USDC_IMAGE =
  CHAINS.STR?.bridgeSupportTokens?.find(token => token.symbol === 'USDC')
    ?.logoURI ||
  CHAINS.ETH?.bridgeSupportTokens?.find(token => token.symbol === 'USDC')
    ?.logoURI ||
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png';

const createActivationRequiredQuote = ({
  amount,
  direction,
  sourceChain,
  effectiveFast,
}) => ({
  amount,
  protocolFee: '0',
  maxFee: '0',
  minimumReceived: amount,
  sourceChain,
  fast: effectiveFast,
  direction,
  requiresWalletActivation: true,
  walletActivationFee: WALLET_ACTIVATION_FEE_USDC,
});

async function fetchStellarUsdcReady(address) {
  if (!address) return null;
  try {
    const response = await fetch(`${STELLAR_URL.URL}/accounts/${address}`);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const balances = Array.isArray(data?.balances) ? data.balances : [];
    const configuredIssuer = CHAINS.STR?.bridgeSupportTokens?.find(
      token => token.symbol === 'USDC',
    )?.address;
    const acceptedIssuers = new Set(
      [configuredIssuer, STELLAR_USDC_ISSUER]
        .filter(Boolean)
        .map(issuer => issuer.toLowerCase()),
    );
    return balances.some(
      balance =>
        balance.asset_code === 'USDC' &&
        acceptedIssuers.has(balance.asset_issuer?.toLowerCase()),
    );
  } catch (_) {
    return null;
  }
}

function toNumber(value) {
  const next = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(next) ? next : 0;
}

function formatBalance(value) {
  const next = toNumber(value);
  if (next === 0) return '0';
  if (next < 0.000001) return '<0.000001';
  return next.toFixed(6).replace(/\.?0+$/, '');
}

function findPortfolioUsdcBalance(portfolio, chainKey, chainMeta) {
  if (!Array.isArray(portfolio) || !chainKey) return null;

  const usdcAsset = chainMeta?.bridgeSupportTokens?.find(
    token => token?.symbol === 'USDC',
  );
  const usdcAddress = usdcAsset?.address?.toLowerCase();
  if (!usdcAddress) return null;

  return (
    portfolio.find(
      token => token?.contractAddress?.toLowerCase?.() === usdcAddress,
    ) || null
  );
}

function findEvmUsdcBalance(portfolio, chainKey, chainMeta) {
  if (!Array.isArray(portfolio)) return null;

  const chainLabels = new Set(
    [chainKey, chainMeta?.symbol, chainMeta?.name, chainMeta?.chainName]
      .filter(Boolean)
      .map(value => String(value).toLowerCase()),
  );

  return (
    portfolio.find(
      token =>
        token?.symbol === 'USDC' &&
        chainLabels.has(String(token?.chain || '').toLowerCase()),
    ) || null
  );
}

function findStellarUsdcBalance(assetData, portfolio) {
  const usdcAddresses = new Set(
    [
      CHAINS.STR?.bridgeSupportTokens?.find(token => token?.symbol === 'USDC')
        ?.address,
      STELLAR_USDC_ISSUER,
    ]
      .filter(Boolean)
      .map(address => address.toLowerCase()),
  );
  const assetBalance = Array.isArray(assetData)
    ? assetData.find(
        asset =>
          usdcAddresses.has(asset?.asset_issuer?.toLowerCase?.()) ||
          usdcAddresses.has(asset?.contractAddress?.toLowerCase?.()) ||
          (asset?.symbol === 'USDC' &&
            Boolean(asset?.asset_issuer || asset?.contractAddress)),
      )
    : null;
  if (assetBalance) return assetBalance;

  return (
    findPortfolioUsdcBalance(portfolio, 'STR', CHAINS.STR) ||
    portfolio?.find?.(
      token => token?.symbol === 'USDC' && Boolean(token?.contractAddress),
    ) ||
    null
  );
}

const CCTP_CHAIN_META = {
  sepolia: 'ETH',
  arbitrum_sepolia: 'ARB',
  base_sepolia: 'BASE',
  optimism_sepolia: 'OPT',
  avalanche_fuji: 'AVAX',
};

export const EVM_SOURCE_CHAINS = {
  sepolia: {
    label: 'Ethereum Sepolia',
    nativeChainKey: 'ETH',
    chainId: 11155111,
    supportsFastTransfer: true,
  },
  arbitrum_sepolia: {
    label: 'Arbitrum Sepolia',
    nativeChainKey: 'ARBITRUM',
    chainId: 421614,
    supportsFastTransfer: true,
  },
  base_sepolia: {
    label: 'Base Sepolia',
    nativeChainKey: 'BASE',
    chainId: 84532,
    supportsFastTransfer: true,
  },
  optimism_sepolia: {
    label: 'Optimism Sepolia',
    nativeChainKey: 'OPTIMISM',
    chainId: 11155420,
    supportsFastTransfer: true,
  },
  avalanche_fuji: {
    label: 'Avalanche Fuji',
    nativeChainKey: 'AVALANCHE',
    chainId: 43113,
    supportsFastTransfer: false,
  },
};

const STATUS_META = {
  APPROVAL_SIGNATURE_REQUIRED: {
    icon: '',
    label: 'Approval signature needed',
    color: 'warn',
  },
  APPROVAL_PENDING: {icon: '', label: 'Approval confirming', color: 'warn'},
  BRIDGE_SIGNATURE_REQUIRED: {
    icon: '',
    label: 'Sign bridge transaction',
    color: 'warn',
  },
  BURN_SIGNATURE_REQUIRED: {
    icon: '',
    label: 'Sign Stellar burn',
    color: 'warn',
  },
  STELLAR_APPROVAL_SIGNATURE_REQUIRED: {
    icon: '',
    label: 'Approve Stellar USDC',
    color: 'warn',
  },
  STELLAR_APPROVAL_PENDING: {
    icon: '',
    label: 'Stellar approval confirming',
    color: 'warn',
  },
  SOURCE_PENDING: {icon: '', label: 'Source chain confirming', color: 'warn'},
  ATTESTATION_PENDING: {icon: '', label: 'Circle attesting', color: 'warn'},
  STELLAR_SIGNATURE_REQUIRED: {
    icon: '',
    label: 'Sign Stellar transaction',
    color: 'warn',
  },
  MINT_SIGNATURE_REQUIRED: {icon: '', label: 'Sign EVM mint', color: 'warn'},
  DESTINATION_PENDING: {
    icon: '',
    label: 'Destination confirming',
    color: 'warn',
  },
  COMPLETED: {icon: '', label: 'Completed', color: 'success'},
  FAILED: {icon: '', label: 'Failed', color: 'fail'},
};

const STEPS = [
  {key: 'source', label: 'Source tx'},
  {key: 'attest', label: 'Attestation'},
  {key: 'destination', label: 'Destination tx'},
];

function getStepIndex(status) {
  if (!status) return -1;
  if (
    [
      'APPROVAL_SIGNATURE_REQUIRED',
      'APPROVAL_PENDING',
      'BRIDGE_SIGNATURE_REQUIRED',
      'BURN_SIGNATURE_REQUIRED',
      'STELLAR_APPROVAL_SIGNATURE_REQUIRED',
      'STELLAR_APPROVAL_PENDING',
      'SOURCE_PENDING',
      'STELLAR_SIGNATURE_REQUIRED',
    ].includes(status)
  )
    return 0;
  if (status === 'ATTESTATION_PENDING') return 1;
  if (['MINT_SIGNATURE_REQUIRED', 'DESTINATION_PENDING'].includes(status))
    return 2;
  if (status === 'COMPLETED') return 3;
  return -1;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/v1${path}`, {
    ...options,
    headers: {'Content-Type': 'application/json', ...(options.headers || {})},
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_) {}
  if (!response.ok) {
    const message =
      data?.message || data?.error || `Request failed: HTTP ${response.status}`;
    const error = new Error(
      Array.isArray(message) ? message.join(', ') : String(message),
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function AddressRow({label, address, theme}) {
  const short = address
    ? `${address.slice(0, 8)}...${address.slice(-6)}`
    : 'Not connected';
  return (
    <View style={addrStyles.row}>
      <Text style={[addrStyles.label, {color: theme.inactiveTx}]}>{label}</Text>
      <View style={[addrStyles.pill, {backgroundColor: theme.cardBg}]}>
        <Text style={[addrStyles.addr, {color: theme.cardSubTx}]}>{short}</Text>
      </View>
    </View>
  );
}
const addrStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  label: {fontSize: 12, fontWeight: '600', letterSpacing: 0.4},
  pill: {borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5},
  addr: {fontSize: 12, fontFamily: 'monospace'},
});

function ProgressStepper({status, theme}) {
  const stepIndex = getStepIndex(status);
  const isFailed = status === 'FAILED';
  return (
    <View style={stepStyles.row}>
      {STEPS.map((step, i) => {
        const done = stepIndex > i || (!isFailed && stepIndex === 3);
        const active = stepIndex === i;
        const failed = isFailed && active;
        const dotColor = failed
          ? theme.fail
          : done
          ? theme.success
          : active
          ? theme.buttonColor
          : theme.inactiveTx;
        return (
          <React.Fragment key={step.key}>
            <View style={stepStyles.stepCol}>
              <View
                style={[
                  stepStyles.dot,
                  {
                    borderColor: dotColor,
                    backgroundColor: done || active ? dotColor : 'transparent',
                  },
                ]}>
                {done && !active && <Text style={stepStyles.check}>✓</Text>}
                {active && !done && (
                  <View style={[stepStyles.inner, {backgroundColor: '#fff'}]} />
                )}
              </View>
              <Text
                style={[
                  stepStyles.stepLabel,
                  {color: active || done ? theme.headingTx : theme.inactiveTx},
                ]}>
                {step.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View
                style={[
                  stepStyles.line,
                  {
                    backgroundColor:
                      stepIndex > i
                        ? theme.success
                        : theme.smallCardBorderColor,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const ACTIVATION_FLOW_STEPS = [
  {key: 'activation', label: 'Wallet Activation'},
  {key: 'swap', label: 'Swap Execution'},
  {key: 'completed', label: 'Completed'},
];

function ActivationFlowStepper({flow, theme, onRetry}) {
  if (!flow?.visible) return null;
  const steps = flow.activationSkipped
    ? ACTIVATION_FLOW_STEPS.slice(1)
    : ACTIVATION_FLOW_STEPS;
  return (
    <View
      style={[
        activationFlowStyles.card,
        {borderColor: theme.smallCardBorderColor},
      ]}>
      {flow.awaitingResume ? (
        <View style={activationFlowStyles.resumeWrap}>
          <Text
            style={[activationFlowStyles.resumeTitle, {color: theme.success}]}>
            Resume Tx
          </Text>
          <ActivityIndicator color={theme.buttonColor} size="small" />
        </View>
      ) : (
        <View style={activationFlowStyles.row}>
          {steps.map((step, index) => {
            const status = flow[step.key] || 'idle';
            const done = status === 'success';
            const active = status === 'loading';
            const failed = status === 'error';
            const color = failed
              ? theme.fail
              : done
              ? theme.success
              : active
              ? theme.buttonColor
              : theme.inactiveTx;

            return (
              <React.Fragment key={step.key}>
                <View style={activationFlowStyles.step}>
                  <View
                    style={[
                      activationFlowStyles.dot,
                      {
                        borderColor: color,
                        backgroundColor: done ? color : 'transparent',
                      },
                    ]}>
                    {done ? (
                      <Text style={activationFlowStyles.check}>✓</Text>
                    ) : active ? (
                      <ActivityIndicator color={color} size="small" />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      activationFlowStyles.label,
                      {
                        color:
                          done || active || failed ? color : theme.inactiveTx,
                      },
                    ]}>
                    {step.label}
                  </Text>
                </View>
                {index < steps.length - 1 && (
                  <View
                    style={[
                      activationFlowStyles.line,
                      {
                        backgroundColor:
                          done || flow[steps[index + 1].key] === 'success'
                            ? theme.success
                            : theme.smallCardBorderColor,
                      },
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
      )}
      {!!flow.error && (
        <>
          <Text style={[activationFlowStyles.error, {color: theme.fail}]}>
            {flow.error}
          </Text>
          <TouchableOpacity
            style={[activationFlowStyles.retryBtn, {borderColor: theme.fail}]}
            onPress={onRetry}>
            <Text style={[activationFlowStyles.retryText, {color: theme.fail}]}>
              Retry
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginVertical: 16,
  },
  stepCol: {alignItems: 'center', width: 72},
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  inner: {width: 8, height: 8, borderRadius: 4},
  check: {fontSize: 11, color: '#fff', fontWeight: '700'},
  stepLabel: {fontSize: 10, fontWeight: '600', textAlign: 'center'},
  line: {flex: 1, height: 2, marginTop: 10, borderRadius: 1},
});

const activationFlowStyles = StyleSheet.create({
  card: {borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12},
  row: {flexDirection: 'row', alignItems: 'flex-start'},
  step: {alignItems: 'center', width: 82},
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  check: {color: '#fff', fontSize: 12, fontWeight: '800'},
  label: {fontSize: 10, fontWeight: '700', textAlign: 'center'},
  line: {flex: 1, height: 2, marginTop: 11, borderRadius: 1},
  error: {fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center'},
  resumeWrap: {alignItems: 'center', paddingVertical: 4},
  resumeTitle: {fontSize: 13, fontWeight: '800'},
  retryBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 10,
  },
  retryText: {fontSize: 13, fontWeight: '800'},
});

function StatusBadge({status, theme}) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const color = theme[meta.color] || theme.inactiveTx;
  return (
    <View
      style={[
        badgeStyles.badge,
        {backgroundColor: color + '22', borderColor: color + '55'},
      ]}>
      <Text style={badgeStyles.icon}>{meta.icon}</Text>
      <Text style={[badgeStyles.label, {color}]}>{meta.label}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    gap: 6,
  },
  icon: {fontSize: 13},
  label: {fontSize: 12, fontWeight: '700'},
});

function TxHashRow({label, hash, theme}) {
  if (!hash) return null;
  const short = `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  return (
    <View style={hashStyles.row}>
      <Text style={[hashStyles.label, {color: theme.inactiveTx}]}>{label}</Text>
      <Text style={[hashStyles.hash, {color: theme.buttonColor}]}>{short}</Text>
    </View>
  );
}
const hashStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  label: {fontSize: 11, fontWeight: '600'},
  hash: {fontSize: 11, fontFamily: 'monospace'},
});

function RecoveryBottomSheet({message, transfer, theme, visible, onClose}) {
  if (!transfer) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}>
      <View style={recoverySheetStyles.backdrop}>
        <View
          style={[
            recoverySheetStyles.sheet,
            {backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor},
          ]}>
          <View
            style={[
              recoverySheetStyles.handle,
              {backgroundColor: theme.smallCardBorderColor},
            ]}
          />
          <View style={recoverySheetStyles.header}>
            <View>
              <Text style={[recoverySheetStyles.title, {color: theme.headingTx}]}>
                Bridge transfer in progress
              </Text>
              <Text style={[recoverySheetStyles.subtitle, {color: theme.inactiveTx}]}>
                We restored your latest transfer and are checking its status.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={[recoverySheetStyles.close, {color: theme.inactiveTx}]}>✕</Text>
            </TouchableOpacity>
          </View>
          <StatusBadge status={transfer.status} theme={theme} />
          <ProgressStepper status={transfer.status} theme={theme} />
          <Text style={[recoverySheetStyles.status, {color: theme.buttonColor}]}>
            {transfer.error || message || transfer.status}
          </Text>
          <Text style={[recoverySheetStyles.idLabel, {color: theme.inactiveTx}]}>
            Transfer ID
          </Text>
          <Text
            numberOfLines={1}
            style={[recoverySheetStyles.id, {color: theme.headingTx}]}
          >
            {transfer.id}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const recoverySheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#00000088',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {alignSelf: 'center', borderRadius: 3, height: 5, width: 44},
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  title: {fontSize: 18, fontWeight: '800'},
  subtitle: {fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 285},
  close: {fontSize: 20, fontWeight: '700', paddingLeft: 12},
  status: {fontSize: 13, fontWeight: '700', marginBottom: 10, textAlign: 'center'},
  idLabel: {fontSize: 11, fontWeight: '700', marginTop: 4},
  id: {fontFamily: 'monospace', fontSize: 12, marginTop: 4},
});

export default function BridgeScreen({directionEnable, isActive = true}) {
  console.info(directionEnable);
  const dispatch = useDispatch();
  const state = useSelector(state => state);
  const evmAddress = state.wallet.address;
  const stellarAddress = state.STELLAR_PUBLICK_KEY;
  const stellarAssetData = state.assetData;
  const portfolio = Array.isArray(state.activeWalletPortFolio)
    ? state.activeWalletPortFolio
    : Array.isArray(state.activeWalletPortFolio?.tokens)
    ? state.activeWalletPortFolio.tokens
    : [];
  const themeMode = state.THEME.THEME;
  const isDark = !!themeMode;
  const colors = {
    light: {
      bg: '#FFFFFF',
      cardBg: '#F4F4F8',
      headingTx: '#272729',
      smallCardBg: '#3c74edff',
      smallCardBorderColor: '#5E5C5C66',
      cardSubTx: '#272729',
      inactiveTx: '#7a7878ff',
      buttonColor: '#5D5FEF',
      success: '#34D399',
      fail: '#F87171',
      warn: '#F59E0B',
    },
    dark: {
      bg: '#0B0B0F',
      cardBg: '#16161D',
      headingTx: '#E6E8EB',
      smallCardBg: '#3f608eff',
      smallCardBorderColor: '#AAAAAA66',
      cardSubTx: '#E6E8EB',
      inactiveTx: '#AAAAAA',
      buttonColor: '#5D5FEF',
      success: '#34D399',
      fail: '#F87171',
      warn: '#F59E0B',
    },
  };
  const theme = isDark ? colors.dark : colors.light;

  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState(directionEnable);
  const [sourceChain, setSourceChain] = useState('sepolia');
  const [fast, setFast] = useState(true);
  const [quote, setQuote] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [recoverySheetVisible, setRecoverySheetVisible] = useState(false);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [pollingRefreshKey, setPollingRefreshKey] = useState(0);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stellarUsdcReady, setStellarUsdcReady] = useState(null);
  const [activationFlow, setActivationFlow] = useState({
    visible: false,
    activation: 'idle',
    swap: 'idle',
    completed: 'idle',
    error: '',
  });

  const processingRef = useRef(false);
  const creatingTransferRef = useRef(false);
  const reverseIdempotencyRef = useRef(null);
  const lastSigningRef = useRef(null);
  const activationRetryingRef = useRef(false);
  const activationRequiredRef = useRef(false);
  const restorationStartedRef = useRef(false);

  const selectedChain =
    EVM_SOURCE_CHAINS[sourceChain] || EVM_SOURCE_CHAINS.sepolia;
  const effectiveFast = selectedChain.supportsFastTransfer && fast;
  const isReverse = direction === STELLAR_TO_EVM;
  const sourceLabel = isReverse ? 'Stellar' : selectedChain.label;
  const destinationLabel = isReverse ? 'Ethereum Sepolia' : 'Stellar';
  const sourceAddress = isReverse ? stellarAddress : evmAddress;
  const destinationAddress = isReverse ? evmAddress : stellarAddress;
  const sourceChainMeta = isReverse
    ? CHAINS.STR
    : CHAINS[CCTP_CHAIN_META[sourceChain]];
  const destinationChainMeta = isReverse ? CHAINS.ETH : CHAINS.STR;
  const walletStorageScope = [evmAddress, stellarAddress]
    .filter(Boolean)
    .map(address => String(address).toLowerCase())
    .join(':');
  const transferWalletScopeRef = useRef(null);
  const currentWalletScopeRef = useRef(walletStorageScope);
  const shouldShowActivationFee = !isReverse && stellarUsdcReady === false;
  const sourcePortfolioChainKey = !isReverse
    ? CCTP_CHAIN_META[sourceChain]
    : 'STR';
  const selectedUsdcBalanceToken = isReverse
    ? findStellarUsdcBalance(stellarAssetData, portfolio)
    : findEvmUsdcBalance(portfolio, sourcePortfolioChainKey, sourceChainMeta);
  const selectedUsdcBalance = toNumber(selectedUsdcBalanceToken?.balance);
  const requiredSourceUsdc = quote
    ? toNumber(quote.amount || amount) +
      (quote.requiresWalletActivation || shouldShowActivationFee
        ? toNumber(quote.walletActivationFee || WALLET_ACTIVATION_FEE_USDC)
        : 0)
    : toNumber(amount);
  const hasInsufficientSourceBalance =
    !!quote &&
    requiredSourceUsdc > 0 &&
    selectedUsdcBalance < requiredSourceUsdc;
  const hasRequiredSepoliaEth = hasMinimumSepoliaEth(portfolio);

  const isActivationRequiredError = useCallback(value => {
    const raw = value?.message || String(value || '');
    return /trustline|wallet.*activated|wallet.*activation|does not have USDC/i.test(
      raw,
    );
  }, []);

  const readableError = useCallback(value => {
    const raw = value?.message || String(value || 'Request failed');
    if (
      /trustline|wallet.*activated|wallet.*activation|does not have USDC/i.test(
        raw,
      )
    )
      return 'Stellar wallet needs activation and USDC trustline setup before receiving CCTP USDC.';
    if (/not enough allowance|allowance to spend|allowance/i.test(raw))
      return 'Stellar USDC approval required. Approve the Token Messenger to spend this USDC amount, then start the bridge again.';
    if (/estimateGas|execution reverted|missing revert data/i.test(raw))
      return 'Bridge router rejected this transaction. Check the selected chain, USDC balance, approval, and try a fresh quote.';
    if (/network|fetch failed|timeout/i.test(raw))
      return 'Network request failed. Check your connection and try again.';
    return raw;
  }, []);

  const validateWallets = useCallback(() => {
    if (!evmAddress) {
      Alert.alert('Wallet', 'EVM wallet not connected.');
      return false;
    }
    if (!stellarAddress) {
      Alert.alert('Wallet', 'Stellar wallet not connected.');
      return false;
    }
    if (!amount.trim()) {
      Alert.alert('Amount', 'Enter USDC amount.');
      return false;
    }
    return true;
  }, [amount, evmAddress, stellarAddress]);

  useEffect(() => {
    let cancelled = false;
    setStellarUsdcReady(null);

    if (!stellarAddress) {
      return () => {
        cancelled = true;
      };
    }

    fetchStellarUsdcReady(stellarAddress).then(isReady => {
      if (!cancelled) {
        setStellarUsdcReady(isReady);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [stellarAddress]);

  useEffect(() => {
    if (isReverse || stellarUsdcReady === null) return;
    setQuote(currentQuote => {
      if (!currentQuote) return currentQuote;
      if (stellarUsdcReady) {
        if (
          !currentQuote.requiresWalletActivation &&
          !currentQuote.walletActivationFee
        ) {
          return currentQuote;
        }
        const nextQuote = {...currentQuote};
        delete nextQuote.requiresWalletActivation;
        delete nextQuote.walletActivationFee;
        return nextQuote;
      }
      return {
        ...currentQuote,
        requiresWalletActivation: true,
        walletActivationFee: WALLET_ACTIVATION_FEE_USDC,
      };
    });
  }, [isReverse, stellarUsdcReady]);

  useEffect(() => {
    if (currentWalletScopeRef.current === walletStorageScope) return;
    currentWalletScopeRef.current = walletStorageScope;
    transferWalletScopeRef.current = null;
    restorationStartedRef.current = false;
    setTransfer(null);
    setRecoverySheetVisible(false);
    setMessage('');
  }, [walletStorageScope]);

  useEffect(() => {
    if (
      !isActive ||
      !walletStorageScope ||
      transfer ||
      restorationStartedRef.current
    )
      return;

    let cancelled = false;
    restorationStartedRef.current = true;
    getSavedBridgeTransfer(directionEnable, walletStorageScope).then(savedTransfer => {
      if (cancelled || !savedTransfer) return;
      transferWalletScopeRef.current = walletStorageScope;
      setTransfer(savedTransfer);
      setRecoverySheetVisible(true);
      setMessage('Restoring your previous bridge transfer...');
    });

    return () => {
      cancelled = true;
    };
  }, [directionEnable, isActive, transfer, walletStorageScope]);

  useEffect(() => {
    if (!transfer?.id || !transfer?.status) return;
    if (transferWalletScopeRef.current !== walletStorageScope) return;

    if (isTerminalBridgeStatus(transfer.status)) {
      clearSavedBridgeTransfer(directionEnable, walletStorageScope).catch(error =>
        console.error('Bridge transfer cleanup error:', error),
      );
      setRecoverySheetVisible(false);
      return;
    }

    saveBridgeTransfer(directionEnable, transfer, walletStorageScope).catch(error =>
      console.error('Bridge transfer persistence error:', error),
    );
  }, [directionEnable, transfer, walletStorageScope]);

  const runActivationFlow = useCallback(async () => {
    if (activationRetryingRef.current) return false;
    activationRetryingRef.current = true;
    setError('');
    setLoading(true);
    setActivationFlow({
      visible: true,
      activation: 'loading',
      swap: 'idle',
      completed: 'idle',
      error: '',
    });

    try {
      await activateStellarAccountFlow({
        state,
        dispatch,
        showToast: false,
      });
      setStellarUsdcReady(true);
      setQuote(currentQuote =>
        currentQuote
          ? {
              ...currentQuote,
              requiresWalletActivation: false,
              walletActivationFee: undefined,
            }
          : currentQuote,
      );
      setActivationFlow({
        visible: true,
        activation: 'success',
        swap: 'idle',
        completed: 'idle',
        awaitingResume: true,
        activationSkipped: false,
        error: '',
      });
      setMessage('Wallet activated. Resume the transaction to continue.');
      return true;
    } catch (error) {
      console.error('Bridge wallet activation failed:', error);
      setActivationFlow({
        visible: true,
        activation: 'error',
        swap: 'idle',
        completed: 'idle',
        error: 'Wallet activation failed. Please retry.',
      });
      setMessage('');
      return false;
    } finally {
      activationRetryingRef.current = false;
      setLoading(false);
    }
  }, [dispatch, state]);

  const runDemoBridgeFlow = useCallback(
    async ({resume = false} = {}) => {
      if (!resume) {
        setError('');
        setLoading(false);
        setQuote(currentQuote =>
          currentQuote
            ? {
                ...currentQuote,
                requiresWalletActivation: true,
                walletActivationFee: WALLET_ACTIVATION_FEE_USDC,
              }
            : currentQuote,
        );
        setActivationFlow({
          visible: true,
          activation: 'loading',
          swap: 'idle',
          completed: 'idle',
          awaitingResume: false,
          activationSkipped: false,
          error: '',
        });
        setMessage('Demo: activating wallet...');
        await new Promise(resolve => setTimeout(resolve, 4000));
        setActivationFlow({
          visible: true,
          activation: 'success',
          swap: 'idle',
          completed: 'idle',
          awaitingResume: true,
          activationSkipped: false,
          error: '',
        });
        setMessage(
          'Demo: wallet activation completed. Resume the transaction.',
        );
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      setError('');
      setLoading(true);
      setActivationFlow({
        visible: true,
        activation: 'success',
        swap: 'loading',
        completed: 'idle',
        awaitingResume: false,
        activationSkipped: false,
        error: '',
      });
      setMessage('Demo: executing bridge...');

      await new Promise(resolve => setTimeout(resolve, 5000));
      setActivationFlow(currentFlow => ({
        ...currentFlow,
        activation: 'success',
        swap: 'success',
        completed: 'loading',
        error: '',
      }));
      setMessage('Demo: completing bridge...');

      await new Promise(resolve => setTimeout(resolve, 5000));
      setActivationFlow({
        visible: true,
        activation: 'success',
        swap: 'success',
        completed: 'success',
        error: '',
      });
      setTransfer({
        id: `demo-${Date.now()}`,
        status: 'COMPLETED',
        direction,
        sourceChain: isReverse ? 'Stellar' : sourceChain,
        sourceTxHash: 'demo-source-transaction',
        destinationTxHash: 'demo-destination-transaction',
      });
      setMessage('Demo bridge completed successfully.');
      setLoading(false);
    },
    [direction, isReverse, sourceChain],
  );

  const requestQuote = useCallback(
    async ({showAlert = false, showMessage = true} = {}) => {
      if (!evmAddress || !stellarAddress || !amount.trim()) {
        return;
      }

      setLoading(true);
      setError('');
      if (showMessage) {
        setMessage('Getting quote...');
      }

      try {
        const result = await apiRequest('/bridge/quote', {
          method: 'POST',
          body: JSON.stringify({
            evmAddress,
            stellarAddress,
            amount: amount.trim(),
            direction,
            ...(isReverse ? {} : {sourceChain, fast: effectiveFast}),
            ...(isReverse ? {fast: false} : {}),
          }),
        });
        setQuote({
          ...result,
          ...(stellarUsdcReady === true
            ? {
                requiresWalletActivation: false,
                walletActivationFee: undefined,
              }
            : shouldShowActivationFee
            ? {
                requiresWalletActivation: true,
                walletActivationFee: WALLET_ACTIVATION_FEE_USDC,
              }
            : {}),
        });
        setMessage('Quote ready.');
      } catch (error) {
        if (isActivationRequiredError(error)) {
          const activationQuote = createActivationRequiredQuote({
            amount: amount.trim(),
            direction,
            sourceChain,
            effectiveFast,
          });
          setQuote(activationQuote);
          setError('');
          setMessage('Quote ready.');
          return;
        }
        const friendly = readableError(error);
        setError(friendly);
        if (showAlert) {
          Alert.alert('Quote failed', friendly);
        }
        setMessage('');
      } finally {
        setLoading(false);
      }
    },
    [
      amount,
      direction,
      effectiveFast,
      evmAddress,
      isReverse,
      isActivationRequiredError,
      readableError,
      shouldShowActivationFee,
      sourceChain,
      stellarAddress,
      stellarUsdcReady,
    ],
  );

  const getQuote = useCallback(async () => {
    if (!validateWallets()) return;
    await requestQuote({showAlert: true});
  }, [requestQuote, validateWallets]);

  useEffect(() => {
    if (transfer) return undefined;

    const nextAmount = amount.trim();
    const numericAmount = Number(nextAmount);
    if (!nextAmount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setQuote(null);
      return undefined;
    }

    if (!evmAddress || !stellarAddress) {
      return undefined;
    }

    const timer = setTimeout(() => {
      requestQuote({showAlert: false, showMessage: false});
    }, 700);

    return () => clearTimeout(timer);
  }, [amount, evmAddress, requestQuote, stellarAddress, transfer]);

  const startBridge = useCallback(
    async ({skipActivationCheck = false} = {}) => {
      if (creatingTransferRef.current) return;
      if (!quote) {
        Alert.alert('Quote', 'Get a quote first.');
        return;
      }
      if (isReverse && !hasRequiredSepoliaEth) {
        Alert.alert(
          'Sepolia ETH required',
          `Keep at least ${MINIMUM_SEPOLIA_ETH_FOR_MINT} Sepolia ETH in your destination wallet. Without it, the EVM mint transaction cannot complete.`,
        );
        return;
      }
      if (hasInsufficientSourceBalance && !BRIDGE_UI_DEMO_MODE) {
        Alert.alert(
          'Insufficient USDC',
          `Available ${formatBalance(
            selectedUsdcBalance,
          )} USDC, required ${formatBalance(requiredSourceUsdc)} USDC.`,
        );
        return;
      }
      if (!skipActivationCheck) {
        activationRequiredRef.current = false;
      }
      if (BRIDGE_UI_DEMO_MODE) {
        activationRequiredRef.current = true;
        creatingTransferRef.current = true;
        try {
          await runDemoBridgeFlow({resume: skipActivationCheck});
        } finally {
          creatingTransferRef.current = false;
        }
        return;
      }
      if (
        (shouldShowActivationFee ||
          (quote.requiresWalletActivation && stellarUsdcReady !== true)) &&
        !skipActivationCheck
      ) {
        activationRequiredRef.current = true;
        const activated = await runActivationFlow();
        if (!activated) return;
        await new Promise(resolve => setTimeout(resolve, 500));
        await startBridge({skipActivationCheck: true});
        return;
      }
      creatingTransferRef.current = true;
      try {
        setLoading(true);
        setError('');
        setActivationFlow(currentFlow =>
          currentFlow.visible ? {...currentFlow, visible: false} : currentFlow,
        );
        setMessage('Creating bridge transfer...');
        const result = await apiRequest('/bridge', {
          method: 'POST',
          body: JSON.stringify({
            evmAddress,
            stellarAddress,
            amount: amount.trim(),
            direction,
            ...(isReverse ? {} : {sourceChain, fast: effectiveFast}),
            ...(isReverse
              ? {
                  fast: false,
                  idempotencyKey:
                    reverseIdempotencyRef.current ||
                    (reverseIdempotencyRef.current = `mobile-${Date.now()}-${Math.random()
                      .toString(36)
                      .slice(2, 10)}`),
                }
              : {}),
          }),
        });
        transferWalletScopeRef.current = walletStorageScope;
        setPollingPaused(false);
        setTransfer(result);
        setActivationFlow(currentFlow =>
          currentFlow.visible
            ? {
                visible: true,
                activation: 'success',
                swap: 'success',
                completed: 'loading',
                error: '',
              }
            : currentFlow,
        );
        setMessage('Transfer created.');
      } catch (error) {
        if (isActivationRequiredError(error)) {
          setError('');
          setMessage('');
          const activated = await runActivationFlow();
          if (activated) {
            creatingTransferRef.current = false;
            setLoading(false);
            await startBridge({skipActivationCheck: true});
          }
          return;
        }
        setActivationFlow(currentFlow =>
          currentFlow.visible
            ? {
                ...currentFlow,
                swap: 'error',
                completed: 'idle',
                error: readableError(error),
              }
            : currentFlow,
        );
        const friendly = readableError(error);
        setError(friendly);
        Alert.alert('Bridge failed', friendly);
        setMessage('');
      } finally {
        creatingTransferRef.current = false;
        setLoading(false);
      }
    },
    [
      amount,
      direction,
      effectiveFast,
      evmAddress,
      isReverse,
      isActivationRequiredError,
      hasInsufficientSourceBalance,
      hasRequiredSepoliaEth,
      quote,
      readableError,
      requiredSourceUsdc,
      runActivationFlow,
      runDemoBridgeFlow,
      shouldShowActivationFee,
      sourceChain,
      selectedUsdcBalance,
      stellarAddress,
      stellarUsdcReady,
      walletStorageScope,
    ],
  );
  const signEvm = useCallback(
    async currentTransfer => {
      const signingRequest = currentTransfer?.signingRequest;
      if (signingRequest?.type !== 'EVM') return;
      if (!signingRequest.rawTx)
        throw new Error('Backend did not return rawTx.');
      const rawTx =
        typeof signingRequest.rawTx === 'string'
          ? signingRequest.rawTx
          : JSON.stringify(signingRequest.rawTx);
      const transferChain =
        currentTransfer.direction === STELLAR_TO_EVM
          ? EVM_SOURCE_CHAINS.sepolia
          : EVM_SOURCE_CHAINS[currentTransfer.sourceChain] || selectedChain;
      const result = await TransactionSigner.signTransaction(
        transferChain.nativeChainKey,
        evmAddress,
        rawTx,
        transferChain.chainId,
      );
      if (!result?.success || typeof result.signedTx !== 'string')
        throw new Error('Native signer returned invalid signedTx.');
      const signedTx = `0x${result.signedTx.replace(/^(0x)+/i, '')}`;
      const updated = await apiRequest(
        `/bridge/${currentTransfer.id}/evm-signature`,
        {
          method: 'POST',
          body: JSON.stringify({signedTx}),
        },
      );
      setTransfer(updated);
      return updated;
    },
    [evmAddress, selectedChain],
  );

  const signStellar = useCallback(async currentTransfer => {
    const signingRequest = currentTransfer?.signingRequest;
    if (signingRequest?.type !== 'STELLAR') return;
    if (!signingRequest.xdr)
      throw new Error('Backend did not return Stellar XDR.');
    const signedResult = await StellarSigner.signTransaction(
      signingRequest.xdr,
    );
    let signedXDR = signedResult?.signedXDR;
    if (!signedXDR && signedResult?.signature && signedResult?.publicKey) {
      const networkPassphrase =
        ENVIRONMENT === 'TESTNET'
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC;
      const transaction = StellarSdk.TransactionBuilder.fromXDR(
        signingRequest.xdr,
        networkPassphrase,
      );
      transaction.addSignature(
        signedResult.publicKey,
        Buffer.from(signedResult.signature, 'base64').toString('base64'),
      );
      signedXDR = transaction.toXDR();
    }
    if (!signedXDR) throw new Error('Wallet did not return signedXDR.');
    const updated = await apiRequest(
      `/bridge/${currentTransfer.id}/stellar-signature`,
      {
        method: 'POST',
        body: JSON.stringify({signedXdr: signedXDR}),
      },
    );
    setTransfer(updated);
    return updated;
  }, []);

  const processSigningRequest = useCallback(
    async currentTransfer => {
      const request = currentTransfer?.signingRequest;
      if (!request || processingRef.current) return;
      const signingKey = `${currentTransfer.id}:${currentTransfer.status}:${request.type}:${request.purpose}`;
      if (lastSigningRef.current === signingKey) return;
      lastSigningRef.current = signingKey;
      processingRef.current = true;
      setSigningInProgress(true);
      try {
        if (request.type === 'EVM') {
          setMessage(
            request.purpose === 'APPROVAL'
              ? 'Approve USDC in wallet...'
              : 'Sign bridge transaction...',
          );
          await signEvm(currentTransfer);
        } else if (request.type === 'STELLAR') {
          setMessage('Waiting for Stellar signature...');
          await signStellar(currentTransfer);
        }
      } catch (error) {
        lastSigningRef.current = null;
        const friendly = readableError(error);
        setError(friendly);
        Alert.alert('Signing failed', friendly);
        setMessage('Signature required.');
      } finally {
        processingRef.current = false;
        setSigningInProgress(false);
      }
    },
    [readableError, signEvm, signStellar],
  );

  useEffect(() => {
    if (transfer?.signingRequest) processSigningRequest(transfer);
  }, [processSigningRequest, transfer]);

  useEffect(() => {
    if (
      !isActive ||
      pollingPaused ||
      !transfer?.id ||
      isTerminalBridgeStatus(transfer.status)
    )
      return undefined;
    let cancelled = false,
      inFlight = false;
    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const next = await apiRequest(`/bridge/${transfer.id}`);
        if (!cancelled) setTransfer(next);
      } catch (error) {
        if (isMissingBridgeTransferError(error)) {
          restorationStartedRef.current = true;
          transferWalletScopeRef.current = null;
          clearSavedBridgeTransfer(directionEnable, walletStorageScope).catch(
            cleanupError =>
              console.error('Missing bridge transfer cleanup error:', cleanupError),
          );
          if (!cancelled) {
            setTransfer(null);
            setRecoverySheetVisible(false);
            setMessage('');
          }
          return;
        }
        if (isInsufficientGasError(error)) {
          if (!cancelled) {
            setPollingPaused(true);
            setMessage(
              'Insufficient native balance for gas. Add native token for gas, then refresh the transfer status.',
            );
          }
          return;
        }
        console.error('Status polling error:', error);
      } finally {
        inFlight = false;
      }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    directionEnable,
    isActive,
    pollingPaused,
    pollingRefreshKey,
    transfer?.id,
    transfer?.status,
    walletStorageScope,
  ]);

  useEffect(() => {
    const status = transfer?.status;
    if (!status) return;
    const messages = {
      APPROVAL_SIGNATURE_REQUIRED: 'USDC approval signature required.',
      APPROVAL_PENDING: 'Waiting for USDC approval confirmation...',
      BRIDGE_SIGNATURE_REQUIRED: 'Bridge signature required.',
      BURN_SIGNATURE_REQUIRED: 'Stellar burn signature required.',
      STELLAR_APPROVAL_SIGNATURE_REQUIRED:
        'Approve Stellar USDC for Circle Token Messenger first.',
      STELLAR_APPROVAL_PENDING:
        'Waiting for Stellar USDC approval confirmation...',
      SOURCE_PENDING: 'Waiting for source-chain confirmation...',
      ATTESTATION_PENDING: 'Waiting for Circle attestation...',
      STELLAR_SIGNATURE_REQUIRED: 'Stellar signature required.',
      MINT_SIGNATURE_REQUIRED: 'EVM mint signature required.',
      DESTINATION_PENDING: 'Waiting for Stellar confirmation...',
      COMPLETED: 'Bridge completed successfully.',
      FAILED: transfer.error || 'Bridge failed.',
    };
    if (messages[status]) setMessage(messages[status]);
    if (status === 'COMPLETED') {
      setActivationFlow({
        visible: true,
        activation: 'success',
        swap: 'success',
        completed: 'success',
        awaitingResume: false,
        activationSkipped: !activationRequiredRef.current,
        error: '',
      });
    } else if (status === 'FAILED') {
      setActivationFlow(currentFlow =>
        currentFlow.visible
          ? {
              ...currentFlow,
              swap: currentFlow.swap === 'idle' ? 'idle' : 'error',
              completed: 'idle',
              error: transfer.error || 'Bridge failed.',
            }
          : currentFlow,
      );
    }
  }, [transfer?.error, transfer?.status]);

  const retrySignature = useCallback(() => {
    if (!transfer?.signingRequest) return;
    lastSigningRef.current = null;
    processSigningRequest(transfer);
  }, [processSigningRequest, transfer]);

  const refreshTransferStatus = useCallback(() => {
    setPollingPaused(false);
    setMessage('Refreshing bridge transfer status...');
    setPollingRefreshKey(currentKey => currentKey + 1);
  }, []);

  const reset = () => {
    setAmount('');
    setDirection(directionEnable);
    setSourceChain('sepolia');
    setFast(true);
    setQuote(null);
    setTransfer(null);
    setRecoverySheetVisible(false);
    setPollingPaused(false);
    setPollingRefreshKey(0);
    setSigningInProgress(false);
    setMessage('');
    setError('');
    lastSigningRef.current = null;
    processingRef.current = false;
    creatingTransferRef.current = false;
    reverseIdempotencyRef.current = null;
    activationRetryingRef.current = false;
    activationRequiredRef.current = false;
    restorationStartedRef.current = false;
    transferWalletScopeRef.current = null;
    clearSavedBridgeTransfer(directionEnable, walletStorageScope).catch(error =>
      console.error('Bridge transfer reset cleanup error:', error),
    );
    setActivationFlow({
      visible: false,
      activation: 'idle',
      swap: 'idle',
      completed: 'idle',
      activationSkipped: false,
      awaitingResume: false,
      error: '',
    });
  };

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={[s.safeArea, {backgroundColor: theme.bg}]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={[s.section, {backgroundColor: theme.cardBg}]}>
          <View style={s.headerRow}>
            <View style={s.networkHeader}>
              <Text style={s.labelText}>From Network</Text>
              <Text style={[s.balanceAmount, {color: theme.inactiveTx}]}>
                Active Wallet
              </Text>
            </View>
            <View
              style={[
                s.networkSelector,
                {backgroundColor: theme.bg, borderColor: theme.inactiveTx},
              ]}>
              {sourceChainMeta?.imageUrl ? (
                <Image
                  source={{uri: sourceChainMeta.imageUrl}}
                  style={s.tokenAvatar}
                />
              ) : (
                <View
                  style={[s.tokenAvatar, {backgroundColor: theme.buttonColor}]}>
                  <Text style={s.tokenAvatarText}>
                    {sourceLabel.slice(0, 1)}
                  </Text>
                </View>
              )}
              <Text style={s.networkName} numberOfLines={1}>
                {sourceLabel}
              </Text>
            </View>
          </View>

          <View
            style={[
              s.assetContainer,
              {backgroundColor: theme.bg, borderColor: theme.inactiveTx},
            ]}>
            <View style={s.assetSelector}>
              <Image source={{uri: USDC_IMAGE}} style={s.assetIconLarge} />
              <View style={s.assetInfo}>
                <Text style={s.assetLabel}>Asset</Text>
                <Text style={s.assetName}>USDC</Text>
              </View>
            </View>
            <View style={s.availableContainer}>
              <Text style={[s.quoteBalance, {color: theme.inactiveTx}]}>
                {`Available\n${formatBalance(selectedUsdcBalance)} USDC`}
              </Text>
            </View>
          </View>

          <AddressRow
            label="From Address"
            address={sourceAddress}
            theme={theme}
          />
          {!isReverse && (
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {Object.entries(EVM_SOURCE_CHAINS).map(([key, chain]) => {
                  const selected = sourceChain === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      disabled={!!transfer}
                      style={[
                        s.chainChip,
                        {
                          backgroundColor: selected
                            ? theme.buttonColor
                            : theme.cardBg,
                          borderColor: selected
                            ? theme.buttonColor
                            : theme.smallCardBorderColor,
                        },
                      ]}
                      onPress={() => {
                        setSourceChain(key);
                        setFast(chain.supportsFastTransfer);
                        setQuote(null);
                        setActivationFlow({
                          visible: false,
                          activation: 'idle',
                          swap: 'idle',
                          completed: 'idle',
                          error: '',
                        });
                        setError('');
                      }}>
                      {!!CHAINS[CCTP_CHAIN_META[key]]?.imageUrl && (
                        <Image
                          source={{uri: CHAINS[CCTP_CHAIN_META[key]].imageUrl}}
                          style={s.chainChipImage}
                        />
                      )}
                      <Text
                        style={[
                          s.chainChipText,
                          {color: selected ? '#fff' : theme.inactiveTx},
                        ]}>
                        {chain.label}
                      </Text>
                      {!chain.supportsFastTransfer && (
                        <Text
                          style={[
                            s.noFastTag,
                            {color: selected ? '#ffffffaa' : theme.inactiveTx},
                          ]}>
                          {' '}
                          · slow
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={[s.section, s.toSection, {backgroundColor: theme.cardBg}]}>
          <View style={s.headerRow}>
            <View style={s.networkHeader}>
              <Text style={s.labelText}>To Network</Text>
              <Text style={[s.balanceAmount, {color: theme.inactiveTx}]}>
                Receive USDC
              </Text>
            </View>
            <View
              style={[
                s.networkSelector,
                {backgroundColor: theme.bg, borderColor: theme.inactiveTx},
              ]}>
              {destinationChainMeta?.imageUrl ? (
                <Image
                  source={{uri: destinationChainMeta.imageUrl}}
                  style={s.tokenAvatar}
                />
              ) : (
                <View
                  style={[s.tokenAvatar, {backgroundColor: theme.buttonColor}]}>
                  <Text style={s.tokenAvatarText}>
                    {destinationLabel.slice(0, 1)}
                  </Text>
                </View>
              )}
              <Text style={s.networkName} numberOfLines={1}>
                {destinationLabel}
              </Text>
            </View>
          </View>

          <View style={[s.amountShell, {backgroundColor: theme.bg}]}>
            <View style={s.amountAssetRow}>
              <View style={s.assetSelectorCompact}>
                <Image source={{uri: USDC_IMAGE}} style={s.assetIconSmall} />
                <View>
                  <Text style={s.assetLabel}>Amount</Text>
                  <Text style={s.assetName}>USDC</Text>
                </View>
              </View>
              <View
                style={[s.currencyTag, {backgroundColor: theme.buttonColor}]}>
                <Text style={s.currencyText}>USDC</Text>
              </View>
            </View>
            <TextInput
              value={amount}
              onChangeText={v => {
                setAmount(v);
                setQuote(null);
                setActivationFlow({
                  visible: false,
                  activation: 'idle',
                  swap: 'idle',
                  completed: 'idle',
                  error: '',
                });
                reverseIdempotencyRef.current = null;
              }}
              placeholder="0.00"
              placeholderTextColor={theme.inactiveTx}
              keyboardType="decimal-pad"
              editable={!transfer}
              style={[s.amountInput, {color: theme.headingTx}]}
            />
          </View>

          <AddressRow
            label="To Address"
            address={destinationAddress}
            theme={theme}
          />
        </View>

        {!isReverse && (
          <View
            style={[
              s.fastRow,
              {
                backgroundColor: theme.cardBg,
                borderColor: theme.smallCardBorderColor,
              },
            ]}>
            <View style={s.fastInfo}>
              <Text style={[s.fastTitle, {color: theme.headingTx}]}>
                Fast Transfer
              </Text>
              <Text style={[s.fastSub, {color: theme.inactiveTx}]}>
                {selectedChain.supportsFastTransfer
                  ? 'Circle finality 1000 — ~20s faster'
                  : 'Not available on Avalanche Fuji'}
              </Text>
            </View>
            <Switch
              value={effectiveFast}
              disabled={!!transfer || !selectedChain.supportsFastTransfer}
              onValueChange={v => {
                if (!v && effectiveFast) {
                  Alert.alert(
                    'Fast Transfer Off',
                    'Fast transfer is disabled. Bridge may take longer to complete.',
                  );
                }
                setFast(v);
                setQuote(null);
                setActivationFlow({
                  visible: false,
                  activation: 'idle',
                  swap: 'idle',
                  completed: 'idle',
                  error: '',
                });
              }}
              trackColor={{
                false: theme.smallCardBorderColor,
                true: theme.buttonColor,
              }}
              thumbColor="#fff"
            />
          </View>
        )}

        {!!error && (
          <View
            style={[
              s.errorCard,
              {
                backgroundColor: theme.fail + '15',
                borderColor: theme.fail + '55',
              },
            ]}>
            <View style={s.errorHeader}>
              <Text style={[s.errorTitle, {color: theme.fail}]}>⚠ Error</Text>
              <TouchableOpacity onPress={() => setError('')}>
                <Text style={[s.dismiss, {color: theme.fail}]}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[s.errorText, {color: theme.fail}]}>{error}</Text>
          </View>
        )}

        {!transfer && (
          <>
            {quote && (
              <View
                style={[
                  s.quoteCard,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: theme.smallCardBorderColor,
                  },
                ]}>
                <Text style={[s.quoteTitle, {color: theme.headingTx}]}>
                  Quote
                </Text>

                <View style={s.quoteDivider} />

                {[
                  ['Amount', `${quote.amount} USDC`],
                  ['Protocol fee', `${quote.protocolFee} USDC`],
                  ['Max Circle fee', `${quote.maxFee} USDC`],
                  ...(quote.requiresWalletActivation ||
                  quote.walletActivationFee
                    ? [
                        [
                          'Wallet Activation Fee',
                          `${
                            quote.walletActivationFee ||
                            WALLET_ACTIVATION_FEE_USDC
                          } USDC`,
                        ],
                      ]
                    : []),
                  ['Min. received', `${quote.minimumReceived} USDC`],
                ].map(([label, value]) => (
                  <View key={label} style={s.quoteRow}>
                    <Text style={[s.quoteLabel, {color: theme.inactiveTx}]}>
                      {label}
                    </Text>
                    <Text style={[s.quoteValue, {color: theme.cardSubTx}]}>
                      {value}
                    </Text>
                  </View>
                ))}

                {!!quote.expiresAt && (
                  <Text style={[s.expiry, {color: theme.warn}]}>
                    ⏱ Quote expires in{' '}
                    {Math.max(
                      0,
                      Math.ceil((quote.expiresAt - Date.now()) / 1000),
                    )}
                    s
                  </Text>
                )}

                {hasInsufficientSourceBalance && (
                  <Text style={[s.insufficientText, {color: theme.fail}]}>
                    Insufficient USDC balance. Required{' '}
                    {formatBalance(requiredSourceUsdc)} USDC.
                  </Text>
                )}

                <ActivationFlowStepper
                  flow={activationFlow}
                  theme={theme}
                  onRetry={startBridge}
                />

                <TouchableOpacity
                  disabled={
                    loading ||
                    activationFlow.awaitingResume ||
                    (hasInsufficientSourceBalance && !BRIDGE_UI_DEMO_MODE)
                  }
                  style={[
                    s.primaryBtn,
                    {
                      backgroundColor: theme.buttonColor,
                      marginTop: 14,
                      opacity:
                        loading ||
                        activationFlow.awaitingResume ||
                        (hasInsufficientSourceBalance && !BRIDGE_UI_DEMO_MODE)
                          ? 0.6
                          : 1,
                    },
                  ]}
                  onPress={startBridge}>
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.primaryBtnText}>Bridge →</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {transfer && (
          <View
            style={[
              s.transferCard,
              {
                backgroundColor: theme.cardBg,
                borderColor: theme.smallCardBorderColor,
              },
            ]}>
            <View style={s.transferHeader}>
              <Text style={[s.transferTitle, {color: theme.headingTx}]}>
                Transfer
              </Text>
              <StatusBadge status={transfer.status} theme={theme} />
            </View>

            {/* <Text style={[s.transferRoute, {color: theme.inactiveTx}]}>
              {transfer.direction === STELLAR_TO_EVM
                ? 'Stellar → Ethereum Sepolia'
                : transfer.sourceChain || sourceChain}
            </Text> */}

            {transfer.status === 'COMPLETED' ? (
              <ActivationFlowStepper flow={activationFlow} theme={theme} />
            ) : (
              <>
                <ProgressStepper status={transfer.status} theme={theme} />

                <View
                  style={[
                    s.transferDivider,
                    {backgroundColor: theme.smallCardBorderColor},
                  ]}
                />

                <TxHashRow
                  label="Source tx"
                  hash={transfer.sourceTxHash}
                  theme={theme}
                />
                <TxHashRow
                  label="Destination tx"
                  hash={transfer.destinationTxHash}
                  theme={theme}
                />

                <View
                  style={[s.idRow, {borderColor: theme.smallCardBorderColor}]}>
                  <Text style={[s.idLabel, {color: theme.inactiveTx}]}>
                    Transfer ID
                  </Text>
                  <Text style={[s.idValue, {color: theme.inactiveTx}]}>
                    {transfer.id}
                  </Text>
                </View>
              </>
            )}

            {!!message && (
              <View
                style={[s.msgRow, {backgroundColor: theme.buttonColor + '18'}]}>
                <Text style={[s.msgText, {color: theme.buttonColor}]}>
                  {message}
                </Text>
              </View>
            )}

            {transfer.error && (
              <Text style={[s.transferError, {color: theme.fail}]}>
                {transfer.error}
              </Text>
            )}

            {pollingPaused && (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  {backgroundColor: theme.buttonColor, marginTop: 14},
                ]}
                onPress={refreshTransferStatus}>
                <Text style={s.primaryBtnText}>Refresh Status</Text>
              </TouchableOpacity>
            )}

            {[
              'APPROVAL_SIGNATURE_REQUIRED',
              'BRIDGE_SIGNATURE_REQUIRED',
              'BURN_SIGNATURE_REQUIRED',
              'MINT_SIGNATURE_REQUIRED',
              'STELLAR_SIGNATURE_REQUIRED',
              'STELLAR_APPROVAL_SIGNATURE_REQUIRED',
            ].includes(transfer.status) && !signingInProgress && (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  {backgroundColor: theme.warn, marginTop: 14},
                ]}
                onPress={retrySignature}>
                <Text style={s.primaryBtnText}>Sign / Retry</Text>
              </TouchableOpacity>
            )}

            {[
              'APPROVAL_SIGNATURE_REQUIRED',
              'BRIDGE_SIGNATURE_REQUIRED',
              'BURN_SIGNATURE_REQUIRED',
              'MINT_SIGNATURE_REQUIRED',
              'STELLAR_SIGNATURE_REQUIRED',
              'STELLAR_APPROVAL_SIGNATURE_REQUIRED',
            ].includes(transfer.status) && signingInProgress && (
              <View
                style={[
                  s.primaryBtn,
                  {backgroundColor: theme.warn, marginTop: 14},
                ]}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}

            {['COMPLETED', 'FAILED'].includes(transfer.status) && (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  {
                    backgroundColor:
                      transfer.status === 'COMPLETED'
                        ? theme.success
                        : theme.fail,
                    marginTop: 14,
                  },
                ]}
                onPress={reset}>
                <Text style={s.primaryBtnText}>
                  {transfer.status === 'COMPLETED'
                    ? 'New Transfer'
                    : 'Start Again'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{height: 32}} />
      </ScrollView>
      <RecoveryBottomSheet
        message={message}
        transfer={transfer}
        theme={theme}
        visible={isActive && recoverySheetVisible}
        onClose={() => setRecoverySheetVisible(false)}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safeArea: {flex: 1},
    scroll: {paddingHorizontal: 12, paddingVertical: 16},

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      marginBottom: 12,
    },
    title: {fontSize: 24, fontWeight: '800', color: theme.headingTx},
    subtitle: {fontSize: 12, color: theme.inactiveTx, marginTop: 2},
    usdcBadge: {borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6},
    usdcBadgeText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
      letterSpacing: 1,
    },

    section: {
      marginBottom: 10,
      paddingHorizontal: 15,
      paddingVertical: 14,
      borderRadius: 13,
    },
    toSection: {marginTop: 0},
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    networkHeader: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      flex: 1,
      paddingRight: 10,
    },
    labelText: {color: theme.headingTx, fontSize: 14, fontWeight: '500'},
    balanceAmount: {fontSize: 13, marginTop: 4},
    networkSelector: {
      minWidth: 132,
      maxWidth: 176,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 9,
      gap: 8,
      borderWidth: 1,
    },
    tokenAvatar: {
      width: 25,
      height: 25,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tokenAvatarText: {color: '#fff', fontSize: 14, fontWeight: '800'},
    networkName: {
      color: theme.headingTx,
      fontSize: 15,
      fontWeight: '600',
      flexShrink: 1,
    },
    assetContainer: {
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      marginTop: 14,
      paddingHorizontal: 6,
      paddingVertical: 7,
    },
    assetSelector: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderTopLeftRadius: 12,
      paddingHorizontal: 4,
      gap: 10,
    },
    assetIconLarge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assetIconText: {color: '#fff', fontSize: 19, fontWeight: '800'},
    assetInfo: {flex: 1},
    assetLabel: {color: theme.inactiveTx, fontSize: 12},
    assetName: {color: theme.headingTx, fontSize: 18, fontWeight: '600'},
    availableContainer: {alignItems: 'flex-end', marginRight: 10},
    availableLabel: {color: theme.headingTx, fontSize: 13},
    availableAmount: {
      color: theme.headingTx,
      fontSize: 13,
      fontWeight: '500',
      marginTop: 3,
    },

    walletCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 20,
    },
    arrowDivider: {
      borderTopWidth: 1,
      marginVertical: 10,
      alignItems: 'center',
      paddingTop: 8,
    },
    arrowText: {fontSize: 18, fontWeight: '700', marginTop: -18},

    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 16,
      textTransform: 'uppercase',
    },

    dirRow: {flexDirection: 'row', gap: 10},
    dirBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    dirBtnText: {fontSize: 13, fontWeight: '700'},
    chainChip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 13,
      marginRight: 8,
    },
    chainChipImage: {
      width: 22,
      height: 22,
      borderRadius: 11,
      marginRight: 7,
      backgroundColor: '#fff',
    },
    chainChipText: {fontSize: 12, fontWeight: '600'},
    noFastTag: {fontSize: 11},

    amountShell: {
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    amountAssetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    assetSelectorCompact: {flexDirection: 'row', alignItems: 'center', gap: 9},
    assetIconSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assetIconTextSmall: {color: '#fff', fontSize: 16, fontWeight: '800'},
    amountInput: {fontSize: 24, fontWeight: '500', minHeight: 48, padding: 0},
    currencyTag: {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7},
    currencyText: {color: '#fff', fontWeight: '700', fontSize: 13},

    fastRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 13,
      padding: 10,
      marginBottom: 8,
    },
    fastInfo: {flex: 1, paddingRight: 12},
    fastTitle: {fontSize: 14, fontWeight: '700'},
    fastSub: {fontSize: 11, marginTop: 2},

    errorCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    errorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    errorTitle: {fontWeight: '800', fontSize: 13},
    dismiss: {fontWeight: '700', fontSize: 15},
    errorText: {fontSize: 13, lineHeight: 19},

    primaryBtn: {
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryBtnText: {color: '#fff', fontWeight: '600', fontSize: 16},

    quoteCard: {borderWidth: 1, borderRadius: 13, padding: 16, marginTop: 1},
    quoteTitle: {fontSize: 19, fontWeight: '500', marginBottom: 2},
    quoteRoute: {fontSize: 12, marginBottom: 12},
    quoteBalance: {fontSize: 12},
    quoteDivider: {height: 1, backgroundColor: '#88888830', marginBottom: 12},
    quoteRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    quoteLabel: {fontSize: 13},
    quoteValue: {fontSize: 13, fontWeight: '700'},
    expiry: {fontSize: 12, marginTop: 8, fontWeight: '600'},
    insufficientText: {fontSize: 12, fontWeight: '700', marginTop: 8},

    transferCard: {
      borderWidth: 1,
      borderRadius: 13,
      padding: 16,
      marginTop: 12,
    },
    transferHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    transferTitle: {fontSize: 18, fontWeight: '800'},
    transferRoute: {fontSize: 12, marginBottom: 4},
    transferDivider: {height: 1, marginVertical: 12},
    idRow: {
      borderTopWidth: 1,
      marginTop: 12,
      paddingTop: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    idLabel: {fontSize: 11, fontWeight: '600'},
    idValue: {
      fontSize: 11,
      fontFamily: 'monospace',
      maxWidth: '70%',
      textAlign: 'right',
    },
    msgRow: {borderRadius: 10, padding: 10, marginTop: 12},
    msgText: {fontSize: 13, fontWeight: '600'},
    transferError: {fontSize: 13, marginTop: 10, fontWeight: '600'},
  });
}
