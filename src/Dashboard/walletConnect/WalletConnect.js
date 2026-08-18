import "@walletconnect/react-native-compat";
import "@ethersproject/shims";
import { Buffer } from "buffer";
global.Buffer = Buffer;

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Animated,
  PermissionsAndroid, Platform,
} from "react-native";
import Modal from "react-native-modal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from "react-native-vision-camera";
import { Core } from "@walletconnect/core";
import { Web3Wallet } from "@walletconnect/web3wallet";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import { useSelector } from "react-redux";
import Icon from "../../icon";
import { ethers } from "ethers";
import { WALLET_CONNECT_INFO, WALLET_CONNECT_PROJECT_ID } from "../constants";
import { CHAINS } from "../../utilities/TokenUtils";
import { nativeSign } from "../../utilities/NativeSign";
import CustomInfoProvider from "../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import DeviceInfo from "react-native-device-info";
import messaging from "@react-native-firebase/messaging";

// ─── WalletConnect capability declarations ────────────────────────────────────
const SUPPORTED_METHODS = [
  "eth_accounts", "eth_requestAccounts",
  "eth_sendTransaction", "eth_sendRawTransaction", "eth_signTransaction",
  "eth_sign", "personal_sign",
  "eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4",
  "wallet_switchEthereumChain", "wallet_addEthereumChain",
  "wallet_getPermissions", "wallet_requestPermissions", "wallet_watchAsset",
  "eth_chainId", "net_version", "net_listening",
  "eth_blockNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory",
  "eth_getBalance", "eth_getCode", "eth_getStorageAt",
  "eth_getTransactionCount", "eth_getTransactionByHash",
  "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_call", "eth_estimateGas", "eth_getLogs",
];

const SUPPORTED_EVENTS = ["accountsChanged", "chainChanged", "message", "connect", "disconnect"];

const SUPPORTED_CHAINS = Object.values(CHAINS)
  .filter((c) => c.eipId && !c.eipId.startsWith("stellar:") && !c.eipId.endsWith(":"))
  .map((c) => c.eipId);

const STELLAR_METHODS = ["stellar_signTransaction", "stellar_signAndSubmitXDR", "stellar_signXDR"];
const STELLAR_EVENTS = [];
const STELLAR_CHAINS = ["stellar:pubnet", "stellar:testnet"];

// Methods that require NO user approval — answered automatically.
const AUTO_RESPOND_METHODS = new Set([
  "eth_accounts", "eth_requestAccounts",
  "eth_chainId", "net_version", "net_listening",
  "eth_blockNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory",
  "eth_getBalance", "eth_getCode", "eth_getStorageAt",
  "eth_getTransactionCount", "eth_getTransactionByHash",
  "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_call", "eth_estimateGas", "eth_getLogs",
  "wallet_switchEthereumChain", "wallet_addEthereumChain",
  "wallet_getPermissions", "wallet_requestPermissions", "wallet_watchAsset",
]);

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  blue: "#2D7DD2", blueLight: "#4A9EF5", purple: "#7B61FF",
  green: "#22C55E", red: "#EF4444", orange: "#F59E0B",
  d_bg: "#0A0A0F", d_card: "#13131A", d_card2: "#1C1C28",
  d_border: "#2A2A3A", d_text: "#F0F0FF", d_sub: "#7A7A9A",
  l_bg: "#F4F4F9", l_card: "#FFFFFF", l_card2: "#F0F0F8",
  l_border: "#E0E0EE", l_text: "#0D0D1A", l_sub: "#6B6B8A",
};

// ─── Chain utilities ──────────────────────────────────────────────────────────
/** Map WalletConnect "eip155:1" → CHAINS entry. */
const getChainConfig = (wcChainId) =>
  Object.values(CHAINS).find((c) => c.eipId === wcChainId) ?? null;

/** Forward a read-only JSON-RPC call to the chain's own RPC endpoint. */
const forwardRpcCall = async (wcChainId, method, params = []) => {
  const config = getChainConfig(wcChainId);
  if (!config?.rpcUrl) throw { code: -32601, message: `No RPC for chain: ${wcChainId}` };
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw json.error;
  return json.result;
};

const isEthAddress = (v) =>
  typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

