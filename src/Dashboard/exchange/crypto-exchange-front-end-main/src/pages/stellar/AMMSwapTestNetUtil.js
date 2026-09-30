import * as StellarSdk from '@stellar/stellar-sdk';
import { ENVIRONMENT, STELLAR_URL } from '../../../../../constants';
import { NativeModules } from 'react-native';
const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);

async function AMMSWAPTESTNET(
  fromTokenCode,
  fromTokenIssuer,
  toTokenCode,
  toTokenIssuer,
  sourcePublic,
  fromAmount,
  trustLineOpt
) {
  if (!sourcePublic) {
    return {
      status: false,
      tx: '',
      error: 'Missing secret key',
    };
  }

  try {

    const sourcePublicKey = sourcePublic;

    // Define sending asset
    const assetSend =
      fromTokenCode === 'XLM'
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(fromTokenCode, fromTokenIssuer);

    // Define destination asset
    const assetDest =
      toTokenCode === 'XLM'
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(toTokenCode, toTokenIssuer);

    // Load account
    const account = await server.loadAccount(sourcePublicKey);

    // Find paths
    const pathsResult = await server
      .strictSendPaths(assetSend, fromAmount, [assetDest])
      .call();

    if (pathsResult.records.length === 0) {
      throw new Error(`No path found from ${fromTokenCode} to ${toTokenCode}.`);
    }

    const bestPathRecord = pathsResult.records.sort(
      (a, b) => parseFloat(b.destination_amount) - parseFloat(a.destination_amount)
    )[0];

    const bestPath = bestPathRecord.path.map(p =>
      p.asset_type === 'native'
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(p.asset_code, p.asset_issuer)
    );

    const destMin = (parseFloat(bestPathRecord.destination_amount) * 0.99).toFixed(7);


    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: ENVIRONMENT==="TESTNET"?StellarSdk.Networks.TESTNET:StellarSdk.Networks.PUBLIC,
    });
  
    if (Array.isArray(trustLineOpt) && trustLineOpt.length > 0) {
      trustLineOpt.forEach(trustLineAsset => {
        const asset = new StellarSdk.Asset(
          trustLineAsset.tokenSymbole, 
          trustLineAsset.tokenIssuer
        );
        tx.addOperation(
          StellarSdk.Operation.changeTrust({
            asset: asset,
          })
        );
      });
    }
    
    tx.addOperation(
        StellarSdk.Operation.pathPaymentStrictSend({
          sendAsset: assetSend,
          sendAmount: fromAmount,
          destination: sourcePublicKey,
          destAsset: assetDest,
          destMin: destMin,
          path: bestPath,
        })
      );
    const transaction =tx.setTimeout(60).build();
    // Sign & submit
    const txXDR = transaction.toXDR();
    const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
    const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
    transaction.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
    const result = await server.submitTransaction(transaction);

    return {
      status: true,
      tx: result.hash,
    };
  } catch (err) {
    console.error('Transaction failed:', err);

    if (err.response?.data?.extras) {
      console.error('Result Codes:', err.response.data.extras.result_codes);
      console.error('Result XDR:', err.response.data.extras.result_xdr);
    }

    return {
      status: false,
      tx: '',
      error: err.response?.data?.extras||err.message,
    };
  }
}

module.exports = { AMMSWAPTESTNET };
