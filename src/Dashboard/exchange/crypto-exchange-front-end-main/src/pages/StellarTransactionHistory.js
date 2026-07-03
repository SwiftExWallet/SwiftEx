import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import * as StellarSdk from '@stellar/stellar-sdk';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { STELLAR_URL } from '../../../../constants';
import { useNavigation } from '@react-navigation/native';
import { authRequest, POST } from '../api';
import AllbridgeTxTrack from '../components/AllbridgeTxTrack';
import LocalTxManager from '../../../../../utilities/LocalTxManager';
import { useSelector } from 'react-redux';
import { AllbridgeCoreSdk, nodeRpcUrlsDefault } from '@allbridge/bridge-core-sdk';
import CustomInfoProvider from '../components/CustomInfoProvider';

const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
const PAGE_SIZE = 10;
const INITIAL_LOAD = 10;
const STELLAR_BATCH_SIZE = 30;

const getThemeColors = (isDarkMode) => ({
  background: isDarkMode ? '#1B1B1C' : '#F5F5F5',
  cardBackground: isDarkMode ? '#242426' : '#FFFFFF',
  primaryText: isDarkMode ? '#FFFFFF' : '#333333',
  secondaryText: isDarkMode ? '#B0B0B0' : '#666666',
  tabBarBackground: isDarkMode ? '#242426' : '#FFFFFF',
  iconBackground: isDarkMode ? '#1B1B1C' : '#F5F5F5',
  divider: isDarkMode ? '#2D2D2D' : '#E0E0E0',
  shadow: isDarkMode ? '#000000' : '#000000',
  accent: '#4052D6',
  success: '#1D5F33',
  error: '#F44336',
  sent: '#FF5722',
  received: '#4CAF50',
});

