import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  StatusBar,
  ScrollView,
  Image,
} from "react-native";
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AllbridgeCoreSdk, nodeRpcUrlsDefault } from "@allbridge/bridge-core-sdk";
import { STELLAR_URL } from "../../../../constants";
import CustomInfoProvider from "./CustomInfoProvider";
import Modal from "react-native-modal";

const sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);

const explorerLinks = {
  ETH: (hash) => `https://etherscan.io/tx/${hash}`,
  BSC: (hash) => `https://bscscan.com/tx/${hash}`,
  SRB: (hash) => `${STELLAR_URL.EXPERT_URL}/tx/${hash}`,
};

async function getAllbridgeTxStatus(chainSymbol, txHash) {
  try {
    const matchedTx = await sdk.getTransferStatus(chainSymbol, txHash);
    const result = {
      sourceChain: matchedTx?.sourceChainSymbol || chainSymbol,
      destinationChain: matchedTx?.destinationChainSymbol || null,
      sender: matchedTx?.senderAddress || null,
      recipient: matchedTx?.recipientAddress || null,
      amount: matchedTx?.receive?.amountFormatted || null,
      fee: matchedTx?.receive?.feeFormatted || null,
      confirmations: matchedTx?.receive?.confirmations || 0,
      confirmationsNeeded: matchedTx?.receive?.confirmationsNeeded || 0,
      explorerUrl: explorerLinks[chainSymbol]
        ? explorerLinks[chainSymbol](txHash)
        : null,
      response: matchedTx,
    };

    if (matchedTx.isSuspended) {
      return { ...result, currentStatus: "Failed", message: "Transaction has failed." };
    }

    if (matchedTx.receive?.txId) {
      const confirmed =
        matchedTx.receive.confirmations >= (matchedTx.receive.confirmationsNeeded || 0);
      return {
        ...result,
        currentStatus: confirmed ? "Completed" : "Pending",
        message: confirmed
          ? "Transfer confirmed on destination chain."
          : "Destination tx found, waiting for confirmations.",
      };
    }

    if (matchedTx.send?.txId) {
      return {
        ...result,
        currentStatus: "Pending",
        message: "Transfer is still in process.",
      };
    }

    return { ...result, currentStatus: "Unknown", message: "Unable to determine transaction status." };
  } catch (err) {
    const exploredError =
      err?.response?.data?.message ||
      err?.response?.statusText ||
      err.message ||
      "Unexpected Error Occurred.";
    return { currentStatus: "Error", message: exploredError };
  }
}

