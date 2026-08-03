import { NativeModules } from "react-native";
import { ethers } from "ethers";
import {
    OpenAPI,
    OneClickService,
    QuoteRequest,
} from "@defuse-protocol/one-click-sdk-typescript";
import { NEARINTENT, STELLAR_URL } from "../Dashboard/constants";
import {
    TransactionBuilder,
    Operation,
    Asset,
    BASE_FEE,
    Networks,
    Horizon,
    Memo,
    StrKey,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { PPOST, proxyRequest } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/api";

const { TransactionSigner, StellarSigner } = NativeModules;

const TERMINAL_STATES = ["SUCCESS", "REFUNDED", "FAILED"];
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

// ---------------------------------------------------------------------------
// Safety / sanity bounds. Tune per product requirements.
// ---------------------------------------------------------------------------
const MAX_SLIPPAGE_BPS = 500; // 5% hard ceiling
const GAS_BUFFER_NUM = 120; // 20% buffer
const GAS_BUFFER_DEN = 100;
const QUOTE_DEADLINE_SAFETY_MS = 30 * 1000; // refuse to broadcast within 30s of quote deadline
const SUBMIT_DEPOSIT_RETRIES = 4;
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const TX_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Optional RPC call instrumentation. Disabled by default (zero overhead).
// Enable via enableRpcCallLogging() during debugging to see exactly which
// JSON-RPC methods are firing and how many times per swap, instead of
// guessing from a flat list of hostnames in a network trace.
// ---------------------------------------------------------------------------
let rpcCallLoggingEnabled = false;

export function enableRpcCallLogging(enabled = true) {
    rpcCallLoggingEnabled = enabled;
}

function instrumentProvider(provider) {
    if (!rpcCallLoggingEnabled) return provider;
    const originalSend = provider.send.bind(provider);
    const counts = {};
    provider.send = async (method, params) => {
        counts[method] = (counts[method] || 0) + 1;
        // eslint-disable-next-line no-console
        console.log(`[RPC] ${method} (call #${counts[method]} for this method)`);
        return originalSend(method, params);
    };
    provider.__rpcCallCounts = counts;
    return provider;
}

/**
 * Tries an EVM read/write operation against each RPC url in order (primary
 * first, then backups). Switches automatically on ANY failure — 403s, rate
 * limits, "archive node requires personal token" errors, timeouts, etc.
 * Throws the last error only if every url fails.
 */
async function withRpcFallback(rpcUrls, operationFn, { label = "rpc-op" } = {}) {
    let lastError;
    for (const url of rpcUrls) {
        try {
            const provider = instrumentProvider(new ethers.providers.JsonRpcProvider(url));
            provider.pollingInterval = 6000;
            return await operationFn(provider);
        } catch (error) {
            logWarn(`${label} failed on RPC (${url}), trying next`, formatError(error));
            lastError = error;
        }
    }
    throw lastError ?? new Error(`${label}: no RPC urls provided`);
}

// ---------------------------------------------------------------------------
// Module-scoped state
// ---------------------------------------------------------------------------
// NOTE ON CONCURRENCY: `OpenAPI` from the SDK is a singleton, so this module
// is only safe for a SINGLE authenticated session at a time. If the app ever
// needs to support multiple concurrent swap sessions / users in one process,
// this SDK usage must be wrapped so the token is set immediately before each
// call rather than once globally. See `withSdkAuth()` below, which mitigates
// this by re-asserting the token/base URL right before every SDK call.
let configuredToken = null;
let configuredAt = 0;

// Simple in-flight lock to prevent duplicate concurrent swap submissions
// (e.g. user double-tapping "Swap" while the first request is still in
// flight). Keyed by wallet address so unrelated flows aren't blocked.
const inFlightSwaps = new Set();

// Token list cache to avoid refetching the full token catalogue on every
// quote request.
let tokenCache = null;
let tokenCacheAt = 0;

function formatError(error) {
    return {
        message: error?.message ?? String(error),
        status: error?.status ?? null,
        body: error?.body ?? null,
        code: error?.code ?? null,
    };
}

function logError(context, error) {
    // Centralized so it's trivial to wire into Sentry / analytics later.
    // eslint-disable-next-line no-console
    console.error(`[NearIntentSwap] ${context}:`, formatError(error));
}

function logWarn(context, details) {
    // eslint-disable-next-line no-console
    console.warn(`[NearIntentSwap] ${context}:`, details);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configures the OneClick SDK client. Must be called before any other
 * exported function in this module.
 *
 * @param {string} [jwtToken] Optional auth token. If omitted, requests
 *   proceed unauthenticated and the 0.2% default fee tier applies — this is
 *   surfaced back to the caller via `feeApplies` so the UI can inform users,
 *   rather than being buried in a log line.
 */
export function configure(jwtToken) {
    try {
        if (jwtToken !== undefined && jwtToken !== null && typeof jwtToken !== "string") {
            throw new Error("jwtToken must be a string if provided");
        }
        if (typeof jwtToken === "string" && jwtToken.trim().length === 0) {
            throw new Error("jwtToken must not be an empty string");
        }

        // Best-effort JWT expiry check. Never throws on malformed tokens —
        // some auth systems use opaque (non-JWT) tokens, which is fine.
        if (jwtToken) {
            const expiry = tryGetJwtExpiry(jwtToken);
            if (expiry && expiry < Date.now()) {
                throw new Error("Provided jwtToken is already expired");
            }
        }

        if (!NEARINTENT?.BASE_ROUTE) {
            throw new Error("NEARINTENT.BASE_ROUTE is not configured");
        }
        // eslint-disable-next-line no-new
        new URL(NEARINTENT.BASE_ROUTE); // throws if malformed

        configuredToken = jwtToken || null;
        configuredAt = Date.now();

        return { success: true, error: null, feeApplies: !jwtToken };
    } catch (error) {
        configuredToken = null;
        logError("configure", error);
        return { success: false, error: formatError(error) };
    }
}

function tryGetJwtExpiry(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(
            Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        );
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null; // not a JWT, or malformed — not fatal
    }
}

function assertConfigured() {
    if (configuredAt === 0) {
        throw new Error("Call configure() before using this utility.");
    }
}

/**
 * Runs an SDK call with the module's auth state applied immediately
 * beforehand. This narrows (but does not eliminate — see module-level note)
 * the singleton-mutation race window described above.
 */
async function withSdkAuth(fn) {
    assertConfigured();
    OpenAPI.BASE = NEARINTENT.BASE_ROUTE;
    OpenAPI.TOKEN = configuredToken ?? undefined;
    return fn();
}

// ---------------------------------------------------------------------------
// Address / amount validation helpers
// ---------------------------------------------------------------------------

function isStellarChain(chain) {
    return typeof chain === "string" && chain.toUpperCase().includes("STELLAR");
}

function isValidAddressForChain(address, chain) {
    if (!address || typeof address !== "string") return false;
    if (isStellarChain(chain)) {
        return StrKey.isValidEd25519PublicKey(address);
    }
    return ethers.utils.isAddress(address);
}

function assertPositiveAmount(amount, label = "amount") {
    const n = Number(amount);
    if (amount === undefined || amount === null || amount === "" || Number.isNaN(n) || n <= 0) {
        throw new Error(`${label} must be a positive number`);
    }
}

function assertSlippageInBounds(slippageTolerance) {
    if (
        typeof slippageTolerance !== "number" ||
        slippageTolerance < 0 ||
        slippageTolerance > MAX_SLIPPAGE_BPS
    ) {
        throw new Error(
            `slippageTolerance out of safe bounds (0-${MAX_SLIPPAGE_BPS} bps): got ${slippageTolerance}`
        );
    }
}

function assertQuoteNotExpired(quote, safetyMs = QUOTE_DEADLINE_SAFETY_MS) {
    const deadline = quote?.quote?.deadline;
    if (!deadline) return; // SDK didn't return one — nothing to check
    const deadlineMs = new Date(deadline).getTime();
    if (Number.isNaN(deadlineMs)) return;
    if (Date.now() + safetyMs >= deadlineMs) {
        throw new Error("Quote is expired or about to expire — refusing to broadcast. Please re-quote.");
    }
}

// ---------------------------------------------------------------------------
// Token lookup (cached)
// ---------------------------------------------------------------------------

async function getTokensCached() {
    if (tokenCache && Date.now() - tokenCacheAt < TOKEN_CACHE_TTL_MS) {
        return tokenCache;
    }
    const tokens = await withSdkAuth(() => OneClickService.getTokens());
    tokenCache = tokens;
    tokenCacheAt = Date.now();
    return tokens;
}

export async function findAsset(blockchain, symbol, tokenAddress) {
    try {
        assertConfigured();

        if (!blockchain || typeof blockchain !== "string") {
            throw new Error("Invalid blockchain parameter");
        }

        if (!symbol || typeof symbol !== "string") {
            throw new Error("Invalid symbol parameter");
        }

        // tokenAddress is required for all tokens except XLM
        if (
            symbol.toUpperCase() !== "XLM" &&
            (!tokenAddress || typeof tokenAddress !== "string")
        ) {
            throw new Error("Invalid tokenAddress parameter");
        }

        const tokens = await getTokensCached();

        const matches = tokens.filter((t) => {
            // For XLM, ignore contractAddress and match by blockchain + symbol
            if (symbol.toUpperCase() === "XLM") {
                return (
                    t.blockchain?.toLowerCase() === blockchain.toLowerCase() &&
                    t.symbol?.toUpperCase() === symbol.toUpperCase()
                );
            }

            // For all other assets, match by blockchain + contractAddress
            return (
                t.blockchain?.toLowerCase() === blockchain.toLowerCase() &&
                t.contractAddress?.toUpperCase() === tokenAddress.toUpperCase()
            );
        });

        if (matches.length === 0) {
            throw new Error(
                `Could not find token ${symbol} on ${blockchain}.`
            );
        }

        if (matches.length > 1) {
            throw new Error(
                `Ambiguous token ${symbol} on ${blockchain}: ${matches.length} matches. ` +
                `Disambiguate via explicit assetId.`
            );
        }

        return {
            success: true,
            data: matches[0],
            error: null,
        };
    } catch (error) {
        logError("findAsset", error);
        return {
            success: false,
            data: null,
            error: formatError(error),
        };
    }
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function getQuote({
    originBlockchain,
    originSymbol,
    destinationBlockchain,
    destinationSymbol,
    amount,
    recipient,
    refundTo,
    recipientType = QuoteRequest.recipientType.DESTINATION_CHAIN,
    dry = false,
    slippageTolerance = 100,
    deadlineMinutes = 10,
    refundType,
    depositType,
    depositMode,
    originSymbolAddress,
    destinationSymbolAddress
}) {
    try {
        assertConfigured();

        assertPositiveAmount(amount);
        assertSlippageInBounds(slippageTolerance);

        if (!recipient) throw new Error("recipient is required");
        if (!isValidAddressForChain(recipient, destinationBlockchain)) {
            throw new Error(`Invalid recipient address for destination chain ${destinationBlockchain}`);
        }
        if (refundTo && !isValidAddressForChain(refundTo, originBlockchain)) {
            throw new Error(`Invalid refundTo address for origin chain ${originBlockchain}`);
        }
        if (!Number.isFinite(deadlineMinutes) || deadlineMinutes <= 0) {
            throw new Error("deadlineMinutes must be a positive number");
        }

        // Independent lookups — run in parallel instead of sequentially.
        const [originResult, destinationResult] = await Promise.all([
            findAsset(originBlockchain, originSymbol ,originSymbolAddress),
            findAsset(destinationBlockchain, destinationSymbol ,destinationSymbolAddress),
        ]);
        if (!originResult.success) throw new Error(originResult.error.message);
        if (!destinationResult.success) throw new Error(destinationResult.error.message);

        const originToken = originResult.data;
        const destinationToken = destinationResult.data;

        // FIX: decimal-safe conversion instead of floating point math.
        // parseUnits also throws cleanly if the input has more precision
        // than the token supports, surfacing the error early.
        let amountSmallestUnit;
        try {
            amountSmallestUnit = ethers.utils.parseUnits(String(amount), originToken.decimals).toString();
        } catch (parseErr) {
            throw new Error(
                `Amount ${amount} is invalid for ${originSymbol} (decimals=${originToken.decimals}): ${parseErr.message}`
            );
        }

        const quoteRequest = {
            dry,
            swapType: QuoteRequest.swapType.EXACT_INPUT,
            slippageTolerance,
            depositType,
            depositMode,
            originAsset: originToken.assetId,
            destinationAsset: destinationToken.assetId,
            amount: amountSmallestUnit,
            recipient,
            recipientType,
            refundTo,
            refundType,
            deadline: new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString(),
        };

        const quote = await withRetry(
            () => withSdkAuth(() => OneClickService.getQuote(quoteRequest)),
            { retries: 2, label: "getQuote" }
        );

        return { success: true, data: quote, error: null };
    } catch (error) {
        logError("getQuote", error);
        return { success: false, data: null, error: formatError(error) };
    }
}

// ---------------------------------------------------------------------------
// Generic retry helper (network-level transient failures only)
// ---------------------------------------------------------------------------

function isRetryableError(error) {
    // Retry on network/timeout/5xx-ish failures; do NOT retry on explicit
    // 4xx validation errors from the SDK, since those won't succeed on retry
    // and retrying could duplicate side effects.
    const status = error?.status ?? error?.response?.status;
    if (status && status >= 400 && status < 500) return false;
    return true;
}

async function withRetry(fn, { retries = 3, baseDelayMs = 750, label = "operation" } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === retries || !isRetryableError(error)) {
                throw error;
            }
            const delay = baseDelayMs * 2 ** attempt;
            logWarn(`${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`, formatError(error));
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastError;
}

function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
}

