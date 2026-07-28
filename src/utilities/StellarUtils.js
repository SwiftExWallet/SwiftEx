import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { STELLAR_URL } from '../Dashboard/constants';
const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);

// Function to calculate total reserved and available balance
export async function GetStellarAvilabelBalance(publicKey) {
  try {
    const account = await server.loadAccount(publicKey);
    
    // Match your exact buffer expectation
    const transactionBuffer = 0.022;  // Your original value
    
    const latestLedger = await server.ledgers().order('desc').limit(1).call();
    const baseReserve = parseFloat(latestLedger.records[0].base_reserve_in_stroops) / 10000000;
    
    const subentryCount = account.subentry_count || 0;
    const numSponsoring = account.num_sponsoring || 0;
    const numSponsored = account.num_sponsored || 0;
    
    const minBalance = (2 + subentryCount + numSponsoring - numSponsored) * baseReserve;
    
    let xlmBalance = 0;
    let sellingLiabilities = 0;
    account.balances.forEach((balance) => {
      if (balance.asset_type === "native") {
        xlmBalance = parseFloat(balance.balance);
        sellingLiabilities = parseFloat(balance.selling_liabilities || '0');
      }
    });
    
    const totalReserved = minBalance + sellingLiabilities;
    const availableBalance = Math.max(0, xlmBalance - totalReserved - transactionBuffer);
    
    const formatValue = (value) => value < 0 ? "0.0000000" : value.toFixed(7);
    
    return {
      availableBalance: formatValue(availableBalance),  // Now: "13.1842044"
      totalReserved: formatValue(totalReserved),
      details: { baseReserve: baseReserve.toFixed(7), subentryCount }
    };
    
  } catch (error) {
    console.error("Error:", error.message);
    return { availableBalance: 'Error', totalReserved: 'Error' };
  }
}





export async function GetStellarUSDCAvilabelBalance(publicKey,coinName,coinIssuer) {
  try {
    // Fetch account data
    const account = await server.loadAccount(publicKey);

    // Fetch active offers
    let assetOffersMap = new Map();

    try {
        const apiUrl = `${STELLAR_URL.URL}/accounts/${publicKey}/offers?limit=200&order=desc`;
        const response = await axios.get(apiUrl);
        const fetchedOffers = response.data._embedded?.records || [];
        
        fetchedOffers.forEach(offer => {
            if (offer.selling.asset_type !== "native") {
                const assetKey = `${offer.selling.asset_code}:${offer.selling.asset_issuer}`;
                const offerAmount = parseFloat(offer.amount);
                const currentAmount = assetOffersMap.get(assetKey) || 0;
                assetOffersMap.set(assetKey, currentAmount + offerAmount);
            }
        });

    } catch (offerError) {
        console.log('No active offers or Error: ', offerError.message);
    }

    const formatValue = (value) => {
        return value < 0 ? "0.00000" : value;
    };

    let selectedAsset = null;

    account.balances.forEach((balance) => {
        if (balance.asset_type !== "native" && balance.asset_code === coinName &&balance.asset_issuer===coinIssuer) {
            const assetKey = `${balance.asset_code}:${balance.asset_issuer}`;
            const totalBalance = parseFloat(balance.balance);
            const inOffers = assetOffersMap.get(assetKey) || 0;

            selectedAsset = {
                totalReserved: formatValue(inOffers),
                availableBalance: formatValue(totalBalance - inOffers),
                asset_type: balance.asset_type,
                asset_code: balance.asset_code,
                asset_issuer: balance.asset_issuer
            };
        }
    });

    if (!selectedAsset) {
        return { error: `Trust ${coinName} to use it in your wallet.`,status:false,tokenSymbole:coinName,tokenIssuer:coinIssuer,userPublicKey:publicKey};
    }

    return selectedAsset;

} catch (error) {
    console.error("Error fetching account details:", error.message);
    return { error: error.message };
}
}

export async function HandleStellarTrustLine(secretKey, assetCode, assetIssuer, addTrustline = true) {
  try {
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const publicKey = keypair.publicKey();
    const account = await server.loadAccount(publicKey);
    const asset = new StellarSdk.Asset(assetCode, assetIssuer);
    const transaction = new TransactionBuilder(account, {
      fee: await server.fetchBaseFee(),
      networkPassphrase: StellarSdk.Networks.PUBLIC,
    })
      .addOperation(
        addTrustline
          ? Operation.changeTrust({ asset })
          : Operation.changeTrust({ asset, limit: '0' })
      )
      .setTimeout(100)
      .build();
    transaction.sign(keypair);
    const txResult = await server.submitTransaction(transaction);
    console.log('updating trustline:', txResult);
    return { response: txResult, status: true };
  } catch (error) {
    console.error('Error updating trustline:', error);
    return { response: error, status: false };
  }
}

export const stellarWalletStatus = async (publicKey) => {
  try {
    await server.loadAccount(publicKey);
    return false;
  } catch (error) {
    return true;
  }
};

export const stellarWalletStatusWithUSDC = async (publicKey) => {
  try {
    const account = await server.loadAccount(publicKey);

    const hasUsdcTrustline = account.balances.some(
      (b) =>
        b.asset_code === "USDC" &&
        b.asset_issuer ===
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    );

    return !hasUsdcTrustline;
  } catch (error) {
    return true;
  }
};
