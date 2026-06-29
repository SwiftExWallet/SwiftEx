import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Appearance,
  RefreshControl,
  Modal,
  Image,
  Animated,
  Clipboard,
  Alert,
  Dimensions,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector } from 'react-redux';
import { Wallet_screen_header, TransactionForStellar } from './reusables/ExchangeHeader';
import { useIsFocused, useNavigation, useRoute, useNavigationState } from '@react-navigation/native';
import StellarTransactionHistory from './exchange/crypto-exchange-front-end-main/src/pages/StellarTransactionHistory';
import { PGET, PPOST, PPUT, proxyRequest } from './exchange/crypto-exchange-front-end-main/src/api';
import CustomInfoProvider from './exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import ShortTermStorage from '../utilities/ShortTermStorage';
import { CHAINS, CheckTxStatus, TXSTATUS } from '../utilities/TokenUtils'
import { AllbridgeCoreSdk, nodeRpcUrlsDefault } from "@allbridge/bridge-core-sdk";
const sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
const ThemeContext = React.createContext();
const themes = {
  light: {
    background: "#FFFFFF",
    cardBackground: "#F4F4F8",
    textPrimary: '#1A1A1A',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    accent: '#3B82F6',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    pending: '#F59E0B',
    border: '#E5E7EB',
    chipBg: '#F3F4F6',
    chipActive: '#3B82F6',
    skeleton: '#E5E7EB',
    divider: '#F3F4F6',
  },
  dark: {
    background: "#1B1B1C",
    cardBackground: "#242426",
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    accent: '#3B82F6',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    pending: '#F59E0B',
    border: '#334155',
    chipBg: '#334155',
    chipActive: '#3B82F6',
    skeleton: '#334155',
    divider: '#1E293B',
  }
};