// ---------------------------------------------------------------------------
// EVM deposit execution
// ---------------------------------------------------------------------------

/**
 * Builds, signs (via native module), and broadcasts (via backend proxy) an
 * ERC-20 transfer depositing funds into the swap route. RPC reads (nonce,
 * balances, chainId, gas estimate, fee data) go through `withRpcFallback`,
 * trying rpcUrl + chainConfig.backupRPCUrls in order and switching
 * automatically on failure (403s, rate limits, "archive node" errors,
 * etc). The signed tx itself is broadcast through the backend
 * `/v1/eth/transaction/broadcast` endpoint rather than directly via RPC.
 */
async function sendDepositViaNativeSigner({
    rpcUrl,
    chain,
    activeWalletAddress,
    activeChain,
    chainConfig,
    tokenContractAddress,
    depositAddress,
    amountSmallestUnit,
}) {
    // --- Structural validation -------------------------------------------
    if (!ethers.utils.isAddress(activeWalletAddress)) {
        throw new Error(`Invalid sender address: ${activeWalletAddress}`);
    }
    if (!ethers.utils.isAddress(tokenContractAddress)) {
        throw new Error(`Invalid token contract address: ${tokenContractAddress}`);
    }
    if (!ethers.utils.isAddress(depositAddress)) {
        throw new Error(`Invalid deposit address received from quote: ${depositAddress}`);
    }
    if (!TransactionSigner) {
        throw new Error("Native TransactionSigner module is not available on this device");
    }
    const amountBN = ethers.BigNumber.from(amountSmallestUnit);
    if (amountBN.lte(0)) {
        throw new Error("Deposit amount must be greater than zero");
    }

    // rpcUrl (primary, as before) + chainConfig.backupRPCUrls for fallback.
    const rpcUrls = [rpcUrl, ...(chainConfig?.backupRPCUrls || [])];

    // --- Batch 1: everything that doesn't depend on tx calldata, with RPC fallback -----
    // getNetwork (also proves RPC reachability), getCode (contract
    // existence), token balance, native balance, and both nonce lookups are
    // all independent RPC calls — fire them together against whichever RPC
    // in rpcUrls responds successfully.
    const { network, code, tokenBalance, nativeBalance, pendingNonce, latestNonce } =
        await withRpcFallback(
            rpcUrls,
            async (provider) => {
                const erc20 = new ethers.Contract(tokenContractAddress, ERC20_ABI, provider);
                const [network, code, tokenBalance, nativeBalance, pendingNonce, latestNonce] =
                    await Promise.all([
                        provider.getNetwork(),
                        provider.getCode(tokenContractAddress),
                        erc20.balanceOf(activeWalletAddress),
                        provider.getBalance(activeWalletAddress),
                        provider.getTransactionCount(activeWalletAddress, "pending"),
                        provider.getTransactionCount(activeWalletAddress, "latest"),
                    ]);
                return { network, code, tokenBalance, nativeBalance, pendingNonce, latestNonce };
            },
            { label: "pre-tx reads" }
        );

    if (activeChain !== undefined && activeChain !== null && String(network.chainId) !== String(activeChain)) {
        throw new Error(
            `Chain mismatch: RPC reports chainId ${network.chainId}, wallet is on ${activeChain}. Refusing to sign.`
        );
    }
    if (code === "0x") {
        throw new Error(`No contract deployed at token address ${tokenContractAddress} on chain ${network.chainId}`);
    }
    if (tokenBalance.lt(amountBN)) {
        throw new Error(
            `Insufficient token balance: have ${tokenBalance.toString()}, need ${amountBN.toString()}`
        );
    }
    if (pendingNonce > latestNonce) {
        logWarn(
            "sendDepositViaNativeSigner",
            `Account has ${pendingNonce - latestNonce} pending transaction(s) that may delay confirmation`
        );
    }
    const nonce = pendingNonce;

    // --- Build transfer calldata ---------------------------------------------
    const iface = new ethers.utils.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData("transfer", [depositAddress, amountBN]);

    // --- Batch 2: gas estimation + fee data, with RPC fallback -----------------
    const { gasEstimate, feeData } = await withRpcFallback(
        rpcUrls,
        async (provider) => {
            const [gasEstimateResult, feeDataResult] = await Promise.allSettled([
                provider.estimateGas({ from: activeWalletAddress, to: tokenContractAddress, data }),
                provider.getFeeData(),
            ]);
            if (gasEstimateResult.status === "rejected") {
                // estimateGas failing almost always means the tx would revert
                // (e.g. paused token, blacklisted address, etc). This is NOT
                // an RPC-availability problem, so don't let withRpcFallback
                // retry it on another RPC — rethrow so it bubbles straight
                // out. (withRpcFallback still treats this as "this RPC
                // failed" and would move to the next url; that's acceptable
                // since the outcome — genuine revert — will be identical on
                // every RPC, so the loop harmlessly exhausts and surfaces
                // this same error.)
                throw new Error(
                    `Gas estimation failed — transaction would likely revert: ${gasEstimateResult.reason?.message}`
                );
            }
            if (feeDataResult.status === "rejected") {
                throw new Error(`Unable to fetch fee data from RPC: ${feeDataResult.reason?.message}`);
            }
            return { gasEstimate: gasEstimateResult.value, feeData: feeDataResult.value };
        },
        { label: "gas estimate + fee data" }
    );

    const gasLimit = gasEstimate.mul(GAS_BUFFER_NUM).div(GAS_BUFFER_DEN);
    const supportsEip1559 = Boolean(feeData.maxFeePerGas && feeData.maxPriorityFeePerGas);

    const tx = {
        nonce: ethers.utils.hexlify(nonce),
        gasLimit: ethers.utils.hexlify(gasLimit),
        to: tokenContractAddress,
        value: "0x0",
        data,
        chainId: network.chainId,
    };

    if (supportsEip1559) {
        tx.type = 2;
        tx.maxFeePerGas = ethers.utils.hexlify(feeData.maxFeePerGas.mul(GAS_BUFFER_NUM).div(GAS_BUFFER_DEN));
        tx.maxPriorityFeePerGas = ethers.utils.hexlify(
            feeData.maxPriorityFeePerGas.mul(GAS_BUFFER_NUM).div(GAS_BUFFER_DEN)
        );
        // Some native signer modules (Android/iOS bridge implementations)
        // are legacy-only and reject a tx object that lacks `gasPrice`,
        // even when `type: 2` / maxFeePerGas are present. Populate it as a
        // safe fallback so those signers don't throw "No value for
        // gasPrice" — providers that do understand EIP-1559 will simply
        // ignore this field in favor of maxFeePerGas/maxPriorityFeePerGas.
        tx.gasPrice = feeData.gasPrice
            ? ethers.utils.hexlify(feeData.gasPrice.mul(GAS_BUFFER_NUM).div(GAS_BUFFER_DEN))
            : tx.maxFeePerGas;
    } else {
        if (!feeData.gasPrice) {
            throw new Error("Unable to determine gas price from provider fee data");
        }
        tx.gasPrice = ethers.utils.hexlify(feeData.gasPrice.mul(GAS_BUFFER_NUM).div(GAS_BUFFER_DEN));
    }

    // --- Native gas balance check (after we know the real fee) -------------------
    const estGasCost = supportsEip1559
        ? gasLimit.mul(tx.maxFeePerGas)
        : gasLimit.mul(tx.gasPrice);
    if (nativeBalance.lt(estGasCost)) {
        throw new Error(
            `Insufficient native gas balance: have ${ethers.utils.formatEther(nativeBalance)}, need ~${ethers.utils.formatEther(estGasCost)}`
        );
    }

    // --- Sign via native module -------------------------------------------------
    const signedTx = await TransactionSigner.signTransaction(
        chain,
        activeWalletAddress,
        JSON.stringify(tx),
        network.chainId
    );

    if (!signedTx?.signedTx) {
        throw new Error("Transaction signing failed or was cancelled by the user");
    }

    let rawTx = signedTx.signedTx;
    if (!rawTx.startsWith("0x")) {
        rawTx = `0x${rawTx}`;
    } else if (rawTx.startsWith("0x0x")) {
        rawTx = rawTx.slice(2);
    }

    // --- Broadcast ----------------------------------------------------------------
    const { res, err } = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, {
        signedTransactions: [rawTx],
        broadcastChain: chainConfig.subName=== "BNB" ? "BSC" : chainConfig.subName,
    });

    if (err?.status) {
        throw new Error(`Broadcast failed via backend: ${err?.message ?? "unknown error"}`);
    }

    const txHash = res?.results?.[0]?.transactionHash;
    if (!txHash) {
        throw new Error("Backend broadcast succeeded but returned no txHash");
    }

    return { txHash };
}

