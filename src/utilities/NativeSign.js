import { NativeModules } from 'react-native';
import { ethers } from 'ethers';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';
import { TransactionBuilder, Networks, Horizon } from '@stellar/stellar-sdk/axios';
import { parseQuantity } from './signingReview';
const { TransactionSigner, StellarSigner } = NativeModules;

const assertModule = (mod, name) => {
    if (!mod) throw new Error(`Native module "${name}" not found.`);
};

const BROADCAST_CHAIN_MAP = {
    ETH: 'ETH',
    BSC: 'BSC',
    BNB: 'BNB',
    POL: 'POL',
    ARB: 'ARB',
    OPT: 'OPT',
    BASE: 'BAS',
    AVAX: 'AVA',
    STR: 'SRB',
};

const getBroadcastChain = (chainConfig) => {
    const key = chainConfig.symbol ?? chainConfig.subName ?? '';
    return BROADCAST_CHAIN_MAP[key.toUpperCase()] ?? key;
};

const getRpcUrls = (chainConfig) =>
    [chainConfig.rpcUrl, ...(chainConfig.backupRPCUrls || [])].filter(Boolean);

const withRpcFallback = async (chainConfig, fn) => {
    const urls = getRpcUrls(chainConfig);
    let lastErr;
    for (const url of urls) {
        try {
            return await fn(new ethers.providers.JsonRpcProvider(url));
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr ?? new Error(`All RPC endpoints failed for ${chainConfig.name}`);
};

const normalizeTx = (tx) => {
    const { gas, from, ...rest } = tx;
    return {
        ...rest,
        ...(gas !== undefined && rest.gasLimit === undefined ? { gasLimit: gas } : {}),
        value: rest.value ?? '0x0',
    };
};

const buildHexTx = (tx) => {
    // Strict parsing (same helper the approval screens use) so a value can't be read
    // one way for display and another way for signing.
    const hl = (v) => ethers.utils.hexlify(v);
    if (!tx.to || !ethers.utils.isAddress(tx.to)) throw new Error('Invalid or missing "to" address');
    return {
        nonce: hl(parseQuantity(tx.nonce, 'nonce')),
        gasPrice: hl(parseQuantity(tx.gasPrice ?? tx.maxFeePerGas, 'gasPrice')),
        gasLimit: hl(parseQuantity(tx.gasLimit ?? 21000, 'gasLimit')),
        to: tx.to,
        value: hl(parseQuantity(tx.value, 'value')),
        data: tx.data || '0x',
        chainId: Number(tx.chainId),
    };
};

const _signEVMTx = async ({ chainConfig, walletAddress, tx, signOnly }) => {
    assertModule(TransactionSigner, 'TransactionSigner');

    const hexTx = buildHexTx(normalizeTx(tx));

    const nativeResult = await TransactionSigner.signTransaction(
        chainConfig.nativeChainKey,
        walletAddress,
        JSON.stringify(hexTx),
        Number(chainConfig.chainId)
    );

    if (!nativeResult?.signedTx) throw new Error('signTransaction returned no signedTx');

    let signedTx = nativeResult.signedTx;
    if (signedTx.startsWith('0x0x')) signedTx = signedTx.replace(/^0x/, '');

    if (signOnly) return { signedTx };

    const stripped = signedTx.startsWith('0x') ? signedTx.slice(2) : signedTx;

    // const { res, err } = await proxyRequest('/v1/eth/transaction/broadcast', PPOST, {
    //     signedTransactions: [stripped],
    //     broadcastChain: getBroadcastChain(chainConfig),
    // });

    // if (!err?.status) {
    //     const txHash = res?.results?.[0]?.transactionHash;
    //     if (txHash) return { txHash };
    // }

    const txHash = await withRpcFallback(chainConfig, async (provider) => {
        const txResponse = await provider.sendTransaction(signedTx);
        return txResponse.hash;
    });
    return { txHash };
};

const normalizeDomain = (domain) => {
    if (!domain) return domain;
    const d = { ...domain };
    if (d.chainId !== undefined && d.chainId !== null) {
        const s = String(d.chainId);
        d.chainId = s.startsWith('0x') || s.startsWith('0X')
            ? parseInt(s, 16)
            : parseInt(s, 10);
    }
    return d;
};

const _signEIP712 = async ({ chainName, walletAddress, typedData }) => {
    assertModule(TransactionSigner, 'TransactionSigner');

    const result = await TransactionSigner.signTypedData(
        chainName.toLowerCase(),
        walletAddress,
        JSON.stringify({
            primaryType: typedData.primaryType,
            types: typedData.types,
            domain: normalizeDomain(typedData.domain),
            message: typedData.message,
        })
    );

    if (!result?.signature) throw new Error('signTypedData returned no signature');
    return { signature: result.signature };
};

const _signPersonalMessage = async ({ chainName, walletAddress, message }) => {
    assertModule(TransactionSigner, 'TransactionSigner');

    const messageHex = typeof message === 'string' && !message.startsWith('0x')
        ? ethers.utils.hexlify(ethers.utils.toUtf8Bytes(message))
        : (message ?? '0x');

    const result = await TransactionSigner.signPersonalMessage(
        chainName.toLowerCase(),
        walletAddress,
        messageHex
    );

    if (!result?.signature) throw new Error('signPersonalMessage returned no signature');
    return { signature: result.signature };
};

const _signStellarXDR = async ({ xdr, submit = false, network = 'public' }) => {
    assertModule(StellarSigner, 'StellarSigner');
    if (network !== 'public' && network !== 'testnet') {
        throw new Error(`Unsupported Stellar network: ${network}`);
    }
    if (typeof StellarSigner.signTransactionForNetwork !== 'function') {
        throw new Error('Native StellarSigner is outdated: signTransactionForNetwork missing');
    }

    // The native side signs with the passphrase for `network`, so a Testnet request
    // can never yield a Mainnet-valid signature.
    const result = await StellarSigner.signTransactionForNetwork(xdr, network);

    let signedXDR = result?.signedXDR;

    if (!signedXDR && result?.signature && result?.publicKey) {
        const networkPass = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
        const tx = TransactionBuilder.fromXdr(xdr, networkPass);
        const sigBuf = Buffer.from(result.signature, 'base64');
        tx.addSignature(result.publicKey, sigBuf.toString('base64'));
        signedXDR = tx.toXdr();
    }

    if (!signedXDR) throw new Error('StellarSigner returned no signedXDR');

    if (!submit) {
        return {
            signedXDR,
            signature: result.signature,
            publicKey: result.publicKey,
            hash: result.hash,
        };
    }

    const networkPass = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
    const horizonUrl = network === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org';
    const server = new Horizon.Server(horizonUrl);
    const horizonResult = await server.submitTransaction(TransactionBuilder.fromXdr(signedXDR, networkPass));

    return {
        signedXDR,
        signature: result.signature,
        publicKey: result.publicKey,
        hash: horizonResult.hash ?? result.hash,
        horizonResult,
    };
};

export const nativeSign = async (descriptor) => {
    if (!descriptor?.type) throw new Error('descriptor.type is required');
    switch (descriptor.type) {
        case 'evm_tx': return _signEVMTx({ ...descriptor, signOnly: false });
        case 'evm_sign_only': return _signEVMTx({ ...descriptor, signOnly: true });
        case 'eip712': return _signEIP712(descriptor);
        case 'personal_msg': return _signPersonalMessage(descriptor);
        case 'stellar_xdr': return _signStellarXDR(descriptor);
        default: throw new Error(`Unknown signing type: "${descriptor.type}"`);
    }
};

export default nativeSign;