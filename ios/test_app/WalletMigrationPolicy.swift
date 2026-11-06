import Foundation

enum WalletKeychainPolicy {
    static let currentService = "com.appSwiftEx.appStorage.v3"
    static let legacyServices = ["com.appSwiftEx.appStorage.v2", "com.appSwiftEx.appStorage"]

    static func activeWallet(read: (String) -> String?) -> String? {
        for service in [currentService] + legacyServices {
            if let wallet = read(service), !wallet.isEmpty {
                return wallet
            }
        }
        return nil
    }
}

enum LegacyWalletRead {
    case absent(source: String)
    case readable(source: String, wallets: String?, activeWallet: String?)
    case unreadable(source: String, reason: String)

    var source: String {
        switch self {
        case let .absent(source), let .readable(source, _, _), let .unreadable(source, _):
            return source
        }
    }
}

enum WalletMigrationDecision: Equatable {
    case freshInstall
    case migrate(wallets: String, activeWallet: String)
    case blocked(source: String, reason: String)
}

enum WalletMigrationCurrentState: Equatable {
    case alreadyMigrated
    case freshInstallComplete
    case needsMigration
}

enum WalletMigrationPolicy {
    static func currentState(
        markerSet: Bool,
        destinationWallets: String?,
        destinationActiveWallet: String?,
        legacyCandidatePresent: Bool
    ) -> WalletMigrationCurrentState {
        if markerSet,
           let wallets = destinationWallets,
           let active = destinationActiveWallet,
           validate(wallets: wallets, activeWallet: active) {
            return .alreadyMigrated
        }
        if markerSet,
           destinationWallets == nil,
           destinationActiveWallet == nil,
           !legacyCandidatePresent {
            return .freshInstallComplete
        }
        return .needsMigration
    }

    static func canCleanup(destinationVerified: Bool, markerCommitted: Bool) -> Bool {
        destinationVerified && markerCommitted
    }

    static func decide(_ reads: [LegacyWalletRead]) -> WalletMigrationDecision {
        guard !reads.isEmpty else {
            return .blocked(source: "migration", reason: "No wallet sources were inspected")
        }

        for read in reads {
            if case let .unreadable(source, reason) = read {
                return .blocked(source: source, reason: reason)
            }
        }

        let readable = reads.compactMap { read -> (String, String?, String?)? in
            guard case let .readable(source, wallets, active) = read else { return nil }
            return (source, wallets, active)
        }
        guard let first = readable.first else { return .freshInstall }
        guard let wallets = first.1 else {
            return .blocked(source: first.0, reason: "Wallet collection is missing")
        }
        guard let active = first.2 else {
            return .blocked(source: first.0, reason: "Active wallet is missing")
        }
        guard validate(wallets: wallets, activeWallet: active) else {
            return .blocked(source: first.0, reason: "Wallet data is invalid or inconsistent")
        }
        guard readable.dropFirst().allSatisfy({ $0.1 == wallets && $0.2 == active }) else {
            return .blocked(source: "migration", reason: "Wallet sources disagree")
        }
        return .migrate(wallets: wallets, activeWallet: active)
    }

    static func validate(wallets: String, activeWallet: String) -> Bool {
        guard
            let walletsData = wallets.data(using: .utf8),
            let activeData = activeWallet.data(using: .utf8),
            let walletArray = try? JSONSerialization.jsonObject(with: walletsData) as? [[String: Any]],
            !walletArray.isEmpty,
            let active = try? JSONSerialization.jsonObject(with: activeData) as? [String: Any]
        else { return false }

        let activeId = nonEmptyString(active["walletId"])
        let activeAddress = nonEmptyString(active["address"])
        guard activeId != nil || activeAddress != nil else { return false }

        return walletArray.contains { wallet in
            if let activeId { return nonEmptyString(wallet["walletId"]) == activeId }
            return nonEmptyString(wallet["address"]) == activeAddress
        }
    }

    private static func nonEmptyString(_ value: Any?) -> String? {
        guard let value = value as? String, !value.isEmpty else { return nil }
        return value
    }
}