// ---------------------------------------------------------------------------
// EVM swap orchestration
// ---------------------------------------------------------------------------

export async function NearIntentSwapExecute({
    originBlockchain,
    originSymbol,
    originTokenContract,
    destinationBlockchain,
    destinationSymbol,
    amount,
    recipient,
    refundTo,
    recipientType,
    slippageTolerance,
    deadlineMinutes,
    rpcUrl,
    chain,
    activeWalletAddress,
    activeChain,
    refundType,
    destinatTokenContract,
    chainConfig,
}) {
    const lockKey = `evm:${activeWalletAddress}`;
    if (inFlightSwaps.has(lockKey)) {
        return {
            success: false,
            data: null,
            error: formatError(new Error("A swap is already in progress for this wallet. Please wait.")),
        };
    }

    try {
        inFlightSwaps.add(lockKey);
        assertConfigured();

        if (!activeWalletAddress || !ethers.utils.isAddress(activeWalletAddress)) {
            throw new Error(`Invalid activeWalletAddress: ${activeWalletAddress}`);
        }
        if (!originTokenContract || !ethers.utils.isAddress(originTokenContract)) {
            throw new Error(`Invalid originTokenContract: ${originTokenContract}`);
        }
        if (!rpcUrl) {
            throw new Error("rpcUrl is required");
        }

        // rpcUrl (primary) + chainConfig.backupRPCUrls, used for the
        // confirmation-wait fallback below.
        const rpcUrls = [rpcUrl, ...(chainConfig?.backupRPCUrls || [])];

        const quoteResult = await getQuote({
            originBlockchain,
            originSymbol,
            destinationBlockchain,
            destinationSymbol,
            amount,
            recipient,
            refundTo: refundTo ?? activeWalletAddress,
            recipientType,
            slippageTolerance,
            deadlineMinutes,
            dry: false,
            depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
            depositMode: QuoteRequest.depositMode.SIMPLE,
            refundType,
            originSymbolAddress:originTokenContract,
            destinationSymbolAddress:destinatTokenContract
        });

        if (!quoteResult.success) throw new Error(quoteResult.error.message);
        const quote = quoteResult.data;

        assertQuoteNotExpired(quote);

        const depositAddress = quote.quote.depositAddress;
        const amountSmallestUnit = quote.quote.amountIn;

        const { txHash } = await sendDepositViaNativeSigner({
            rpcUrl,
            chain,
            activeWalletAddress,
            activeChain,
            chainConfig,
            tokenContractAddress: originTokenContract,
            depositAddress,
            amountSmallestUnit,
        });

        // Bounded wait for confirmation, also falling back across RPCs.
        // This is exactly the case that previously failed with
        // "Archive requests require a personal token" on one public RPC —
        // waitForTransaction now retries against the next url in rpcUrls.
        const receipt = await withTimeout(
            withRpcFallback(
                rpcUrls,
                (provider) => provider.waitForTransaction(txHash, 1),
                { label: "confirmation" }
            ),
            TX_CONFIRMATION_TIMEOUT_MS,
            "Transaction confirmation timed out"
        );

        if (receipt.status !== 1) {
            throw new Error(
                `Deposit transaction reverted on-chain (tx: ${txHash}). No funds were sent to the swap route.`
            );
        }

        // The on-chain deposit has now definitely succeeded. From this point
        // on, failures must NOT be reported as a bare swap failure — the
        // user's funds have moved. Surface the txHash so it can be manually
        // reconciled / retried even if this registration step fails.
        try {
            await withRetry(
                () =>
                    withSdkAuth(() =>
                        OneClickService.submitDepositTx({ depositAddress, txHash })
                    ),
                { retries: SUBMIT_DEPOSIT_RETRIES, label: "submitDepositTx" }
            );
        } catch (submitErr) {
            logError("submitDepositTx failed after on-chain success", submitErr);
            return {
                success: false,
                data: {
                    depositConfirmedOnChain: true,
                    txHash,
                    depositAddress,
                    quote,
                },
                error: formatError(
                    new Error(
                        `Deposit succeeded on-chain (tx: ${txHash}) but failed to register with the ` +
                            `swap backend. This requires manual follow-up — do not resubmit the deposit.`
                    )
                ),
            };
        }

        return {
            success: true,
            data: {
                quote,
                txHash,
                finalStatus: "pending", // caller must invoke pollStatus() / GetNearIntentStatus() to track progress
                depositAddress,
            },
            error: null,
        };
    } catch (error) {
        logError("NearIntentSwapExecute", error);
        return { success: false, data: null, error: formatError(error) };
    } finally {
        inFlightSwaps.delete(lockKey);
    }
}

