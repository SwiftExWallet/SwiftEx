import Foundation
import stellarsdk
import LocalAuthentication

@objc(StellarSigner)
class StellarSigner: NSObject {
  
  let sdk = StellarSDK(withHorizonUrl: "https://horizon.stellar.org")

  private func authenticateForSigning(_ completion: @escaping (Result<Void, Error>) -> Void) {
    guard TransactionAuthPolicyIOS.isEnabled() else {
      completion(.success(()))
      return
    }

    let context = LAContext()
    let reason = "Authenticate to sign transaction"
    var error: NSError?

    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
      DispatchQueue.main.async {
        NativePinBottomSheet.show { pin in
          guard let pin else {
            completion(.failure(NSError(domain: "AUTH", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid app PIN"])))
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
        completion(.failure(authError ?? NSError(domain: "AUTH", code: -2, userInfo: [NSLocalizedDescriptionKey: "Authentication failed"])))
      }
    }
  }

  private func signerAuthCode(_ error: Error) -> String {
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
    if nsError.domain == "AUTH", nsError.code == -1 {
      return "AUTH_UNAVAILABLE"
    }
    return "AUTH_FAILED"
  }
  
  private func getPrivateKey(chain: String) throws -> String? {
    guard let walletJson = WalletKeychainPolicy.activeWallet(read: { service in
      self.retrieveFromKeychain(key: "activeUserWallet", service: service)
    }) else {
      throw NSError(domain: "KEYCHAIN", code: -1, userInfo: [NSLocalizedDescriptionKey: "No wallet found"])
    }
    
    guard let jsonData = walletJson.data(using: .utf8),
          let walletJson = try JSONSerialization.jsonObject(with: jsonData,options: []) as? [String: Any] else {
      throw NSError(domain: "KEYCHAIN", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid wallet JSON"])
    }
    
    guard let privateKeyString = walletJson["stellarPrivateKey"] as? String else {
      throw NSError(domain: "KEYCHAIN", code: -3, userInfo: [NSLocalizedDescriptionKey: "Invalid private key"])
    }
    
    return privateKeyString
  }
  
  private func retrieveFromKeychain(key: String, service: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    guard status == errSecSuccess,
          let data = result as? Data,
          let walletJson = String(data: data, encoding: .utf8) else {
      return nil
    }
    
    return walletJson
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool { return false }
  
  @objc
  func getAssets(
    _ publicKey: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let responseEnum = await sdk.accounts.getAccountDetails(accountId: publicKey)
        
        guard case .success(let accountDetails) = responseEnum else {
          throw NSError(domain: "STELLAR", code: -1, userInfo: [NSLocalizedDescriptionKey: "Account not found"])
        }
        
        var balancesArray: [[String: Any]] = []
        
        for balance in accountDetails.balances {
          if balance.assetType == AssetTypeAsString.NATIVE {
            balancesArray.append([
              "assetType": "native",
              "balance": balance.balance
            ])
          } else {
            balancesArray.append([
              "assetType": "credit",
              "assetCode": balance.assetCode ?? "",
              "issuer": balance.assetIssuer ?? "",
              "balance": balance.balance
            ])
          }
        }
        
        let result: [String: Any] = [
          "accountId": accountDetails.accountId,
          "sequence": accountDetails.sequenceNumber,
          "balances": balancesArray
        ]
        
        await MainActor.run {
          resolve(result)
        }
      } catch {
        await MainActor.run {
          reject("STELLAR_ERROR", error.localizedDescription, error)
        }
      }
    }
  }
  
  @objc
  func signTransaction(
    _ transactionXDR: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    sign(transactionXDR, network: Network.public, resolver: resolve, rejecter: reject)
  }

  @objc
  func signTransactionForNetwork(
    _ transactionXDR: String,
    network: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let resolved: Network
    switch network {
    case "public": resolved = Network.public
    case "testnet": resolved = Network.testnet
    default:
      reject("INVALID_NETWORK", "Unsupported Stellar network: \(network)", nil)
      return
    }
    sign(transactionXDR, network: resolved, resolver: resolve, rejecter: reject)
  }

  private func sign(
    _ transactionXDR: String,
    network: Network,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    authenticateForSigning { authResult in
      do {
        try authResult.get()
        self.signTransactionAfterAuthentication(
          transactionXDR,
          network: network,
          resolver: resolve,
          rejecter: reject
        )
      } catch {
        reject(self.signerAuthCode(error), error.localizedDescription, error)
      }
    }
  }

  private func signTransactionAfterAuthentication(
    _ transactionXDR: String,
    network: Network,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let secretKey = try getPrivateKey(chain: "stellar")!
        let sourceKeyPair = try KeyPair(secretSeed: secretKey)
        let transaction = try Transaction(envelopeXdr: transactionXDR)
        try transaction.sign(keyPair: sourceKeyPair, network: network)
        let signedXDR = try transaction.encodedEnvelope()
        let signature = sourceKeyPair.sign([UInt8](try transaction.getTransactionHashData(network: network)))
        let signatureBase64 = Data(signature).base64EncodedString()
        
        await MainActor.run {
          resolve([
            "signedXDR": signedXDR,
            "signature": signatureBase64,
            "publicKey": sourceKeyPair.accountId
          ])
        }
      } catch {
        await MainActor.run {
          reject("SIGN_ERROR", error.localizedDescription, error)
        }
      }
    }
  }
  
}
