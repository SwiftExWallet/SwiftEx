import { NativeModules } from 'react-native';
import { ethers } from 'ethers';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';

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
    const bn = (v) => ethers.BigNumber.from(v ?? 0);
    const hl = (v) => ethers.utils.hexlify(v);
    return {
        nonce: hl(bn(tx.nonce)),
        gasPrice: hl(bn(tx.gasPrice ?? tx.maxFeePerGas ?? 0)),
        gasLimit: hl(bn(tx.gasLimit ?? 21000)),
        to: tx.to ?? '0x0000000000000000000000000000000000000000',
        value: hl(bn(tx.value ?? 0)),
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

    const result = await StellarSigner.signTransaction(xdr);

    let signedXDR = result?.signedXDR;

    if (!signedXDR && result?.signature && result?.publicKey) {
        const { TransactionBuilder, Networks } = require('@stellar/stellar-sdk');
        const networkPass = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
        const tx = TransactionBuilder.fromXDR(xdr, networkPass);
        const sigBuf = Buffer.from(result.signature, 'base64');
        tx.addSignature(result.publicKey, sigBuf.toString('base64'));
        signedXDR = tx.toXDR();
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

    const { Horizon, TransactionBuilder, Networks } = require('@stellar/stellar-sdk');
    const networkPass = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
    const horizonUrl = network === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org';
    const server = new Horizon.Server(horizonUrl);
    const horizonResult = await server.submitTransaction(TransactionBuilder.fromXDR(signedXDR, networkPass));

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