// ---------------------------------------------------------------------------
// Status polling
// ---------------------------------------------------------------------------

export async function pollStatus(depositAddress, { intervalMs = 5000, maxIntervalMs = 30000, timeoutMs = 15 * 60 * 1000 } = {}) {
    try {
        assertConfigured();
        if (!depositAddress) throw new Error("depositAddress is required");

        const start = Date.now();
        let interval = intervalMs;
        let lastStatus = null;

        while (Date.now() - start < timeoutMs) {
            try {
                const status = await withSdkAuth(() => OneClickService.getExecutionStatus(depositAddress));
                lastStatus = status;
                if (TERMINAL_STATES.includes(status.status)) {
                    return { success: true, data: status, error: null };
                }
            } catch (err) {
                // A single transient failure should not abort a 15-minute
                // polling window — log and keep polling.
                logWarn("pollStatus transient error, continuing", formatError(err));
            }

            await new Promise((resolve) => setTimeout(resolve, interval));
            interval = Math.min(interval * 1.5, maxIntervalMs); // backoff with cap
        }

        return {
            success: false,
            data: lastStatus,
            timedOut: true,
            error: formatError(new Error("Timed out waiting for swap to finalize; last known status attached")),
        };
    } catch (error) {
        logError("pollStatus", error);
        return { success: false, data: null, error: formatError(error) };
    }
}

