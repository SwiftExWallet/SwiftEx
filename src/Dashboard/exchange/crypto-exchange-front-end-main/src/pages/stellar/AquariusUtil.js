import * as StellarSdk from '@stellar/stellar-sdk';
import { AQUARIUS_BASE_API, SRB_MAINNET_ROUTER, SRB_RPC_URL, STELLAR_URL } from '../../../../../constants';
import { NativeModules } from 'react-native';

function assetContractId(asset, passphrase) {
    return asset.contractId(passphrase);
}

function toStroops(humanAmount) {
    return Math.round(parseFloat(humanAmount) * 1e7).toString();
}

async function fetchRoute({ assetIn, assetOut, amount }) {
    const networkPassphrase = StellarSdk.Networks.PUBLIC;
    const amountStr = amount.toString();
    const route = await (
        await fetch(`${AQUARIUS_BASE_API}/find-path/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token_in_address: assetContractId(assetIn, networkPassphrase),
                token_out_address: assetContractId(assetOut, networkPassphrase),
                amount: amountStr,
            }),
        })
    ).json();

    if (!route.success) throw new Error('No swap path found');
    return route;
}

function calcMinimumReceived(routeAmount, slippageBps) {
    const bpsDenominator = 10000n;
    const slippageFactor = bpsDenominator - BigInt(slippageBps);
    return (BigInt(routeAmount) * slippageFactor) / bpsDenominator;
}

async function GetAquariusSwapQuote({ assetIn, assetOut, amount, slippageBps = 100 }) {
    try {
        const amountStr = toStroops(amount);
        const route = await fetchRoute({ assetIn, assetOut, amount: amountStr });

        const inHuman = parseFloat(amount);
        const outHuman = route.amount / 1e7;
        const minimumReceived = calcMinimumReceived(route.amount, slippageBps);

        return {
            status: true,
            network: 'stellar',
            exchangeRate: (outHuman / inHuman).toFixed(7),
            slippageTolerance: `${(slippageBps / 100).toFixed(2)}%`,
            minimumReceived: (Number(minimumReceived) / 1e7).toFixed(7),
            output: outHuman
        };
    } catch (error) {
        console.error("error in GetAquariusSwapQuote:", error);
        return {
            status: false,
            network: 'stellar',
            exchangeRate: null,
            slippageTolerance: null,
            minimumReceived: null,
            output: null
        };
    }
}

async function ExecuteAquariusSwap({ publicKey, assetIn, assetOut, amount, slippageBps = 100, networkPassphrase = StellarSdk.Networks.PUBLIC }) {
    if (!assetIn) throw new Error('assetIn is required');
    if (!assetOut) throw new Error('assetOut is required');
    if (!amount) throw new Error('amount is required');
    if (!publicKey) throw new Error('publicKey is required');

    const horizonUrl = STELLAR_URL.URL;
    const rpcUrl = SRB_RPC_URL;
    const router = SRB_MAINNET_ROUTER;

    if (!horizonUrl) throw new Error('HORIZON_URL missing');
    if (!rpcUrl) throw new Error('SRB_RPC_URL missing');
    if (!router) throw new Error('SRB_MAINNET_ROUTER missing');

    try {
        const horizon = new StellarSdk.Horizon.Server(horizonUrl);
        const soroban = new StellarSdk.rpc.Server(rpcUrl);
        const amountStr = toStroops(amount);
        const route = await fetchRoute({ assetIn, assetOut, amount: amountStr });
        const outMinValue = calcMinimumReceived(route.amount, slippageBps);
        const account = await horizon.loadAccount(publicKey);

        function isTrusted(asset) {
            if (asset.isNative()) return true;
            return account.balances.some(
                (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer
            );
        }

        if (!isTrusted(assetIn)) {
            throw new Error(
                `Trustline missing for ${assetIn.code}:${assetIn.issuer}.`
            );
        }

        const balanceLine = account.balances.find(
            (b) => b.asset_code === assetIn.code && b.asset_issuer === assetIn.issuer
        );
        const available = parseFloat(balanceLine.balance);
        const required = Number(amountStr) / 1e7;
        if (available < required) {
            throw new Error(
                `Insufficient ${assetIn.code} balance: available ${available}, required ${required}.`
            );
        }

        const trustlineOps = [];
        if (!isTrusted(assetOut)) {
            trustlineOps.push(StellarSdk.Operation.changeTrust({ asset: assetOut }));
        }

        const txBuilder = new StellarSdk.TransactionBuilder(account, {
            fee: '10000',
            networkPassphrase,
        });

        for (const op of trustlineOps) {
            txBuilder.addOperation(op);
        }

        let swapTx = txBuilder
            .addOperation(
                new StellarSdk.Contract(router).call(
                    'swap_chained',
                    new StellarSdk.Address(publicKey).toScVal(),
                    StellarSdk.xdr.ScVal.fromXDR(route.swap_chain_xdr, 'base64'),
                    new StellarSdk.Address(assetContractId(assetIn, networkPassphrase)).toScVal(),
                    StellarSdk.nativeToScVal(amountStr, { type: 'u128' }),
                    StellarSdk.nativeToScVal(outMinValue, { type: 'u128' }),
                )
            )
            .setTimeout(300)
            .build();

        swapTx = await soroban.prepareTransaction(swapTx);

        const txXDR = swapTx.toXDR();
        const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
        swapTx.addSignature(signedTx.publicKey, signedTx.signature);
        const response = await horizon.submitTransaction(swapTx);

        let txResult;
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            txResult = await soroban.getTransaction(response.id);
            if (txResult.status !== 'NOT_FOUND') break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (!txResult || txResult.status === 'NOT_FOUND') {
            throw new Error(
                `Transaction status unknown after ${maxAttempts}s — check txHash manually: ${response.id}`
            );
        }
        if (txResult.status !== 'SUCCESS') {
            throw new Error(`Transaction failed on-chain with status: ${txResult.status}`);
        }

        const returnValue = txResult.resultMetaXdr.value().sorobanMeta().returnValue();
        const received = Number(StellarSdk.scValToNative(returnValue)) / 1e7;

        return {
            status: true,
            txHash: response.id,
            fromAsset: assetIn.code,
            toAsset: assetOut.code,
            amount: amount,
            received,
            txResult,
        };
    } catch (error) {
        console.error('error in Aquarius:', error);
        return {
            status: false,
            error: error.message || String(error),
            txHash: null,
            fromAsset: assetIn?.code ?? null,
            toAsset: assetOut?.code ?? null,
            amount: null,
        };
    }
}
export { GetAquariusSwapQuote, ExecuteAquariusSwap };