export default function AllbridgeTxTrack({ txs, isDarkMode, showTx, closeTx }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txData, setTxData] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);


  useEffect(() => {
    if (showTx && txs.length === 1) {
      openModal(txs[0], 0)
    }
  }, [txs, showTx])

  const getThemedColor = (lightColor, darkColor) => {
    return isDarkMode ? darkColor : lightColor;
  };

  const openModal = async (item, index) => {
    setSelectedTx({ ...item, index: index + 1 });
    setLoading(true);
    setModalVisible(true);
    const res = await getAllbridgeTxStatus(item.chain, item.hash);
    if (res.currentStatus !== "Error") {
      setTxData(res);
      setLoading(false);
    } else {
      setLoading(false);
      CustomInfoProvider.show("Transaction Status", "Transaction under process please wait for confirmation.")
      setModalVisible(false);
      setTxData(null);
    }
  };

  const refreshTx = async (txData) => {
    setLoading(true);
    const res = await getAllbridgeTxStatus(txData.sourceChain, txData?.response?.txId);
    if (res.currentStatus !== "Error") {
      setTxData(res);
      setLoading(false);
    } else {
      setLoading(false);
      CustomInfoProvider.show("Transaction Status", "This transaction under process please wait for confirmation.")
      setModalVisible(false);
      setTxData(null);
    }
  };

  const closeModal = () => {
    closeTx()
    setModalVisible(false);
    setTxData(null);
    setSelectedTx(null);
  };

  const getTokenSymbol = (chain) => {
    switch (chain) {
      case 'ETH': return '';
      case 'BSC': return '';
      case 'SRB': return '';
      default: return 'TOKEN';
    }
  };

  const getChainInfo = (chain) => {
    const chainData = {
      ETH: { color: "#627EEA", name: "Ethereum", gradient: ["#627EEA", "#4A69E2"], icon: "https://tokens.pancakeswap.finance/images/0x2170Ed0880ac9A755fd29B2688956BD959F933F8.png" },
      BSC: { color: "#F3BA2F", name: "Binance Smart Chain", gradient: ["#F3BA2F", "#E6A91F"], icon: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970" },
      SRB: { color: "#00D4FF", name: "Stellar", gradient: ["#00D4FF", "#0094CC"], icon: "https://stellar.myfilebase.com/ipfs/QmSTXU2wn1USnmd5ZypA5zMze259wEPSDP3i8wivyr9qiq" },
    };
    return chainData[chain] || { color: "#8B5CF6", name: chain, gradient: ["#8B5CF6", "#7C3AED"], icon: "device-hub" };
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const StatusBadge = ({ status }) => {
    const getStatusConfig = () => {
      switch (status) {
        case "Completed":
          return { bg: "#DCFCE7", color: "#16A34A", text: "Success", iconName: "checkmark-circle-outline" };
        case "Pending":
          return { bg: "#FEF3C7", color: "#D97706", text: "Pending", iconName: "time" };
        case "Failed":
        case "Error":
          return { bg: "#FEE2E2", color: "#DC2626", text: "Failed", iconName: "close-circle-outline" };
        default:
          return { bg: "#F3F4F6", color: "#6B7280", text: "Unknown", iconName: "information" };
      }
    };

    const config = getStatusConfig();

    return (
      <View style={styles.statusBadgeCon}>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.text}
          </Text>
        </View>
        <Ionicons name={config.iconName} size={30} color={config.color} />
      </View>
    );
  };

  const DetailRow = ({ label, value, isLast = false }) => (
    <View style={[
      styles.detailRow,
      !isLast && { borderBottomColor: getThemedColor('#C6C6C8', '#38383A') },
      !isLast && styles.detailRowBorder
    ]}>
      <Text style={[styles.detailLabel, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: getThemedColor('#000000', '#FFFFFF') }]}>{value}</Text>
    </View>
  );

  const ModalContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={getThemedColor('#007AFF', '#0A84FF')} />
          <Text style={[styles.loadingText, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>Checking transaction status...</Text>
        </View>
      );
    }

    if (!txData) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={[styles.noDataText, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>No transaction data found</Text>
        </View>
      );
    }

    const chainInfo = getChainInfo(selectedTx?.chain || '');

    return (
      <View style={styles.modalContentContainer}>
        <View style={[styles.transactionSummary, { backgroundColor: getThemedColor('#FFFFFF', '#1C1C1E') }]}>
          <View style={styles.summaryHeader}>
            <View style={[styles.summaryIcon, { backgroundColor: chainInfo.color }]}>
              <Image source={{ uri: chainInfo.icon }} style={{ width: 41, height: 41 }} />
            </View>
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryTitle, { color: getThemedColor('#000000', '#FFFFFF') }]}>
                Bridge Transfer
              </Text>
              <Text style={[styles.summarySubtitle, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>
                {txData.sourceChain || selectedTx?.chain} <Ionicons name="arrow-forward" size={12} color={getThemedColor('#007AFF', '#0A84FF')} /> {txData.destinationChain || 'Unknown'}
              </Text>
            </View>


            <View style={styles.amountSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
              >
                <Text style={[styles.amountValue, { color: getThemedColor("#000000", "#FFFFFF") }]}
                >{txData.amount ? txData.amount : txData.response.send.amountFormatted}</Text>
              </ScrollView>
              <Text style={[styles.feeText, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>Fee: {txData.fee ? txData.fee : txData.response.send.feeFormatted}</Text>
            </View>

          </View>
        </View>

        <View style={[styles.detailsContainer, { backgroundColor: getThemedColor('#FFFFFF', '#1C1C1E') }, !txData.explorerUrl && { marginTop: "4%" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 }}>
            <Text style={[styles.sectionTitle, { color: getThemedColor('#000000', '#FFFFFF') }]}>Transaction Details</Text>
            <Ionicons name="refresh" size={24} color={"#007AFF"} onPress={() => { refreshTx(txData) }} />
          </View>
          <View style={[styles.detailsCard, { backgroundColor: getThemedColor('#F2F2F7', '#2C2C2E') }]}>
            <DetailRow
              label="Transaction Number"
              value={txData.response?.txId ? `#${txData.response.txId.slice(-8)}` : `#${Math.floor(Math.random() * 100000000)}`}
            />
            <DetailRow
              label="Status"
              value={<StatusBadge status={txData.currentStatus} />}
            />
            <DetailRow
              label="Sender Address"
              value={
                <View style={styles.recipientContainer}>
                  <View style={styles.recipientAvatar}>
                    <Text style={styles.recipientAvatarText}>
                      {txData?.response?.send?.sender?.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.recipientText, { color: getThemedColor('#000000', '#FFFFFF') }]}>
                    {`${txData?.response?.send?.sender?.slice(0, 6)}...${txData?.response?.send?.sender?.slice(-6)}`}
                  </Text>
                </View>
              }
            />
            {txData?.response?.send?.recipient && (
              <DetailRow
                label="Recipient"
                value={
                  <View style={styles.recipientContainer}>
                    <View style={styles.recipientAvatar}>
                      <Text style={styles.recipientAvatarText}>
                        {txData?.response?.send?.recipient?.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.recipientText, { color: getThemedColor('#000000', '#FFFFFF') }]}>
                      {`${txData?.response?.send?.recipient?.slice(0, 6)}...${txData?.response?.send?.recipient?.slice(-6)}`}
                    </Text>
                  </View>
                }
              />
            )}
            <DetailRow
              label="Transaction Date"
              value={formatDate(txData.response?.send?.blockTime)}
            />

            {txData.amount && (
              <DetailRow
                label="Amount Send"
                value={`${txData.amount} ${getTokenSymbol(txData.sourceChain)}`}
              />
            )}
            <DetailRow
              label="Completed On"
              value={
                txData.currentStatus === 'Completed' && txData.response?.receive?.blockTime
                  ? formatDate(txData.response.receive.blockTime)
                  : 'Pending'
              }
            />
            <DetailRow
              label="Transaction Hash"
              value={txData.response.hash ?
                `${txData.response.hash.slice(0, 8)}...${txData.response.hash.slice(-6)}` : txData.response.send.hash ? `${txData.response.send.hash.slice(0, 8)}...${txData.response.send.hash.slice(-6)}` : 'Pending'}
            />
            <DetailRow
              label="Fee"
              value={txData.fee ? `${txData.fee} ${getTokenSymbol(txData.sourceChain)}` : txData.response.send.feeFormatted ? `${txData.response.send.feeFormatted} ${getTokenSymbol(txData.sourceChain)}` : 'IDR 0'}
            />
            <DetailRow
              label="Payment Method"
              value={`${txData.sourceChain || selectedTx?.chain} Bridge Transfer`}
              isLast={true}
            />
          </View>

          {txData.currentStatus === 'Pending' && txData.confirmationsNeeded > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>Confirmations</Text>
                <Text style={[styles.progressValue, { color: getThemedColor('#000000', '#FFFFFF') }]}>
                  {txData.confirmations}/{txData.confirmationsNeeded}
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: getThemedColor('#E5E5EA', '#48484A') }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min((txData.confirmations / txData.confirmationsNeeded) * 100, 100)}%`,
                      backgroundColor: getThemedColor('#007AFF', '#0A84FF')
                    }
                  ]}
                />
              </View>
              <Text style={[styles.progressNote, { color: getThemedColor('#8E8E93', '#8E8E93') }]}>
                {txData.message || 'Transaction is being processed'}
              </Text>
            </View>
          )}

          {txData.destinationChain && (
            <View style={[styles.detailsContainer, { backgroundColor: getThemedColor('#FFFFFF', '#1C1C1E'), paddingHorizontal: 2 }]}>
              <Text style={[styles.sectionTitle, { color: getThemedColor('#000000', '#FFFFFF') }]}>
                {getChainInfo(txData.destinationChain).name} Details
              </Text>

              <View style={[styles.detailsCard, { backgroundColor: getThemedColor('#F2F2F7', '#2C2C2E') }]}>
                <DetailRow
                  label="Chain"
                  value={getChainInfo(txData.destinationChain).name}
                />
                <DetailRow
                  label="Transaction Hash"
                  value={txData.response?.receive?.txId ?
                    `${txData.response.receive.txId.slice(0, 8)}...${txData.response.receive.txId.slice(-6)}` :
                    'Pending'
                  }
                />
                {txData.response.send.recipient && (
                  <DetailRow
                    label="Recipient"
                    value={`${txData.response.send.recipient.slice(0, 6)}...${txData.response.send.recipient.slice(-6)}`}
                  />
                )}
                {txData.response?.send?.blockId && (
                  <DetailRow
                    label="Block Number"
                    value={txData.response.send.blockId}
                  />
                )}
                {txData.response?.receive?.blockTime && (
                  <DetailRow
                    label="Block Time"
                    value={formatDate(txData.response.receive.blockTime)}
                  />
                )}
                <DetailRow
                  label="Signatures"
                  value={`${txData.response?.signaturesCount || 0}/${txData.response?.signaturesNeeded || 2}`}
                  isLast={true}
                />
              </View>
            </View>
          )}

          <View style={[styles.bottomCon, {
            backgroundColor: getThemedColor('#FFFFFF', '#1C1C1E'),
            borderBottomColor: getThemedColor('#C6C6C8', '#38383A')
          }]}>
            <TouchableOpacity
              style={[styles.explorerButton, { width: txData?.explorerUrl ? "48%" : "100%", backgroundColor: "gray" }, !txData.explorerUrl && { marginTop: "4%" }]}
              onPress={() => { closeModal() }}
              activeOpacity={0.8}
            >
              <Text style={styles.explorerButtonText}>Close</Text>
            </TouchableOpacity>
            {txData.explorerUrl && (
              <TouchableOpacity
                style={[styles.explorerButton, { backgroundColor: getThemedColor('#007AFF', '#0A84FF') }]}
                onPress={() => Linking.openURL(txData.explorerUrl)}
                activeOpacity={0.8}
              >
                <Text style={styles.explorerButtonText}>Explorer </Text>
                <Ionicons name="open-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (showTx) {
    return (
      <Modal
        isVisible={modalVisible}
        onBackdropPress={closeModal}
        onBackButtonPress={closeModal}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.5}
        style={{ justifyContent: "flex-end", margin: 0 }}
      >
        <View
          style={[
            styles.bottomSheet,
            { backgroundColor: getThemedColor('#FFFFFF', '#1C1C1E') }
          ]}
        >
          <TouchableOpacity style={{
            zIndex:20,
            position:"absolute",
            alignSelf:"flex-end",
            padding:10
          }}>
            <Ionicons name="close-circle-outline" size={34} color={"#fff"} onPress={() => { closeModal() }}/>
          </TouchableOpacity>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ModalContent />
          </ScrollView>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  bottomCon: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingTop: 1,
    paddingBottom: 1,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#C6C6C8',
  },
  modalContentContainer: {
    flex: 1,
  },
  transactionSummary: {
    height: "10%",
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  summaryContent: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '400',
  },
  amountSection: {
    alignItems: 'flex-end',
    width: "40%"
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'right',
  },
  feeText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 4,
  },
  detailsContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingTop: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  detailsCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#C6C6C8',
  },
  detailLabel: {
    fontSize: 17,
    color: '#8E8E93',
    fontWeight: '400',
    flex: 1,
  },
  detailValue: {
    fontSize: 17,
    color: '#000000',
    fontWeight: '400',
    textAlign: 'right',
    flex: 1,
  },
  statusBadgeCon: {
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center"
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 5
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressSection: {
    marginTop: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 17,
    color: '#8E8E93',
    fontWeight: '400',
  },
  progressValue: {
    fontSize: 17,
    color: '#000000',
    fontWeight: '400',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  explorerButton: {
    width: "48%",
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 2,
    flexDirection: "row",
    alignItems: 'center',
    justifyContent: "center"
  },
  explorerButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  recipientContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipientAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  recipientAvatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  recipientText: {
    fontSize: 17,
    color: '#000000',
    fontWeight: '400',
  },
  progressNote: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 17,
    color: '#8E8E93',
    marginTop: 16,
    fontWeight: '400',
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noDataText: {
    fontSize: 17,
    color: '#8E8E93',
    fontWeight: '400',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  bottomSheet: {
    maxHeight: "70%",
    width: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 10,
  },
  modalScrollContent: {
    marginTop:10,
    paddingBottom: 20,
  },
});