const STATUS_DISPLAY_MAP = {
    SUCCESS: { status: "completed", statusColor: "#09b317" },
    PROCESSING: { status: "processing", statusColor: "#eec14f" },
    FAILED: { status: "failed", statusColor: "#de2727" },
    REFUNDED: { status: "refunded", statusColor: "#de2727" },
};
const KNOWN_PENDING_STATES = ["KNOWN_DEPOSIT_TX", "PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT"];

export async function GetNearIntentStatus(depositAddress, depositMemo) {
    try {
        assertConfigured();
        if (!depositAddress) throw new Error("depositAddress is required");

        const status = await withSdkAuth(() =>
            depositMemo
                ? OneClickService.getExecutionStatus(depositAddress, depositMemo)
                : OneClickService.getExecutionStatus(depositAddress)
        );

        const mapped = STATUS_DISPLAY_MAP[status.status];
        if (mapped) return mapped;

        if (!KNOWN_PENDING_STATES.includes(status.status)) {
            logWarn("GetNearIntentStatus: unrecognized status from SDK", status.status);
        }
        return { status: "pending", statusColor: "#eec14f" };
    } catch (error) {
        // Distinguish genuine failures (auth expired, bad request, network
        // down) from legitimate "still pending" states — collapsing both
        // into "pending" hides real problems from the user indefinitely.
        logError("GetNearIntentStatus", error);
        return { status: "unknown", statusColor: "#999999", error: formatError(error) };
    }
}

