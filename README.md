<div align="center">

# SwiftEx Wallet

**Multi-chain crypto wallet for Ethereum, BNB, Polygon, XRP, Stellar DEX and more.**

[![React Native](https://img.shields.io/badge/React%20Native-0.84.0-61DAFB?logo=react)](https://reactnative.dev)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-green)](https://reactnative.dev)
[![Android](https://img.shields.io/badge/Android-API%2024+-brightgreen?logo=android)](https://developer.android.com)
[![iOS](https://img.shields.io/badge/iOS-15.6+-blue?logo=apple)](https://developer.apple.com)
[![Stellar SDK](https://img.shields.io/badge/Stellar%20SDK-v16-blueviolet)](https://stellar.org)
[![WalletConnect](https://img.shields.io/badge/WalletConnect-v2-3B99FC)](https://walletconnect.com)

</div>

---

## Features

- **Multi-chain** — ETH, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche, XRP, Stellar
- **Stellar DEX** — SDEX trading, AMM swaps, P&L dashboard, offers management
- **WalletConnect v2** — Connect to any EVM or Stellar dApp
- **Cross-chain bridge** — Allbridge, Rango, 1inch Fusion+
- **Biometric security** — Hardware-bound key storage (StrongBox / Secure Enclave)
- **Portfolio tracking** — Real-time balances, P&L analytics, trade history
- **USDC on/off ramp** — Fiat access via RampProvider and Banxa

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 22.11 |
| npm | ≥ 10 |
| React Native CLI | latest |
| Android Studio | Hedgehog or newer |
| Xcode | 15+ |
| CocoaPods | ≥ 1.15 |
| Java (JDK) | 17 |
| Ruby | ≥ 3.0 (iOS) |

**Android SDK:**
- `minSdkVersion` 24
- `compileSdkVersion` 36
- `targetSdkVersion` 36
- Build Tools 36.0.0
- Kotlin 2.1.20

**iOS:**
- Minimum deployment target: **iOS 15.6**

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/SwiftExWallet/SwiftEx.git
cd SwiftEx
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
# RPC Endpoints
BSC_RPC=https://bsc-dataseed.binance.org/
MATIC_RPC=https://polygon-rpc.com/
ETH_RPC=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
ETH_RPC_MAIN_NET=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
INFURA_RPC=https://mainnet.infura.io/v3/YOUR_INFURA_KEY

# Stellar
STELLAR_RPC=https://horizon.stellar.org
STELLAR_EXPERT_URL=https://stellar.expert

# Backend
PROXY_BACKEND_URL=https://your-backend.com
SERVER_BACKEND_URL=https://your-backend.com

# App config
USER_ENV=production
APP_LOCAL_TOKEN=exchange_user_token
FCM_TOKEN_KEY=fcm_token

# Biometric challenge
CHALLENGE_OPT_DATA=swiftex_wallet_v1

# WalletConnect
VPID_KEY=your_walletconnect_project_id

# Smart Contracts
ONE_TAP_CONTRACT_ADD=0xYourContractAddress
ONE_TAP_USDC_ADD=0xYourUSDCAddress

# Price APIs
COIN_GECKO_PRICE_URL=https://api.coingecko.com/api/v3
```

> **Note:** Never commit `.env` to version control. Add it to `.gitignore`.

### 4. iOS setup

```bash
cd ios
pod install
cd ..
```

### 5. Run the app

**Android:**
```bash
npx react-native run-android
```

**iOS:**
```bash
npx react-native run-ios
```

**Start Metro separately:**
```bash
npx react-native start --reset-cache
```

---

## Project Structure

```
SwiftEx/
├── android/                    # Android native code
│   └── app/src/main/java/
│       └── com/app/
│           ├── StorageModule.kt
│           ├── StellarSigner.kt 
│           └── TransactionSigner.kt
├── ios/
│   └── test_app/
│       ├── AppStorageModule.swift
│       ├── StellarSigner.swift
│       └── TransactionSigner.swift
├── src/
│   ├── biometrics/
│   │   └── biometric.js
│   ├── components/Redux/
│   ├── Dashboard/
│   │   ├── exchange/
│   │   │   └── crypto-exchange-front-end-main/src/
│   │   │       ├── pages/stellar/
│   │   │       └── components/
│   │   ├── reusables/
│   │   │   └── PnlOverView.js
│   │   ├── tokens/
│   │   └── Wallets/
│   ├── Routes/
│   │   └── Navigation.js
│   ├── utilities/
│   │   ├── TokenUtils.js
│   │   ├── NativeSign.js
│   │   └── StellarUtils.js
│   └── Screens/                       # Splash, AppCheck, ThemeConfig
└── .env                               # Environment variables (not committed)
```

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `@stellar/stellar-sdk` v16 | Stellar blockchain integration |
| `ethers` v5 | EVM transaction building |
| `@walletconnect/web3wallet` v2 | dApp connectivity |
| `react-native-biometrics` | Hardware biometric auth |
| `react-native-vision-camera` | QR code scanning |
| `react-redux` | State management |
| `@react-navigation/native` | Screen navigation |
| `react-native-svg` | Charts and graphics |
| `react-native-modal` | Bottom sheets / modals |
| `react-native-snackbar` | Toast notifications |

---

## Building for Production

**Android (Release APK):**
```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

**Android (Release AAB for Play Store):**
```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**iOS (Archive for App Store):**
```bash
# Open Xcode
open ios/test_app.xcworkspace
# Product → Archive → Distribute App
```

---

## Troubleshooting

**Metro cache issues:**
```bash
npx react-native start --reset-cache
```

**Android build fails — Firebase messaging:**
```bash
rm -rf node_modules
npm install
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

**iOS pod issues:**
```bash
cd ios
pod deintegrate
pod install
cd ..
```

**Watchman permission error:**
```bash
watchman watch-del-all
watchman shutdown-server
```

**Gradle build slow:**
```bash
# Add to ~/.gradle/gradle.properties
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.jvmargs=-Xmx4g
```

---

## Contributing

1. Branch from `audit/security-fixes`
2. Follow existing code patterns
3. Never log private keys or mnemonics
4. All wallet key operations must go through native modules
5. Test on both Android and iOS before opening PR

---

## License

Private — SwiftEx Wallet. All rights reserved.
