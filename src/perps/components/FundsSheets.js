import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Modal from "react-native-modal";
import {
  getDepositWalletState,
  fetchDepositAsset,
  prepareDeposit,
  executeDeposit,
  fetchWithdrawInfo,
  fetchWithdrawHistory,
  withdrawWithMainWallet,
} from "../api/asterFunds";
import { isAsterWithdrawSigningAvailable } from "../api/asterWithdrawSigner";
import { gt, isPositive, sub, mul, min as dMin, lte, toPlain, floorToStep } from "../utils/decimal";
import { formatNumber } from "../utils/format";
import { friendlyAsterError } from "../utils/asterErrors";

// Digits + one dot (comma accepted as dot), max 8 decimals.
const cleanInput = (t) =>
  t.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,8}).*$/, "$1");

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

const Sheet = ({ visible, onClose, busy, theme, title, children }) => (
  <Modal
    isVisible={visible}
    onBackdropPress={() => !busy && onClose()}
    onBackButtonPress={() => !busy && onClose()}
    style={styles.modal}
    avoidKeyboard
    useNativeDriverForBackdrop
  >
    <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.headingTx }]}>{title}</Text>
      {children}
    </View>
  </Modal>
);

const Row = ({ label, value, theme, color }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.rowValue, { color: color || theme.headingTx }]}>{value}</Text>
  </View>
);

const AmountInput = ({ theme, value, onChange, onMax }) => (
  <View style={[styles.field, { backgroundColor: theme.cardBg }]}>
    <TextInput
      value={value}
      onChangeText={(t) => onChange(cleanInput(t))}
      placeholder="0.00"
      placeholderTextColor={theme.inactiveTx}
      keyboardType="decimal-pad"
      style={[styles.input, { color: theme.headingTx }]}
    />
    <Text style={[styles.suffix, { color: theme.inactiveTx }]}>USDT</Text>
    <TouchableOpacity onPress={onMax} style={styles.maxBtn}>
      <Text style={[styles.maxTxt, { color: theme.buttonColor }]}>Max</Text>
    </TouchableOpacity>
  </View>
);

const PrimaryButton = ({ theme, label, onPress, disabled, busy, color }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled || busy}
    onPress={onPress}
    style={[styles.primary, { backgroundColor: color || theme.buttonColor, opacity: disabled ? 0.45 : 1 }]}
  >
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryTxt}>{label}</Text>}
  </TouchableOpacity>
);

const STEP_TEXT = {
  approving: "Step 1/2 · Approving USDT…",
  depositing: "Sending deposit…",
  waiting: "Waiting for Aster to credit your deposit…",
};