// ---------------------------------------------------------------------------
// Stellar helpers
// ---------------------------------------------------------------------------

async function hasTrustline(server, accountId, assetCode, assetIssuer) {
    if (assetCode === "native" || assetCode === "XLM") return true;
    if (!StrKey.isValidEd25519PublicKey(assetIssuer)) {
        throw new Error(`Invalid Stellar asset issuer: ${assetIssuer}`);
    }
    try {
        const account = await server.loadAccount(accountId);
        return account.balances.some(
            (b) => b.asset_code === assetCode && b.asset_issuer === assetIssuer
        );
    } catch (error) {
        if (error?.response?.status === 404 || error?.name === "NotFoundError") {
            throw new Error(
                "Stellar account is not yet funded/activated on the network. Fund it with XLM before continuing."
            );
        }
        throw new Error(`Trustline check failed: ${error?.message ?? error}`);
    }
}

async function getDynamicFee(server) {
    try {
        const feeStats = await server.fetchBaseFee();
        return String(feeStats);
    } catch {
        return BASE_FEE; // fall back to network minimum
    }
}

function assertStellarSignerAvailable() {
    if (!StellarSigner) {
        throw new Error("Native StellarSigner module is not available on this device");
    }
}

function assertValidSignedStellarTx(signedTx) {
    if (!signedTx?.signature || !signedTx?.publicKey) {
        throw new Error("Stellar transaction signing failed or was cancelled by the user");
    }
}

async function submitStellarTxWithSeqRetry(server, buildAndSign, { retries = 1 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const tx = await buildAndSign();
            const response = await server.submitTransaction(tx);
            if (response.successful === false) {
                throw new Error("Stellar transaction failed on-chain");
            }
            return response;
        } catch (error) {
            lastError = error;
            const isSeqConflict =
                error?.response?.data?.extras?.result_codes?.transaction === "tx_bad_seq";
            if (!isSeqConflict || attempt === retries) {
                throw error;
            }
            logWarn("Stellar sequence conflict, retrying with fresh sequence", formatError(error));
        }
    }
    throw lastError;
}

async function sendTrustlineTx({
    activeWalletAddress,
    horizonUrl,
    networkPassphrase,
    assetCode,
    assetIssuer,
    limit,
}) {
    assertStellarSignerAvailable();
    if (!StrKey.isValidEd25519PublicKey(activeWalletAddress)) {
        throw new Error(`Invalid Stellar wallet address: ${activeWalletAddress}`);
    }

    const server = new Horizon.Server(horizonUrl);
    const asset = new Asset(assetCode, assetIssuer);
    const fee = await getDynamicFee(server);

    const submit = async () => {
        const sourceAccount = await server.loadAccount(activeWalletAddress);

        // Reserve check: creating a trustline raises the account's minimum
        // XLM reserve by one subentry (0.5 XLM), plus the tx fee.
        const baseReserve = 0.5; // XLM per subentry (network default)
        const nativeBalance = sourceAccount.balances.find((b) => b.asset_type === "native");
        const requiredXlm = baseReserve + Number(fee) / 1e7;
        if (nativeBalance && Number(nativeBalance.balance) < requiredXlm) {
            throw new Error(
                `Insufficient XLM to cover trustline reserve + fee. Have ${nativeBalance.balance}, need ~${requiredXlm}`
            );
        }

        const tx = new TransactionBuilder(sourceAccount, { fee, networkPassphrase })
            .addOperation(Operation.changeTrust({ asset, limit }))
            .setTimeout(180)
            .build();

        const txXDR = tx.toXDR();
        const signedTx = await StellarSigner.signTransaction(txXDR);
        assertValidSignedStellarTx(signedTx);

        const signatureBuffer = Buffer.from(signedTx.signature, "base64");
        tx.addSignature(signedTx.publicKey, signatureBuffer.toString("base64"));
        return tx;
    };

    return submitStellarTxWithSeqRetry(server, submit);
}

