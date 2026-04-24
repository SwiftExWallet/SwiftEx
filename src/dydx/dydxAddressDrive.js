const { onboarding, LocalWallet, BECH32_PREFIX } = require('@dydxprotocol/v4-client-js');
const { Wallet } = require('ethers');

export async function dydxAddressDrive(walletKey) {
    try {
        const wallet = new Wallet(walletKey);
        const walletSignature = await wallet._signTypedData(
            { name: 'dYdX Chain', chainId: 1 },
            { dYdX: [{ name: 'action', type: 'string' }] },
            { action: 'dYdX Chain Onboarding' }
        );
        const { mnemonic, privateKey, publicKey } = onboarding.deriveHDKeyFromEthereumSignature(walletSignature);
        const drivedWallet = await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
        return {
            status: true,
            ethAddress: wallet.address,
            dydxAddress: drivedWallet.address,
            mnemonic: mnemonic,
            privateKey: Buffer.from(privateKey).toString('hex'),
            publicKey: Buffer.from(publicKey).toString('hex'),
            walletConnectSignature:walletSignature
        };
    } catch (error) {
        console.debug("error in dydxAddressDrive", error);
        return {
            status: false,
            error: error
        }
    }
}