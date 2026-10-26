# SwiftEx Wallet

**A multichain mobile wallet for Stellar and EVM networks, with on-device signing.**

![React Native](https://img.shields.io/badge/React%20Native-Platform-61DAFB?logo=react&logoColor=black)
![Android](https://img.shields.io/badge/Android-supported-3DDC84?logo=android&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-supported-000000?logo=apple&logoColor=white)
![Stellar SDK](https://img.shields.io/badge/Stellar-SDK-7D00FF?logo=stellar&logoColor=white)
![WalletConnect](https://img.shields.io/badge/WalletConnect-v2-3B99FC?logo=walletconnect&logoColor=white)
![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-yellow.svg)

SwiftEx is built with React Native for Android and iOS. It brings Stellar and EVM-compatible accounts into a single wallet experience while keeping all transaction signing on the device.

---

## Table of Contents

- [Features](#features)
- [Stellar and EVM roles](#stellar-and-evm-roles)
- [Wallet recovery](#wallet-recovery)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Key dependencies](#key-dependencies)
- [Tests](#tests)
- [Building for production](#building-for-production)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [License](#license)

---

## Features

- 🌐 **Multichain wallets**: create or import wallets with a Stellar account and an EVM account side by side
- 📊 **Combined portfolio**: real-time balances, P&L analytics, and trade history across Stellar and EVM
- 💸 **Send and receive**: native assets and supported tokens
- ⭐ **Stellar DEX**: SDEX trading, AMM swaps, P&L dashboard, and offers management
- 🔁 **Swaps and bridges**: same-chain swaps and cross-chain transfers via Allbridge, Rango, and 1inch Fusion+
- 🔗 **WalletConnect v2**: connect to supported EVM and Stellar dApps
- ✅ **Stellar account tools**: account activation and asset trustlines
- 🔒 **Biometric security**: hardware-bound key storage (StrongBox on Android, Secure Enclave on iOS)
- 📧 **Email-guardian recovery**: recovery flow for activated Stellar wallets
- 💳 **USDC on/off ramp**: fiat access through RampProvider and Banxa

> [!NOTE]
> Network availability is feature-dependent. Send, receive, swap, bridge, and import options are driven by the chain configuration in the app.

---

## Stellar and EVM roles

A SwiftEx multichain wallet contains separate Stellar and EVM account identities. They are presented together in the app, but each follows its own network rules.

| Area | Stellar | EVM-compatible chains |
| :--- | :--- | :--- |
| Address | Stellar public key, beginning with `G` | Ethereum-style address, beginning with `0x` |
| Primary role | XLM and Stellar-issued assets, trustlines, Stellar trading flows, and wallet recovery | Native assets and tokens, swaps, bridges, and dApp connections |
| Supported networks | Stellar | Ethereum, BNB Smart Chain, Polygon, Arbitrum, Optimism, Avalanche, and Base |
| Network access | Horizon and Soroban RPC | Chain-specific JSON-RPC providers |
| Account requirement | The account must be activated before it can hold or transact with assets | The selected chain requires enough of its native token to pay gas |
| Signing | Signed locally with the device-held Stellar key | Signed locally with the device-held EVM key |

> [!IMPORTANT]
> The current repository configuration targets **test networks**. Chain IDs, RPC endpoints, token lists, and feature flags are defined in the app's network configuration. Review them before using a different environment.

---

## Wallet recovery

SwiftEx includes an email-guardian recovery flow for activated Stellar wallets:

1. The wallet owner registers a recovery email and selects the balances to protect.
2. Recovery intent is proven through the registered inbox, with a DKIM-signed email file available as a fallback.
3. A backend-provided safety timelock must expire.
4. The selected balances are swept to the destination Stellar wallet.

The mobile module provides the recovery UI, local state, on-device signing, and the backend adapter. Proof verification, timelock enforcement, and asset movement depend on an external recovery backend and deployed contracts.

For architecture, installation, demo steps, limitations, and recovery-specific tests, see the [Wallet Recovery documentation](./src/Dashboard/Recovery/README.md).

---

## Requirements

| Tool | Version |
| :--- | :--- |
| Node.js | 22.11 or newer |
| npm | 10 or newer |
| Android Studio | Hedgehog or newer |
| JDK | 17 |
| Xcode (iOS) | 15+ |
| CocoaPods (iOS) | 1.15 or newer |
| Ruby / Bundler (iOS) | 3.0 or newer |

**Android SDK**

- `minSdkVersion` 24
- `compileSdkVersion` 36
- `targetSdkVersion` 36
- Build Tools 36.0.0
- Kotlin 2.1.20

**iOS**

- Minimum deployment target: iOS 15.6

Follow the official [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) for the platform you want to run.

---

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/SwiftExWallet/SwiftEx.git
cd SwiftEx
```

### 2. Install dependencies

```bash
npm install
```

For iOS, also install the Ruby and CocoaPods dependencies:

```bash
bundle install
cd ios
bundle exec pod install
cd ..
```

### 3. Configure environment variables

Create a `.env` file in the repository root. Use the values below as a template and replace every placeholder with your own. Point the RPC endpoints at test networks unless you intentionally target another environment.

```bash
# RPC endpoints
BSC_RPC=<your_bsc_rpc_url>
MATIC_RPC=<your_polygon_rpc_url>
ETH_RPC=https://<network>.infura.io/v3/<YOUR_INFURA_KEY>
ETH_RPC_MAIN_NET=https://mainnet.infura.io/v3/<YOUR_INFURA_KEY>
INFURA_RPC=https://<network>.infura.io/v3/<YOUR_INFURA_KEY>

# Stellar
STELLAR_RPC=<your_horizon_url>
STELLAR_EXPERT_URL=https://stellar.expert

# Backend
PROXY_BACKEND_URL=<your_backend_url>
SERVER_BACKEND_URL=<your_backend_url>

# App config
USER_ENV=<development|production>
APP_LOCAL_TOKEN=exchange_user_token
FCM_TOKEN_KEY=fcm_token

# Biometric challenge
CHALLENGE_OPT_DATA=swiftex_wallet_v1

# WalletConnect
VPID_KEY=<your_walletconnect_project_id>

# Smart contracts
ONE_TAP_CONTRACT_ADD=<contract_address>
ONE_TAP_USDC_ADD=<usdc_address>

# Price APIs
COIN_GECKO_PRICE_URL=https://api.coingecko.com/api/v3
```

> [!WARNING]
> Never commit `.env` to version control. Make sure it is listed in `.gitignore`.

### 4. Run the app

Start Metro in one terminal:

```bash
npm start
```

Then launch the selected platform from another terminal:

```bash
npm run android
```

or:

```bash
npm run ios
```

To start Metro with a clean cache:

```bash
npx react-native start --reset-cache
```

---

## Key dependencies

| Package | Purpose |
| :--- | :--- |
| `@stellar/stellar-sdk` | Stellar blockchain integration |
| `ethers` (v5) | EVM transaction building |
| `@walletconnect/web3wallet` (v2) | dApp connectivity |
| `react-native-biometrics` | Hardware biometric auth |
| `react-native-vision-camera` | QR code scanning |
| `react-redux` | State management |
| `@react-navigation/native` | Screen navigation |
| `react-native-svg` | Charts and graphics |
| `react-native-modal` | Bottom sheets and modals |
| `react-native-snackbar` | Toast notifications |

---

## Tests

Run the Jest test suite from the repository root:

```bash
npm test -- --runInBand
```

Recovery-specific commands and their verification scope are documented in the [Wallet Recovery documentation](./src/Dashboard/Recovery/README.md).

---

## Building for production

**Android: release APK**

```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

**Android: release AAB (Play Store)**

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**iOS: archive for the App Store**

```bash
open ios/test_app.xcworkspace
# Product → Archive → Distribute App
```

---

## Troubleshooting

<details>
<summary><strong>Metro cache issues</strong></summary>

```bash
npx react-native start --reset-cache
```
</details>

<details>
<summary><strong>Android build fails (Firebase messaging)</strong></summary>

```bash
rm -rf node_modules
npm install
cd android && ./gradlew clean && cd ..
npm run android
```
</details>

<details>
<summary><strong>iOS pod issues</strong></summary>

```bash
cd ios
bundle exec pod deintegrate
bundle exec pod install
cd ..
```
</details>

<details>
<summary><strong>Watchman permission error</strong></summary>

```bash
watchman watch-del-all
watchman shutdown-server
```
</details>

<details>
<summary><strong>Slow Gradle builds</strong></summary>

Add the following to `~/.gradle/gradle.properties`:

```properties
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.jvmargs=-Xmx4g
```
</details>

---

## Security

- All wallet key operations go through the native modules; keys never live in JavaScript state.
- Seed phrases, private keys, and recovery material are never logged.
- Transactions on both Stellar and EVM are signed locally on the device.

---

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for details.