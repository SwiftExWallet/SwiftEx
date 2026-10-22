# ⚙️ Installation & Setup Guide: SwiftEx Wallet Recovery (Mobile)

This guide walks you through setting up the **Wallet Recovery** feature locally for development, testing, and evaluation.

> [!IMPORTANT]
> Recovery is **not** a standalone app. It depends on the full SwiftEx app's navigation, Redux wallet state, native modules, storage, and signer. Always run it from the **repository root** of the complete app.

---

## 📋 Prerequisites

Before you begin, ensure you have the following:

| Requirement | Details |
| :--- | :--- |
| **Node.js** | `22.11` or newer (the repository's declared minimum) |
| **npm** | Installed with Node.js |
| **React Native environment** | A complete Android and/or iOS development environment |
| **Device** | Android emulator/device or iOS Simulator/device |
| **Stellar wallet** | Connected, **activated**, with a valid public address |
| **Funds** | XLM for the Stellar account reserve and transaction fees |
| **Backend access** | The recovery backend used by the app deployment |

**Platform tooling**

| Platform | Requires |
| :--- | :--- |
| 🤖 Android | Android Studio, Android SDK, a compatible JDK |
| 🍎 iOS | macOS, Xcode, Ruby/Bundler, CocoaPods |

The parent app also needs its native dependencies and service configuration to build successfully.

---

## 🚀 Quick Setup Instructions

### 1. Get the Full SwiftEx App
Clone the complete SwiftEx mobile repository and open its **root directory**.

```bash
git clone https://github.com/SwiftExWallet/SwiftEx.git
cd SwiftEx
git checkout feature/zk-email-recovery
```
### 2. Install Dependencies
```bash
npm install
```

### 3. iOS Only: Install Ruby and CocoaPods Dependencies
```bash
bundle install
cd ios
bundle exec pod install
cd ..
```

---

## 🔑 Environment & Deployment Configuration

This recovery feature does **not** define a separate environment-variable interface. It receives its Stellar-network and recovery-backend connectivity from the parent application deployment.

For a working demo, the deployment owner must configure the complete app with:

- [ ] Reachable **Stellar Horizon** and **Soroban RPC** services
- [ ] A reachable **recovery backend** implementing the [expected endpoints](./ARCHITECTURE.md#2-recovery-backend-api)
- [ ] The **native Stellar signing** capability for the target platform

> [!CAUTION]
> Never place private keys, recovery-email contents, API tokens, or production secrets in documentation or source-controlled environment files.

---

## 🏃 Running the Application

### Start Metro
In one terminal:
```bash
npm start
```

### Install and Launch the App
In another terminal:
```bash
# Android
npm run android

# iOS
npm run ios
```

After the app is running, connect or import a Stellar wallet, then navigate to **Wallet Recovery** from the wallet area.

---

## 🩺 Troubleshooting

| Symptom | Likely cause | What to do |
| :--- | :--- | :--- |
| App won't build | Native dependencies or service config incomplete | Re-run the install steps from the repo root; for iOS re-run `bundle exec pod install` |
| Recovery screen not reachable | Wallet not connected | Connect or import a Stellar wallet first |
| Wallet isn't accepted | Account not activated or address invalid | Fund the account with XLM so it's activated, then reconnect |
| Backend calls fail | Backend not reachable from the device | Ask the deployment owner to confirm backend, Horizon and Soroban RPC access |
| Tests fail on mocks | Wrong working directory | Run the commands from the repository root |