// ─── Component ────────────────────────────────────────────────────────────────
const WalletSyncComponent = ({ visible, onClose, isDark }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const web3Ref = useRef(null);

  const [web3wallet, setWeb3wallet] = useState(null);
  const [manualUri, setManualUri] = useState("");
  const [scanned, setScanned] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [transactionRequest, setTransactionRequest] = useState(null);
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [activeView, setActiveView] = useState("scanner");
  const [loading, setLoading] = useState(false);

  const device = useCameraDevice("back");
  const state = useSelector((s) => s);

  // Stable refs so async callbacks always see the latest values.
  const walletAddressRef = useRef(state?.wallet?.address);
  const stellarKeyRef = useRef(state?.STELLAR_PUBLICK_KEY);
  useEffect(() => {
    walletAddressRef.current = state?.wallet?.address;
    stellarKeyRef.current = state?.STELLAR_PUBLICK_KEY;
  }, [state?.wallet?.address, state?.STELLAR_PUBLICK_KEY]);

  const T = {
    bg: isDark ? C.d_bg : C.l_bg,
    card: isDark ? C.d_card : C.l_card,
    card2: isDark ? C.d_card2 : C.l_card2,
    border: isDark ? C.d_border : C.l_border,
    text: isDark ? C.d_text : C.l_text,
    sub: isDark ? C.d_sub : C.l_sub,
  };

  // ─── Pulse animation ────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Camera permission ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const ask = async () => {
      if (Platform.OS === "android") {
        const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (!ok) {
          const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          if (r !== PermissionsAndroid.RESULTS.GRANTED) {
            CustomInfoProvider.show("warning", "Permission Denied", "Camera permission required for scanning QR Code.");
          }
        }
      } else if (!hasPermission) {
        requestPermission();
      }
    };
    ask();
  }, [visible]);

  // ─── WalletConnect initialisation ───────────────────────────────────────────
  useEffect(() => {
    let web3Instance = null;
    const init = async () => {
      try {
        const core = new Core({ projectId: WALLET_CONNECT_PROJECT_ID });
        const web3 = await Web3Wallet.init({
          core,
          metadata: {
            name: WALLET_CONNECT_INFO.name,
            description: WALLET_CONNECT_INFO.description,
            url: WALLET_CONNECT_INFO.url,
            icons: WALLET_CONNECT_INFO.icons,
            redirect: WALLET_CONNECT_INFO.redirect,
            userDevice: {
              brand: await DeviceInfo.getBrand(),
              model: await DeviceInfo.getModel(),
              uniqueId: await DeviceInfo.getUniqueIdSync(),
              type: await DeviceInfo.getDeviceType(),
              macAddress: (await DeviceInfo.getMacAddress()) || "00000",
              fcmToken: await messaging().getToken(),
            },
          },
          storageOptions: { asyncStorage: AsyncStorage },
        });

        web3Instance = web3;
        web3Ref.current = web3;

        // Session proposal — user must approve
        web3.on("session_proposal", (p) => {
          handleClose();
          setTimeout(() => {
            setScanned(false);
            setTxModalVisible(false);
            setProposal(p);
            setSessionModalVisible(true);
          }, 1300);
        });

        // Session request — auto-respond or show approval modal
        web3.on("session_request", async (event) => {
          const method = event?.params?.request?.method;
          if (AUTO_RESPOND_METHODS.has(method)) {
            await autoRespondRequest(web3, event);
            return;
          }
          setTimeout(() => handleClose(), 1400);
          setTransactionRequest(event);
          setScanned(false);
          setSessionModalVisible(false);
          setTxModalVisible(true);
        });

        web3.on("session_delete", ({ topic }) => {
          setTimeout(() => handleClose(), 1300);
          setActiveSessions((prev) => prev.filter((s) => s.topic !== topic));
          CustomInfoProvider.show("info", "Session Ended", "The dApp disconnected the session.");
        });

        web3.on("session_expire", ({ topic }) => {
          setActiveSessions((prev) => prev.filter((s) => s.topic !== topic));
          CustomInfoProvider.show("error", "Session Expired", "The WalletConnect session timed out.");
        });

        setWeb3wallet(web3);
        loadActiveSessions(web3);
      } catch (err) {
        console.error("WC Init:", err);
      }
    };

    init();
    return () => {
      ["session_proposal", "session_request", "session_delete", "session_expire"]
        .forEach((e) => { try { web3Instance?.off(e); } catch (_) { } });
      web3Ref.current = null;
    };
  }, []);

  // ─── Auto-respond (no user tap needed) ─────────────────────────────────────
  const autoRespondRequest = async (web3Instance, event) => {
    const { topic, params, id } = event;
    const { request: rpc, chainId } = params;
    const method = rpc.method;

    const ok = async (result) =>
      web3Instance.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", result } });
    const err = async (code, message) =>
      web3Instance.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", error: { code, message } } });

    try {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return ok([walletAddressRef.current]);

        case "eth_chainId": {
          const cfg = getChainConfig(chainId);
          const num = chainId?.split(":")?.[1];
          return ok(cfg ? `0x${cfg.chainId.toString(16)}` : num ? `0x${parseInt(num).toString(16)}` : "0x1");
        }

        case "net_version": {
          const cfg = getChainConfig(chainId);
          const num = chainId?.split(":")?.[1];
          return ok(cfg ? String(cfg.chainId) : (num ?? "1"));
        }

        case "net_listening":
          return ok(true);

        case "wallet_switchEthereumChain": {
          const reqId = rpc.params?.[0]?.chainId;
          const known = Object.values(CHAINS).some((c) =>
            c.chainId && (`0x${c.chainId.toString(16)}` === reqId || c.chainId === parseInt(reqId, 16))
          );
          if (!known) return err(4902, "Unrecognised chain. Add it first with wallet_addEthereumChain.");
          return ok(null);
        }

        case "wallet_addEthereumChain":
        case "wallet_watchAsset":
          return ok(null);

        case "wallet_getPermissions":
        case "wallet_requestPermissions":
          return ok([{ parentCapability: "eth_accounts", date: Date.now() }]);

        default: {
          const result = await forwardRpcCall(chainId, method, rpc.params);
          return ok(result);
        }
      }
    } catch (e) {
      console.error(`autoRespond [${method}]:`, e);
      await err(e.code ?? -32603, e.message ?? "Internal error");
    }
  };

  // ─── Misc ───────────────────────────────────────────────────────────────────
  const loadActiveSessions = (w) => {
    try { setActiveSessions(Object.values(w.getActiveSessions())); }
    catch (e) { console.error("Sessions:", e); }
  };

  const handleClose = () => {
    setScanned(false);
    setManualUri("");
    setActiveView("scanner");
    onClose?.();
  };

  // ─── Transaction approval ─────────────────────────────────────────────────
  /**
   * All signing goes through nativeSign() — private key never touches JS.
   *
   * Flow for each method:
   *   eth_sendTransaction   → populate missing nonce/gas → nativeSign evm_tx → txHash
   *   eth_signTransaction   → populate → nativeSign evm_sign_only → signedTx
   *   eth_sendRawTransaction→ provider.sendTransaction (already signed) → txHash
   *   personal_sign         → nativeSign personal_msg → signature
   *   eth_sign              → nativeSign personal_msg → signature
   *   eth_signTypedData_v4  → nativeSign eip712 → signature
   *   stellar_sign*         → nativeSign stellar_xdr → signedXDR / hash
   */
  const approveTransaction = async () => {
    const req = transactionRequest;
    if (!req) return;

    const { topic, params, id } = req;
    const { request: rpc } = params;
    const method = rpc.method;
    const wcChainId = params.chainId;
    const walletAddress = walletAddressRef.current;

    const respondOk = async (result) =>
      web3Ref.current.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", result } });
    const respondErr = async (code, message) =>
      web3Ref.current.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", error: { code, message } } });

    try {
      setLoading(true);
      let result;

      // ── Stellar signing ─────────────────────────────────────────────────
      if (wcChainId?.startsWith("stellar:") || STELLAR_METHODS.includes(method)) {
        const normXDR = (p) => {
          if (typeof p === "string") return { txXdr: p };
          if (Array.isArray(p)) return { txXdr: p[0] };
          return { txXdr: p.xdr ?? p.transaction ?? p.envelope_xdr ?? p.signedXDR };
        };
        const { txXdr } = normXDR(rpc.params);
        if (!txXdr) throw new Error("Invalid Stellar XDR params");

        const network = wcChainId === "stellar:testnet" ? "testnet" : "public";

        if (method === "stellar_signAndSubmitXDR") {
          const signed = await nativeSign({
            type: "stellar_xdr",
            xdr: txXdr,
            submit: false,
            network,
          });


          const { Horizon, TransactionBuilder, Networks } = require("@stellar/stellar-sdk");
          const networkPass = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
          const horizonUrl = network === "testnet"
            ? "https://horizon-testnet.stellar.org"
            : "https://horizon.stellar.org";
          const server = new Horizon.Server(horizonUrl);
          const horizonResult = await server.submitTransaction(
            TransactionBuilder.fromXDR(signed.signedXDR, networkPass)
          );

          await respondOk({ hash: horizonResult.hash ?? signed.hash });
          setTxModalVisible(false);
          setTransactionRequest(null);
          setLoading(false);

          CustomInfoProvider.show("success", "Approved", "Transaction signed & submitted");
          return;
        }

        const signed = await nativeSign({
          type: "stellar_xdr",
          xdr: txXdr,
          submit: false,
          network,
        });
        result = { signedXDR: signed.signedXDR };

      } else {
        // ── EVM signing ─────────────────────────────────────────────────────
        const chainConfig = getChainConfig(wcChainId);
        if (!chainConfig) throw new Error(`Unsupported chain: ${wcChainId}`);

        const chainName = chainConfig.nativeChainKey;  // "eth", "bnb", "matic"…

        switch (method) {

          // ── Send / Sign transaction ───────────────────────────────────────
          case "eth_sendTransaction":
          case "eth_signTransaction": {
            const raw = { ...rpc.params[0] };

            // Normalise: gas → gasLimit, remove from
            if (raw.gas && !raw.gasLimit) { raw.gasLimit = raw.gas; }
            delete raw.gas;
            delete raw.from;

            // Populate missing fields using chain RPC (no private key involved)
            const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);

            if (raw.nonce === undefined || raw.nonce === null) {
              raw.nonce = await provider.getTransactionCount(walletAddress, "latest");
            }

            if (!raw.gasPrice && !raw.maxFeePerGas) {
              const feeData = await provider.getFeeData();
              if (feeData.maxFeePerGas) {
                raw.maxFeePerGas = feeData.maxFeePerGas;
                raw.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
              } else {
                raw.gasPrice = feeData.gasPrice;
              }
            }

            if (!raw.gasLimit) {
              try {
                raw.gasLimit = await provider.estimateGas({ ...raw, from: walletAddress });
              } catch (_) {
                raw.gasLimit = 300000; // conservative fallback
              }
            }

            raw.chainId = chainConfig.chainId;

            if (method === "eth_signTransaction") {
              const { signedTx } = await nativeSign({
                type: "evm_sign_only",
                chainConfig,
                walletAddress,
                tx: raw,
              });
              result = signedTx;
            } else {
              const { txHash } = await nativeSign({
                type: "evm_tx",
                chainConfig,
                walletAddress,
                tx: raw,
              });
              result = txHash;
            }
            break;
          }

          // ── Send pre-signed raw tx ────────────────────────────────────────
          case "eth_sendRawTransaction": {
            const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
            const txRes = await provider.sendTransaction(rpc.params[0]);
            result = txRes.hash;
            break;
          }

          // ── personal_sign ─────────────────────────────────────────────────
          // WalletConnect v2 spec: [message, address]
          // Some older dApps:      [address, message]
          case "personal_sign": {
            const message = (isEthAddress(rpc.params[0]) && !isEthAddress(rpc.params[1]))
              ? rpc.params[1]  // old: [address, message]
              : rpc.params[0]; // std: [message, address]

            const { signature } = await nativeSign({
              type: "personal_msg",
              chainName,
              walletAddress,
              message,
            });
            result = signature;
            break;
          }

          // ── eth_sign ──────────────────────────────────────────────────────
          // Spec: [address, message]
          case "eth_sign": {
            const { signature } = await nativeSign({
              type: "personal_msg",
              chainName,
              walletAddress,
              message: rpc.params[1],
            });
            result = signature;
            break;
          }

          // ── EIP-712 typed data ────────────────────────────────────────────
          case "eth_signTypedData":
          case "eth_signTypedData_v3":
          case "eth_signTypedData_v4": {
            const raw = rpc.params[1];
            const typedData = typeof raw === "string" ? JSON.parse(raw) : raw;

            const { signature } = await nativeSign({
              type: "eip712",
              chainName,
              walletAddress,
              typedData,
            });
            result = signature;
            break;
          }

          default:
            throw new Error(`Unhandled method: ${method}`);
        }
      }

      await respondOk(result);
      setTxModalVisible(false);
      setTransactionRequest(null);

      const isSign = method !== 'eth_sendTransaction' && method !== 'eth_sendRawTransaction' && !STELLAR_METHODS.includes(method);
      CustomInfoProvider.show(
        'success',
        'Approved',
        isSign ? 'Signed successfully' : `Transaction sent — ${result?.substring?.(0, 12) ?? ''}...`
      );

    } catch (err) {
      console.error("approveTransaction:", err);
      await respondErr(4001, err?.message || err?.toString() || 'Signing failed. Please try again.');
      setTxModalVisible(false);
      setTransactionRequest(null);
      CustomInfoProvider.show('error', '!Oops', 'Transaction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const rejectTransaction = async () => {
    const req = transactionRequest;
    if (!req) return;
    try {
      setLoading(true);
      await web3Ref.current.respondSessionRequest({
        topic: req.topic,
        response: { id: req.id, jsonrpc: "2.0", error: getSdkError("USER_REJECTED") },
      });
      CustomInfoProvider.show('info', 'Rejected', 'Transaction rejected.');
    } catch (e) { console.error(e); }
    finally {
      setTxModalVisible(false);
      setTransactionRequest(null);
      setLoading(false);
    }
  };

  // ─── Session approval ───────────────────────────────────────────────────────
  const approveSession = async () => {
    try {
      setLoading(true);
      const address = walletAddressRef.current;
      if (!address) throw new Error("No wallet address");

      const supportedNamespaces = {
        eip155: {
          chains: SUPPORTED_CHAINS,
          methods: SUPPORTED_METHODS,
          events: SUPPORTED_EVENTS,
          accounts: SUPPORTED_CHAINS.map((c) => `${c}:${address}`),
        },
      };

      const reqNs = {
        ...proposal.params.requiredNamespaces,
        ...proposal.params.optionalNamespaces,
      };

      if (reqNs.stellar && stellarKeyRef.current) {
        supportedNamespaces.stellar = {
          chains: STELLAR_CHAINS,
          methods: STELLAR_METHODS,
          events: STELLAR_EVENTS,
          accounts: STELLAR_CHAINS.map((c) => `${c}:${stellarKeyRef.current}`),
        };
      }

      const approvedNamespaces = buildApprovedNamespaces({
        proposal: proposal.params,
        supportedNamespaces,
      });

      await web3wallet.approveSession({ id: proposal.id, namespaces: approvedNamespaces });
      setSessionModalVisible(false);
      setScanned(true);
      loadActiveSessions(web3wallet);
    } catch (e) {
      console.error("Session approval failed:", e);
      try { await web3wallet.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") }); } catch (_) { }
      setSessionModalVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const rejectSession = async () => {
    try {
      setLoading(true);
      await web3wallet.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") });
      setSessionModalVisible(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const disconnectSession = async (topic) => {
    try {
      setLoading(true);
      await web3wallet.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") });
      loadActiveSessions(web3wallet);
      setScanned(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ─── QR / pairing ───────────────────────────────────────────────────────────
  const handlePairing = async (uri) => {
    try {
      setLoading(true);
      const trimmed = uri?.trim();
      if (!trimmed?.startsWith("wc:")) throw new Error("Invalid WalletConnect URI");
      await web3wallet.core.pairing.pair({ uri: trimmed });
    } catch (e) {
      console.error("Pairing:", e);
      CustomInfoProvider.show("error", "Pairing Failed", "Could not connect. Try scanning again.");
    } finally { setLoading(false); }
  };

  const onBarCodeRead = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: async (codes) => {
      for (const code of codes) {
        if (code.value?.startsWith("wc:")) await handlePairing(code.value);
      }
    },
  });

  const FUNCTION_SELECTORS = {
    '0x095ea7b3': 'Token Approval',
    '0xa9059cbb': 'Token Transfer',
    '0x23b872dd': 'Token Transfer From',
    '0x40c10f19': 'Token Mint',
    '0x7ff36ab5': 'Token Swap',
    '0x38ed1739': 'Token Swap',
    '0x5c11d795': 'Token Swap',
    '0x18cbafe5': 'Token Swap',
    '0x791ac947': 'Token Swap',
    '0xe8e33700': 'Add Liquidity',
    '0xbaa2abde': 'Remove Liquidity',
    '0x4e71d92d': 'Claim Rewards',
    '0x2e1a7d4d': 'Withdraw',
    '0xd0e30db0': 'Deposit',
    '0x3593564c': 'Uniswap Execute',
  };

  const getTxType = (p, rawMethod) => {
    if (rawMethod === 'eth_sendRawTransaction') return 'Send Raw Transaction';
    if (rawMethod === 'eth_signTransaction') return 'Sign Transaction (no broadcast)';
    const selector = p.data?.substring(0, 10)?.toLowerCase();
    if (selector && FUNCTION_SELECTORS[selector]) return FUNCTION_SELECTORS[selector];
    if (p.data && p.data !== '0x') return 'Contract Interaction';
    return 'Send Transaction';
  };

  const getNativeSymbol = (wcChainId) =>
    getChainConfig(wcChainId)?.nativeToken?.symbol ?? 'ETH';

  const getDisplayData = () => {
    if (!transactionRequest) return {};
    const { request, chainId } = transactionRequest.params;
    const m = request.method;

    if (chainId?.startsWith("stellar:") || STELLAR_METHODS.includes(m)) {
      return {
        type: m === "stellar_signAndSubmitXDR" ? "Sign & Submit" : "Sign Transaction",
        chain: `Stellar ${chainId === "stellar:testnet" ? "Testnet" : "Mainnet"}`,
        message: m === "stellar_signAndSubmitXDR"
          ? "Transaction will be signed and submitted to the Stellar network immediately."
          : "Transaction will be signed only. Submission is handled by the dApp.",
        isStellar: true,
        accentColor: C.purple,
      };
    }

    if (["eth_sendTransaction", "eth_sendRawTransaction", "eth_signTransaction"].includes(m)) {
      const p = request.params[0] ?? {};
      const nativeSymbol = getNativeSymbol(chainId);
      const valueWei = p.value ? parseInt(p.value, 16) : 0;
      const valueFormatted = (valueWei / 1e18).toFixed(6);
      const txType = getTxType(p, m);
      const isSignOnly = m === 'eth_signTransaction';

      return {
        type: txType,
        chain: chainIdToName(chainId),
        nativeSymbol,
        isEvmTx: true,
        isSignOnly,
        to: p.to ?? 'Contract Interaction',
        value: valueFormatted,
        showValue: valueWei > 0,
        data: p.data && p.data !== '0x' ? `${p.data.substring(0, 20)}…` : null,
        message: isSignOnly ? "Transaction will be signed only. It will NOT be broadcast automatically." : null,
        accentColor: C.orange,
      };
    }

    if (m === "personal_sign" || m === "eth_sign") {
      return {
        type: "Sign Message",
        chain: chainIdToName(chainId),
        message: "Verifies your wallet ownership. No transaction will be broadcast.",
        accentColor: C.blue,
      };
    }

    if (["eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4"].includes(m)) {
      let label = "Sign Typed Data", extra = null;
      try {
        const raw = request.params[1];
        const d = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (JSON.stringify(d).toLowerCase().includes("dydx")) {
          label = "Derive dYdX Wallet";
          extra = "dYdX Chain address derivation via EIP-712";
        } else if (d?.domain?.name) {
          extra = `Domain: ${d.domain.name}`;
        }
      } catch (_) { }
      return {
        type: label,
        extra,
        chain: chainIdToName(chainId),
        message: "EIP-712 structured signature. No transaction will be broadcast.",
        accentColor: C.blueLight,
      };
    }

    return { type: m, chain: chainIdToName(chainId), message: "Review carefully before approving.", accentColor: C.orange };
  };

  const chainIdToName = (id) => ({
    "eip155:1": "Ethereum Mainnet",
    "eip155:137": "Polygon",
    "eip155:42161": "Arbitrum",
    "eip155:10": "Optimism",
    "eip155:8453": "Base",
    "eip155:56": "BNB Chain",
    "eip155:43114": "Avalanche",
    "stellar:pubnet": "Stellar Mainnet",
    "stellar:testnet": "Stellar Testnet",
  }[id] ?? id ?? "Unknown Network");

  const short = (addr) =>
    addr ? `${addr.substring(0, 6)}···${addr.substring(addr.length - 4)}` : "—";

  // ─── Reusable sub-components ─────────────────────────────────────────────────
  const Chip = ({ label, color = C.blue }) => (
    <View style={[s.chip, { backgroundColor: color + "20", borderColor: color + "50" }]}>
      <Text style={[s.chipTxt, { color }]}>{label}</Text>
    </View>
  );

  const InfoRow = ({ label, value, mono, last }) => (
    <View style={[s.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border }]}>
      <Text style={[s.infoLbl, { color: T.sub }]}>{label}</Text>
      <Text style={[s.infoVal, { color: T.text }, mono && s.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );

  const SectionCard = ({ title, children }) => (
    <View style={[s.sectionCard, { backgroundColor: T.card2, borderColor: T.border }]}>
      {title && <Text style={[s.sectionTitle, { color: T.sub }]}>{title}</Text>}
      {children}
    </View>
  );

  // ─── Tab bar ─────────────────────────────────────────────────────────────────
  const renderTabBar = () => (
    <View style={[s.tabBar, { backgroundColor: T.card2, borderColor: T.border }]}>
      {["scanner", "sessions"].map((tab) => {
        const active = activeView === tab;
        return (
          <TouchableOpacity key={tab} style={[s.tab, active && { backgroundColor: C.blue }]} onPress={() => setActiveView(tab)}>
            <Icon type={"materialCommunity"} name={tab === "scanner" ? "qrcode-scan" : "connection"} size={14} color={active ? "#fff" : T.sub} />
            <Text style={[s.tabTxt, { color: active ? "#fff" : T.sub }]}>
              {tab === "scanner" ? "Connect" : `Sessions${activeSessions.length > 0 ? `  (${activeSessions.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ─── Scanner view ─────────────────────────────────────────────────────────────
  const renderScanner = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
      {!scanned ? (
        <>
          <View style={[s.camWrap, { borderColor: T.border }]}>
            <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive audio={false} codeScanner={onBarCodeRead} captureAudio={false} />
            <View style={s.cornerTL} /><View style={s.cornerTR} />
            <View style={s.cornerBL} /><View style={s.cornerBR} />
            <View style={s.camPill}>
              <Icon type={"materialCommunity"} name="qrcode-scan" size={13} color="#fff" />
              <Text style={s.camPillTxt}>Point at WalletConnect QR</Text>
            </View>
          </View>

          <View style={s.divRow}>
            <View style={[s.divLine, { backgroundColor: T.border }]} />
            <Text style={[s.divTxt, { color: T.sub }]}>or enter URI</Text>
            <View style={[s.divLine, { backgroundColor: T.border }]} />
          </View>

          <View style={[s.inputRow, { backgroundColor: T.card, borderColor: T.border }]}>
            <Icon type={"materialCommunity"} name="link-variant" size={17} color={T.sub} />
            <TextInput
              style={[s.textInput, { color: T.text }]}
              placeholder="wc:a1b2c3d4…"
              placeholderTextColor={T.sub}
              value={manualUri}
              onChangeText={setManualUri}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {manualUri.length > 0 && (
              <TouchableOpacity onPress={() => setManualUri("")}>
                <Icon type={"materialCommunity"} name="close-circle" size={17} color={T.sub} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={[s.primaryBtn, loading && s.disabled]} onPress={() => handlePairing(manualUri)} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <><Icon type={"materialCommunity"} name="transit-connection-variant" size={17} color="#fff" /><Text style={s.primaryBtnTxt}>Connect</Text></>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <View style={s.successWrap}>
          <View style={[s.successRing, { borderColor: C.green + "60", backgroundColor: C.green + "15" }]}>
            <Icon type={"materialCommunity"} name="check-circle-outline" size={52} color={C.green} />
          </View>
          <Text style={[s.successTitle, { color: T.text }]}>Session Active</Text>
          <Text style={[s.successSub, { color: T.sub }]}>Your wallet is connected</Text>
          <SectionCard title="CONNECTED WALLETS">
            <InfoRow label="EVM" value={state.wallet.address} mono />
            {state.STELLAR_PUBLICK_KEY && <InfoRow label="Stellar" value={state.STELLAR_PUBLICK_KEY} mono last />}
          </SectionCard>
          <TouchableOpacity style={[s.outlineBtn, { borderColor: C.blue }]} onPress={() => setScanned(false)}>
            <Icon type={"materialCommunity"} name="qrcode-scan" size={15} color={C.blue} />
            <Text style={[s.outlineBtnTxt, { color: C.blue }]}>Scan Another</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  // ─── Sessions view ────────────────────────────────────────────────────────────
  const renderSessions = () => (
    <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
      {activeSessions.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={[s.emptyIcon, { backgroundColor: T.card2 }]}>
            <Icon type={"materialCommunity"} name="wifi-off" size={30} color={T.sub} />
          </View>
          <Text style={[s.emptyTitle, { color: T.text }]}>No Active Sessions</Text>
          <Text style={[s.emptySub, { color: T.sub }]}>Connect a dApp from the Connect tab</Text>
        </View>
      ) : activeSessions.map((session) => {
        const ns = Object.keys(session.namespaces);
        const hasStellar = ns.includes("stellar");
        const hasEVM = ns.includes("eip155");
        return (
          <View key={session.topic} style={[s.sessionCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={s.sessionTop}>
              <View style={[s.sessionAvatar, { backgroundColor: C.blue + "20" }]}>
                <Text style={[s.sessionAvatarTxt, { color: C.blue }]}>{session.peer.metadata.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.sessionName, { color: T.text }]}>{session.peer.metadata.name}</Text>
                <Text style={[s.sessionUrl, { color: T.sub }]} numberOfLines={1}>{session.peer.metadata.url}</Text>
              </View>
              <View style={s.liveBadge}>
                <Animated.View style={[s.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={s.liveTxt}>Live</Text>
              </View>
            </View>
            <View style={s.chipRow}>
              {hasEVM && <Chip label="EVM" color={C.blue} />}
              {hasStellar && <Chip label="Stellar" color={C.purple} />}
            </View>
            <SectionCard title="WALLETS">
              {hasEVM && <InfoRow label="EVM" value={short(state.wallet.address)} mono />}
              {hasStellar && <InfoRow label="Stellar" value={short(state.STELLAR_PUBLICK_KEY)} mono last={!hasEVM} />}
            </SectionCard>
            <TouchableOpacity style={[s.disconnectBtn, loading && s.disabled]} onPress={() => disconnectSession(session.topic)} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={C.red} /> : (
                <><Icon type={"materialCommunity"} name="link-variant-off" size={14} color={C.red} /><Text style={s.disconnectTxt}>Disconnect</Text></>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );

  // ─── Session approval modal ───────────────────────────────────────────────────
  const renderSessionApprovalModal = () => {
    const reqNs = proposal ? { ...proposal.params?.requiredNamespaces, ...proposal.params?.optionalNamespaces } : {};
    const hasStellar = !!reqNs.stellar;
    const dappName = proposal?.params?.proposer?.metadata?.name ?? "Unknown dApp";
    const dappUrl = proposal?.params?.proposer?.metadata?.url ?? "";
    return (
      <Modal isVisible={sessionModalVisible} onBackdropPress={() => !loading && setSessionModalVisible(false)} style={s.modalStyle} backdropOpacity={0.75}>
        <View style={[s.sheet, { backgroundColor: T.card }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetTop}>
            <View style={[s.dappAvatar, { backgroundColor: C.blue + "20" }]}>
              <Text style={[s.dappAvatarTxt, { color: C.blue }]}>{dappName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: T.text }]}>{dappName}</Text>
              <Text style={[s.sheetSub, { color: T.sub }]} numberOfLines={1}>{dappUrl}</Text>
            </View>
            <Chip label="Connect" color={C.blue} />
          </View>
          <SectionCard title="WALLETS TO CONNECT">
            <InfoRow label="EVM Address" value={short(state.wallet.address)} mono />
            {hasStellar && state.STELLAR_PUBLICK_KEY &&
              <InfoRow label="Stellar Address" value={short(state.STELLAR_PUBLICK_KEY)} mono last />}
          </SectionCard>
          <SectionCard title="PERMISSIONS REQUESTED">
            {[
              { icon: "eye-outline", label: "View wallet addresses" },
              { icon: "send-outline", label: "Request EVM transactions" },
              { icon: "draw-pen", label: "Request EIP-712 typed signatures" },
              ...(hasStellar ? [{ icon: "star-outline", label: "Request Stellar transaction signatures" }] : []),
            ].map((p, i, arr) => (
              <View key={i} style={[s.permRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border }]}>
                <View style={[s.permIcon, { backgroundColor: C.blue + "18" }]}>
                  <Icon type={"materialCommunity"} name={p.icon} size={13} color={C.blue} />
                </View>
                <Text style={[s.permTxt, { color: T.text }]}>{p.label}</Text>
              </View>
            ))}
          </SectionCard>
          <View style={s.chipRow}>
            {["Ethereum", "BNB", "Polygon", "Arbitrum"].map((n) => <Chip key={n} label={n} color={C.blue} />)}
            {hasStellar && <Chip label="Stellar" color={C.purple} />}
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.rejectBtn, { backgroundColor: T.card2, borderColor: T.border }, loading && s.disabled]} onPress={rejectSession} disabled={loading}>
              <Text style={[s.rejectTxt, { color: T.sub }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.approveBtn, loading && s.disabled]} onPress={approveSession} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.approveTxt}>Approve</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Transaction modal ────────────────────────────────────────────────────────
  const renderTransactionModal = () => {
    if (!transactionRequest) return null;
    const d = getDisplayData();
    const accent = d.accentColor ?? C.blue;
    return (
      <Modal isVisible={txModalVisible} onBackdropPress={() => !loading && setTxModalVisible(false)} style={s.modalStyle} backdropOpacity={0.75}>
        <ScrollView style={[s.sheet, { backgroundColor: T.card }]} contentContainerStyle={{ paddingBottom: 36 }} bounces={false}>
          <View style={s.sheetHandle} />
          <View style={s.txHead}>
            <View style={[s.txIconWrap, { backgroundColor: accent + "20", borderColor: accent + "45" }]}>
              <Icon type={"materialCommunity"}
                name={d.isStellar ? "star-circle-outline" : d.type?.includes("Send") ? "send-circle-outline" : "draw-pen"}
                size={34} color={accent}
              />
            </View>
            <Text style={[s.txType, { color: T.text }]}>{d.type}</Text>
            {d.chain && (
              <View style={[s.chainPill, { backgroundColor: accent + "18", borderColor: accent + "45" }]}>
                <Text style={[s.chainPillTxt, { color: accent }]}>{d.chain}</Text>
              </View>
            )}
          </View>

          <SectionCard title="DETAILS">
            {d.isEvmTx && !d.isStellar ? (
              <>
                <InfoRow label="To" value={d.to} mono />
                {d.showValue && <InfoRow label="Amount" value={`${d.value} ${d.nativeSymbol}`} />}
                {d.data && <InfoRow label="Data" value={d.data} mono />}
                {d.message && (
                  <View style={[s.msgBox, { backgroundColor: C.orange + "10", borderColor: C.orange + "30" }]}>
                    <Icon type={"materialCommunity"} name="information-outline" size={14} color={C.orange} />
                    <Text style={[s.msgTxt, { color: C.orange }]}>{d.message}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {d.extra && <InfoRow label="Info" value={d.extra} last={!d.message} />}
                {d.message && (
                  <View style={[s.msgBox, { backgroundColor: accent + "10", borderColor: accent + "30" }]}>
                    <Icon type={"materialCommunity"} name="information-outline" size={14} color={accent} />
                    <Text style={[s.msgTxt, { color: accent }]}>{d.message}</Text>
                  </View>
                )}
              </>
            )}
          </SectionCard>

          <SectionCard title="SIGNING WITH">
            {d.isStellar
              ? <InfoRow label="Stellar" value={short(state.STELLAR_PUBLICK_KEY)} mono last />
              : <InfoRow label="EVM" value={short(state.wallet.address)} mono last />}
          </SectionCard>

          <View style={[s.warnBox, { backgroundColor: C.orange + "12", borderColor: C.orange + "38" }]}>
            <Icon type={"materialCommunity"} name="shield-alert-outline" size={17} color={C.orange} />
            <Text style={[s.warnTxt, { color: C.orange }]}>
              Only approve requests from dApps you trust. This action may be irreversible.
            </Text>
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.rejectBtn, { backgroundColor: T.card2, borderColor: T.border }, loading && s.disabled]} onPress={rejectTransaction} disabled={loading}>
              <Text style={[s.rejectTxt, { color: T.sub }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.approveBtn, { backgroundColor: accent }, loading && s.disabled]} onPress={approveTransaction} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.approveTxt}>Approve</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    );
  };

  // ─── Root ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <Modal isVisible={visible} onBackdropPress={handleClose} style={s.modalStyle} backdropOpacity={0.6}>
        <View style={[s.mainSheet, { backgroundColor: T.bg }]}>
          <View style={[s.mainHeader, { borderBottomColor: T.border }]}>
            <View style={s.headerLeft}>
              <View style={[s.wcIcon, { backgroundColor: C.blue }]}>
                <Icon type={"materialCommunity"} name="transit-connection-variant" size={17} color="#fff" />
              </View>
              <View>
                <Text style={[s.mainTitle, { color: T.text }]}>WalletConnect</Text>
                <Text style={[s.mainSub, { color: T.sub }]}>
                  {activeSessions.length > 0
                    ? `${activeSessions.length} active session${activeSessions.length > 1 ? "s" : ""}`
                    : "No active sessions"}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[s.closeBtn, { backgroundColor: T.card2, borderColor: T.border }]} onPress={handleClose}>
              <Icon type={"materialCommunity"} name="close" size={17} color={T.sub} />
            </TouchableOpacity>
          </View>
          {renderTabBar()}
          {activeView === "scanner" ? renderScanner() : renderSessions()}
        </View>
      </Modal>
      {renderSessionApprovalModal()}
      {renderTransactionModal()}
    </>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  modalStyle: { justifyContent: "flex-end", margin: 0 },
  mainSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, height: "88%", overflow: "hidden" },
  mainHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  wcIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  mainTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  mainSub: { fontSize: 11, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  tabBar: { flexDirection: "row", margin: 14, borderRadius: 13, padding: 4, borderWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10 },
  tabTxt: { fontSize: 13, fontWeight: "600" },
  scrollContent: { padding: 16, paddingBottom: 36 },
  camWrap: { height: 230, borderRadius: 20, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, marginBottom: 18 },
  cornerTL: { position: "absolute", top: 14, left: 14, width: 22, height: 22, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderTopLeftRadius: 5 },
  cornerTR: { position: "absolute", top: 14, right: 14, width: 22, height: 22, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderTopRightRadius: 5 },
  cornerBL: { position: "absolute", bottom: 14, left: 14, width: 22, height: 22, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderBottomLeftRadius: 5 },
  cornerBR: { position: "absolute", bottom: 14, right: 14, width: 22, height: 22, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderBottomRightRadius: 5 },
  camPill: { position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  camPillTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  divRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  divLine: { flex: 1, height: StyleSheet.hairlineWidth },
  divTxt: { fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 },
  textInput: { flex: 1, fontSize: 14, padding: 0 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.blue, borderRadius: 14, paddingVertical: 13 },
  primaryBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  successWrap: { alignItems: "center", paddingTop: 16, gap: 10 },
  successRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  successSub: { fontSize: 13 },
  outlineBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 20, marginTop: 6 },
  outlineBtnTxt: { fontSize: 14, fontWeight: "600" },
  sectionCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.9, marginBottom: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  infoLbl: { fontSize: 12, fontWeight: "500" },
  infoVal: { fontSize: 13, fontWeight: "600", maxWidth: "65%", textAlign: "right" },
  mono: { fontFamily: "Courier" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipTxt: { fontSize: 11, fontWeight: "600" },
  emptyWrap: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 13 },
  sessionCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 12 },
  sessionTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sessionAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sessionAvatarTxt: { fontSize: 17, fontWeight: "800" },
  sessionName: { fontSize: 14, fontWeight: "700" },
  sessionUrl: { fontSize: 11, marginTop: 2 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.green + "18", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveTxt: { fontSize: 11, fontWeight: "700", color: C.green },
  disconnectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: C.red + "50", borderRadius: 12, paddingVertical: 9, backgroundColor: C.red + "0E" },
  disconnectTxt: { color: C.red, fontSize: 13, fontWeight: "700" },
  permRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  permIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  permTxt: { fontSize: 13 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: "92%" },
  sheetHandle: { width: 36, height: 4, backgroundColor: "#88888855", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  dappAvatar: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dappAvatarTxt: { fontSize: 19, fontWeight: "800" },
  sheetTitle: { fontSize: 15, fontWeight: "700" },
  sheetSub: { fontSize: 12, marginTop: 2 },
  txHead: { alignItems: "center", marginBottom: 20, gap: 10 },
  txIconWrap: { width: 70, height: 70, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  txType: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  chainPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chainPillTxt: { fontSize: 12, fontWeight: "700" },
  msgBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 6 },
  msgTxt: { flex: 1, fontSize: 12, lineHeight: 18 },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  warnTxt: { flex: 1, fontSize: 12, lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 10 },
  rejectBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  rejectTxt: { fontSize: 14, fontWeight: "600" },
  approveBtn: { flex: 1, backgroundColor: C.blue, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  approveTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

export default WalletSyncComponent;