function formatDate(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

const getAssetName = (code, type) => {
  if (type === 'native') return 'XLM';
  return code || 'XLM';
};

const decodeDestinationChain = (params = []) => {
  try {
    const chainMap = {
      1: "Ethereum",
      2: "BNB",
      3: "Polygon",
      4: "Avalanche",
      5: "Solana",
      6: "Arbitrum",
      7: "Stellar"
    };

    const chainParam = params.find(
      p => p.type === "U32"
    );

    if (!chainParam?.value) return "Bridge";

    const bytes = Buffer.from(chainParam.value, "base64");

    let chainId = 0;

    for (let i = bytes.length - 4; i < bytes.length; i++) {
      chainId = (chainId << 8) + bytes[i];
    }

    return chainMap[chainId] || "Bridge";
  } catch {
    return "Bridge";
  }
};


const getTransactionType = (operation, userPublicKey, isReceived) => {
  if (operation.type === 'payment') {
      return operation.asset_code || operation.asset_type;
  }

  switch (operation.type) {
      case 'create_account':
          return 'Account Created';
      case 'change_trust':
          return 'Trust Line';
      case 'manage_sell_offer':
          return 'Swap Out';
      case 'manage_buy_offer':
          return 'Swap In';
      case 'invoke_host_function': {
        return isReceived
          ? `Deposit ${operation.destinationChain || "Bridge"}`
          : `Withdraw ${operation.destinationChain || "Bridge"}`;
      }
      case 'path_payment_strict_send':
      case 'path_payment_strict_receive': {
        const fromAsset = getAssetName(
          operation.source_asset_code,
          operation.source_asset_type
        );
        const toAsset = getAssetName(
          operation.asset_code,
          operation.asset_type
        );
       return `${fromAsset} -> ${toAsset}`;
      }
      case 'setOptions':
          return 'Settings Update';
      case 'buyCry':
          return `Buy ${operation?.cryptoName||""}`;
      case 'sellCry':
          return `Sell ${operation?.cryptoName||""}`;
      case 'create_claimable_balance':
          return `${operation?.asset?.split(":")[0]||"Claimable Asset"}`;
      case 'wallet_tx':
          if (operation.chain === 'SRB') {
            const assetSymbol = operation.symbol || 'USDC';
            return `Withdraw ${assetSymbol}`;
          } else {
            const assetSymbol = operation.symbol || 'USDC';
            return `Deposit ${assetSymbol}`;
          }
      default:
          return operation.type.replace(/([A-Z])/g, ' $1').trim();
  }
};



const getTransactionIcon = (type) => {
  switch (type) {
    case 'payment':
      return 'cash-multiple';
    case 'create_account':
      return 'account-plus';
    case 'change_trust':
      return 'shield-check';
    case 'manageSellOffer':
      return 'trending-down';
    case 'manageBuyOffer':
      return 'trending-up';
      case 'path_payment_strict_send':
      case 'path_payment_strict_receive':
      return 'swap-vertical';
    case 'invoke_host_function':
      return 'bridge';  
    case 'setOptions':
      return 'cog';
    case 'sellCry':
      return 'bank-transfer-in';
    case 'buyCry':
      return 'cash-fast';
    case 'create_claimable_balance':
      return 'family-tree';
    case 'wallet_tx':
      return 'bridge';
    default:
      return 'bank-transfer';
  }
};

const TabBar = ({ selectedTab, onTabPress, isDarkMode }) => {
  const colors = getThemeColors(isDarkMode);
  const tabs = [
    { key: 'all', title: 'All', icon: 'history' },
    { key: 'sent', title: 'Sent', icon: 'arrow-top-right' },
    { key: 'received', title: 'Received', icon: 'arrow-bottom-left' },
    { key: 'path', title: 'Swaps', icon: 'swap-vertical' },
  ];

  return (
    <View style={[styles.tabBar, { backgroundColor: colors.tabBarBackground }]}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tab,
            selectedTab === tab.key && styles.selectedTab,
            selectedTab === tab.key && { borderBottomColor: colors.accent }
          ]}
          onPress={() => onTabPress(tab.key)}
        >
          <Icon
            name={tab.icon}
            size={24}
            color={selectedTab === tab.key ? colors.primaryText : colors.secondaryText}
          />
          <Text
            style={[
              styles.tabText,
              { color: colors.secondaryText },
              selectedTab === tab.key && { color: colors.primaryText }
            ]}
          >
            {tab.title}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const TransactionCard = ({ item, userPublicKey, isDarkMode, onRefreshTx }) => {
  const navigation = useNavigation();
  const colors = getThemeColors(isDarkMode);
  const operations = item?.operations?.records || [];
  const operation = operations.find(op =>
    ['payment',
      'path_payment_strict_receive',
      'path_payment_strict_send',
      'invoke_host_function'
    ].includes(op.type)
  ) || operations[0];
  
  const txType = operation.asset_balance_changes?.find(resObj => resObj.to === userPublicKey);
  const isReceived =
    operation?.to === userPublicKey ||
    operation.type === 'create_account' ||
    operation.type === 'change_trust' ||
    (operation.type === 'invoke_host_function' && !!txType);

  const multiTxType = [
    ...new Set(operations.map(op => getTransactionType(op, userPublicKey, isReceived)))
  ].join(' & ');
  const transactionType = multiTxType;
  
  const [showTx, setshowTx] = useState(false);
  const [showTxHash, setshowTxHash] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  let iconName = getTransactionIcon(operation.type);

 
  let amountText = '0';
  if (operation.type === 'create_claimable_balance') {
    amountText = operation.amount;
  } else if (operation.type === 'payment') {
    amountText = operation.amount;
  } else if (operation.type === 'create_account') {
    amountText = operation.starting_balance;
  } else if (operation.type === 'invoke_host_function') {
    const transfers = operation.asset_balance_changes?.filter(
      resObj =>
        resObj.type === 'transfer' &&
        (resObj.to === userPublicKey || resObj.from === userPublicKey)
    ) || [];

    amountText = transfers.length > 1
      ? transfers[1].amount
      : transfers[0]?.amount || '0';
  }
 else if (operation.type === 'manage_sell_offer' || operation.type === 'manage_buy_offer') {
    amountText = operation.amount;
  } else if (operation.type === 'buyCry'||operation.type === 'sellCry') {
    amountText = operation.amount;
  }
  const isPathPayment = operation.type === 'path_payment_strict_send' || operation.type === 'path_payment_strict_receive';
  const isWalletTx = operation.type === 'wallet_tx';

  let assetFrom = '';
  let assetTo = '';
  let amountFrom = '';
  let amountTo = '';

  if (isPathPayment) {
    assetFrom = operation.source_asset_code || (operation.source_asset_type === 'native' ? 'XLM' : operation.source_asset_type);
    assetTo = operation.asset_code || (operation.asset_type === 'native' ? 'XLM' : operation.asset_type);
    amountFrom = operation.source_amount;
    amountTo = operation.amount;
  }

  const handleRefreshTx = async () => {
    if (isWalletTx && operation.chain && operation.hash) {
      setIsRefreshing(true);
      await onRefreshTx(operation.chain, operation.hash);
      setIsRefreshing(false);
    }
  };

  const txViewrManager = (txId, txType, isReceived) => {
    if (txType === "invoke_host_function" && !isReceived) {
      setshowTxHash([{ chain: "SRB", hash: txId }]);
      setshowTx(true);
    } else if (txType === "wallet_tx") {
      setshowTxHash([{ chain: operation.chain, hash: operation.hash }]);
      setshowTx(true);
    } else {
      Linking.openURL(`${STELLAR_URL.EXPERT_URL}/tx/${txId}`);
    }
  };

  return (
    <>
      <TouchableOpacity 
        style={[
          styles.transactionCard,
          { backgroundColor: colors.cardBackground, shadowColor: colors.shadow }
        ]}
        disabled={operation.type === 'sellCry' || operation.type === 'buyCry' || (isWalletTx && item.success === "pending")}
        onPress={() => {
          item.success === false || item.success === "failed" || item.success === "Failed"?CustomInfoProvider.show("error","Opps!","Transaction failed try again."):
          txViewrManager(item?.operations?.records[0]?.transaction_hash || item?.operations?.records[0]?.hash,operation.type,isReceived);
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.iconBackground }]}>
          <Icon
            name={
              isReceived && operation.type === "payment"
                ? "arrow-bottom-left"
                : operation.type === "payment"
                ? "arrow-top-right"
                : iconName
            }          
            size={24}
            color={colors.primaryText}
          />
        </View>

        <View style={styles.contentContainer}>
          {!isPathPayment && !isWalletTx && (
            <View style={styles.transactionHeader}>
              <Text style={[styles.amount, { color: colors.primaryText }]}>
                {isReceived || 
                 operation.type === 'manage_sell_offer' || 
                 operation.type === 'manage_buy_offer' || 
                 operation.type === 'sellCry' || 
                 operation.type === 'buyCry' || 
                 operation.type === 'create_claimable_balance' ? '' : '-'}
                {operation.type!=="change_trust"&&amountText}
              </Text>
            </View>
          )}

          {isWalletTx && (
            item.success === false || item.success === "failed" || item.success === "Failed"?
            <View style={styles.transactionHeader}>
              <TouchableOpacity 
                onPress={()=>{navigation.navigate("ExportUSDC")}}
                style={styles.tryAgainBtn}
              >
                  <Text style={{fontSize:14,color:"#fff"}}>Try Again</Text>
              </TouchableOpacity>
            </View>
            :
            <View style={styles.transactionHeader}>
              <TouchableOpacity 
                onPress={handleRefreshTx}
                disabled={isRefreshing}
                style={styles.refreshButton}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Icon name="refresh" size={24} color={colors.accent} />
                )}
              </TouchableOpacity>
            </View>
          )}
          
          {isPathPayment ? (
            <View style={[styles.transactionDetails, { paddingVertical: 5 }]}>
              <View style={{ marginTop: -3 }}>
                <Text style={[styles.type, { color: colors.primaryText,maxWidth:140 }]}>
                   {transactionType}
                </Text>
                <Text style={[styles.date, { color: colors.secondaryText }]}>
                  {item.date}
                </Text>
              </View>
              <View>
                <Text style={[styles.amount, { color: colors.primaryText }]}>-{amountFrom}</Text>
                <Text style={[styles.amount, { color: colors.primaryText }]}>+{amountTo}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.transactionDetails}>
              <View style={{ marginTop: -33 }}>
                <Text style={[styles.type, { color: colors.primaryText,maxWidth:140 }]}>
                  {transactionType}
                </Text>
                <Text style={[styles.date, { color: colors.secondaryText }]}>
                  {item.date||""}
                </Text>
              </View>

              <View style={[
                styles.statusBadge,
                {
                  backgroundColor: item.success === true || item.success === "completed"
                    ? colors.success
                    : item.success === false || item.success === "failed" || item.success === "Failed"
                    ? colors.error
                    : item.success === "processing" || item.success === "process"
                    ? "#f0a313d3"
                    : item.success === "pending"
                    ? "#eec14fff"
                    : "gray"
                }
              ]}>
                <Text style={styles.statusText}>
                  {item.success === true
                    ? operation.type === "create_claimable_balance"
                      ? "Claimable"
                      : "Success"
                    : item.success === "processing"
                    ? "Processing"
                    : item.success === "process"
                    ? "Process"
                    : ["completed", "Completed"].includes(item.success)?
                      "Success"
                    : item.success === false || ["failed", "Failed", "FAILED"].includes(item.success)
                    ? "Failed"
                    : typeof item.success === "string"
                    ? item.success.charAt(0).toUpperCase() + item.success.slice(1)
                    : "Unknown"
                  }
                </Text>
              </View>
            </View>
          )}

          {item.memo && item.memo !== 'No memo' && (
            <Text style={[styles.memo, { color: colors.secondaryText }]} numberOfLines={1}>
              Memo: {item.memo}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      
      <View style={styles.allBridgeTxCon}>
        <AllbridgeTxTrack 
          txs={showTxHash} 
          isDarkMode={true} 
          showTx={showTx} 
          closeTx={() => { setshowTx(false); }} 
        />
      </View>
    </>
  );
};

