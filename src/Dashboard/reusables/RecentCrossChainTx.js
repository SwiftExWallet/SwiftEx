import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import LocalTxManager from '../../utilities/LocalTxManager';
import { useNavigation } from '@react-navigation/native';
import Icon from '../../icon';
import { colors } from '../../Screens/ThemeColorsConfig';
import { RPC } from '../constants';
import Web3 from 'web3';

const RecentCrossChainTx = ({ activeWalletPublicKey, theme }) => {
  const navigation = useNavigation();
  const [transactions, setTransactions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const activeTheme = theme ? colors.dark : colors.light;

  const loadTransactions = useCallback(async () => {
    try {
      const response = await LocalTxManager.getWalletTx(activeWalletPublicKey);
      console.log(response)
      if (response.status) {
        const uniqueTransactions = response.data.filter((tx, index, self) =>
          index === self.findIndex((t) => (
            t.hash === tx.hash && t.chain === tx.chain
          ))
        );
        setTransactions(uniqueTransactions);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [activeWalletPublicKey]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const refreshSingleTx = async (chainSymbol, txHash, type) => {
    try {
      setRefreshing(true);

      let updatedStatus = {
        chain: chainSymbol,
        hash: txHash,
        status: "pending",
        statusColor: "#eec14fff"
      };

      if (type === "Approval"||type === "approval") {
        const receipt = await getTxReceiptByChain(chainSymbol, txHash);

        if (receipt?.status === true || receipt?.status === 1) {
          updatedStatus = {
            ...updatedStatus,
            status: "completed",
            statusColor: "#09b317ff"
          };
        } else if (receipt?.status === false || receipt?.status === 0) {
          updatedStatus = {
            ...updatedStatus,
            status: "failed",
            statusColor: "#de2727ff"
          };
        } else {
          updatedStatus = {
            ...updatedStatus,
            status: "pending",
            statusColor: "#eec14fff"
          };
        }
      }
      else {
        const receipt = await getTxReceiptByChain(chainSymbol, txHash);
        if (receipt?.status === true || receipt?.status === 1) {
          updatedStatus = { ...updatedStatus, status: "completed", statusColor: "#09b317ff" };
        } else if (receipt?.status === false || receipt?.status === 0) {
          updatedStatus = { ...updatedStatus, status: "failed", statusColor: "#de2727ff" };
        }
      }

      await LocalTxManager.updateTxStatus(activeWalletPublicKey, updatedStatus);

      setTransactions(prev =>
        prev.map(tx =>
          tx.hash === txHash && tx.chain === chainSymbol
            ? { ...tx, status: updatedStatus.status, statusColor: updatedStatus.statusColor }
            : tx
        )
      );

      setRefreshing(false);
      return updatedStatus;

    } catch (err) {
      console.error("error in refreshing tx:", err);
      setRefreshing(false);
      return { status: "pending", statusColor: "#eec14fff" };
    }
  };

  const getTxReceiptByChain = async (chainSymbol, txHash) => {
    let rpcUrl;

    switch (chainSymbol) {
      case "ETH":
        rpcUrl = RPC.ETHRPC;
        break;

      case "BNB":
      case "BSC":
        rpcUrl =  RPC.BSCRPC;
        break;

      default:
        return null;
    }

    const web3 = new Web3(rpcUrl);
    return await web3.eth.getTransactionReceipt(txHash);
  };

  const txViewManager = (status, chain, hash) => {
    if (status === "processing" || status === "completed") {
      navigation.navigate("TxDetail", { transactionPath: chain === "ETH" ? "https://etherscan.io/tx/" + hash : "https://bscscan.com/tx/" + hash });
    } else {
      if(chain === "SRB"){
        navigation.navigate("TxDetail", { transactionPath: "https://stellar.expert/explorer/public/tx/" + hash})
      }else{
        navigation.navigate("TxDetail", { transactionPath: chain === "ETH" ? "https://etherscan.io/tx/" + hash : "https://bscscan.com/tx/" + hash })
      }
    }
  }

  const renderItem = ({ item }) => (
    <View style={[styles.cardContainer, { backgroundColor: activeTheme.cardBg }]}>
      <View style={styles.leftSection}>
        <View style={[styles.iconContainer, { backgroundColor: activeTheme.smallCardBg }]}>
          <Text style={{ fontSize: 25, fontWeight: "500", color: '#3b82f6' }}>{item?.chain?.charAt(0)?.toLocaleUpperCase() || "E"}</Text>
        </View>
      </View>
      <View style={styles.rightSection}>
        <View style={styles.headerRow}>
          <Text style={[styles.assetName, { color: activeTheme.headingTx, marginBottom: -16 }]}>
            {item?.type === "Approval"||item?.type === "approval" ? "Approval" : item?.chain==="ETH"||item?.chain==="BSC"||item?.chain==="BNB"?"Deposit USDC":"Withdrawal USDC"}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: item.statusColor }]}>
            <Text style={[styles.statusText, { color: activeTheme.headingTx }]}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.detailsRow}>
          <TouchableOpacity onPress={() => { txViewManager(item.status,item.chain,item.hash) }}>
            <Text style={[styles.dateText, { color: '#007AFF' }]}>
              {`XXXXXXXX${item.hash.slice(-15)}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => { await refreshSingleTx(item.chain, item.hash ,item?.type) }}>
            <Icon name={"refresh-circle"} type={"materialCommunity"} size={30} color={"#3b82f6"} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No transactions yet</Text>
      <Text style={styles.emptySubtext}>
        Your transaction history will appear here
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: activeTheme.bg }]}>
      <View style={[styles.header, { backgroundColor: activeTheme.bg }]}>
        <Text style={[styles.headerTitle, { color: activeTheme.headingTx }]}>Recent Five Transaction</Text>
        <Text style={[styles.headerSubtitle, { color: activeTheme.inactiveTx }]}>
          {transactions.length} transaction(s)
        </Text>
      </View>

      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.hash}-${index}`}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        style={{marginBottom:30}}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 0.2,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  listContainer: {
    padding: 16,
  },
  transactionItem: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  txMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chainText: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  hashText: {
    fontSize: 14,
    color: '#007AFF',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: "center"
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#BBB',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  cardContainer: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: "row",
    alignContent: "center",
  },
  leftSection: {
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightSection: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
    paddingRight: 14
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '500',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  assetName: {
    fontSize: 17,
    fontWeight: '600',
  },
  statusBadge: {
    maxWidth: 89,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 15,
    alignItems: "center"
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  amountText: {
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: "right",
    maxWidth: "35%"
  },
});

export default RecentCrossChainTx;