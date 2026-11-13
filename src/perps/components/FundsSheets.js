import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import Modal from "react-native-modal";
import {
  getChainWalletBalances,
  prepareChainDeposit,
  fetchWithdrawOptions,
  estimateWithdrawFee,
} from "../api/asterFunds";
import {
  PERPS_CHAINS,
  chainById,
  getAssetLists,
  depositAssetsFor,
  withdrawChainsFor,
  collateralRatio,
  displayName,
  SINGLE_ASSET_MARGIN,
} from "../api/asterAssets";
import { isAsterWithdrawSigningAvailable } from "../api/asterWithdrawSigner";
import WithdrawStatusCard from "./WithdrawStatusCard";
import DepositStatusCard from "./DepositStatusCard";
import CoinLogo from "./CoinLogo";
import {
  useDepositTracker,
  startDeposit,
  clearDeposit,
  continueDeposit,
  cancelInterruptedDeposit,
  isDepositFinished,
  isDepositSending,
} from "../storage/depositTracker";
import { useWithdrawTracker, startWithdraw, clearWithdraw, isWithdrawFinished } from "../storage/withdrawTracker";
import { gt, isPositive, sub, min as dMin, lte, toPlain, floorToStep, cleanAmountInput, decimalsOf } from "../utils/decimal";
import { formatNumber, formatAmount } from "../utils/format";
import { friendlyAsterError } from "../utils/asterErrors";


const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const pct = (r) => `${Math.round(r * 1000) / 10}%`;

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
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false} style={styles.sheetScroll}>
        {children}
      </ScrollView>
    </View>
  </Modal>
);

const Row = ({ label, value, theme, color }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>{label}</Text>
    <Text style={[styles.rowValue, { color: color || theme.headingTx }]}>{value}</Text>
  </View>
);

const AmountInput = ({ theme, value, onChange, onMax, suffix = "USDT", maxBusy }) => (
  <View style={[styles.field, { backgroundColor: theme.cardBg }]}>
    <TextInput
      value={value}
      onChangeText={(t) => onChange(cleanAmountInput(t))}
      placeholder="0.00"
      placeholderTextColor={theme.inactiveTx}
      keyboardType="decimal-pad"
      style={[styles.input, { color: theme.headingTx }]}
    />
    <Text style={[styles.suffix, { color: theme.inactiveTx }]}>{suffix}</Text>
    <TouchableOpacity onPress={onMax} style={styles.maxBtn} disabled={maxBusy}>
      {maxBusy ? (
        <ActivityIndicator size="small" color={theme.buttonColor} />
      ) : (
        <Text style={[styles.maxTxt, { color: theme.buttonColor }]}>Max</Text>
      )}
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

const Chip = ({ theme, label, active, onPress, disabled, left }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ selected: !!active, disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.chip,
      { backgroundColor: active ? theme.buttonColor : theme.cardBg, opacity: disabled ? 0.45 : 1 },
    ]}
  >
    {left}
    <Text style={[styles.chipTxt, { color: active ? "#FFFFFF" : theme.headingTx }]}>{label}</Text>
  </TouchableOpacity>
);

const Label = ({ theme, children }) => <Text style={[styles.label, { color: theme.inactiveTx }]}>{children}</Text>;

// ------------------------------------------------------------------ Deposit
const ESTIMATE_DEBOUNCE_MS = 600;