const processStellarTx = async (tx, publicKey) => {
  const operations = await tx.operations();
  const firstOp = operations.records[0];
  let amount = '0';
  let isReceived = false;

  if (firstOp.type === 'payment') {
    amount = firstOp.amount;
    isReceived = firstOp.to === publicKey;
  } else if (firstOp.type === 'create_account') {
    amount = firstOp.starting_balance;
    isReceived = true;
  } else if (firstOp.type === 'invoke_host_function') {
    firstOp.destinationChain =
      decodeDestinationChain(firstOp.parameters);

    const resBal = firstOp.asset_balance_changes?.find(
      resObj =>
        (resObj.to === publicKey ||
          resObj.from === publicKey) &&
        resObj.type === 'transfer'
    ) || null;

    if (resBal) {
      amount = resBal.amount || '0';
      isReceived = resBal.to === publicKey;
    }
  } else if (['change_trust'].includes(firstOp.type)) {
    isReceived = true;
  } else if (firstOp.type === 'manage_sell_offer' || firstOp.type === 'manage_buy_offer') {
    isReceived = false;
    amount = firstOp.amount;
  }

  return {
    id: tx.id,
    date: formatDate(tx.created_at),
    amount: amount,
    success: tx.successful,
    memo: tx.memo || 'No memo',
    operations: operations,
    isReceived: isReceived,
    sortTime: new Date(tx.created_at).getTime(),
  };
};

