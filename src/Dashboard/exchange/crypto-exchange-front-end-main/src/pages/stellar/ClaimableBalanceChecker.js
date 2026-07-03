import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  NativeModules,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import {Asset, BASE_FEE, Horizon, Networks, Operation, TransactionBuilder} from '@stellar/stellar-sdk';
import { STELLAR_URL } from "../../../../../constants";
import LinearGradient from "react-native-linear-gradient";
import { colors } from "../../../../../../Screens/ThemeColorsConfig";
import CustomInfoProvider from "../../components/CustomInfoProvider";
import DragToProcced from "../AnimatedComponent/DragToProcced"
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.8;

const ClaimableBalanceChecker = ({
  publicKey,
  autoFetch = false,
  onClose,
  isDark
}) => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState(null);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [viewAllTx, setViewAllTx] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState(0);

  const theme = isDark ? colors.dark : colors.light;
  const server = new Horizon.Server(STELLAR_URL.URL);

  const fetchClaimableBalances = async () => {
    if (!publicKey || publicKey.length !== 56) {
      setError("Invalid Stellar public key");
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await server
        .claimableBalances()
        .claimant(publicKey)
        .limit(200)
        .call();

      const records = result.records || [];
      const enriched = records.map((balance) => {
        let assetCode = "XLM";
        let assetIssuer = null;

        if (balance.asset !== "native") {
          const [code, issuer] = balance.asset.split(":");
          assetCode = code;
          assetIssuer = issuer;
        }

        return {
          ...balance,
          assetCode,
          assetIssuer,
        };
      });

      setBalances(enriched);

      if (enriched.length > 0 && autoFetch) {
        setIsVisible(true);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch claimable balances");
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAsset = async (balance) => {
    const balanceId = balance.id;
    const assetCode = formatAsset(balance.asset);

    if (!NativeModules.StellarSigner) {
      CustomInfoProvider.show("error", "!Oops", "Something went wrong.");
      return;
    }

    setClaimingId(balanceId);
    try {
      const account = await server.loadAccount(publicKey);
      const txBuilder = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase: Networks.PUBLIC,
      });

      if (balance.asset !== "native" && balance.assetIssuer) {
        const customAsset = new Asset(balance.assetCode, balance.assetIssuer);
        const hasTrustline = account.balances.some(
          (b) => b.asset_code === balance.assetCode && b.asset_issuer === balance.assetIssuer
        );
        if (!hasTrustline) {
          txBuilder.addOperation(Operation.changeTrust({ asset: customAsset }));
        }
      }

      txBuilder.addOperation(
        Operation.claimClaimableBalance({ balanceId })
      );

      const transaction = txBuilder.setTimeout(30).build();
      const txXDR = transaction.toXDR();

      const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);

      transaction.addSignature(
        signedTx.publicKey,
        Buffer.from(signedTx.signature, 'base64').toString('base64')
      );

      const txResponse = await server.submitTransaction(transaction);
      CustomInfoProvider.show("success", "Hurray", `${assetCode} has been successfully claimed!`);
      fetchClaimableBalances();
    } catch (err) {
      console.error("Claim Error:", err);
      CustomInfoProvider.show("error", "Claim Failed", err.message || "Something went wrong while claiming.");
    } finally {
      setClaimingId(null);
    }
  };

  useEffect(() => {
    if (autoFetch && publicKey) {
      setViewAllTx(true);
      fetchClaimableBalances();
    }
  }, [publicKey, autoFetch]);

  const formatAsset = (asset) => {
    if (!asset) return "Unknown";
    if (asset === "native" || asset.asset_type === "native") return "XLM";
    if (typeof asset === "string") return asset.split(":")[0] || "Unknown";
    return asset.asset_code || asset.code || "Unknown Asset";
  };

  const formatAmount = (amount) => parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    };
  };

  const getClaimCondition = (claimants) => {
    if (!claimants || claimants.length === 0) return { text: "No conditions", color: "#6B7280", isReady: false };
    const predicate = claimants[0].predicate;
    if (predicate && predicate.unconditional) {
      return { text: "Ready to Claim", color: "#10b981", isReady: true };
    }
    return { text: "Time Locked", color: "#f59e0b", isReady: false };
  };

  const toggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => {
        setIsVisible(false);
        onClose();
      }}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            setIsVisible(false);
            onClose();
          }}
        />

        <View style={[styles.bottomSheet, { backgroundColor: theme.cardBg }]}>
          <View style={[styles.dragIndicator, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]} />

          {balances.length > 0 && !viewAllTx && (
            <View style={styles.welcomeContainer}>
              <View style={styles.iconBadgeContainer}>
                <Icon name="auto-awesome" size={40} color="#4052D6" />
              </View>
              <Text style={[styles.heading, { color: theme.headingTx }]}>Pending Tokens Found</Text>
              <Text style={[styles.subText, { color: theme.inactiveTx }]}>
                You have {balances.length} claimable balance{balances.length > 1 ? 's' : ''} waiting for your review.
              </Text>

              <TouchableOpacity onPress={() => setViewAllTx(true)} style={styles.welcomePrimaryBtn}>
                <Text style={styles.welcomePrimaryBtnTxt}>Review Balances ({balances.length})</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsVisible(false)} style={styles.welcomeSecondaryBtn}>
                <Text style={[styles.welcomeSecondaryBtnTxt, { color: theme.inactiveTx }]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}

          {viewAllTx && (
            <View style={{ flex: 1 }}>
              <View style={styles.headerRow}>
                <Text style={[styles.sheetTitle, { color: theme.headingTx }]}>Claimable Assets</Text>
                <Text style={[styles.badgeCount, { backgroundColor: isDark ? 'rgba(64,82,214,0.2)' : '#EEEFFF', color: '#4052D6' }]}>
                  {balances.length} Pending
                </Text>
              </View>

              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 30 }}
              >
                {loading && (
                  <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color={"#4052D6"} />
                    <Text style={[styles.loadingText, { color: theme.inactiveTx }]}>Fetching Stellar network...</Text>
                  </View>
                )}

                {error && (
                  <View style={[styles.errorContainer, { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)' }]}>
                    <Icon name="error-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                    <Text style={[styles.errorText, { color: '#ef4444' }]}>{error}</Text>
                  </View>
                )}

                {!loading && !error && balances.map((balance, index) => {
                  const condition = getClaimCondition(balance.claimants);
                  const isExpanded = expandedIndex === index && condition.text !== 'Time Locked';
                  const assetString = typeof balance.asset === 'string' ? balance.asset : '';
                  const issuerAddress = assetString.includes(':')
                    ? `${assetString.split(":")[1].slice(0, 8)}...${assetString.split(":")[1].slice(-8)}`
                    : 'Stellar Native';
                  const currentAssetCode = formatAsset(balance.asset);

                  return (
                    <View
                      key={balance.id || index}
                      style={[
                        styles.cardContainer,
                        {
                          borderColor: isExpanded ? '#4052D6' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                          backgroundColor: isExpanded ? (isDark ? 'rgba(64,82,214,0.05)' : '#F9FAFF') : 'transparent'
                        }
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.cardHeader}
                        activeOpacity={0.7}
                        onPress={() => toggleExpand(index)}
                      >
                        <LinearGradient
                          colors={['#10b981', '#059669']}
                          style={styles.assetIconGrad}
                        >
                          <Text style={styles.assetIcon}>{currentAssetCode[0]}</Text>
                        </LinearGradient>

                        <View style={styles.assetBalCon}>
                          <Text style={[styles.assetBal, { color: theme.headingTx }]}>{formatAmount(balance.amount)}</Text>
                          <View style={styles.subInfoRow}>
                            <Text style={[styles.tokenName, { color: theme.inactiveTx }]}>{currentAssetCode}</Text>
                          </View>
                        </View>

                        <View style={styles.rightHeaderAction}>
                          <Text style={[styles.statusBadgeText, { color: condition.color }]}>{condition.text}</Text>
                          <Icon
                            name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                            size={22}
                            color={theme.inactiveTx}
                          />
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.cardDetails}>
                          <View style={[styles.detailRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.detailLabel, { color: theme.inactiveTx }]}>Issuer Account</Text>
                            <Text style={[styles.detailValue, { color: '#4F8EF7' }]}>{issuerAddress}</Text>
                          </View>

                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.inactiveTx }]}>Sponsor</Text>
                            <Text style={[styles.detailValue, { color: theme.headingTx }]}>
                              {balance.sponsor ? `${balance.sponsor.slice(0, 6)}...${balance.sponsor.slice(-6)}` : 'None'}
                            </Text>
                          </View>

                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.inactiveTx }]}>Created Date</Text>
                            <Text style={[styles.detailValue, { color: theme.headingTx }]}>
                              {formatDate(balance.last_modified_time).date}
                            </Text>
                          </View>

                          <View style={[styles.noteContainer, { backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#FFFBF0', borderColor: isDark ? 'rgba(245,158,11,0.2)' : '#FDE68A' }]}>
                            <Icon name="info-outline" size={16} color="#D97706" style={{ marginRight: 6, marginTop: 1 }} />
                            <Text style={styles.noteText}>
                              A small network fee in XLM is required for each claim operation.
                            </Text>
                          </View>

                          <View style={styles.actionBtnRow}>
                            <DragToProcced
                              onDragComplete={() => handleClaimAsset(balance)}
                              disabled={!condition.isReady}
                              isProccessing={claimingId === balance.id}
                              heading={`Slide to Claim ${currentAssetCode}`}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheet: {
    maxHeight: SHEET_HEIGHT,
    minHeight: '55%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  badgeCount: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconBadgeContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(64,82,214,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  subText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: "90%",
    marginBottom: 28,
  },
  welcomePrimaryBtn: {
    width: '100%',
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#4052D6",
  },
  welcomePrimaryBtnTxt: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
  welcomeSecondaryBtn: {
    paddingVertical: 16,
    marginTop: 8,
  },
  welcomeSecondaryBtnTxt: {
    fontSize: 15,
    fontWeight: "500",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  cardContainer: {
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  assetIconGrad: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  assetIcon: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  assetBalCon: {
    flex: 1,
  },
  assetBal: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  tokenName: {
    fontSize: 13,
    fontWeight: '500',
  },
  rightHeaderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: '#B45309',
    fontWeight: '500',
    lineHeight: 16,
  },
  actionBtnRow: {
    marginTop: 12,
  },
  claimActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  claimActionBtnTxt: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ClaimableBalanceChecker;