// Any supported chain + asset -> Perps. The deposit runs in storage/depositTracker, so it keeps
// going (and is tracked) when this sheet closes; the sheet shows the form or the timeline.
// multiAssets: account mode (true / false / null unknown). In Single-Asset mode only USDT/USD1
// are offered (they are the only margin there); onEnableMultiAssets asks the user to switch.
export const DepositSheet = ({ visible, onClose, theme, user, perpsBalance, multiAssets, onEnableMultiAssets }) => {
  const { record } = useDepositTracker();
  const [lists, setLists] = useState(null);
  const [chainId, setChainId] = useState(56);
  const [assetName, setAssetName] = useState("USDT");
  const [balances, setBalances] = useState(null); // { native, assets: { NAME: { value } } }
  const [amount, setAmount] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [maxBusy, setMaxBusy] = useState(false);
  const [retryTick, setRetryTick] = useState(0); // re-run the estimate after a connection error
  const [contErr, setContErr] = useState(null);
  const [continuing, setContinuing] = useState(false);
  const estSeq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const chain = chainById(chainId);
  const showTimeline = !!record && (!user || record.user.toLowerCase() === user.toLowerCase());
  const singleAsset = multiAssets === false;

  useEffect(() => {
    if (!visible || !user) return;
    setAmount("");
    setEstimate(null);
    setReviewing(false);
    setStarting(false);
    setLoadError(null);
    setContErr(null);
    getAssetLists()
      .then((l) => mounted.current && setLists(l))
      .catch(() => mounted.current && setLoadError("Couldn't load Aster's deposit list. Check your connection."));
  }, [visible, user]);

  const allAssets = useMemo(() => (lists ? depositAssetsFor(lists, chainId) : []), [lists, chainId]);
  const assets = singleAsset ? allAssets.filter((a) => SINGLE_ASSET_MARGIN.includes(a.name)) : allAssets;
  const hiddenCount = allAssets.length - assets.length;
  const asset = assets.find((a) => a.name === assetName) || assets[0] || null;

  // Wallet balances for this chain's assets.
  useEffect(() => {
    if (!visible || !user || !lists || allAssets.length === 0) return undefined;
    let cancelled = false;
    setBalances(null);
    getChainWalletBalances(chain, user, allAssets)
      .then((b) => !cancelled && mounted.current && setBalances(b))
      .catch(() => !cancelled && mounted.current && setLoadError(`Couldn't load your ${chain.name} balances. Check your connection.`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user, lists, chainId]);

  // Pick the first asset with a balance when the chain changes.
  useEffect(() => {
    if (!balances || assets.length === 0) return;
    const cur = assets.find((a) => a.name === assetName);
    if (cur && gt(balances.assets[cur.name] ? balances.assets[cur.name].value : "0", "0")) return;
    const firstWithBal = assets.find((a) => balances.assets[a.name] && gt(balances.assets[a.name].value, "0"));
    if (firstWithBal) setAssetName(firstWithBal.name);
    else if (!cur) setAssetName(assets[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances, chainId, singleAsset]);

  const bal = asset && balances && balances.assets[asset.name] ? balances.assets[asset.name].value : null;
  let inline = null;
  if (amount && !isPositive(amount)) inline = "Enter an amount";
  else if (amount && asset && isPositive(asset.minDeposit) && gt(asset.minDeposit, amount))
    inline = `Minimum deposit is ${asset.minDeposit} ${displayName(asset.name)}`;
  else if (amount && asset && decimalsOf(amount) > asset.decimals)
    inline = `${displayName(asset.name)} allows at most ${asset.decimals} decimals`;
  else if (amount && bal !== null && gt(amount, bal)) inline = `More than your wallet has (${formatAmount(bal, 6)})`;
  const noGas = !!balances && !isPositive(balances.native);

  useEffect(() => {
    if (!visible || !user || !asset || !balances || !amount || inline) {
      setEstimate(null);
      setEstimating(false);
      return undefined;
    }
    const seq = ++estSeq.current;
    setEstimating(true);
    const id = setTimeout(() => {
      prepareChainDeposit({ chain, asset, user, amount })
        .catch(() => ({ ok: false, error: "Couldn't estimate the network fee. Check your connection." }))
        .then((res) => {
          if (seq !== estSeq.current || !mounted.current) return;
          setEstimate(res);
          setEstimating(false);
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user, asset && asset.name, chainId, balances, amount, inline, retryTick]);

  const onMax = async () => {
    if (!asset || bal === null) return;
    if (!asset.isNative) {
      setAmount(floorToStep(toPlain(bal), asset.decimals >= 6 ? "0.000001" : "0.01"));
      return;
    }
    // Native coin: keep enough for the network fee.
    setMaxBusy(true);
    const res = await prepareChainDeposit({ chain, asset, user, amount: "0.000001" }).catch(() => null);
    if (!mounted.current) return;
    setMaxBusy(false);
    if (res && res.plan && res.plan.nativeMax !== null) setAmount(floorToStep(res.plan.nativeMax, "0.000001"));
  };

  const plan = estimate && estimate.plan;
  const doConfirm = async () => {
    if (!estimate || !estimate.ok || starting || isDepositSending()) return; // double-tap guard
    setStarting(true);
    const fresh = await prepareChainDeposit({ chain, asset, user, amount }).catch(() => null);
    if (!mounted.current) return;
    setStarting(false);
    if (!fresh || !fresh.ok) {
      setReviewing(false);
      setEstimate(fresh || { ok: false, error: "Couldn't check the deposit. Check your connection." });
      return;
    }
    startDeposit({ user, plan: fresh.plan, baseline: asset.name === "USDT" ? perpsBalance : null });
  };

  const doContinue = async () => {
    setContErr(null);
    setContinuing(true);
    const res = await continueDeposit();
    if (!mounted.current) return;
    setContinuing(false);
    if (!res.ok && res.error) setContErr(res.error);
  };

  const close = () => {
    if (isDepositFinished(record)) clearDeposit();
    onClose();
  };

  if (showTimeline) {
    const paused = !!record.interrupted;
    return (
      <Sheet visible={visible} onClose={close} busy={false} theme={theme} title="Deposit">
        <DepositStatusCard theme={theme} record={record} />
        {paused ? (
          <>
            {contErr ? <Text style={[styles.err, { color: theme.fail }]}>{contErr}</Text> : null}
            <PrimaryButton theme={theme} label="Continue deposit" onPress={doContinue} busy={continuing} />
            <TouchableOpacity disabled={continuing} onPress={cancelInterruptedDeposit} style={styles.secondary}>
              <Text style={[styles.secondaryTxt, { color: theme.inactiveTx }]}>Cancel deposit</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {!isDepositFinished(record) ? (
              <Text style={[styles.note, { color: theme.inactiveTx }]}>
                You can close this. Progress stays on the Perps screen.
              </Text>
            ) : null}
            <PrimaryButton theme={theme} label={isDepositFinished(record) ? "Done" : "Close"} onPress={close} />
          </>
        )}
      </Sheet>
    );
  }

  const ratio = asset ? collateralRatio(lists, asset.name) : null;
  const nat = chain.native;
  const stepsText = plan ? (plan.needsApprove ? `${plan.approves.length + 1} steps · approve + deposit` : "1 step · deposit") : "—";
  return (
    <Sheet visible={visible} onClose={close} busy={starting} theme={theme} title="Deposit">
      <Text style={[styles.note, { color: theme.inactiveTx }]}>
        From your wallet {short(user)} to your Perps balance.
      </Text>
      {loadError ? <Text style={[styles.err, { color: theme.fail }]}>{loadError}</Text> : null}

      {!reviewing ? (
        <>
          <Label theme={theme}>Network</Label>
          <View style={styles.chips}>
            {PERPS_CHAINS.map((c) => (
              <Chip
                key={c.chainId}
                theme={theme}
                label={c.name}
                active={c.chainId === chainId}
                onPress={() => {
                  setChainId(c.chainId);
                  setAmount("");
                }}
              />
            ))}
          </View>
          <Label theme={theme}>Asset</Label>
          {!lists ? (
            <ActivityIndicator style={styles.pad} color={theme.buttonColor} />
          ) : (
            <View>
              {assets.map((a) => {
                const v = balances && balances.assets[a.name] ? balances.assets[a.name].value : null;
                const zero = v !== null && !gt(v, "0");
                const r = collateralRatio(lists, a.name);
                const active = asset && a.name === asset.name;
                return (
                  <TouchableOpacity
                    key={a.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!active, disabled: zero }}
                    disabled={zero}
                    onPress={() => {
                      setAssetName(a.name);
                      setAmount("");
                    }}
                    style={[
                      styles.assetRow,
                      { backgroundColor: theme.cardBg, borderColor: active ? theme.buttonColor : theme.cardBg, opacity: zero ? 0.45 : 1 },
                    ]}
                  >
                    <CoinLogo asset={a.name === "USDCE" ? "USDC" : a.name} size={28} theme={theme} />
                    <View style={styles.assetMid}>
                      <Text style={[styles.assetName, { color: theme.headingTx }]}>{displayName(a.name)}</Text>
                      <Text style={[styles.assetSub, { color: theme.inactiveTx }]}>
                        {a.isNative ? "Native coin" : r !== null && r < 0.995 ? `Counts as ${pct(r)} margin` : "Stablecoin"}
                      </Text>
                    </View>
                    <Text style={[styles.assetBal, { color: theme.headingTx }]}>{v === null ? "…" : formatAmount(v, 6)}</Text>
                  </TouchableOpacity>
                );
              })}
              {singleAsset && hiddenCount > 0 ? (
                <View style={styles.modeNote}>
                  <Text style={[styles.note, { color: theme.inactiveTx }]}>
                    Your account uses Single-Asset mode, so only USDT and USD1 count as margin.
                    {` ${hiddenCount} more asset${hiddenCount > 1 ? "s" : ""} (${chain.native}, USDC…) need Multi-Assets mode.`}
                  </Text>
                  {onEnableMultiAssets ? (
                    <TouchableOpacity accessibilityRole="button" onPress={onEnableMultiAssets}>
                      <Text style={[styles.link, { color: theme.buttonColor }]}>Turn on Multi-Assets mode</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
          <AmountInput
            theme={theme}
            value={amount}
            onChange={setAmount}
            onMax={onMax}
            maxBusy={maxBusy}
            suffix={asset ? displayName(asset.name) : ""}
          />
          {inline ? <Text style={[styles.err, { color: theme.fail }]}>{inline}</Text> : null}
        </>
      ) : (
        <>
          <Row theme={theme} label="Network" value={chain.name} />
          <Row theme={theme} label="Amount" value={`${amount} ${displayName(asset.name)}`} />
        </>
      )}

      <Row
        theme={theme}
        label="You receive in Perps"
        value={amount && !inline && asset ? `${amount} ${displayName(asset.name)}` : "—"}
      />
      {asset && ratio !== null && ratio < 0.995 ? (
        <Row theme={theme} label="Counts as margin" value={`${pct(ratio)} of its value`} />
      ) : null}
      <Row theme={theme} label="Steps" value={estimating ? "…" : stepsText} />
      <Row
        theme={theme}
        label={`Est. network fee (${nat})`}
        value={estimating ? "…" : plan ? `~${formatAmount(plan.gasCost, 8)} ${nat}` : "—"}
        color={estimate && estimate.lowGas ? theme.fail : undefined}
      />
      <Row theme={theme} label={`Wallet ${nat}`} value={balances ? `${formatAmount(balances.native, 6)} ${nat}` : "…"} />
      {chain.gasNote ? <Text style={[styles.note, { color: theme.warn }]}>{chain.gasNote}</Text> : null}
      {noGas ? (
        <Text style={[styles.err, { color: theme.fail }]}>
          You have no {nat} on {chain.name}. Add a little {nat} to pay the network fee.
        </Text>
      ) : null}
      {estimate && !estimate.ok && !inline ? (
        <>
          <Text style={[styles.err, { color: theme.fail }]}>{estimate.error}</Text>
          {/connection/i.test(estimate.error || "") ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => setRetryTick((n) => n + 1)}>
              <Text style={[styles.link, { color: theme.buttonColor }]}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {reviewing ? (
        <>
          <PrimaryButton
            theme={theme}
            label={`Confirm deposit of ${amount} ${displayName(asset.name)}`}
            onPress={doConfirm}
            busy={starting}
            disabled={!estimate || !estimate.ok}
          />
          <TouchableOpacity disabled={starting} onPress={() => setReviewing(false)} style={styles.secondary}>
            <Text style={[styles.secondaryTxt, { color: theme.inactiveTx }]}>Back</Text>
          </TouchableOpacity>
        </>
      ) : (
        <PrimaryButton
          theme={theme}
          label="Review"
          onPress={() => setReviewing(true)}
          disabled={!asset || !amount || !!inline || !balances || noGas || estimating || !estimate || !estimate.ok}
        />
      )}
    </Sheet>
  );
};

// ------------------------------------------------------------------ Withdraw
const WITHDRAW_STEP_TEXT = {
  sending: "Signing with your wallet and sending to Aster…",
};

// Any asset held in Perps -> the user's OWN wallet, on a chain Aster supports for that asset.
// Signed entirely by the main wallet (Aster-only native method, one PIN/biometric prompt).
// The request runs in storage/withdrawTracker (survives closing the sheet / relaunch).
export const WithdrawSheet = ({ visible, onClose, theme, agent, user, available }) => {
  const signingSupported = isAsterWithdrawSigningAvailable();
  const { record } = useWithdrawTracker();
  const [options, setOptions] = useState(null); // [{ asset, total, chains: [{ chainId, max, fee }] }]
  const [lists, setLists] = useState(null);
  const [infoNote, setInfoNote] = useState(null);
  const [assetName, setAssetName] = useState("USDT");
  const [chainId, setChainId] = useState(56);
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const showTimeline = !!record && (!user || record.user.toLowerCase() === user.toLowerCase()) && !(record.failed && record.failed.nothingSent);

  const loadOptions = () => {
    setOptions(null);
    setInfoNote(null);
    fetchWithdrawOptions(agent, user).then((r) => {
      if (!mounted.current) return;
      if (r.error) {
        setInfoNote(friendlyAsterError(r));
        setOptions([]);
        return;
      }
      setOptions(r.data);
    });
  };

  useEffect(() => {
    if (!visible || !agent || !user) return;
    setAmount("");
    setReviewing(false);
    setSending(false);
    setError(null);
    if (record && record.failed && record.failed.nothingSent) clearWithdraw();
    loadOptions();
    getAssetLists()
      .then((l) => mounted.current && setLists(l))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, agent, user]);

  const assetOpts = (options || []).filter((o) => o.asset === "USDT" || o.chains.some((c) => gt(c.max, "0")));
  const opt = assetOpts.find((o) => o.asset === assetName) || assetOpts[0] || null;
  const wChains = opt && lists ? withdrawChainsFor(lists, opt.asset) : null; // null = unknown
  const supported = wChains ? wChains.map((c) => c.chainId) : null;
  const chainOrder = (id) => PERPS_CHAINS.findIndex((c) => c.chainId === id);
  const chainOpts = opt
    ? opt.chains.filter((c) => !supported || supported.includes(c.chainId)).sort((a, b) => chainOrder(a.chainId) - chainOrder(b.chainId))
    : [];
  const ch = chainOpts.find((c) => c.chainId === chainId) || chainOpts.find((c) => c.chainId === 56) || chainOpts[0] || null;
  const chain = ch ? chainById(ch.chainId) : chainById(56);
  const fee = ch ? ch.fee : null;
  // USDT: also capped by the account's available balance (margin in use can't leave).
  const maxAllowed = ch ? (opt.asset === "USDT" && available !== null && available !== undefined ? dMin(ch.max, available) : ch.max) : null;
  const receive = fee !== null && isPositive(amount) && gt(amount, fee) ? sub(amount, fee) : null;
  const tok = opt ? displayName(opt.asset) : "USDT";

  let inline = null;
  if (amount && !isPositive(amount)) inline = "Enter an amount";
  else if (amount && (maxAllowed === null || gt(amount, maxAllowed)))
    inline = ch && lte(ch.max, "0.000001") ? `${chain.name} has no ${tok} available for withdrawal right now` : "More than you can withdraw on this network right now";
  else if (amount && fee !== null && lte(amount, fee)) inline = "Amount must be more than the fee";

  const doWithdraw = async () => {
    if (sending) return; // double-tap guard
    setError(null);
    setSending(true);
    // Fee can change: re-read it right before signing and stop if it moved.
    const fresh = await fetchWithdrawOptions(agent, user);
    const freshCh = fresh.data && fresh.data.find((o) => o.asset === opt.asset);
    const freshFee = freshCh && (freshCh.chains.find((c) => c.chainId === ch.chainId) || {}).fee;
    let useFee = freshFee;
    if (useFee === undefined || useFee === null) useFee = await estimateWithdrawFee(opt.asset, ch.chainId);
    if (!mounted.current) return;
    if (useFee === null || useFee === undefined) {
      setSending(false);
      setError(friendlyAsterError(fresh) || "Couldn't get the withdrawal fee. Try again.");
      return;
    }
    if (!(lte(useFee, fee) && lte(fee, useFee))) {
      setOptions(fresh.data || options);
      setSending(false);
      setReviewing(false);
      setError(`The network fee changed to ${useFee} ${tok}. Please check and confirm again.`);
      return;
    }
    const res = await startWithdraw({ user, asset: opt.asset, chainId: ch.chainId, amount, fee });
    if (!mounted.current) return;
    setSending(false);
    if (!res.ok) setError(res.error);
  };

  const close = () => {
    if (isWithdrawFinished(record)) clearWithdraw();
    onClose();
  };

  if (showTimeline) {
    const tracking = {
      ...record,
      requestedAt: record.requestedAt || record.startedAt,
      failed: record.failed || null,
    };
    return (
      <Sheet visible={visible} onClose={close} busy={false} theme={theme} title="Withdraw">
        {record.phase === "sending" && !record.failed ? (
          <Text style={[styles.note, { color: theme.headingTx }]}>
            {record.unsure ? "Couldn't reach Aster. Checking whether the request arrived…" : WITHDRAW_STEP_TEXT.sending}
          </Text>
        ) : null}
        <WithdrawStatusCard theme={theme} tracking={tracking} />
        {!isWithdrawFinished(record) ? (
          <Text style={[styles.note, { color: theme.inactiveTx }]}>You can close this. Progress stays on the Perps screen.</Text>
        ) : null}
        <PrimaryButton theme={theme} label={isWithdrawFinished(record) ? "Done" : "Close"} onPress={close} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} busy={sending} theme={theme} title="Withdraw">
      <Text style={[styles.note, { color: theme.inactiveTx }]}>From your Perps balance to your own wallet.</Text>
      {!reviewing ? (
        <>
          <Label theme={theme}>Asset</Label>
          {!options ? (
            <ActivityIndicator style={styles.pad} color={theme.buttonColor} />
          ) : (
            <View style={styles.chips}>
              {assetOpts.map((o) => (
                <Chip
                  key={o.asset}
                  theme={theme}
                  label={`${displayName(o.asset)} · ${formatAmount(o.total, 4)}`}
                  active={opt && o.asset === opt.asset}
                  onPress={() => {
                    setAssetName(o.asset);
                    setAmount("");
                  }}
                  left={<CoinLogo asset={o.asset} size={18} theme={theme} style={styles.chipLogo} />}
                />
              ))}
            </View>
          )}
          {opt ? (
            <>
              <Label theme={theme}>Network</Label>
              <View style={styles.chips}>
                {chainOpts.map((c) => (
                  <Chip
                    key={c.chainId}
                    theme={theme}
                    label={chainById(c.chainId).name}
                    active={ch && c.chainId === ch.chainId}
                    disabled={!gt(c.max, c.fee)}
                    onPress={() => {
                      setChainId(c.chainId);
                      setAmount("");
                    }}
                  />
                ))}
              </View>
              {chainOpts.some((c) => !gt(c.max, c.fee)) ? (
                <Text style={[styles.note, { color: theme.inactiveTx }]}>
                  Greyed-out networks don't have enough {tok} available on Aster right now.
                </Text>
              ) : null}
            </>
          ) : null}
          <Row theme={theme} label="Withdrawable" value={maxAllowed !== null ? `${formatAmount(maxAllowed, 6)} ${tok}` : "…"} />
          <AmountInput
            theme={theme}
            value={amount}
            onChange={setAmount}
            suffix={tok}
            onMax={() => maxAllowed !== null && setAmount(floorToStep(toPlain(maxAllowed), "0.000001"))}
          />
          {inline ? <Text style={[styles.err, { color: theme.fail }]}>{inline}</Text> : null}
        </>
      ) : (
        <Row theme={theme} label="Amount" value={`${amount} ${tok}`} />
      )}
      <Row theme={theme} label="Network fee" value={fee !== null ? `${fee} ${tok}` : "…"} />
      <Row theme={theme} label="You receive" value={receive !== null ? `${receive} ${tok}` : "—"} />
      <Row theme={theme} label="Network · token" value={`${chain.name} · ${tok}`} />
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: theme.inactiveTx }]}>To (your wallet)</Text>
      </View>
      <Text selectable style={[styles.address, { color: theme.headingTx }]}>{user}</Text>
      {infoNote ? <Text style={[styles.note, { color: theme.inactiveTx }]}>{infoNote}</Text> : null}
      {sending ? <Text style={[styles.note, { color: theme.headingTx }]}>{WITHDRAW_STEP_TEXT.sending}</Text> : null}
      {error ? <Text style={[styles.note, { color: theme.fail }]}>{error}</Text> : null}
      {record && record.failed && record.failed.nothingSent ? (
        <Text style={[styles.note, { color: theme.fail }]}>{record.failed.text}</Text>
      ) : null}
      {!signingSupported ? (
        <Text style={[styles.note, { color: theme.warn }]}>Withdrawals need the latest app version.</Text>
      ) : null}

      {reviewing ? (
        <>
          <PrimaryButton theme={theme} label={`Confirm withdrawal of ${amount} ${tok}`} onPress={doWithdraw} busy={sending} />
          <TouchableOpacity disabled={sending} onPress={() => setReviewing(false)} style={styles.secondary}>
            <Text style={[styles.secondaryTxt, { color: theme.inactiveTx }]}>Back</Text>
          </TouchableOpacity>
        </>
      ) : (
        <PrimaryButton
          theme={theme}
          label={signingSupported ? "Review" : "Withdraw coming soon"}
          onPress={() => {
            setError(null);
            if (record && record.failed) clearWithdraw();
            setReviewing(true);
          }}
          disabled={!signingSupported || !amount || !!inline || fee === null || !ch}
        />
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  modal: { justifyContent: "flex-end", margin: 0 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, maxHeight: "92%" },
  sheetScroll: { flexGrow: 0 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  note: { fontSize: 13, marginVertical: 6, lineHeight: 18 },
  err: { fontSize: 13, marginTop: 6 },
  label: { fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 6, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, height: 50, marginTop: 10 },
  input: { flex: 1, fontSize: 18, fontWeight: "600", paddingVertical: 0 },
  suffix: { fontSize: 14, marginLeft: 6 },
  maxBtn: { marginLeft: 10, paddingVertical: 6, paddingHorizontal: 4, minWidth: 32, alignItems: "center" },
  maxTxt: { fontSize: 14, fontWeight: "700" },
  primary: { marginTop: 16, alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 14, minHeight: 50 },
  primaryTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  address: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  secondary: { alignItems: "center", paddingVertical: 12 },
  secondaryTxt: { fontSize: 15, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  chip: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
  chipTxt: { fontSize: 13, fontWeight: "600" },
  chipLogo: { marginRight: 6 },
  assetRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1.5 },
  assetMid: { flex: 1, marginLeft: 10 },
  assetName: { fontSize: 15, fontWeight: "700" },
  assetSub: { fontSize: 12, marginTop: 1 },
  assetBal: { fontSize: 14, fontWeight: "600" },
  modeNote: { marginTop: 2 },
  link: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  pad: { marginVertical: 12 },
});
