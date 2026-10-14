import Foundation
import React
import Security
import LocalAuthentication
import UIKit
import CryptoKit
import CommonCrypto

@objc(StorageModule)
class StorageModule: NSObject {
    private let serviceName   = "com.appSwiftEx.appStorage"
    private let serviceNameV2 = "com.appSwiftEx.appStorage.v2"
    private let migrationKey  = "swiftex_h4_migrated_v1"
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
            resolve(true)
        } catch {
            reject("PIN_STORAGE_ERROR", error.localizedDescription, error)
        }
    }

    @objc(validateAppPin:resolver:rejecter:)
    func validateAppPin(_ pin: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            guard let encoded = try getFromKeychain(key: appPinVerifierAccount, service: appPinVerifierService),
                  let data = Data(base64Encoded: encoded),
                  let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let saltText = value["salt"] as? String,
                  let salt = Data(base64Encoded: saltText),
                  let expectedText = value["verifier"] as? String,
                  let expected = Data(base64Encoded: expectedText) else {
                resolve(false)
                return
            }
            let actual = try derivePinKey(pin, salt: salt)
            resolve(actual.withUnsafeBytes { actualBytes in
                expected.withUnsafeBytes { expectedBytes in
                    actualBytes.elementsEqual(expectedBytes)
                }
            })
        } catch {
            resolve(false)
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

    private func authenticateForSecretView(_ completion: @escaping (Result<Void, Error>) -> Void) {
        let context = LAContext()
        let reason = "Authenticate to view secret backup"
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            DispatchQueue.main.async {
                NativePinBottomSheet.show { pin in
                    guard let pin, AppPinVerifierIOS.validate(pin) else {
                        completion(.failure(SecureStorageError.authenticationFailed))
                        return
                    }
                    completion(.success(()))
                }
            }
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, authError in
            if success {
                completion(.success(()))
            } else {
                completion(.failure(authError ?? SecureStorageError.authenticationFailed))
            }
        }
    }

    private func storageAuthCode(_ error: Error) -> String {
        let nsError = error as NSError
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

    private func makeBackupViewController(_ backupText: String) -> UIViewController {
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
        let done = (try? getFromKeychain(key: migrationKey, service: serviceNameV2)) != nil
        resolve(done)
    }

    @objc
    func migrateToSecureStorage(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        self.authenticateForSecretView { authResult in
            do {
                try authResult.get()
                self.performSecureStorageMigration(resolve: resolve, reject: reject)
            } catch {
                reject(self.storageAuthCode(error), error.localizedDescription, error)
            }
        }
    }

    private func performSecureStorageMigration(resolve: @escaping RCTPromiseResolveBlock,
                                               reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            if (try? self.getFromKeychain(key: self.migrationKey, service: self.serviceNameV2)) != nil {
                DispatchQueue.main.async {
                    resolve(["success": true, "status": "already_migrated"])
                }
                return
            }

            let legacyWallets = try? self.getFromKeychain(key: "appAllWallet",service: self.serviceName)
            let legacyActive  = try? self.getFromKeychain(key: "activeUserWallet", service: self.serviceName)

            if legacyWallets == nil && legacyActive == nil {
                try? self.saveToKeychainSecure(key: self.migrationKey, value: "1")
                DispatchQueue.main.async {
                    resolve(["success": true, "status": "fresh_install"])
                }
                return
            }

            do {
                if let w = legacyWallets { try self.saveToKeychainSecure(key: "appAllWallet",     value: w) }
                if let a = legacyActive  { try self.saveToKeychainSecure(key: "activeUserWallet", value: a) }
                try self.saveToKeychainSecure(key: self.migrationKey, value: "1")
                try? self.deleteFromKeychain(key: "appAllWallet",     service: self.serviceName)
                try? self.deleteFromKeychain(key: "activeUserWallet", service: self.serviceName)

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

    private func saveToKeychainSecure(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else { throw SecureStorageError.encodingError }

        try? deleteFromKeychain(key: key, service: serviceNameV2)

        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .biometryCurrentSet,
            &error
        ) else {
            throw SecureStorageError.accessControlError
        }

        let query: [String: Any] = [
            kSecClass           as String: kSecClassGenericPassword,
            kSecAttrAccount     as String: key,
            kSecAttrService     as String: serviceNameV2,
            kSecValueData       as String: data,
            kSecAttrAccessControl as String: access,
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw SecureStorageError.keychainError(status: status) }
    }

    private func saveToKeychain(key: String, value: String, service: String? = nil) throws {
        guard let data = value.data(using: .utf8) else { throw SecureStorageError.encodingError }
        let svc = service ?? serviceNameV2
        try? deleteFromKeychain(key: key, service: svc)

        let query: [String: Any] = [
            kSecClass       as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: svc,
            kSecValueData   as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
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
                guard let envelope = try self.pinRecoveryValue() else {
                    throw SecureStorageError.recoveryBackupMissing
                }
                guard let payloadData = try self.decryptPinBackup(pin: pin, envelope: envelope).data(using: .utf8),
                      let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: String],
                      let wallets = payload["appAllWallet"],
                      let active = payload["activeUserWallet"] else {
                    throw SecureStorageError.invalidRecoveryBackup
                }
                guard let walletData = wallets.data(using: .utf8),
                      let activeData = active.data(using: .utf8),
                      (try JSONSerialization.jsonObject(with: walletData)) is [[String: Any]],
                      (try JSONSerialization.jsonObject(with: activeData)) is [String: Any] else {
                    throw SecureStorageError.invalidRecoveryBackup
                }
                // This fallback service is device-unlock protected and app-PIN gated by JS.
                try self.saveToKeychain(key: "appAllWallet", value: wallets)
                try self.saveToKeychain(key: "activeUserWallet", value: active)
                try self.saveToKeychain(key: self.migrationKey, value: "1")
                DispatchQueue.main.async { resolve(["success": true, "status": "restored"]) }
            } catch {
                DispatchQueue.main.async { reject("RECOVERY_RESTORE_ERROR", "PIN recovery failed", error) }
            }
        }
    }

    @objc
    func saveWallet(_ value: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let data = value.data(using: .utf8),
                      let newUser = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { throw SecureStorageError.decodingError }

                var usersArray: [[String: Any]] = []
                if let existing = try? self.getFromKeychain(key: "appAllWallet"),
                   let d = existing.data(using: .utf8),
                   let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] {
                    usersArray = arr
                }
                usersArray.append(newUser)
                let updated = try JSONSerialization.data(withJSONObject: usersArray)
                guard let str = String(data: updated, encoding: .utf8) else { throw SecureStorageError.encodingError }
                try self.saveToKeychainSecure(key: "appAllWallet", value: str)
                DispatchQueue.main.async { resolve(["success": true]) }
            } catch { DispatchQueue.main.async { reject("SAVE_WALLET_ERROR", error.localizedDescription, error) } }
        }
    }

    @objc
    func updateActiveWallet(_ id: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let s = try self.getFromKeychain(key: "appAllWallet"),
                      let d = s.data(using: .utf8),
                      let arr = try JSONSerialization.jsonObject(with: d) as? [[String: Any]]
                else { throw SecureStorageError.decodingError }

                guard let matched = arr.first(where: { ($0["walletId"] as? String) == id }) else {
                    return DispatchQueue.main.async { reject("WALLET_ID_NOT_FOUND", "Wallet \(id) not found", nil) }
                }
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
                guard let s = try self.getFromKeychain(key: "appAllWallet"),
                      let d = s.data(using: .utf8),
                      let arr = try JSONSerialization.jsonObject(with: d) as? [[String: Any]]
                else {
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
                        presenter.present(self.makeBackupViewController(backupText), animated: true)
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
                    presenter.present(self.makeBackupViewController(backupText), animated: true)
                    resolve(["success": true])
                }
            } catch {
                DispatchQueue.main.async { reject("OPEN_BACKUP_ERROR", "PIN backup authentication failed", error) }
            }
        }
    }

    @objc
    func delete(_ id: String,
                resolver resolve: @escaping RCTPromiseResolveBlock,
                rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let s = try self.getFromKeychain(key: "appAllWallet"),
                      let d = s.data(using: .utf8),
                      var arr = try JSONSerialization.jsonObject(with: d) as? [[String: Any]]
                else { throw SecureStorageError.decodingError }

                guard arr.contains(where: { ($0["walletId"] as? String) == id }) else {
                    return DispatchQueue.main.async { reject("WALLET_ID_NOT_FOUND", "Wallet \(id) not found", nil) }
                }
                arr.removeAll { ($0["walletId"] as? String) == id }
                let updated = try JSONSerialization.data(withJSONObject: arr)
                guard let str = String(data: updated, encoding: .utf8) else { throw SecureStorageError.encodingError }
                try self.saveToKeychainSecure(key: "appAllWallet", value: str)
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
                guard let s = try self.getFromKeychain(key: "appAllWallet"),
                      let d = s.data(using: .utf8),
                      var arr = try JSONSerialization.jsonObject(with: d) as? [[String: Any]]
                else { throw SecureStorageError.decodingError }

                guard let idx = arr.firstIndex(where: { ($0["walletId"] as? String) == id }) else {
                    return DispatchQueue.main.async { reject("WALLET_ID_NOT_FOUND", "Wallet \(id) not found", nil) }
                }
                arr[idx]["name"] = name
                let updated = try JSONSerialization.data(withJSONObject: arr)
                guard let str = String(data: updated, encoding: .utf8) else { throw SecureStorageError.encodingError }
                try self.saveToKeychainSecure(key: "appAllWallet", value: str)
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

    @objc
    func clearAll(_ resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.clearAllFromKeychain()
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
        }
    }
}