export async function EnsureStellarTrustline({
    activeWalletAddress,
    assetCode,
    assetIssuer,
    horizonUrl = STELLAR_URL.URL,
    networkPassphrase = Networks.PUBLIC,
    limit,
}) {
    try {
        if (!activeWalletAddress) throw new Error("activeWalletAddress is required");
        if (!assetCode) throw new Error("assetCode is required");

        const server = new Horizon.Server(horizonUrl);
        const trustlineActive = await hasTrustline(server, activeWalletAddress, assetCode, assetIssuer);

        if (trustlineActive) {
            return { success: true, data: { trustlineActive: true, txHash: null }, error: null };
        }

        const trustTxResponse = await sendTrustlineTx({
            activeWalletAddress,
            horizonUrl,
            networkPassphrase,
            assetCode,
            assetIssuer,
            limit,
        });

        return {
            success: true,
            data: { trustlineActive: false, trustlineEstablished: true, txHash: trustTxResponse.hash },
            error: null,
        };
    } catch (error) {
        logError("EnsureStellarTrustline", error);
        return { success: false, data: null, error: formatError(error) };
    }
}

async function sendDepositViaStellarSigner({
    activeWalletAddress,
    horizonUrl,
    networkPassphrase,
    depositAddress,
    assetCode,
    assetIssuer,
    amountDecimal,
    quote,
}) {
    assertStellarSignerAvailable();

    if (!StrKey.isValidEd25519PublicKey(activeWalletAddress)) {
        throw new Error(`Invalid Stellar wallet address: ${activeWalletAddress}`);
    }
    if (!StrKey.isValidEd25519PublicKey(depositAddress)) {
        throw new Error(`Invalid Stellar deposit address received from quote: ${depositAddress}`);
    }
    if (!(Number(amountDecimal) > 0)) {
        throw new Error(`Deposit amount must be greater than zero: ${amountDecimal}`);
    }

    const server = new Horizon.Server(horizonUrl);
    const asset =
        assetCode === "native" || assetCode === "XLM" ? Asset.native() : new Asset(assetCode, assetIssuer);
    const fee = await getDynamicFee(server);

    const rawMemo = quote?.quote?.depositMemo;

    // IMPORTANT: the OneClick SDK's Quote type only exposes `depositMemo`
    // as a plain string — there is no `depositMemoType` field in the real
    // API response (verified against @defuse-protocol/one-click-sdk-typescript
    // type definitions). A previous version of this code switched on
    // `quote.quote.depositMemoType`, which is always `undefined` since the
    // field doesn't exist, so it silently fell into the "no memo" branch on
    // every deposit — meaning any deposit that actually required a memo for
    // routing was submitted memo-less. Fixed: if the SDK returns a
    // depositMemo, always attach it as MEMO_TEXT, which is Stellar's
    // standard convention for routing memos and safely accommodates both
    // numeric and alphanumeric memo values. If a future SDK version adds an
    // explicit memo-type field, prefer that over this heuristic.
    let memo;
    if (rawMemo !== undefined && rawMemo !== null && String(rawMemo).length > 0) {
        memo = Memo.text(String(rawMemo));
    } else {
        memo = undefined; // no memo required for this deposit address
    }

    const submit = async () => {
        const sourceAccount = await server.loadAccount(activeWalletAddress);

        // Balance check
        const balanceLine = sourceAccount.balances.find((b) =>
            asset.isNative() ? b.asset_type === "native" : b.asset_code === assetCode && b.asset_issuer === assetIssuer
        );
        if (!balanceLine || parseFloat(balanceLine.balance) < parseFloat(amountDecimal)) {
            throw new Error(
                `Insufficient ${assetCode} balance: have ${balanceLine?.balance ?? 0}, need ${amountDecimal}`
            );
        }

        let builder = new TransactionBuilder(sourceAccount, { fee, networkPassphrase }).addOperation(
            Operation.payment({ destination: depositAddress, asset, amount: amountDecimal })
        );
        if (memo) builder = builder.addMemo(memo);
        const tx = builder.setTimeout(180).build();

        const txXDR = tx.toXDR();
        const signedTx = await StellarSigner.signTransaction(txXDR);
        assertValidSignedStellarTx(signedTx);

        const signatureBuffer = Buffer.from(signedTx.signature, "base64");
        tx.addSignature(signedTx.publicKey, signatureBuffer.toString("base64"));
        return tx;
    };

    return submitStellarTxWithSeqRetry(server, submit);
}