const StellarTransactionHistory = ({ publicKey, isDarkMode }) => {
  const colors = getThemeColors(isDarkMode);
  const [allTransactions, setAllTransactions] = useState([]);
  const [displayedTransactions, setDisplayedTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stellarCursor, setStellarCursor] = useState(null);
  const [isFetchingStellar, setIsFetchingStellar] = useState(false);
  const state = useSelector((state) => state);
  const stellarCursorRef = useRef(null);
  const allTransactionsRef = useRef([]);

  const updateStellarCursor = (token) => {
    setStellarCursor(token);
    stellarCursorRef.current = token;
  };
  useEffect(() => {
    allTransactionsRef.current = allTransactions;
  }, [allTransactions]);

  const refreshSingleTx = async (chainSymbol, txHash) => {
    try {
      const sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
      const matchedTx = await sdk.getTransferStatus(chainSymbol, txHash);

      let updatedStatus = {
        chain: chainSymbol,
        hash: txHash,
        status: "pending",
        statusColor: "#eec14fff"
      };

      if (matchedTx.isSuspended) {
        updatedStatus = {
          chain: chainSymbol,
          hash: txHash,
          status: "failed",
          statusColor: "#de2727ff"
        };
      } else if (matchedTx.receive?.txId) {
        const confirmed = matchedTx.receive.confirmations >= (matchedTx.receive.confirmationsNeeded || 0);
        updatedStatus = {
          chain: chainSymbol,
          hash: txHash,
          status: confirmed ? "completed" : "pending",
          statusColor: confirmed ? "#09b317ff" : "#eec14fff"
        };
      } else if (matchedTx.send?.txId) {
        updatedStatus = {
          chain: chainSymbol,
          hash: txHash,
          status: "processing",
          statusColor: "#eec14fff"
        };
      }

      await LocalTxManager.updateTxStatus(state?.wallet?.address, updatedStatus);
      
      const updateTransactions = (txList) => txList.map(tx => {
          if (tx.id === `wallet_tx_${txHash}` && tx.operations.records[0].chain === chainSymbol) {
            return {
              ...tx,
              success: updatedStatus.status,
              operations: {
                records: [{
                  ...tx.operations.records[0],
                  status: updatedStatus.status,
                  statusColor: updatedStatus.statusColor
                }]
              }
            };
          }
          return tx;
        })
      setAllTransactions(prev => updateTransactions(prev));
      setDisplayedTransactions(prev => updateTransactions(prev));

      return { status: updatedStatus.status, statusColor: updatedStatus.statusColor };
    } catch (err) {
      console.error('error in refreshing tx:', err);
      return { status: "pending", statusColor: "#eec14fff" };
    }
  };

  useEffect(() => {
    const autoRefreshPendingTxs = async () => {
      try {
        const currentTxs = allTransactionsRef.current;
        if (!currentTxs || !Array.isArray(currentTxs)) return;

        const pendingWalletTxs = currentTxs.filter(tx => {
          const op = tx?.operations?.records?.[0];
          const statusStr = typeof tx?.success === 'string'
            ? tx.success.toLowerCase()
            : String(tx?.success || '').toLowerCase();

          return (
            op?.type === 'wallet_tx' &&
            ['pending', 'processing', 'process'].includes(statusStr) &&
            op?.chain &&
            op?.hash
          );
        });
        
        if (pendingWalletTxs.length === 0) return;

        await Promise.all(
          pendingWalletTxs.map(tx => {
            const op = tx.operations.records[0];
            return refreshSingleTx(op.chain, op.hash);
          })
        );
      } catch (error) {
        console.error("Error inside auto refresh function:", error);
      }
    };

    const intervalId = setInterval(autoRefreshPendingTxs, 20000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchTransactions = async () => {
    try {
      const transactionsData = await server
        .transactions()
        .forAccount(publicKey)
        .order('desc')
        .limit(STELLAR_BATCH_SIZE)
        .call();

      const lastRecord = transactionsData.records[transactionsData.records.length - 1];
      updateStellarCursor(lastRecord?.paging_token || null);

      const processedTransactions = await Promise.all(
        transactionsData.records.map(tx => processStellarTx(tx, publicKey))
      );

      const stellarHashes = new Set(
        transactionsData.records.map(tx => tx.hash).filter(Boolean)
      );

      let walletTxs = [];
      try {
        const walletResponse = await LocalTxManager.getWalletTx(state?.wallet?.address);

        if (walletResponse?.status && walletResponse?.data && Array.isArray(walletResponse.data)) {

          for (const tx of walletResponse.data) {
            if (!tx.timestamp) continue;

            const currentTime = Date.now();
            const isOlderThan25Min = (currentTime - tx.timestamp) > 25 * 60 * 1000;
            const txStatus = tx.status?.toLowerCase();
            const isSRBPending = tx.chain === "SRB" && txStatus === "pending";

            if (isSRBPending && isOlderThan25Min && tx.hash) {
              await LocalTxManager.updateTxStatus(state?.wallet?.address, {
                chain: tx.chain,
                hash: tx.hash,
                status: "failed",
                statusColor: "#de2727ff"
              });
            }
          }
          const stellarInvokeTxIds = new Set(
            processedTransactions
              .filter(tx => tx.operations.records[0].type === 'invoke_host_function')
              .map(tx => tx.operations.records[0].transaction_hash)
              .filter(Boolean)
          );
        
          const filteredWalletTxs = walletResponse.data.filter(tx => {
            const isCompletedOrApproval = tx.status === 'completed' || ['approval', 'Approval'].includes(tx.type);
            const isAlreadyInStellar = tx.hash && stellarHashes.has(tx.hash);
            const isPendingInStellar = isAlreadyInStellar &&
              ['pending', 'processing', 'process'].includes(tx.status?.toLowerCase());
            const isSRBAlreadyOnStellar = tx.chain === "SRB" && stellarInvokeTxIds.has(tx.hash);

            return !isCompletedOrApproval && !isSRBAlreadyOnStellar && (!isAlreadyInStellar || isPendingInStellar);
          });

          const uniqueWalletTxs = [];
          const seenHashes = new Set();
          
          filteredWalletTxs.forEach(tx => {
            const txHash = tx.hash || `${tx.chain}_${tx.timestamp}`;
            if (!seenHashes.has(txHash)) {
              seenHashes.add(txHash);
              uniqueWalletTxs.push(tx);
            }
          });

          uniqueWalletTxs.sort((a, b) => {
            const timeA = a.timestamp || 0;
            const timeB = b.timestamp || 0;
            return timeB - timeA;
          });

          walletTxs = uniqueWalletTxs.map((tx) => {
            const txTimestamp = tx.timestamp;

            if (!txTimestamp) {
              return {
                id: `wallet_tx_${tx.hash || Date.now()}`,
                date: `${tx.chain} - ${tx.symbol || 'Cross-chain'}`,
                amount: '0',
                success: tx.status,
                memo: "",
                operations: {
                  records: [{
                    type: 'wallet_tx',
                    symbol: tx.symbol,
                    chain: tx.chain,
                    hash: tx.hash,
                    status: tx.status,
                    statusColor: tx.statusColor,
                    transaction_hash: tx.hash,
                    timestamp: Date.now(),
                  }]
                },
                isReceived: true,
                sortTime: Date.now(),
              };
            }

            const currentTime = Date.now();
            const isOlderThan25Min = (currentTime - txTimestamp) > 25 * 60 * 1000;
            const txStatus = tx.status?.toLowerCase();
            const isSRBPending = tx.chain === "SRB" && txStatus === "pending";
            const finalStatus = isSRBPending && isOlderThan25Min ? "failed" : tx.status;
            const finalStatusColor = isSRBPending && isOlderThan25Min ? "#de2727ff" : tx.statusColor;

          return {
            id: `wallet_tx_${tx.hash || txTimestamp}`,
            date: txTimestamp ? formatDate(new Date(txTimestamp)) : `${tx.chain} - ${tx.symbol || 'Cross-chain'}`,
            amount: '0',
            success: finalStatus,
            memo: "",
            operations: {
              records: [{
                type: 'wallet_tx',
                symbol: tx.symbol,
                chain: tx.chain,
                hash: tx.hash,
                status: finalStatus,
                statusColor: finalStatusColor,
                transaction_hash: tx.hash,
                timestamp: txTimestamp, 
              }]
            },
            isReceived: true,
            sortTime: txTimestamp,
          };
         });
        }
      } catch (walletError) {
        console.error('Error fetching wallet transactions:', walletError);
      }

      const allTxs = [...walletTxs, ...processedTransactions];
      allTxs.sort((a, b) => b.sortTime - a.sortTime);

      setAllTransactions(allTxs);
      const initialDisplay = allTxs.slice(0, INITIAL_LOAD);
      setDisplayedTransactions(initialDisplay);
      setCurrentPage(1);
      setHasMore(allTxs.length > INITIAL_LOAD || lastRecord?.paging_token != null);

    } catch (error) {
      console.log('Error fetching transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMoreStellarTransactions = async () => {
    if (isFetchingStellar || !stellarCursorRef.current) return [];

    setIsFetchingStellar(true);
    try {
      const transactionsData = await server
        .transactions()
        .forAccount(publicKey)
        .order('desc')
        .cursor(stellarCursorRef.current)
        .limit(STELLAR_BATCH_SIZE)
        .call();

      if (transactionsData.records.length > 0) {
        const lastRecord = transactionsData.records[transactionsData.records.length - 1];
        updateStellarCursor(lastRecord?.paging_token || null);

        const processedTransactions = await Promise.all(
          transactionsData.records.map(tx => processStellarTx(tx, publicKey))
        );

        return processedTransactions;
      }
      return [];
    } catch (error) {
      console.log('Error fetching more Stellar transactions:', error);
      return [];
    } finally {
      setIsFetchingStellar(false);
    }
  };

  const getFilteredTransactions = (txList, filterTab = selectedTab) => {
    return txList.filter(tx => {
      const opType = tx.operations.records[0].type;

      if (filterTab === 'all') return true;

      if (filterTab === 'sent') {
        return (
          !tx.isReceived &&
          opType !== 'path_payment_strict_send' &&
          opType !== 'path_payment_strict_receive' &&
          opType !== 'sellCry' &&
          opType !== 'buyCry' &&
          opType !== 'wallet_tx' &&
          opType !== 'create_account'
        );
      }

      if (filterTab === 'received') {
        return (
          tx.isReceived &&
          opType !== 'path_payment_strict_send' &&
          opType !== 'path_payment_strict_receive' &&
          opType !== 'wallet_tx' &&
          opType !== 'sellCry' &&
          opType !== 'buyCry' &&
          opType !== 'create_account'
        );
      }

      if (filterTab === 'path') {
        return (
          opType === 'path_payment_strict_send' ||
          opType === 'path_payment_strict_receive' ||
          opType === 'wallet_tx'
        );
      }

      return true;
    });
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    const filteredTxs = getFilteredTransactions(allTransactions, tab);
    setDisplayedTransactions(filteredTxs.slice(0, INITIAL_LOAD));
    setCurrentPage(1);
    setHasMore(filteredTxs.length > INITIAL_LOAD || stellarCursorRef.current !== null);
  };

  const loadMoreTransactions = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);

    try {
      const filteredAll = getFilteredTransactions(allTransactions, selectedTab);
      const currentDisplayedCount = displayedTransactions.filter(tx =>
        getFilteredTransactions([tx], selectedTab).length > 0
      ).length;

      if (currentDisplayedCount < filteredAll.length) {
        const nextBatch = filteredAll.slice(currentDisplayedCount, currentDisplayedCount + PAGE_SIZE);
        setDisplayedTransactions(prev => [...prev, ...nextBatch]);
        setHasMore(
          currentDisplayedCount + PAGE_SIZE < filteredAll.length ||
          stellarCursorRef.current !== null
        );
      } else {
        if (!stellarCursorRef.current) {
          setHasMore(false);
          return;
        }

        const newStellarTxs = await fetchMoreStellarTransactions();

        if (newStellarTxs.length > 0) {
          const updatedAll = [...allTransactions, ...newStellarTxs].sort(
            (a, b) => b.sortTime - a.sortTime
          );
          setAllTransactions(updatedAll);

          const newFiltered = getFilteredTransactions(newStellarTxs, selectedTab);
          setDisplayedTransactions(prev => [...prev, ...newFiltered.slice(0, PAGE_SIZE)]);
          setHasMore(newStellarTxs.length >= STELLAR_BATCH_SIZE || stellarCursorRef.current !== null);
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error('Error loading more transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [allTransactions, displayedTransactions, loadingMore, hasMore, selectedTab]);

  useEffect(() => {
    fetchTransactions();
  }, [publicKey]);

  const onRefresh = async () => {
    setAllTransactions([]);
    setDisplayedTransactions([]);
    setLoading(true);
    setLoadingMore(false);
    setRefreshing(false);
    setSelectedTab('all');
    setCurrentPage(1);
    setHasMore(true);
    setStellarCursor(null);
    setIsFetchingStellar(false);
    await fetchTransactions();
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const filteredDisplayedTransactions = getFilteredTransactions(displayedTransactions, selectedTab);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TabBar
        selectedTab={selectedTab}
        onTabPress={handleTabChange}
        isDarkMode={isDarkMode}
      />

      <FlatList
        data={filteredDisplayedTransactions}
        renderItem={({ item }) => (
          <TransactionCard
            item={item}
            userPublicKey={publicKey}
            isDarkMode={isDarkMode}
            onRefreshTx={refreshSingleTx}
          />
        )}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          filteredDisplayedTransactions.length === 0 && { 
            flex: 1, 
            justifyContent: 'center', 
            alignItems: 'center' 
          }
        ]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMoreTransactions}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() => {
          if (loadingMore) {
            return (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
                  Loading more...
                </Text>
              </View>
            );
          }
          if (!hasMore && filteredDisplayedTransactions.length > 0) {
            return (
              <View style={styles.footerLoader}>
                <Text style={[styles.endText, { color: colors.secondaryText }]}>
                  • End of transactions •
                </Text>
              </View>
            );
          }
          return null;
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="history" size={60} color={colors.primaryText} />
            <Text style={[styles.emptyText, { color: colors.primaryText }]}>
              No transactions found
            </Text>
            <Text style={[styles.emptySubText, { color: colors.secondaryText }]}>
              Your transactions will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selectedTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  transactionCard: {
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden'
  },
  iconContainer: {
    width: 63,
    height: 63,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    alignSelf: "center",
    marginLeft: 10
  },
  contentContainer: {
    flex: 1,
    padding: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: "flex-end",
    alignItems: 'center',
    marginBottom: 8,
  },
  refreshButton: {
    padding: 1,
  },
  date: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  transactionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: {
    fontSize: 16,
    fontWeight: '500',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  memo: {
    fontSize: 14,
  },
  directionIcon: {
    padding: 8,
    borderRadius: 20,
  },
  exchangeRate: {
    fontSize: 12,
    marginBottom: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 20,
  },
  allBridgeTxCon: {
    zIndex: 20,
    position: "absolute",
    width: "100%",
    maxHeight: "50%",
    bottom: 25
  },
  tryAgainBtn: {
    backgroundColor: "#4052D6",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  endText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});

export default StellarTransactionHistory;