// ------------------------------------------------------------------ Deposit
export const DepositSheet = ({ visible, onClose, theme, user, onDeposited }) => {
  const [wallet, setWallet] = useState(null);
  const [minDeposit, setMinDeposit] = useState("0");
  const [amount, setAmount] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [review, setReview] = useState(null); // result of prepareDeposit
  const [reviewing, setReviewing] = useState(false);
  const [step, setStep] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!visible || !user) return;
    setAmount("");
    setReview(null);
    setStep(null);
    setResult(null);
    setLoadError(null);
    setWallet(null);
    getDepositWalletState(user)
      .then(setWallet)
      .catch(() => setLoadError("Couldn't load your wallet balance"));
    fetchDepositAsset().then((r) => {
      if (r.data && r.data.minDeposit) setMinDeposit(r.data.minDeposit);
    });
  }, [visible, user]);

  let inline = null;
  if (amount && !isPositive(amount)) inline = "Enter an amount";
  else if (amount && wallet && gt(amount, wallet.usdt)) inline = "Not enough USDT";
  else if (amount && isPositive(minDeposit) && gt(minDeposit, amount)) inline = `Minimum deposit is ${minDeposit} USDT`;
  else if (wallet && !isPositive(wallet.bnb)) inline = "Need a little BNB for gas";

  const doReview = async () => {
    setReviewing(true);
    try {
      setReview(await prepareDeposit(user, amount, minDeposit));
    } catch (e) {
      setReview({ ok: false, error: "Couldn't prepare the deposit. Check your connection." });
    }
    setReviewing(false);
  };

  const doDeposit = async () => {
    if (!review || !review.ok) return;
    setResult(null);
    const res = await executeDeposit(user, review.plan, setStep);
    const hashes = [
      res.approveHash ? `Approve tx ${short(res.approveHash)}` : null,
      res.txHash ? `Deposit tx ${short(res.txHash)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (!res.ok) {
      setStep(null);
      setResult({ ok: false, text: `${res.error}${hashes ? `\n${hashes}` : ""}` });
      return;
    }
    setResult({
      ok: true,
      text: `Deposit sent. Deposits can take a few minutes to show up.${hashes ? `\n${hashes}` : ""}`,
    });
    if (onDeposited) onDeposited(review.plan.amount);
  };

  const busy = !!step && step !== "waiting";
  return (
    <Sheet visible={visible} onClose={onClose} busy={busy} theme={theme} title="Deposit USDT">
      <Text style={[styles.note, { color: theme.inactiveTx }]}>
        From your wallet {short(user)} on BNB Smart Chain to your Perps balance.
      </Text>
      {loadError ? <Text style={[styles.err, { color: theme.fail }]}>{loadError}</Text> : null}
      <Row theme={theme} label="Wallet USDT" value={wallet ? formatNumber(wallet.usdt, 2) : "…"} />
      <Row theme={theme} label="Wallet BNB (gas)" value={wallet ? formatNumber(wallet.bnb, 5) : "…"} />
      <AmountInput
        theme={theme}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setReview(null);
        }}
        onMax={() => wallet && setAmount(toPlain(wallet.usdt))}
      />
      {inline ? <Text style={[styles.err, { color: theme.fail }]}>{inline}</Text> : null}

      {review && review.plan ? (
        <View style={styles.block}>
          <Row theme={theme} label="Steps" value={review.plan.needsApprove ? "Approve + Deposit" : "Deposit"} />
          <Row theme={theme} label="Est. network fee" value={`~${formatNumber(review.plan.gasCostBnb, 6)} BNB`} />
          <Row theme={theme} label="Gas price" value={`${formatNumber(review.plan.gasPriceGwei, 2)} gwei`} />
        </View>
      ) : null}
      {review && !review.ok ? <Text style={[styles.err, { color: theme.fail }]}>{review.error}</Text> : null}
      {step ? <Text style={[styles.note, { color: theme.headingTx }]}>{STEP_TEXT[step]}</Text> : null}
      {result ? (
        <Text style={[styles.note, { color: result.ok ? theme.success : theme.fail }]}>{result.text}</Text>
      ) : null}

      {result && result.ok ? (
        <PrimaryButton theme={theme} label="Done" onPress={onClose} />
      ) : review && review.ok ? (
        <PrimaryButton theme={theme} label={`Confirm deposit of ${review.plan.amount} USDT`} onPress={doDeposit} busy={busy} />
      ) : (
        <PrimaryButton
          theme={theme}
          label="Review"
          onPress={doReview}
          busy={reviewing}
          disabled={!amount || !!inline || !wallet}
        />
      )}
    </Sheet>
  );
};

// ------------------------------------------------------------------ Withdraw
const TRACK_EVERY_MS = 10000;
const TRACK_FOR_MS = 15 * 60 * 1000;
const WITHDRAW_STEP_TEXT = {
  checking: "Checking the fee…",
  signing: "Signing with your wallet and sending to Aster…",
  sending: "Sending the withdrawal to Aster…",
};

// Withdrawable perps USDT -> the user's OWN wallet on BSC. The main wallet signs Aster's EIP-712
// withdraw Action (Aster-only native method, PIN/biometric gate); the request is sent with the
// agent's v3 signature. Receiver is always the user's own address.
export const WithdrawSheet = ({ visible, onClose, theme, agent, user, available, onWithdrawn }) => {
  const signingSupported = isAsterWithdrawSigningAvailable();
  const [info, setInfo] = useState(null);
  const [infoNote, setInfoNote] = useState(null);
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false); // review screen before PIN
  const [step, setStep] = useState(null); // checking | signing | sending
  const [result, setResult] = useState(null); // { ok, text }
  const [tracking, setTracking] = useState(null); // { amount, receive, startUsdt, since, status, txHash, arrived }
  const trackRef = useRef(null);

  const stopTracking = () => {
    if (trackRef.current) clearInterval(trackRef.current);
    trackRef.current = null;
  };

  useEffect(() => {
    if (!visible || !agent || !user) return undefined;
    setAmount("");
    setResult(null);
    setReviewing(false);
    setStep(null);
    setTracking(null);
    setInfo(null);
    setInfoNote(null);
    fetchWithdrawInfo(agent, user).then((r) => {
      setInfo(r.data);
      if (r.error && r.data) setInfoNote("Using Aster's estimated fee.");
      else if (r.error) setInfoNote(friendlyAsterError(r));
    });
    return stopTracking;
  }, [visible, agent, user]);

  const fee = info && info.fee !== undefined && info.fee !== null ? info.fee : null;
  // Withdrawable = Aster's per-chain max (excludes margin locked by open positions), capped by
  // the account's available balance.
  const maxAllowed =
    info && info.maxAmount !== null && info.maxAmount !== undefined && available !== null
      ? dMin(info.maxAmount, available)
      : info && info.maxAmount !== null && info.maxAmount !== undefined
      ? info.maxAmount
      : available;
  const receive = fee !== null && isPositive(amount) && gt(amount, fee) ? sub(amount, fee) : null;

  let inline = null;
  if (amount && !isPositive(amount)) inline = "Enter an amount";
  else if (amount && (maxAllowed === null || gt(amount, maxAllowed))) inline = "More than you can withdraw right now";
  else if (amount && fee !== null && lte(amount, fee)) inline = "Amount must be more than the fee";

  const startTracking = (t) => {
    stopTracking();
    const poll = async () => {
      if (Date.now() - t.since > TRACK_FOR_MS) {
        stopTracking();
        return;
      }
      const [wallet, hist] = await Promise.all([
        getDepositWalletState(user).catch(() => null),
        fetchWithdrawHistory(agent, user),
      ]);
      const row =
        hist.data &&
        hist.data.find((r) => Number(r.time) >= t.since - 120000 && lte(r.amount, t.amount) && lte(t.amount, r.amount));
      // Arrived when the wallet's USDT grew by at least the expected amount (0.1% tolerance).
      const arrived =
        !!wallet && t.startUsdt !== null && !gt(mul(t.receive, "0.999"), sub(wallet.usdt, t.startUsdt));
      setTracking((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          status: row ? row.state : prev.status,
          txHash: (row && row.txHash) || prev.txHash,
          arrived: prev.arrived || arrived,
          walletUsdt: wallet ? wallet.usdt : prev.walletUsdt,
        };
        if (next.arrived || next.status === "FAILED") stopTracking();
        return next;
      });
    };
    poll();
    trackRef.current = setInterval(poll, TRACK_EVERY_MS);
  };

  const doWithdraw = async () => {
    setResult(null);
    try {
      // Fee can change: re-read it right before signing and stop if it moved.
      setStep("checking");
      const fresh = await fetchWithdrawInfo(agent, user);
      const freshFee = fresh.data && fresh.data.fee;
      if (freshFee === null || freshFee === undefined) {
        setStep(null);
        setResult({ ok: false, text: friendlyAsterError(fresh) || "Couldn't get the withdrawal fee. Try again." });
        return;
      }
      if (!(lte(freshFee, fee) && lte(fee, freshFee))) {
        setInfo(fresh.data);
        setStep(null);
        setReviewing(false);
        setResult({ ok: false, text: `The network fee changed to ${freshFee} USDT. Please check and confirm again.` });
        return;
      }
      const before = await getDepositWalletState(user).catch(() => null);
      setStep("signing");
      // Signed entirely by the main wallet (one PIN/biometric prompt); then sent to Aster.
      const res = await withdrawWithMainWallet(user, amount, fee);
      setStep(null);
      if (res.error) {
        // Show Aster's own code + message (no agent involved, so no "trading key" wording).
        const code = res.code !== null && res.code !== undefined ? ` (${res.code})` : "";
        setResult({ ok: false, text: `Aster didn't accept the withdrawal: ${res.error}${code}` });
        return;
      }
      setResult({ ok: true, text: "Withdrawal requested." });
      const t = {
        amount,
        receive: sub(amount, fee),
        startUsdt: before ? before.usdt : null,
        since: Date.now(),
        status: "PROCESSING",
        txHash: null,
        arrived: false,
      };
      setTracking(t);
      startTracking(t);
      if (onWithdrawn) onWithdrawn();
    } catch (e) {
      setStep(null);
      setResult({ ok: false, text: e && e.message ? e.message : "Withdrawal failed" });
    }
  };

  const busy = !!step;
  const trackingText = tracking
    ? tracking.arrived
      ? `Arrived: ${tracking.receive} USDT is in your wallet.`
      : tracking.status === "FAILED"
      ? "Aster reports the withdrawal failed. Your balance stays in Perps."
      : tracking.status === "SUCCESS"
      ? "Sent by Aster · waiting for it to show in your wallet…"
      : "Processing · usually a few minutes…"
    : null;

  return (
    <Sheet visible={visible} onClose={onClose} busy={busy} theme={theme} title="Withdraw USDT">
      <Text style={[styles.note, { color: theme.inactiveTx }]}>
        From your Perps balance to your own wallet on BNB Smart Chain.
      </Text>
      <Row theme={theme} label="Withdrawable" value={maxAllowed !== null ? `${formatNumber(maxAllowed, 2)} USDT` : "…"} />
      {!reviewing && !tracking ? (
        <>
          <AmountInput
            theme={theme}
            value={amount}
            onChange={setAmount}
            onMax={() => maxAllowed !== null && setAmount(floorToStep(toPlain(maxAllowed), "0.01"))}
          />
          {inline ? <Text style={[styles.err, { color: theme.fail }]}>{inline}</Text> : null}
        </>
      ) : (
        <Row theme={theme} label="Amount" value={`${amount} USDT`} />
      )}
      <Row theme={theme} label="Network fee" value={fee !== null ? `${fee} USDT` : "…"} />
      <Row theme={theme} label="You receive" value={receive !== null ? `${receive} USDT` : "—"} />
      <Row theme={theme} label="Network · token" value="BNB Smart Chain · USDT" />
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>To (your wallet)</Text>
      </View>
      <Text selectable style={[styles.address, { color: theme.headingTx }]}>{user}</Text>
      {infoNote ? <Text style={[styles.note, { color: theme.inactiveTx }]}>{infoNote}</Text> : null}
      {step ? <Text style={[styles.note, { color: theme.headingTx }]}>{WITHDRAW_STEP_TEXT[step]}</Text> : null}
      {result ? (
        <Text style={[styles.note, { color: result.ok ? theme.success : theme.fail }]}>{result.text}</Text>
      ) : null}
      {trackingText ? (
        <Text style={[styles.note, { color: tracking.arrived ? theme.success : theme.headingTx }]}>
          {trackingText}
          {tracking.txHash ? `\nTx ${short(tracking.txHash)}` : ""}
        </Text>
      ) : null}
      {!signingSupported ? (
        <Text style={[styles.note, { color: theme.warn }]}>
          Withdrawals need the latest app version.
        </Text>
      ) : null}

      {tracking ? (
        <PrimaryButton theme={theme} label="Done" onPress={onClose} />
      ) : reviewing ? (
        <>
          <PrimaryButton
            theme={theme}
            label={`Confirm withdrawal of ${amount} USDT`}
            onPress={doWithdraw}
            busy={busy}
          />
          <TouchableOpacity disabled={busy} onPress={() => setReviewing(false)} style={styles.secondary}>
            <Text style={[styles.secondaryTxt, { color: theme.inactiveTx }]}>Back</Text>
          </TouchableOpacity>
        </>
      ) : (
        <PrimaryButton
          theme={theme}
          label={signingSupported ? "Review" : "Withdraw coming soon"}
          onPress={() => {
            setResult(null);
            setReviewing(true);
          }}
          disabled={!signingSupported || !amount || !!inline || fee === null}
        />
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  note: { fontSize: 13, marginVertical: 6, lineHeight: 18 },
  err: { fontSize: 13, marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600" },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, height: 50, marginTop: 10 },
  input: { flex: 1, fontSize: 18, fontWeight: "600", paddingVertical: 0 },
  suffix: { fontSize: 14, marginLeft: 6 },
  maxBtn: { marginLeft: 10, paddingVertical: 6, paddingHorizontal: 4 },
  maxTxt: { fontSize: 14, fontWeight: "700" },
  block: { marginTop: 10 },
  primary: { marginTop: 16, alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 14, minHeight: 50 },
  primaryTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  address: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  secondary: { alignItems: "center", paddingVertical: 12 },
  secondaryTxt: { fontSize: 15, fontWeight: "600" },
});