export async function NearIntentSwapExecuteFromStellar({
    originBlockchain,
    originSymbol,
    originAssetCode,
    originAssetIssuer,
    originDecimals,
    destinationBlockchain,
    destinationSymbol,
    amount,
    recipient,
    refundTo,
    recipientType,
    activeWalletAddress,
    slippageTolerance = 100,
    deadlineMinutes = 10,
    horizonUrl = STELLAR_URL.URL,
    networkPassphrase = Networks.PUBLIC,
    trustLimit,
    refundType = QuoteRequest.refundType.ORIGIN_CHAIN,
    depositType = QuoteRequest.depositType.ORIGIN_CHAIN,
    destinationSymbolAddress
}) {
    const lockKey = `stellar:${activeWalletAddress}`;
    if (inFlightSwaps.has(lockKey)) {
        return {
            success: false,
            data: null,
            error: formatError(new Error("A swap is already in progress for this wallet. Please wait.")),
        };
    }

    try {
        inFlightSwaps.add(lockKey);
        assertConfigured();

        assertPositiveAmount(amount);
        if (!activeWalletAddress || !StrKey.isValidEd25519PublicKey(activeWalletAddress)) {
            throw new Error(`Invalid Stellar activeWalletAddress: ${activeWalletAddress}`);
        }
        if (!Number.isFinite(originDecimals) || originDecimals < 0) {
            throw new Error(`Invalid originDecimals: ${originDecimals}`);
        }
        if (trustLimit !== undefined && Number(trustLimit) < Number(amount)) {
            throw new Error(`trustLimit (${trustLimit}) is lower than the swap amount (${amount})`);
        }

        const server = new Horizon.Server(horizonUrl);
        const trustlineActive = await hasTrustline(server, activeWalletAddress, originAssetCode, originAssetIssuer);

        // FIX: collapse the previous two-phase "create trustline, then
        // require caller to retry" flow into a single continuous operation.
        // Stellar's submitTransaction already waits for ledger inclusion,
        // so once the trustline tx returns successfully we can proceed
        // directly — removing an entire class of "caller forgot to retry /
        // app was closed mid-flow" bugs.
        if (!trustlineActive) {
            await sendTrustlineTx({
                activeWalletAddress,
                horizonUrl,
                networkPassphrase,
                assetCode: originAssetCode,
                assetIssuer: originAssetIssuer,
                limit: trustLimit,
            });
            logWarn("NearIntentSwapExecuteFromStellar", "Trustline established, proceeding to swap in same call");
        }

        const quoteResult = await getQuote({
            originBlockchain,
            originSymbol,
            destinationBlockchain,
            destinationSymbol,
            amount,
            recipient,
            refundTo: refundTo ?? activeWalletAddress,
            recipientType,
            slippageTolerance,
            deadlineMinutes,
            dry: false,
            depositMode: "MEMO",
            refundType,
            depositType,
            destinationSymbolAddress:destinationSymbolAddress,
            originSymbolAddress:originAssetIssuer,
        });

        if (!quoteResult.success) throw new Error(quoteResult.error.message);
        const quote = quoteResult.data;
        assertQuoteNotExpired(quote);

        const depositAddress = quote.quote.depositAddress;
        const amountSmallestUnit = quote.quote.amountIn;

        // Decimal-safe division instead of float math (Stellar amounts cap
        // at 7 decimal places).
        const amountDecimal = smallestUnitToDecimalString(amountSmallestUnit, originDecimals, 7);

        const txResponse = await sendDepositViaStellarSigner({
            activeWalletAddress,
            horizonUrl,
            networkPassphrase,
            depositAddress,
            assetCode: originAssetCode,
            assetIssuer: originAssetIssuer,
            amountDecimal,
            quote,
        });

        // As with the EVM path: once this on-chain payment succeeds, a
        // failure to register with the backend must not be reported as a
        // generic swap failure — funds have moved.
        try {
            await withRetry(
                () =>
                    withSdkAuth(() =>
                        OneClickService.submitDepositTx({
                            depositAddress,
                            txHash: txResponse.hash,
                            memo: quote.quote.depositMemo,
                        })
                    ),
                { retries: SUBMIT_DEPOSIT_RETRIES, label: "submitDepositTx (stellar)" }
            );
        } catch (submitErr) {
            logError("submitDepositTx failed after on-chain success (stellar)", submitErr);
            return {
                success: false,
                data: {
                    depositConfirmedOnChain: true,
                    txHash: txResponse.hash,
                    depositAddress,
                    depositMemo: quote.quote.depositMemo,
                    quote,
                },
                error: formatError(
                    new Error(
                        `Deposit succeeded on-chain (tx: ${txResponse.hash}) but failed to register with the ` +
                            `swap backend. This requires manual follow-up — do not resubmit the deposit.`
                    )
                ),
            };
        }

        return {
            success: true,
            data: {
                quote,
                txHash: txResponse.hash,
                finalStatus: "pending",
                depositAddress,
                depositMemo: quote.quote.depositMemo,
            },
            error: null,
        };
    } catch (error) {
        logError("NearIntentSwapExecuteFromStellar", error);
        return { success: false, data: null, error: formatError(error) };
    } finally {
        inFlightSwaps.delete(lockKey);
    }
}

/**
 * Converts a smallest-unit integer string to a fixed-precision decimal
 * string without floating point arithmetic, avoiding precision loss for
 * large amounts / high-decimal tokens.
 */
function smallestUnitToDecimalString(smallestUnit, decimals, maxPrecision) {
    let s = String(smallestUnit);
    const negative = s.startsWith("-");
    if (negative) s = s.slice(1);
    s = s.padStart(decimals + 1, "0");
    const intPart = s.slice(0, s.length - decimals) || "0";
    let fracPart = s.slice(s.length - decimals);
    if (fracPart.length > maxPrecision) {
        // Truncate (not round) excess precision — rounding up could exceed
        // the actual token balance being sent.
        fracPart = fracPart.slice(0, maxPrecision);
    }
    fracPart = fracPart.padEnd(maxPrecision, "0");
    const result = `${intPart}.${fracPart}`;
    return negative ? `-${result}` : result;
}

// ---------------------------------------------------------------------------
// Chain identifier canonicalization
// ---------------------------------------------------------------------------

export const NEARINTENT_ENUM = {
    ARB: "ARB",
    POL: "POL",
    OPT: "OP",
    AVAX: "AVAX",
    AVA: "AVAX",
    BASE: "BASE",
    BAS: "BASE",
    ETH: "ETH",
    BSC: "BSC",
    BNB: "BSC",
    STR: "STELLAR",
    SRB: "STELLAR",
};