const ThemeProvider = ({ children }) => {
  const state = useSelector((state) => state);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    setTheme(state.THEME.THEME === true ? 'dark' : 'light');
  }, [state.THEME.THEME]);

  return (
    <ThemeContext.Provider value={{ theme, colors: themes[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = () => useContext(ThemeContext);

// Utility Functions
const formatNumber = (num) => {
  const value = Number(num);
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  if (Math.abs(value) < 0.0001) return value.toExponential(2);
  if (Math.abs(value) > 1000000) return (value / 1000000).toFixed(2) + "M";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(value);
};

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = todayDate - txDate;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupTransactionsByDate = (transactions) => {
  const groups = {};

  transactions.forEach(tx => {
    const dateKey = formatDate(tx.timestamp);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(tx);
  });

  return groups;
};

const shortenAddress = (address, chars = 4) => {
  if (!address) return 'Unknown';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};

// Skeleton Loader Component
const TransactionSkeleton = ({ colors }) => (
  <View style={[styles.skeletonCard, { backgroundColor: colors.cardBackground }]}>
    <View style={styles.skeletonRow}>
      <View style={[styles.skeletonCircle, { backgroundColor: colors.skeleton }]} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLine, { backgroundColor: colors.skeleton, width: '60%' }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.skeleton, width: '40%', marginTop: 8 }]} />
      </View>
    </View>
  </View>
);

// Chain Selector Component
const ChainSelector = ({ activeChain, onSelect, colors }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const activeChainData = Object.values(CHAINS).find(c => c.symbol === activeChain);

  return (
    <>
      <TouchableOpacity
        style={[styles.chainSelectorButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => setModalVisible(true)}
      >
        <Image source={{ uri: activeChainData?.imageUrl }} style={styles.chainIconSmall} />
        <Text style={[styles.chainSelectorText, { color: colors.textPrimary }]}>
          {activeChainData?.symbol}
        </Text>
        <Icon name="chevron-down" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        transparent
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Select Network
            </Text>
            <FlatList
              data={Object.values(CHAINS)
                .filter(item => !item.name?.toLowerCase().includes("dydx"))
                .filter(
                  (item, index, self) =>
                    index === self.findIndex(obj => obj.name === item.name)
                )}
              keyExtractor={(item, index) => item.id?.toString() || index.toString()}
              renderItem={({ item, index }) => {
                return(
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.chainOption,
                    { borderBottomColor: colors.border },
                    activeChain === item.symbol && { backgroundColor: colors.chipBg }
                  ]}
                  onPress={() => {
                    onSelect(item.symbol);
                    setModalVisible(false);
                  }}
                >
                  <Image source={{ uri: item.imageUrl }} style={styles.chainIcon} />
                  <View style={styles.chainDetails}>
                    <Text style={[styles.chainName, { color: colors.textPrimary }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.chainSymbol, { color: colors.textSecondary }]}>
                      {item.symbol}
                    </Text>
                  </View>
                  {activeChain === item.symbol && (
                    <Icon name="check-circle" size={24} color={colors.accent} />
                  )}
                </TouchableOpacity>
                )
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

// Filter Chips Component
const FilterChips = ({ activeFilter, onFilterChange, colors }) => {
  const filters = ['All', 'Recent'];

  return (
    <View style={styles.filterContainer}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.filterChip,
            {
              backgroundColor: activeFilter === filter ? colors.chipActive : colors.chipBg,
              borderColor: activeFilter === filter ? colors.chipActive : 'transparent',
            }
          ]}
          onPress={() => onFilterChange(filter)}
        >
          <Text style={[
            styles.filterChipText,
            { color: activeFilter === filter ? '#FFFFFF' : colors.textSecondary }
          ]}>
            {filter}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const TransactionCard = ({ item, walletAddress, activeChain, activeFilter, navigation, colors, onRefreshList }) => {
  const scaleAnim = useState(new Animated.Value(1))[0];

  const getTransactionType = (tx) => {
    if (tx.isApprove || tx.typeTx?.toLowerCase() === 'approve') return 'Approve';
    if ((tx.isPending || tx.isFailed || tx.isSuccess) && tx.typeTx) return tx.typeTx;
    if (tx.from?.toLowerCase() === walletAddress?.toLowerCase()) return 'Send';
    if (tx.to?.toLowerCase() === walletAddress?.toLowerCase()) return 'Receive';
    if (tx.toChain && tx.fromChain) return tx.provider;
    return 'Unknown';
  };

  const txType = getTransactionType(item);
  const isPending = item.isPending === true || ['pending', 'created', 'partially_filled'].includes(item.status);
  const isFailed = item.isFailed === true || ['failed', 'cancelled', 'expired', 'invalid', 'refunding', 'refunded'].includes(item.status);
  const isSuccess = item.isSuccess === true || ['completed', 'executed', 'filled'].includes(item.status);
  const isApprove = item.isApprove === true || item.typeTx?.toLowerCase() === 'approve';

  const getStatusConfig = () => {
    switch (item.status) {
      case 'created': return { text: 'Created', color: colors.accent, icon: 'plus-circle-outline' };
      case 'pending': return { text: 'Pending', color: colors.pending, icon: 'clock-outline' };
      case 'partially_filled': return { text: 'Partial', color: colors.warning, icon: 'circle-half-full' };
      case 'completed': return { text: 'Success', color: colors.success, icon: 'check-circle' };
      case 'executed': return { text: 'Executed', color: colors.success, icon: 'check-circle' };
      case 'filled': return { text: 'Filled', color: colors.success, icon: 'check-circle' };
      case 'failed': return { text: 'Failed', color: colors.error, icon: 'close-circle' };
      case 'cancelled': return { text: 'Cancelled', color: colors.error, icon: 'cancel' };
      case 'expired': return { text: 'Expired', color: colors.textTertiary, icon: 'timer-off-outline' };
      case 'invalid': return { text: 'Invalid', color: colors.error, icon: 'alert-circle' };
      case 'refunding': return { text: 'Refunding', color: colors.warning, icon: 'refresh' };
      case 'refunded': return { text: 'Refunded', color: colors.warning, icon: 'cash-refund' };
      default: break;
    }
    if (isFailed) return { text: 'Failed', color: colors.error, icon: 'close-circle' };
    if (isPending) return { text: 'Pending', color: colors.pending, icon: 'clock-outline' };
    if (isSuccess) return { text: 'Success', color: colors.success, icon: 'check-circle' };
    if (txType === 'Send') return { text: 'Sent', color: colors.error, icon: 'arrow-up' };
    if (txType === 'Receive') return { text: 'Received', color: colors.success, icon: 'arrow-down' };
    if (txType === 'Approve') return { text: 'Approved', color: colors.accent, icon: 'check-circle' };
    return { text: 'Unknown', color: colors.textTertiary, icon: 'help-circle' };
  };

  const status = getStatusConfig();

  const getExplorerUrl = async () => {
    if (item.provider) {
      switch (item.provider) {
        case 'RANGO': return `https://explorer.rango.exchange/swap/${item.requestId}`;
        case "ALLBRIDGE":
          CustomInfoProvider.show("waiting", "Please Wait", "Collecting information.");
          const getUrl = await sdk.getTransferStatus(item.fromChain, item.txHash);
          if (getUrl.txId) {
            CustomInfoProvider.hide();
            return `https://core.allbridge.io/explorer/transfer/${getUrl.send.hash}`;
          } else {
            CustomInfoProvider.show("error", "!Opps", "Tx under relay.");
          }
        case 'UNISWAP':
        case 'EVMTX':
        case 'ONEINCH':
          switch (item.fromChain) {
            case 'ETH': return `https://etherscan.io/tx/${item.txHash}`;
            case 'BSC':
            case 'BNB': return `https://bscscan.com/tx/${item.txHash}`;
            case "POL": return `https://polygonscan.com/tx/${item.txHash}`
            case "ARB": return `https://arbiscan.io/tx/${item.txHash}`
            case "OPT": return `https://optimistic.etherscan.io/tx/${item.txHash}`
            case "AVAX": return `https://avascan.info/blockchain/c/tx/${item.txHash}`
            case "BASE": return `https://basescan.org/tx/${item.txHash}`
            default: return null;
          }
        default: return null;
      }
    } else {
      const chain = item.chain || activeChain;
      switch (chain) {
        case 'ETH': return `https://etherscan.io/tx/${item.hash}`;
        case 'BSC':
        case 'BNB': return `https://bscscan.com/tx/${item.hash}`;
        case "POL": return `https://polygonscan.com/tx/${item.hash}`
        case "ARB": return `https://arbiscan.io/tx/${item.hash}`
        case "OPT": return `https://optimistic.etherscan.io/tx/${item.hash}`
        case "AVAX": return `https://avascan.info/blockchain/c/tx/${item.hash}`
        case "BASE": return `https://basescan.org/tx/${item.hash}`
        default: return null;
      }
    }
  };

  const handlePress = async () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    const is1inchFusion = item.provider === 'ONEINCH_FUSION' || item.provider === 'ONEINCH_FUSION_PLUS';

    if (is1inchFusion && item.status === 'pending') {
      CustomInfoProvider.show("waiting", "Please Wait", "Checking order status...");
      try {
        const chain = item.fromChain || activeChain;
        const { res, err } = await proxyRequest(
          `/v1/swap/1inch/orderStatus?chain=${chain}&orderHash=${item.txHash || item.orderHash}&swapProvider=${item.provider}`,
          PGET
        );

        if (!err?.status && res) {
          onRefreshList();
          CustomInfoProvider.hide();
        } else {
          CustomInfoProvider.hide();
        }
      } catch (e) {
        console.error('1inch order status error:', e);
        CustomInfoProvider.hide();
      }
      return;
    }
    
    if(item.provider === "UNISWAP" || item.provider === "TX" || item.provider === "EVMTX"){
      const explorerUrl = await getExplorerUrl();
        if (explorerUrl) Linking.openURL(explorerUrl);
    }

    CustomInfoProvider.hide();
    const explorerUrl = await getExplorerUrl();
    if (explorerUrl) Linking.openURL(explorerUrl);
  };

  const copyToClipboard = (text, label) => {
    Clipboard.setString(text);
    CustomInfoProvider.show("Copied", `${label} copied to clipboard`);
  };

  const handleLongPress = () => {
    CustomInfoProvider.show(
      'info',
      'Transaction Options',
      'What would you like to do?',
      [
        { text: 'Copy Hash', onPress: () => copyToClipboard(item.hash || item.txHash, 'Transaction hash') },
        {
          text: 'Copy Address',
          onPress: () => {
            const address = txType === 'Send' ? item.to : item.from || item.walletAddress;
            copyToClipboard(address, 'Address');
          }
        },
        { text: 'View on Explorer', onPress: handlePress },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }} key={item.txHash}>
      <TouchableOpacity
        style={[styles.transactionCard, { backgroundColor: colors.cardBackground }]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.iconCircle, { backgroundColor: status.color + '15' }]}>
            <Icon name={status.icon} size={24} color={status.color} />
          </View>
        </View>

        <View style={styles.cardCenter}>
          <View style={styles.cardRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.assetText, { color: colors.textPrimary }]}>
                {item.fromChain && item.toChain ? item.txType : item.asset || activeChain}
              </Text>
              {item.chain && item.chain !== activeChain && (
                <View style={[styles.chainBadge, { backgroundColor: colors.chipBg }]}>
                  <Text style={[styles.chainBadgeText, { color: colors.textSecondary }]}>
                    {item.chain}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text style={[styles.addressText, { color: colors.textSecondary }]}>
            {isPending || isFailed || isApprove || isSuccess
              ? item.fromChain && item.toChain ? `${item.fromChain} (${item.fromToken}) to ${item.toChain} (${item.toToken})` : shortenAddress(item.hash, 6)
              : txType === 'Send'
                ? `To: ${shortenAddress(item.to)}`
                : `From: ${shortenAddress(item.from)}`
            }
          </Text>

          {item.timestamp && (
            <Text style={[styles.timeText, { color: colors.textTertiary }]}>
              {new Date(item.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          )}
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '15' }]}>
            <Text style={[styles.statusBadgeText, { color: status.color }]}>
              {status.text}
            </Text>
          </View>

          {!isApprove && item.value !== 0 && (
            <Text style={[
              styles.amountText,
              { color: isFailed ? colors.textTertiary : status.color }
            ]}>
              {txType === 'Send' ? '-' : txType === 'Receive' ? '+' : ''}
              {formatNumber(item.value || item.formattedAmount || item.amountIn || 0)}
            </Text>
          )}

          {['pending', 'created', 'partially_filled', 'refunding'].includes(item.status) && (
            <View style={styles.pendingIndicator}>
              <ActivityIndicator size="small" color={colors.pending} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Empty State Component
const EmptyState = ({ activeFilter, colors }) => {
  const getMessage = () => {
    switch (activeFilter) {
      case 'Send': return 'No sent transactions yet';
      case 'Receive': return 'No received transactions yet';
      case 'Recent': return 'No recent transactions';
      default: return 'No transactions found';
    }
  };

  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { backgroundColor: colors.chipBg }]}>
        <Icon name="history" size={48} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        {getMessage()}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Your transaction history will appear here
      </Text>
    </View>
  );
};

// Main Component
const TransactionHistory = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { colors } = useTheme();
  const state = useSelector((state) => state);
  const walletAddress = state?.wallet?.address;

  const [activeChain, setActiveChain] = useState('ETH');
  const [activeFilter, setActiveFilter] = useState('All');
  const [apiTransactions, setApiTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sentPageKey, setSentPageKey] = useState(null);
  const [receivedPageKey, setReceivedPageKey] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [hasNext, setHasNext] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const previousScreen = useNavigationState(state => {
    const routes = state?.routes || [];
    const currentIndex = state?.index;
    if (currentIndex > 0) {
      return routes[currentIndex - 1]?.name;
    }
    return null;
  });

  useEffect(() => {
    if (route?.params?.txType) {
      setActiveChain(route.params.txType || "ETH");
    }

    if (previousScreen === 'Settings' || previousScreen === 'Setting' || previousScreen === 'TxDetail' || previousScreen === 'HomeScreen') {
      setActiveFilter('All');
    } else if (previousScreen) {
      setActiveFilter('Recent');
    }
  }, [route?.params?.txType, previousScreen]);


  useEffect(() => {
    fetchTransactions();
  }, [activeChain]);

  useEffect(() => {
    if (activeFilter === 'Recent') {
      fetchRecentTransactions();
    }
  }, [activeFilter]);

  // --- AUTO REFRESH LOOP FOR PENDING TRANSACTIONS (RECENT ONLY) ---
  useEffect(() => {
    let intervalId = null;

    if (activeFilter === 'Recent' && isFocused) {
      const hasPendingTransactions = transactions.some(tx => 
        tx.isPending === true || ['pending', 'created', 'partially_filled', 'refunding'].includes(tx.status)
      );

      if (hasPendingTransactions) {
        intervalId = setInterval(() => {
          fetchRecentTransactions(false);
        }, 5000);
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [transactions, activeFilter, isFocused]);
  // -----------------------------------------------------------------

  const fetchRecentTransactions = async (isLoadMore = false) => {
    try {
      if (!isLoadMore) {
        if (transactions.length === 0) setIsLoading(true);
        setError(null);
        setPage(1);
      } else {
        setIsLoadingMore(true);
      }

      const currentPage = isLoadMore ? page : 1;
      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('page', currentPage);

      const { res, err } = await proxyRequest(
        `/v1/swapOrders/orderByWallet?address=${walletAddress}&${params.toString()}`,
        PGET
      );

      if (err?.status) {
        setError('Failed to fetch transactions');
        return;
      }

      if (res?.ok === true) {
        const formattedTxs = res.data.data.map(tx => ({
          ...tx,
          timestamp: tx.confirmedAt || tx.createdAt
        }));

        setTransactions(prev => isLoadMore ? [...prev, ...formattedTxs] : formattedTxs);
        setHasNext(res.data.hasNext);
        if (res.data.hasNext) setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setRefreshing(false);
    }
  };

  const fetchTransactions = async (isLoadMore = false) => {
    if (activeChain === 'STR') return;
    if (loadingMore) return;

    try {
      if (!isLoadMore) {
        if (apiTransactions.length === 0) setLoading(true);
        setError(null);
        setSentPageKey(null);
        setReceivedPageKey(null);
        setHasNextPage(true);
      } else {
        setLoadingMore(true);
      }

      let endpoint = `/v1/transaction-history`;
      const params = new URLSearchParams();
      if (isLoadMore && sentPageKey) params.append('sentPageKey', sentPageKey);
      if (isLoadMore && receivedPageKey) params.append('receivedPageKey', receivedPageKey);
      if (params.toString()) endpoint += `?${params.toString()}`;

      const { res, err } = await proxyRequest(endpoint, PPOST, {
        walletAddress,
        chain: activeChain.toLowerCase() === "bnb" ? "bsc" : activeChain.toLowerCase()
      });

      if (err?.status) {
        setError('Failed to fetch transactions');
        return;
      }

      if (res) {
        const formattedApiTxs = res.data.map(tx => ({
          ...tx,
          timestamp: tx.metadata?.blockTimestamp || tx.timestamp
        }));

        setApiTransactions(prev =>
          isLoadMore ? [...prev, ...formattedApiTxs] : formattedApiTxs
        );

        setSentPageKey(res.pagination.nextSentPageKey);
        setReceivedPageKey(res.pagination.nextReceivedPageKey);
        setHasNextPage(res.pagination.hasNextPage);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setError('Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (activeFilter === 'Recent') {
      if (!hasNext || isLoadingMore || isLoading) return;
      fetchRecentTransactions(true);
    } else {
      if (!hasNextPage || loadingMore || loading) return;
      fetchTransactions(true);
    }
  };

  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'Recent') {
      return transactions;
    }
    if (activeFilter === 'All') {
      return apiTransactions;
    }
    return apiTransactions.filter(tx => {
      if (tx.from?.toLowerCase() === walletAddress?.toLowerCase()) return activeFilter === 'Send';
      if (tx.to?.toLowerCase() === walletAddress?.toLowerCase()) return activeFilter === 'Receive';
      return false;
    });
  }, [apiTransactions, activeFilter, walletAddress, transactions]);

  const groupedTransactions = useMemo(() => {
    return groupTransactionsByDate(filteredTransactions);
  }, [filteredTransactions]);

  const onRefresh = () => {
    setRefreshing(true);
    if (activeFilter === 'Recent') {
      fetchRecentTransactions();
    } else {
      fetchTransactions(false);
    }
  };

  const renderSectionHeader = ({ section }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
        {section.title}
      </Text>
    </View>
  );

  const renderTransaction = ({ item }) => (
    <TransactionCard
      item={item}
      walletAddress={walletAddress}
      activeChain={activeChain}
      activeFilter={activeFilter}
      navigation={navigation}
      colors={colors}
      onRefreshList={() => {
        if (activeFilter === 'Recent') fetchRecentTransactions();
        else fetchTransactions(false);
      }}
    />
  );

  const sections = Object.keys(groupedTransactions).map(dateKey => ({
    title: dateKey,
    data: groupedTransactions[dateKey]
  }));

  if (activeChain === 'STR') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TransactionForStellar
          title="Transactions"
          onLeftIconPress={() => navigation.goBack()}
          activeBackgroundColor={colors.background}
          activeTxColor={colors.textPrimary}
        />
        <StellarTransactionHistory
          publicKey={state.STELLAR_PUBLICK_KEY}
          isDarkMode={state.THEME.THEME}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Wallet_screen_header
        title="Transactions"
        onLeftIconPress={() => navigation.goBack()}
      />

      <View style={styles.headerSection}>
        {activeFilter !== 'Recent' && (
          <ChainSelector
            activeChain={activeChain}
            onSelect={setActiveChain}
            colors={colors}
          />
        )}
        <FilterChips
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          colors={colors}
        />
      </View>

      {loading || isLoading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <TransactionSkeleton key={i} colors={colors} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.accent }]}
            onPress={fetchTransactions}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredTransactions.length === 0 ? (
        <EmptyState activeFilter={activeFilter} colors={colors} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item, index) => `section-${index}`}
          renderItem={({ item: section }) => (
            <View>
              {renderSectionHeader({ section })}
              {section.data.map((tx, index) => (
                <View key={`${tx.hash}-${index}`}>
                  {renderTransaction({ item: tx })}
                </View>
              ))}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={() => (
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={colors.accent}
                style={{ marginVertical: 16 }}
              />
            ) : !hasNextPage && (apiTransactions.length > 0 || transactions.length > 0) ? (
              <Text style={{
                textAlign: 'center',
                color: colors.textTertiary,
                marginVertical: 16,
                fontSize: 13
              }}>
                No more transactions
              </Text>
            ) : null
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chainSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  chainIconSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  chainSelectorText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight:"80%"
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  chainOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  chainIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  chainDetails: {
    flex: 1,
  },
  chainName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  chainSymbol: {
    fontSize: 14,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    paddingVertical: 8,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transactionCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardLeft: {
    marginRight: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  assetText: {
    fontSize: 16,
    fontWeight: '700',
  },
  chainBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  chainBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  txTypeText: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  txTypeTextRight: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'right',
  },
  addressText: {
    fontSize: 14,
    marginBottom: 2,
  },
  timeText: {
    fontSize: 12,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  pendingIndicator: {
    marginTop: 4,
  },
  skeletonCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
  skeletonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
    justifyContent: 'center',
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    padding: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

const Transactions = () => (
  <ThemeProvider>
    <TransactionHistory />
  </ThemeProvider>
);

export default Transactions;