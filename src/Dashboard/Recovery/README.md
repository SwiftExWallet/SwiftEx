# 🔐 SwiftEx Wallet Recovery: Email-Guardian Recovery on Stellar (Mobile)

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-blue.svg?style=flat-square&logo=stellar)](https://stellar.org)
[![React Native](https://img.shields.io/badge/React_Native-Android_%7C_iOS-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![Node](https://img.shields.io/badge/Node.js-%E2%89%A5_22.11-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Signing](https://img.shields.io/badge/Signing-On--Device-emerald.svg?style=flat-square)](./docs/Architecture.md#-native-signing)
[![Backend](https://img.shields.io/badge/Backend-External-orange.svg?style=flat-square)](./docs/Architecture.md#-trust-boundaries)

> **SwiftEx Wallet Recovery** is the Stellar wallet-recovery feature of the SwiftEx React Native app. A wallet owner registers an **email guardian**, proves recovery intent through that email, waits through a **safety timelock**, and then completes a **recovery sweep** to a destination wallet. Transactions are signed on the device with the device-held Stellar key.

> [!IMPORTANT]
> This directory is a **feature module**, not a standalone app or service. Set up and run the complete SwiftEx mobile app before opening or testing recovery.

---

## 📚 Documentation Index

For in-depth guides and technical specifications, explore the dedicated documentation modules:

| Document | Description |
| :--- | :--- |
| 🏗️ [**Architecture & Integration Guide**](./docs/Architecture.md) | Component hierarchy, trust boundaries, signing, backend APIs, assets & reserve floor, sequence diagrams |
| ⚙️ [**Installation & Setup Guide**](./docs/Installation.md) | Prerequisites, Android/iOS setup, deployment configuration, validation, and troubleshooting |
| 🚀 [**End-to-End Walkthrough & Demo Guide**](./docs/DemoGuide.md) | Step-by-step instructions to register a guardian and run a full recovery demo |

---

## 💡 The Problem & The Solution

### The Problem
* **Lost access = lost assets:** Losing access to a Stellar wallet can leave its assets inaccessible.
* **Recovery needs proof:** A safe recovery path must confirm the real owner is asking, and must not let a stranger sweep funds instantly.

### The Solution
1. **Email Guardian:** The owner registers a recovery email for the wallet and selects which balances to protect.
2. **Proof Through Email:** Recovery intent is proven by sending an email from the registered inbox (or by submitting a DKIM-signed `.eml` as a manual fallback).
3. **Safety Timelock:** A delay separates proof from execution. The countdown follows the backend's `unlockAt` value.
4. **Recovery Sweep:** After the timelock, the owner executes recovery and the selected balances are swept to the destination wallet.

> [!NOTE]
> The client supports registration and recovery requests for selected Stellar balances. Proof verification, timelock enforcement, and asset movement depend on the **external backend and its deployed contracts**, which are not included in this directory.

---

## 🔄 How It Works

```
[ 1. Register Guardian ] ──> [ 2. Prove via Email ] ──> [ 3. Safety Timelock ] ──> [ 4. Execute Recovery ]
  Choose email + assets        Send from registered        Backend unlockAt           Balances swept to
  Sign on device, submit       inbox (or .eml upload)      countdown, auto-refresh    destination wallet
```

1. **Register Guardian:** Owner opens **Wallet Recovery → Set up recovery**, confirms the email, picks assets, and taps **Register on Stellar**. The backend prepares an unsigned transaction, the device signs it locally, and the app submits it to Stellar.
2. **Prove via Email:** Owner chooses **Recover my funds**, enters the original wallet and registered email, then uses **Open mail app** and sends from the registered inbox.
3. **Safety Timelock:** The app polls recovery status automatically while the timelock runs.
4. **Execute Recovery:** When the timelock expires, owner taps **Execute recovery** and verifies the swept balances.

---

## ✅ Scope: What Is and Isn't Here

| ✅ In this directory (client) | ❌ Not in this directory (external) |
| :--- | :--- |
| Wallet Recovery UI and local state | Proof verification |
| Registration, recovery and status flows | Timelock enforcement |
| Native-signing integration (Android / iOS) | Asset movement / sweep |
| API adapter for the recovery backend | Backend server and deployed contracts |

---

## ⚡ Quick Run

Run everything from the **repository root** of the complete SwiftEx app:

```bash
# Install dependencies
npm install

# iOS only: install CocoaPods dependencies
bundle install
cd ios && bundle exec pod install && cd ..

# Terminal 1: start Metro
npm start

# Terminal 2: launch the app
npm run android     # Android
npm run ios         # iOS
```

Connect or import an **activated** Stellar wallet, then open **Wallet Recovery** from the wallet area.

For full steps, see the [Installation & Setup Guide](./docs/Installation.md) and the [Demo Guide](./docs/DemoGuide.md).

> [!WARNING]
> Do not attempt to run this directory by itself.

---

## 📜 Key Components & Network Configuration

| Component | Identifier / Address | Details |
| :--- | :--- | :--- |
| **Recovery contract ID** | *Not defined in this client* | Obtain from the deployed recovery service |
| **Stellar anchors / issuer allowlist** | *Not defined in this client* | Backend / deployment responsibility |
| **Recovery backend** | *Provided by the app deployment* | Prepare, confirm, start, status, execute endpoints |
| **Stellar Horizon** | *Provided by the app deployment* | Account activation and balances |
| **Soroban RPC** | *Provided by the app deployment* | Submit and poll the registration transaction |
| **XLM reserve floor** | `20000000` (stroops, sent by the client) | Backend enforcement must be verified separately |

> [!CAUTION]
> Never place private keys, recovery-email contents, API tokens, or production secrets in documentation or source-controlled environment files.

---

## 🧪 Tests

```bash
npm test -- --runInBand __tests__/stellarRecoveryApi.test.js __tests__/WalletRecoveryModule.test.js

# Additional recovery helper suites
npm test -- --runInBand src/Dashboard/Recovery
```

These suites exercise client helpers and selected UI behavior with mocks. They do **not** establish that deployed contracts, email delivery, or a real asset sweep work. This documentation does not claim a successful native build or a live recovery demo.

---

<p align="center">
  Built for the <strong>SwiftEx</strong> mobile app on <strong>Stellar</strong>.<br/>
  Keys stay on the device. Recovery runs through an email guardian and a safety timelock.
</p>
