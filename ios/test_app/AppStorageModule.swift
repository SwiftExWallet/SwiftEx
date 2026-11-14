import Foundation
import React
import Security
import LocalAuthentication
import UIKit
import CryptoKit
import CommonCrypto

struct SecretCopyPolicy {
    static let mnemonic = "mnemonic"
    static let ethereumPrivateKey = "ethereumPrivateKey"
    static let stellarPrivateKey = "stellarPrivateKey"
    static let clipboardClearDelay: TimeInterval = 60

    static func value(for wallet: [String: Any], type: String) -> String? {
        let key: String
        switch type {
        case mnemonic: key = "mnemonic"
        case ethereumPrivateKey: key = "privatekey"
        case stellarPrivateKey: key = "stellarPrivateKey"
        default: return nil
        }
        guard let value = wallet[key] as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return value
    }

    static func canClear(current: String?, copied: String) -> Bool {
        current == copied
    }
}

@objc(StorageModule)
class StorageModule: NSObject {
    private let serviceName   = "com.appSwiftEx.appStorage"
    private let serviceNameV2 = "com.appSwiftEx.appStorage.v3"
    private let legacySecureServiceV2 = "com.appSwiftEx.appStorage.v2"
    private let migrationKey  = "swiftex_h4_migrated_v2_safe"
    private let backupViewedAtKey = "lastWalletBackupViewedAt"
    private let pinRecoveryService = "com.appSwiftEx.pinRecovery.v1"
    private let pinRecoveryAccount = "recoveryEnvelope"
    private let pinRecoveryVersion = 1
    private let pinRecoveryIterations: UInt32 = 600000
    private let appPinVerifierService = "com.appSwiftEx.appPinVerifier.v1"
    private let appPinVerifierAccount = "verifier"

    @objc static func requiresMainQueueSetup() -> Bool { return false }

