import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { ethers } from 'ethers';
import axios from 'axios';
import { RPC } from '../../../../constants';
import { REACT_APP_COIN_GECKO_SIMPLE_PRICE_URL } from '../ExchangeConstants';
import Icon from '../../../../../icon';
import { CHAINS } from '../../../../../utilities/TokenUtils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

const THEMES = {
  light: {
    background: '#ebebeb',
    surface: '#fff',
    text: '#000000',
    textSecondary: '#666666',
    border: '#E0E0E0',
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    primary: '#2196F3',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  dark: {
    background: 'black',
    surface: '#171616',
    text: '#FFFFFF',
    textSecondary: '#B0B0B0',
    border: '#404040',
    success: '#66BB6A',
    error: '#EF5350',
    warning: '#FFA726',
    primary: '#42A5F5',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
};

const TokenTxDetails = ({ visible, onClose, params, theme,onNextStep }) => {
  const colorScheme = useColorScheme();
  const currentTheme = theme || colorScheme || 'light';
  const colors = THEMES[currentTheme];

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      openSheet();
      if (params) {
        calculateFees();
      }
    } else {
      closeSheet();
    }
  }, [visible, params]);

  const openSheet = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setResult(null);
      setError(null);
    });
  };

  const handleClose = () => {
    closeSheet();
    setTimeout(() => onClose(), 300);
  };

  const getTokenInfo = async (tokenAddress, config) => {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name().catch(() => 'Unknown Token'),
      tokenContract.symbol().catch(() => 'UNKNOWN'),
      tokenContract.decimals().catch(() => 18)
    ]);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
      network: config.name
    };
  };

  const getWalletBalances = async (walletAddress, tokenAddress,config) => {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const nativeBalanceWei = await provider.getBalance(walletAddress);
    const nativeBalance = ethers.utils.formatEther(nativeBalanceWei);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    const tokenBalanceRaw = await tokenContract.balanceOf(walletAddress);
    const tokenBalance = ethers.utils.formatUnits(tokenBalanceRaw, decimals);
    return {
      native: {
        balance: nativeBalance,
        symbol: config.symbol,
        balanceWei: nativeBalanceWei.toString()
      },
      token: {
        balance: tokenBalance,
        balanceRaw: tokenBalanceRaw.toString()
      }
    };
  };

  const getGasPrice = async (config) => {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');

    return {
      gasPrice: gasPrice.toString(),
      gasPriceGwei: parseFloat(gasPriceGwei),
    };
  };

  const calculateFees = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { walletAddress, tokenAddress, recipientAddress, amount, network, tokenDecimals } = params;

      if (!ethers.utils.isAddress(walletAddress)) throw new Error('Invalid wallet address');
      if (!ethers.utils.isAddress(tokenAddress)) throw new Error('Invalid token address');
      if (!ethers.utils.isAddress(recipientAddress)) throw new Error('Invalid recipient address');
      if (parseFloat(amount) <= 0) throw new Error('Amount must be greater than 0');

      const config = CHAINS[network];
      const [tokenInfo, balances, gasData] = await Promise.all([
        getTokenInfo(tokenAddress,config),
        getWalletBalances(walletAddress, tokenAddress, config),
        getGasPrice(config)
      ]);
      const estimatedGas = config.gasLimit;
      const txFeeWei = BigInt(gasData.gasPrice) * BigInt(estimatedGas);
      const txFee = ethers.utils.formatEther(txFeeWei);
      const nativeBalance = parseFloat(balances.native.balance);
      const tokenBalance = parseFloat(balances.token.balance);
      const sendAmount = parseFloat(amount);
      const txFeeAmount = parseFloat(txFee);
      const hasSufficientNative = nativeBalance >= txFeeAmount;
      const hasSufficientToken = tokenBalance >= sendAmount;
      const canExecuteTransfer = hasSufficientNative && hasSufficientToken;
      const warnings = [];
      const errors = [];

      if (!hasSufficientNative) {
        warnings.push(`Insufficient ${txFeeAmount.toFixed(6)} ${config.symbol} for gas fee`);
        errors.push('Insufficient native balance');
      }

      if (!hasSufficientToken) {
        warnings.push(`Insufficient token balance. Required: ${sendAmount} ${tokenInfo.symbol}`);
        errors.push('Insufficient token balance');
      }

      setResult({
        success: true,
        network: config.name,
        token: {
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          decimals: tokenInfo.decimals
        },
        transaction: {
          from: walletAddress,
          to: recipientAddress,
          amount: sendAmount,
          amountFormatted: `${sendAmount} ${tokenInfo.symbol}`
        },
        gas: {
          estimatedGas,
          gasPrice: gasData.gasPriceGwei.toFixed(2),
          txFee: txFeeAmount.toFixed(6),
          symbol: config.symbol
        },
        balances: {
          native: {
            current: nativeBalance.toFixed(6),
            sufficient: hasSufficientNative,
            symbol: config.symbol
          },
          token: {
            current: tokenBalance,
            sufficient: hasSufficientToken,
            symbol: tokenInfo.symbol
          }
        },
        canExecute: canExecuteTransfer,
        warnings,
        errors
      });
    } catch (err) {
      console.error("error in calculateFees", err);
      const message =err?.reason || err?.message || 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const InfoRow = ({ label, value, highlight, isError }) => (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.value,
          { color: highlight ? (isError ? colors.error : colors.success) : colors.text }
        ]}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: colors.overlay, opacity: opacityAnim }
        ]}
      >
        <TouchableOpacity
          style={styles.overlayTouch}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: colors.background, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Transaction Details</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Icon name="close-circle-outline" type="materialCommunity" size={35} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Wait Collecting transaction details...
              </Text>
            </View>
          )}

          {error && (
            <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}> {error}</Text>
            </View>
          )}

          {result && (
            <View style={styles.resultContainer}>
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction</Text>
                <InfoRow label="Token" value={`${result.token.name} (${result.token.symbol})`} />
                <InfoRow label="Amount" value={result.transaction.amountFormatted} highlight />
                <InfoRow label="From" value={`${result.transaction.from.slice(0, 6)}.....${result.transaction.from.slice(-6)}`} />
                <InfoRow label="To" value={`${result.transaction.to.slice(0, 10)}.....${result.transaction.to.slice(-6)}`} />

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas & Fees</Text>
                <InfoRow label="Gas Price" value={`${result.gas.gasPrice} Gwei`} />
                <InfoRow label="Estimated Gas" value={result.gas.estimatedGas.toLocaleString()} />

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Balances</Text>
                <InfoRow
                  label={`${result.balances.native.symbol} Balance`}
                  value={`${result.balances.native.current} ${result.balances.native.symbol}`}
                  highlight
                  isError={!result.balances.native.sufficient}
                />
                <InfoRow
                  label={`${result.balances.token.symbol} Balance`}
                  value={`${result.balances.token.current} ${result.balances.token.symbol}`}
                  highlight
                  isError={!result.balances.token.sufficient}
                />

                {result.warnings.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10 }]}>Warnings</Text>
                    <View style={[styles.warningsContainer, { backgroundColor: colors.warning + '20' }]}>
                      {result.warnings.map((warning, index) => (
                        <Text key={index} style={[styles.warningText, { color: colors.warning }]}>
                          {warning}
                        </Text>
                      ))}
                    </View>
                  </>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: result.canExecute ? colors.success : colors.error }
                ]}
                onPress={() => { result.canExecute ? onNextStep() : handleClose() }}>
                <Text style={styles.actionButtonText}>{result.canExecute ? 'Proceed to Send' : 'Insufficient Balance'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTouch: {
    flex: 1,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
    fontWeight: '300',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop:15
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  label: {
    fontSize: 14,
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  warningsContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resultContainer: {
    paddingBottom: 30,
  },
});

export default TokenTxDetails;