    @objc(setAppPin:resolver:rejecter:)
    func setAppPin(_ pin: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            guard !AppPinVerifierIOS.isConfigured() else {
                reject("PIN_ALREADY_SET", "Existing app PIN requires device authentication to replace", nil)
                return
            }
            guard pin.count == 6, pin.allSatisfy({ $0.isNumber }) else {
                throw SecureStorageError.invalidPin
            }
            var salt = Data(count: 16)
            _ = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
            let key = try derivePinKey(pin, salt: salt)
            let verifier = try JSONSerialization.data(withJSONObject: [
                "version": 1,
                "kdf": "PBKDF2-HMAC-SHA256",
                "iterations": pinRecoveryIterations,
                "salt": salt.base64EncodedString(),
                "verifier": key.withUnsafeBytes { Data($0).base64EncodedString() },
            ]).base64EncodedString()
            try saveToKeychain(key: appPinVerifierAccount, value: verifier, service: appPinVerifierService)
            _ = try AppPinVerifierIOS.recordDeviceSuccess()
            resolve(true)
        } catch {
            reject("PIN_STORAGE_ERROR", error.localizedDescription, error)
        }
    }

    @objc(validateAppPin:resolver:rejecter:)
    func validateAppPin(_ pin: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            resolve(try AppPinVerifierIOS.authenticate(pin).bridgeValue)
        } catch {
            reject("PIN_AUTH_ERROR", "Unable to validate app PIN", error)
        }
    }

    @objc(getPinAuthState:rejecter:)
    func getPinAuthState(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            var current = try PinAttemptGuardIOS.shared.current()
            if !AppPinVerifierIOS.isConfigured(),
               current.status != .backoff,
               current.status != .deviceCredentialRequired {
                current = PinAttemptResult(status: .notConfigured, state: current.state)
            }
            resolve(current.bridgeValue)
        } catch {
            reject("PIN_AUTH_ERROR", "Unable to read PIN authentication state", error)
        }
    }

    @objc(authenticateDeviceOwner:rejecter:)
    func authenticateDeviceOwner(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            reject("DEVICE_CREDENTIAL_UNAVAILABLE", "Set up a device screen lock to continue", error)
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication,
                               localizedReason: "Verify your device screen lock to unlock PIN-protected actions") {
            success, authError in
            guard success else {
                reject("AUTH_CANCELLED", authError?.localizedDescription ?? "Authentication cancelled", authError)
                return
            }
            do {
                _ = try AppPinVerifierIOS.recordDeviceSuccess()
                resolve(["success": true])
            } catch {
                reject("PIN_AUTH_ERROR", "Unable to reset PIN lock", error)
            }
        }
    }

    @objc(getTransactionAuthEnabled:rejecter:)
    func getTransactionAuthEnabled(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(TransactionAuthPolicyIOS.isEnabled())
    }

    @objc(setTransactionAuthEnabled:resolver:rejecter:)
    func setTransactionAuthEnabled(
        _ enabled: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let persist: () -> Void = {
            do {
                resolve(try TransactionAuthPolicyIOS.setEnabled(enabled))
            } catch {
                reject("TRANSACTION_AUTH_STORAGE_ERROR", error.localizedDescription, error)
            }
        }

        guard !enabled else {
            persist()
            return
        }

        authenticate(reason: "Authenticate to disable transaction signing protection") { result in
            do {
                try result.get()
                persist()
            } catch {
                reject(self.storageAuthCode(error), error.localizedDescription, error)
            }
        }
    }

    private func publicWallet(_ w: [String: Any]) -> [String: Any] {
        return [
            "address":          w["address"]          ?? NSNull(),
            "stellarPublicKey": w["stellarPublicKey"] ?? NSNull(),
            "name":             w["name"]             ?? NSNull(),
            "walletId":         w["walletId"]         ?? NSNull(),
            "walletType":       w["walletType"]       ?? NSNull(),
            "dydxAddress":      w["dydxAddress"]      ?? NSNull(),
        ]
    }

    private func formatBackupText(_ w: [String: Any]) -> String {
        var sections: [String] = []
        if let mnemonic = w["mnemonic"] as? String, !mnemonic.isEmpty {
            sections.append("Mnemonic Phrase\n\(mnemonic)")
        }
        if let privatekey = w["privatekey"] as? String, !privatekey.isEmpty {
            sections.append("Private Key\n\(privatekey)")
        }
        if let stellarPrivateKey = w["stellarPrivateKey"] as? String, !stellarPrivateKey.isEmpty {
            sections.append("Stellar Private Key\n\(stellarPrivateKey)")
        }
        return sections.joined(separator: "\n\n")
    }

    private func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
        let root = scenes
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController

        var top = root
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    private func authenticate(
        reason: String,
        _ completion: @escaping (Result<Void, Error>) -> Void
    ) {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            DispatchQueue.main.async {
                NativePinBottomSheet.show { pin in
                    guard let pin else {
                        completion(.failure(SecureStorageError.authenticationFailed))
                        return
                    }
                    do {
                        let result = try AppPinVerifierIOS.authenticate(pin)
                        if result.status == .success { completion(.success(())) }
                        else { completion(.failure(result.authenticationError)) }
                    } catch { completion(.failure(error)) }
                }
            }
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, authError in
            if success {
                do {
                    _ = try AppPinVerifierIOS.recordDeviceSuccess()
                    completion(.success(()))
                } catch { completion(.failure(error)) }
            } else {
                completion(.failure(authError ?? SecureStorageError.authenticationFailed))
            }
        }
    }

    private func authenticateForSecretView(_ completion: @escaping (Result<Void, Error>) -> Void) {
        authenticate(reason: "Authenticate to view secret backup", completion)
    }

    private func storageAuthCode(_ error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain.hasPrefix("PIN_") { return nsError.domain }
        if nsError.domain == LAError.errorDomain {
            switch LAError.Code(rawValue: nsError.code) {
            case .userCancel, .systemCancel, .appCancel, .userFallback:
                return "AUTH_CANCELLED"
            default:
                return "AUTH_FAILED"
            }
        }
        if case SecureStorageError.authenticationUnavailable = error {
            return "AUTH_UNAVAILABLE"
        }
        if case SecureStorageError.keychainError(let status) = error,
           status == errSecAuthFailed || status == errSecInteractionNotAllowed {
            return "AUTH_UNAVAILABLE"
        }
        return "AUTH_FAILED"
    }

    private func copySecretToClipboard(
        type: String,
        wallet: [String: Any],
        statusLabel: UILabel
    ) {
        guard let secret = SecretCopyPolicy.value(for: wallet, type: type) else {
            statusLabel.text = "That secret is unavailable."
            return
        }

        authenticate(reason: "Authenticate to copy wallet secret") { result in
            DispatchQueue.main.async {
                do {
                    try result.get()
                    let pasteboard = UIPasteboard.general
                    pasteboard.string = secret
                    let copyChangeCount = pasteboard.changeCount
                    statusLabel.text = "Secret copied. It will clear in 60 seconds."
                    DispatchQueue.main.asyncAfter(deadline: .now() + SecretCopyPolicy.clipboardClearDelay) {
                        guard pasteboard.changeCount == copyChangeCount,
                              SecretCopyPolicy.canClear(current: pasteboard.string, copied: secret) else { return }
                        pasteboard.string = ""
                    }
                } catch {
                    statusLabel.text = "Authentication cancelled or failed."
                }
            }
        }
    }

    private func makeBackupViewController(_ backupText: String, wallet: [String: Any]) -> UIViewController {
        let controller = UIViewController()
        controller.modalPresentationStyle = .fullScreen
        controller.view.backgroundColor = .systemBackground

        let root = UIStackView()
        root.axis = .vertical
        root.spacing = 16
        root.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(root)

        let header = UIStackView()
        header.axis = .horizontal
        header.alignment = .center
        header.spacing = 12

        let title = UILabel()
        title.text = "Secure Wallet Backup"
        title.font = .boldSystemFont(ofSize: 22)
        title.textColor = .label

        let closeButton = UIButton(type: .system)
        closeButton.setTitle("Close", for: .normal)
        closeButton.addAction(UIAction { [weak controller] _ in
            controller?.dismiss(animated: true)
        }, for: .touchUpInside)

        header.addArrangedSubview(title)
        header.addArrangedSubview(UIView())
        header.addArrangedSubview(closeButton)
        root.addArrangedSubview(header)

        let warning = UILabel()
        warning.text = "Keep these recovery details private. Anyone with access can control your wallet."
        warning.font = .systemFont(ofSize: 14)
        warning.textColor = .secondaryLabel
        warning.numberOfLines = 0
        root.addArrangedSubview(warning)

        let textView = UITextView()
        textView.text = backupText
        textView.font = .monospacedSystemFont(ofSize: 15, weight: .regular)
        textView.textColor = .label
        textView.backgroundColor = .secondarySystemBackground
        textView.layer.cornerRadius = 12
        textView.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
        textView.isEditable = false
        textView.isSelectable = false
        root.addArrangedSubview(textView)

        let statusLabel = UILabel()
        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0
        root.addArrangedSubview(statusLabel)

        let copyButtons: [(String, String)] = [
            (SecretCopyPolicy.mnemonic, "Copy Mnemonic"),
            (SecretCopyPolicy.ethereumPrivateKey, "Copy Ethereum Private Key"),
            (SecretCopyPolicy.stellarPrivateKey, "Copy Stellar Private Key"),
        ]
        for (type, title) in copyButtons where SecretCopyPolicy.value(for: wallet, type: type) != nil {
            let button = UIButton(type: .system)
            button.setTitle(title, for: .normal)
            button.addAction(UIAction { [weak self, weak statusLabel] _ in
                guard let statusLabel else { return }
                self?.copySecretToClipboard(type: type, wallet: wallet, statusLabel: statusLabel)
            }, for: .touchUpInside)
            root.addArrangedSubview(button)
        }

        NSLayoutConstraint.activate([
            root.topAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.topAnchor, constant: 20),
            root.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: 20),
            root.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor, constant: -20),
            root.bottomAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
        ])

        return controller
    }

    @objc
    func isMigrated(_ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            resolve(try getFromKeychain(key: migrationKey, service: serviceNameV2) != nil)
        } catch {
            resolve(false)
        }
    }

    @objc
    func migrateToSecureStorage(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        self.performSecureStorageMigration(resolve: resolve, reject: reject, isAuthenticated: false)
    }

    private func performSecureStorageMigration(resolve: @escaping RCTPromiseResolveBlock,
                                               reject: @escaping RCTPromiseRejectBlock,
                                               isAuthenticated: Bool) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                if try self.getFromKeychain(key: self.migrationKey, service: self.serviceNameV2) != nil {
                    DispatchQueue.main.async {
                        resolve(["success": true, "status": "already_migrated"])
                    }
                    return
                }
            } catch {
                DispatchQueue.main.async {
                    reject("MIGRATION_SOURCE_UNREADABLE", error.localizedDescription, error)
                }
                return
            }

            guard isAuthenticated else {
                DispatchQueue.main.async {
                    self.authenticateForSecretView { authResult in
                        do {
                            try authResult.get()
                            self.performSecureStorageMigration(
                                resolve: resolve,
                                reject: reject,
                                isAuthenticated: true
                            )
                        } catch {
                            reject(self.storageAuthCode(error), error.localizedDescription, error)
                        }
                    }
                }
                return
            }

            let destination = self.readWalletSource(source: "v3_destination", service: self.serviceNameV2)
            let secureV2 = self.readWalletSource(source: "secure_v2", service: self.legacySecureServiceV2)
            let legacy = self.readWalletSource(source: "legacy", service: self.serviceName)

            switch WalletMigrationPolicy.decide([destination, secureV2, legacy]) {
            case let .blocked(source, reason):
                DispatchQueue.main.async {
                    reject("MIGRATION_SOURCE_UNREADABLE", "\(source): \(reason)", nil)
                }
            case .freshInstall:
                do {
                    try self.commitMigrationMarker(value: "fresh")
                    DispatchQueue.main.async {
                        resolve(["success": true, "status": "fresh_install"])
                    }
                } catch {
                    DispatchQueue.main.async {
                        reject("MIGRATION_ERROR", error.localizedDescription, error)
                    }
                }
            case let .migrate(wallets, activeWallet):
                do {
                    let destinationAlreadyMatches: Bool
                    if case let .readable(_, currentWallets, currentActive) = destination {
                        destinationAlreadyMatches = currentWallets == wallets && currentActive == activeWallet
                    } else {
                        destinationAlreadyMatches = false
                    }

                    if !destinationAlreadyMatches {
                        try self.saveToKeychainSecure(key: "appAllWallet", value: wallets)
                        try self.saveToKeychainSecure(key: "activeUserWallet", value: activeWallet)
                    }

                    let verifiedWallets = try self.getFromKeychain(key: "appAllWallet", service: self.serviceNameV2)
                    let verifiedActive = try self.getFromKeychain(key: "activeUserWallet", service: self.serviceNameV2)
                    guard verifiedWallets == wallets,
                          verifiedActive == activeWallet,
                          WalletMigrationPolicy.validate(wallets: wallets, activeWallet: activeWallet) else {
                        throw SecureStorageError.migrationVerificationFailed
                    }

                    try self.commitMigrationMarker(value: "wallets")
                    guard WalletMigrationPolicy.canCleanup(destinationVerified: true, markerCommitted: true) else {
                        throw SecureStorageError.migrationVerificationFailed
                    }

                    try? self.deleteFromKeychain(key: "appAllWallet", service: self.serviceName)
                    try? self.deleteFromKeychain(key: "activeUserWallet", service: self.serviceName)
                    try? self.deleteFromKeychain(key: "appAllWallet", service: self.legacySecureServiceV2)
                    try? self.deleteFromKeychain(key: "activeUserWallet", service: self.legacySecureServiceV2)

                    DispatchQueue.main.async {
                        resolve(["success": true, "status": "migrated"])
                    }
                } catch {
                    DispatchQueue.main.async {
                        reject("MIGRATION_ERROR", error.localizedDescription, error)
                    }
                }
            }
        }
    }

    private func readWalletSource(source: String, service: String) -> LegacyWalletRead {
        do {
            let wallets = try getFromKeychain(key: "appAllWallet", service: service)
            let active = try getFromKeychain(key: "activeUserWallet", service: service)
            if wallets == nil && active == nil { return .absent(source: source) }
            return .readable(source: source, wallets: wallets, activeWallet: active)
        } catch {
            return .unreadable(source: source, reason: error.localizedDescription)
        }
    }

    private func commitMigrationMarker(value: String) throws {
        try saveToKeychainSecure(key: migrationKey, value: value)
        guard try getFromKeychain(key: migrationKey, service: serviceNameV2) == value else {
            throw SecureStorageError.migrationVerificationFailed
        }
    }

    private func saveToKeychainSecure(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else { throw SecureStorageError.encodingError }
        let lookup: [String: Any] = [
            kSecClass           as String: kSecClassGenericPassword,
            kSecAttrAccount     as String: key,
            kSecAttrService     as String: serviceNameV2,
        ]
        let updateStatus = SecItemUpdate(
            lookup as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw SecureStorageError.keychainError(status: updateStatus)
        }

        var query = lookup
        query.merge([
            kSecValueData       as String: data,
            kSecAttrAccessible  as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]) { _, new in new }

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw SecureStorageError.keychainError(status: status) }
    }

    private func saveToKeychain(key: String, value: String, service: String? = nil) throws {
        guard let data = value.data(using: .utf8) else { throw SecureStorageError.encodingError }
        let svc = service ?? serviceNameV2
        let lookup: [String: Any] = [
            kSecClass       as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: svc,
        ]
        let updateStatus = SecItemUpdate(
            lookup as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw SecureStorageError.keychainError(status: updateStatus)
        }

        var query = lookup
        query.merge([
            kSecValueData   as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]) { _, new in new }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw SecureStorageError.keychainError(status: status) }
    }

    private func getFromKeychain(key: String, service: String? = nil) throws -> String? {
        let svc = service ?? serviceNameV2
        let query: [String: Any] = [
            kSecClass           as String: kSecClassGenericPassword,
            kSecAttrAccount     as String: key,
            kSecAttrService     as String: svc,
            kSecReturnData      as String: true,
            kSecMatchLimit      as String: kSecMatchLimitOne,
            kSecUseOperationPrompt as String: "Authenticate to access wallet",
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw SecureStorageError.keychainError(status: status) }
        guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            throw SecureStorageError.decodingError
        }
        return value
    }

    private func deleteFromKeychain(key: String, service: String? = nil) throws {
        let svc = service ?? serviceNameV2
        let query: [String: Any] = [
            kSecClass       as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: svc,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw SecureStorageError.keychainError(status: status)
        }
    }

    private func derivePinKey(_ pin: String, salt: Data) throws -> SymmetricKey {
        guard pin.count == 6, pin.allSatisfy({ $0.isNumber }) else {
            throw SecureStorageError.invalidPin
        }
        var derived = Data(count: 32)
        let status = derived.withUnsafeMutableBytes { output in
            salt.withUnsafeBytes { saltBytes in
                pin.withCString { pinBytes in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        pinBytes,
                        pin.utf8.count,
                        saltBytes.bindMemory(to: UInt8.self).baseAddress,
                        salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                        pinRecoveryIterations,
                        output.bindMemory(to: UInt8.self).baseAddress,
                        32
                    )
                }
            }
        }
        guard status == kCCSuccess else { throw SecureStorageError.keyDerivationError }
        return SymmetricKey(data: derived)
    }

    private func encryptPinBackup(pin: String, payload: String) throws -> String {
        var salt = Data(count: 16)
        var nonce = Data(count: 12)
        _ = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
        _ = nonce.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 12, $0.baseAddress!) }
        let key = try derivePinKey(pin, salt: salt)
        let sealed = try AES.GCM.seal(Data(payload.utf8), using: key, nonce: AES.GCM.Nonce(data: nonce))
        return try JSONSerialization.data(withJSONObject: [
            "version": pinRecoveryVersion,
            "kdf": "PBKDF2-HMAC-SHA256",
            "iterations": pinRecoveryIterations,
            "salt": salt.base64EncodedString(),
            "nonce": nonce.base64EncodedString(),
            "ciphertext": sealed.combined!.base64EncodedString(),
        ]).base64EncodedString()
    }

    private func decryptPinBackup(pin: String, envelope: String) throws -> String {
        guard let data = Data(base64Encoded: envelope),
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              value["version"] as? Int == pinRecoveryVersion,
              value["kdf"] as? String == "PBKDF2-HMAC-SHA256",
              UInt32(value["iterations"] as? Int ?? 0) == pinRecoveryIterations,
              let saltText = value["salt"] as? String,
              let salt = Data(base64Encoded: saltText),
              let combinedText = value["ciphertext"] as? String,
              let combined = Data(base64Encoded: combinedText)
        else { throw SecureStorageError.invalidRecoveryBackup }
        let key = try derivePinKey(pin, salt: salt)
        let sealed = try AES.GCM.SealedBox(combined: combined)
        let clear = try AES.GCM.open(sealed, using: key)
        guard let payload = String(data: clear, encoding: .utf8) else {
            throw SecureStorageError.decodingError
        }
        return payload
    }

    private func pinRecoveryValue() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: pinRecoveryAccount,
            kSecAttrService as String: pinRecoveryService,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw SecureStorageError.keychainError(status: status)
        }
        return value
    }

    private func savePinRecoveryValue(_ value: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: pinRecoveryAccount,
            kSecAttrService as String: pinRecoveryService,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: pinRecoveryAccount,
            kSecAttrService as String: pinRecoveryService,
        ] as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw SecureStorageError.keychainError(status: status) }
    }

    private func getAllKeysFromKeychain() throws -> [String] {
        let query: [String: Any] = [
            kSecClass          as String: kSecClassGenericPassword,
            kSecAttrService    as String: serviceNameV2,
            kSecReturnAttributes as String: true,
            kSecMatchLimit     as String: kSecMatchLimitAll,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess else { throw SecureStorageError.keychainError(status: status) }
        guard let items = result as? [[String: Any]] else { return [] }
        return items.compactMap { $0[kSecAttrAccount as String] as? String }
    }

    private func clearAllFromKeychain() throws {
        let query: [String: Any] = [
            kSecClass       as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceNameV2,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw SecureStorageError.keychainError(status: status)
        }
    }

    @objc
    func createPinRecoveryBackup(_ pin: String,
                                 resolver resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let wallets = try self.getFromKeychain(key: "appAllWallet"),
                      let active = try self.getFromKeychain(key: "activeUserWallet") else {
                    throw SecureStorageError.decodingError
                }
                let payloadData = try JSONSerialization.data(withJSONObject: [
                    "appAllWallet": wallets,
                    "activeUserWallet": active,
                ])
                let payload = String(data: payloadData, encoding: .utf8)!
                let envelope = try self.encryptPinBackup(pin: pin, payload: payload)
                guard try self.decryptPinBackup(pin: pin, envelope: envelope) == payload else {
                    throw SecureStorageError.recoveryVerificationFailed
                }
                try self.savePinRecoveryValue(envelope)
                DispatchQueue.main.async { resolve(["success": true, "status": "created"]) }
            } catch {
                DispatchQueue.main.async { reject("RECOVERY_BACKUP_ERROR", error.localizedDescription, error) }
            }
        }
    }

    @objc
    func hasPinRecoveryBackup(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        do { resolve(try pinRecoveryValue() != nil) }
        catch { reject("RECOVERY_BACKUP_ERROR", error.localizedDescription, error) }
    }

    @objc
    func restoreFromPinRecoveryBackup(_ pin: String,
                                      resolver resolve: @escaping RCTPromiseResolveBlock,
                                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let pinResult = try AppPinVerifierIOS.authenticate(pin)
                guard pinResult.status == .success else { throw pinResult.authenticationError }
                guard let envelope = try self.pinRecoveryValue() else {
                    throw SecureStorageError.recoveryBackupMissing
                }
                guard let payloadData = try self.decryptPinBackup(pin: pin, envelope: envelope).data(using: .utf8),
                      let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: String],
                      let wallets = payload["appAllWallet"],
                      let active = payload["activeUserWallet"] else {
                    throw SecureStorageError.invalidRecoveryBackup
                }
                guard WalletMigrationPolicy.validate(wallets: wallets, activeWallet: active) else {
                    throw SecureStorageError.invalidRecoveryBackup
                }
                // This fallback service is device-unlock protected and app-PIN gated by JS.
                try self.saveToKeychain(key: "appAllWallet", value: wallets)
                try self.saveToKeychain(key: "activeUserWallet", value: active)
                guard try self.getFromKeychain(key: "appAllWallet") == wallets,
                      try self.getFromKeychain(key: "activeUserWallet") == active else {
                    throw SecureStorageError.migrationVerificationFailed
                }
                try self.commitMigrationMarker(value: "wallets")
                DispatchQueue.main.async { resolve(["success": true, "status": "restored"]) }
            } catch {
                let nsError = error as NSError
                let code = nsError.domain.hasPrefix("PIN_") ? nsError.domain : "RECOVERY_RESTORE_ERROR"
                DispatchQueue.main.async { reject(code, "PIN recovery failed", error) }
            }
        }
    }

    private static let walletListLock = NSLock()

    private func newWalletId(taken: Set<String>) -> String {
        var id: String
        repeat { id = UUID().uuidString } while taken.contains(id)
        return id
    }

    private func saveWalletList(_ arr: [[String: Any]]) throws {
        let data = try JSONSerialization.data(withJSONObject: arr)
        guard let str = String(data: data, encoding: .utf8) else { throw SecureStorageError.encodingError }
        try saveToKeychainSecure(key: "appAllWallet", value: str)
    }

    private func sameKeys(_ a: [String: Any], _ b: [String: Any]) -> Bool {
        (a["address"] as? String) == (b["address"] as? String) &&
        (a["stellarPublicKey"] as? String) == (b["stellarPublicKey"] as? String) &&
        (a["privatekey"] as? String) == (b["privatekey"] as? String)
    }

    private func loadWalletsWithUniqueIds() throws -> [[String: Any]]? {
        StorageModule.walletListLock.lock()
        defer { StorageModule.walletListLock.unlock() }

        guard let s = try getFromKeychain(key: "appAllWallet"),
              let d = s.data(using: .utf8),
              var arr = try JSONSerialization.jsonObject(with: d) as? [[String: Any]]
        else { return nil }

        var taken = Set(arr.compactMap { $0["walletId"] as? String })
        var seen = Set<String>()
        var changed = false
        for i in arr.indices {
            let id = arr[i]["walletId"] as? String ?? ""
            if id.isEmpty || seen.contains(id) {
                let fresh = newWalletId(taken: taken)
                taken.insert(fresh); seen.insert(fresh)
                arr[i]["walletId"] = fresh
                changed = true
            } else {
                seen.insert(id)
            }
        }
        guard changed else { return arr }

        try saveWalletList(arr)
        if let activeStr = try? getFromKeychain(key: "activeUserWallet"),
           let ad = activeStr.data(using: .utf8),
           let active = try? JSONSerialization.jsonObject(with: ad) as? [String: Any],
           let match = arr.first(where: { sameKeys($0, active) }) {
            let md = try JSONSerialization.data(withJSONObject: match)
            if let ms = String(data: md, encoding: .utf8) {
                try saveToKeychainSecure(key: "activeUserWallet", value: ms)
            }
        }
        return arr
    }

    private func indexOfWallet(_ arr: [[String: Any]], id: String) throws -> Int? {
        let matches = arr.indices.filter { (arr[$0]["walletId"] as? String) == id }
        if matches.count > 1 { throw SecureStorageError.decodingError }
        return matches.first
    }

    @objc
    func saveWallet(_ value: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let data = value.data(using: .utf8),
                      var newUser = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { throw SecureStorageError.decodingError }

                var usersArray = (try? self.loadWalletsWithUniqueIds()) ?? []

                let id = self.newWalletId(taken: Set(usersArray.compactMap { $0["walletId"] as? String }))
                newUser["walletId"] = id
                usersArray.append(newUser)
                try self.saveWalletList(usersArray)
                DispatchQueue.main.async { resolve(["success": true, "walletId": id]) }
            } catch { DispatchQueue.main.async { reject("SAVE_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func updateActiveWallet(_ id: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let arr = try self.loadWalletsWithUniqueIds() else { throw SecureStorageError.decodingError }

                guard let idx = try self.indexOfWallet(arr, id: id) else {
                    return DispatchQueue.main.async { reject("WALLET_ID_NOT_FOUND", "Wallet \(id) not found", nil) }
                }
                let matched = arr[idx]
                let info = try JSONSerialization.data(withJSONObject: matched)
                guard let str = String(data: info, encoding: .utf8) else { throw SecureStorageError.encodingError }
                try self.saveToKeychainSecure(key: "activeUserWallet", value: str)
                DispatchQueue.main.async { resolve(["success": true, "mode": "replace", "walletId": id]) }
            } catch { DispatchQueue.main.async { reject("UPDATE_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func getAllWallets(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let arr = try self.loadWalletsWithUniqueIds() else {
                    return DispatchQueue.main.async { resolve(["success": false, "wallets": []]) }
                }
                let filtered = arr.map { w -> [String: Any] in [
                    "walletId":         w["walletId"]         ?? NSNull(),
                    "name":             w["name"]             ?? NSNull(),
                    "address":          w["address"]          ?? NSNull(),
                    "stellarPublicKey": w["stellarPublicKey"] ?? NSNull(),
                    "walletType":       w["walletType"]       ?? NSNull(),
                    "dydxAddress":      w["dydxAddress"]      ?? NSNull(),
                ]}
                DispatchQueue.main.async { resolve(["success": true, "wallets": filtered]) }
            } catch { DispatchQueue.main.async { reject("GET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func getWalletAddress(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let s = try self.getFromKeychain(key: "activeUserWallet"),
                      let d = s.data(using: .utf8),
                      let w = try JSONSerialization.jsonObject(with: d) as? [String: Any]
                else { return DispatchQueue.main.async { resolve(["success": false, "wallet": NSNull()]) } }

                let resp: [String: Any] = [
                    "address":          w["address"]          ?? NSNull(),
                    "stellarPublicKey": w["stellarPublicKey"] ?? NSNull(),
                    "name":             w["name"]             ?? NSNull(),
                    "walletId":         w["walletId"]         ?? NSNull(),
                    "walletType":       w["walletType"]       ?? NSNull(),
                    "dydxAddress":      w["dydxAddress"]      ?? NSNull(),
                ]
                DispatchQueue.main.async { resolve(["success": true, "wallet": resp]) }
            } catch { DispatchQueue.main.async { reject("GET_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func getWalletInfo(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let s = try self.getFromKeychain(key: "activeUserWallet"),
                      let d = s.data(using: .utf8),
                      let w = try JSONSerialization.jsonObject(with: d) as? [String: Any]
                else { return DispatchQueue.main.async { resolve(["success": false, "wallet": NSNull()]) } }
                DispatchQueue.main.async { resolve(["success": true, "wallet": self.publicWallet(w)]) }
            } catch { DispatchQueue.main.async { reject("GET_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func openWalletBackupScreen(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        self.authenticateForSecretView { authResult in
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try authResult.get()
                guard let s = try self.getFromKeychain(key: "activeUserWallet"),
                      let d = s.data(using: .utf8),
                      let w = try JSONSerialization.jsonObject(with: d) as? [String: Any]
                else {
                    return DispatchQueue.main.async {
                        reject("GET_WALLET_ERROR", "No active wallet found", nil)
                    }
                }

                let backupText = self.formatBackupText(w)
                guard !backupText.isEmpty else {
                    return DispatchQueue.main.async {
                        reject("GET_WALLET_ERROR", "No backup data found", nil)
                    }
                }
                try self.saveToKeychainSecure(
                    key: self.backupViewedAtKey,
                    value: String(Int(Date().timeIntervalSince1970 * 1000))
                )

                    DispatchQueue.main.async {
                        guard let presenter = self.topViewController() else {
                            reject("VIEW_CONTROLLER_UNAVAILABLE", "No active view controller", nil)
                            return
                        }
                        presenter.present(self.makeBackupViewController(backupText, wallet: w), animated: true)
                        resolve(["success": true])
                }
            } catch {
                DispatchQueue.main.async {
                    reject(self.storageAuthCode(error), error.localizedDescription, error)
                }
                }
            }
        }
    }

    @objc
    func openWalletBackupScreenWithPin(_ pin: String,
                                       resolver resolve: @escaping RCTPromiseResolveBlock,
                                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let pinResult = try AppPinVerifierIOS.authenticate(pin)
                guard pinResult.status == .success else { throw pinResult.authenticationError }
                guard let envelope = try self.pinRecoveryValue(),
                      let payloadData = try self.decryptPinBackup(pin: pin, envelope: envelope).data(using: .utf8),
                      let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: String],
                      let backupActive = payload["activeUserWallet"] else {
                    throw SecureStorageError.invalidRecoveryBackup
                }
                let active = (try? self.getFromKeychain(key: "activeUserWallet")) ?? backupActive
                guard let activeData = active.data(using: .utf8),
                      let wallet = try JSONSerialization.jsonObject(with: activeData) as? [String: Any] else {
                    throw SecureStorageError.invalidRecoveryBackup
                }
                let backupText = self.formatBackupText(wallet)
                guard !backupText.isEmpty else { throw SecureStorageError.decodingError }
                try self.savePinRecoveryValue(envelope)
                try self.saveToKeychain(
                    key: self.backupViewedAtKey,
                    value: String(Int(Date().timeIntervalSince1970 * 1000))
                )
                DispatchQueue.main.async {
                    guard let presenter = self.topViewController() else {
                        reject("VIEW_CONTROLLER_UNAVAILABLE", "No active view controller", nil)
                        return
                    }
                    presenter.present(self.makeBackupViewController(backupText, wallet: wallet), animated: true)
                    resolve(["success": true])
                }
            } catch {
                let nsError = error as NSError
                let code = nsError.domain.hasPrefix("PIN_") ? nsError.domain : "OPEN_BACKUP_ERROR"
                DispatchQueue.main.async { reject(code, "PIN backup authentication failed", error) }
            }
        }
    }

    @objc
    func delete(_ id: String,
                resolver resolve: @escaping RCTPromiseResolveBlock,
                rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard var arr = try self.loadWalletsWithUniqueIds() else { throw SecureStorageError.decodingError }

                guard let idx = try self.indexOfWallet(arr, id: id) else {
                    return DispatchQueue.main.async { reject("WALLET_ID_NOT_FOUND", "Wallet \(id) not found", nil) }
                }
                arr.remove(at: idx)
                try self.saveWalletList(arr)
                DispatchQueue.main.async { resolve(["success": true, "wallet_removed": "wallet_removed","mode": "remove"]) }
            } catch { DispatchQueue.main.async { reject("REMOVE_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func renameWallet(_ id: String, name: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard var arr = try self.loadWalletsWithUniqueIds() else { throw SecureStorageError.decodingError }

                guard let idx = try self.indexOfWallet(arr, id: id) else {
                    return DispatchQueue.main.async { reject("WALLET_ID_NOT_FOUND", "Wallet \(id) not found", nil) }
                }
                arr[idx]["name"] = name
                try self.saveWalletList(arr)
                DispatchQueue.main.async { resolve(["success": true, "mode": "replace"]) }
            } catch { DispatchQueue.main.async { reject("UPDATE_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func getAllKeys(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let keys = try self.getAllKeysFromKeychain()
                DispatchQueue.main.async { resolve(["success": true, "keys": keys]) }
            } catch { DispatchQueue.main.async { reject("GET_ALL_KEYS_ERROR", error.localizedDescription, error) } }
        }
    }

    // MARK: - Perps: Aster agent (trading-only) key  (UNTESTED ON iOS)
    // Keychain items in a separate service, only for keys with the perps prefix, so these
    // methods can never touch wallet data. Not part of the PIN recovery backup. Never log values.
    private let perpsSecureService = "org.app.swiftEx.wallet.perps"
    private let perpsSecurePrefix = "perps_aster_agent_"

    private func isPerpsSecureKey(_ key: String) -> Bool {
        return key.count > perpsSecurePrefix.count && key.count <= 128 && key.hasPrefix(perpsSecurePrefix)
    }

    @objc(setSecureItem:value:resolver:rejecter:)
    func setSecureItem(_ key: String, value: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard isPerpsSecureKey(key) else { reject("SECURE_ITEM_KEY", "Key not allowed", nil); return }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                // saveToKeychain adds with kSecAttrAccessibleWhenUnlockedThisDeviceOnly.
                try self.saveToKeychain(key: key, value: value, service: self.perpsSecureService)
                DispatchQueue.main.async { resolve(true) }
            } catch { DispatchQueue.main.async { reject("SECURE_ITEM_WRITE", "Write failed", nil) } }
        }
    }

    @objc(getSecureItem:resolver:rejecter:)
    func getSecureItem(_ key: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard isPerpsSecureKey(key) else { reject("SECURE_ITEM_KEY", "Key not allowed", nil); return }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let value = try self.getFromKeychain(key: key, service: self.perpsSecureService)
                DispatchQueue.main.async { resolve(value ?? NSNull()) }
            } catch { DispatchQueue.main.async { reject("SECURE_ITEM_READ", "Read failed", nil) } }
        }
    }

    @objc(removeSecureItem:resolver:rejecter:)
    func removeSecureItem(_ key: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard isPerpsSecureKey(key) else { reject("SECURE_ITEM_KEY", "Key not allowed", nil); return }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.deleteFromKeychain(key: key, service: self.perpsSecureService)
                DispatchQueue.main.async { resolve(true) }
            } catch { DispatchQueue.main.async { reject("SECURE_ITEM_DELETE", "Delete failed", nil) } }
        }
    }

    private func clearPerpsSecureItems() {
        let query: [String: Any] = [
            kSecClass       as String: kSecClassGenericPassword,
            kSecAttrService as String: perpsSecureService,
        ]
        _ = SecItemDelete(query as CFDictionary)
    }

    @objc
    func clearAll(_ resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                self.clearPerpsSecureItems() // never throws; wallet clearing below is unchanged
                try self.clearAllFromKeychain()
                try self.deleteFromKeychain(key: self.appPinVerifierAccount, service: self.appPinVerifierService)
                try self.deleteFromKeychain(key: self.pinRecoveryAccount, service: self.pinRecoveryService)
                try PinAttemptGuardIOS.shared.clear()
                try TransactionAuthPolicyIOS.resetToDefault()
                DispatchQueue.main.async { resolve(["success": true]) }
            } catch { DispatchQueue.main.async { reject("CLEAR_ALL_ERROR", error.localizedDescription, error) } }
        }
    }
}

enum SecureStorageError: Error, LocalizedError {
    case encodingError
    case decodingError
    case accessControlError
    case keychainError(status: OSStatus)
    case authenticationUnavailable
    case authenticationFailed
    case invalidPin
    case keyDerivationError
    case invalidRecoveryBackup
    case recoveryBackupMissing
    case recoveryVerificationFailed
    case migrationVerificationFailed

    var errorDescription: String? {
        switch self {
        case .encodingError:       return "Failed to encode data"
        case .decodingError:       return "Failed to decode data"
        case .accessControlError:  return "Failed to create access control"
        case .keychainError(let s): return "Keychain error: \(s)"
        case .authenticationUnavailable: return "Device authentication is not available"
        case .authenticationFailed: return "Authentication failed"
        case .invalidPin: return "PIN must contain 6 digits"
        case .keyDerivationError: return "Failed to derive recovery key"
        case .invalidRecoveryBackup: return "Invalid recovery backup"
        case .recoveryBackupMissing: return "No PIN recovery backup found"
        case .recoveryVerificationFailed: return "Recovery backup verification failed"
        case .migrationVerificationFailed: return "Wallet migration verification failed"
        }
    }
}
