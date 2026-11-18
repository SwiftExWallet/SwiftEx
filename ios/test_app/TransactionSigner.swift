import Foundation
import React
import WalletCore
import Security
import LocalAuthentication

@objc(TransactionSigner)
class TransactionSigner: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

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
                      completion(.failure(SignerError.authenticationFailed))
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
              completion(.failure(authError ?? SignerError.authenticationFailed))
          }
      }
  }
    
  @objc
  func signTransaction(
      _ chainName: String,
      walletAddress: String,
      rawUnsignedTx: String,
      chainId: Int,
      resolver resolve: @escaping RCTPromiseResolveBlock,
      rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
      authenticateForSigning { authResult in
          do {
              try authResult.get()
              self.signTransactionAfterAuthentication(
                  chainName,
                  walletAddress: walletAddress,
                  rawUnsignedTx: rawUnsignedTx,
                  chainId: chainId,
                  resolver: resolve,
                  rejecter: reject
              )
          } catch {
              reject(self.signerAuthCode(error), error.localizedDescription, error)
          }
      }
  }

  private func signTransactionAfterAuthentication(
      _ chainName: String,
      walletAddress: String,
      rawUnsignedTx: String,
      chainId: Int,
      resolver resolve: @escaping RCTPromiseResolveBlock,
      rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
      do {
          guard let privateKeyHex = try getPrivateKey(for: walletAddress, chain: chainName)
          else {
              throw SignerError.privateKeyNotFound
          }

          let privateKeyData = safeHexData(privateKeyHex)

          guard
              let jsonData = rawUnsignedTx.data(using: .utf8),
              let tx = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
          else {
              throw SignerError.invalidRawTransaction
          }

          let nonce     = safeHexData(tx["nonce"] as! String)
          let gasPrice  = safeHexData(tx["gasPrice"] as! String)
          let gasLimit  = safeHexData(tx["gasLimit"] as! String)
          let value     = safeHexData(tx["value"] as! String)
          let dataField = safeHexData(tx["data"] as! String)
        let hexString = value.map { String(format: "%02x", $0) }.joined()
        print("0x" + hexString)

          let input = EthereumSigningInput.with {
              $0.chainID = intToData(chainId)
              $0.nonce = nonce
              $0.gasPrice = gasPrice
              $0.gasLimit = gasLimit
              $0.toAddress = tx["to"] as! String
              $0.privateKey = privateKeyData

              if dataField.isEmpty {
                  $0.transaction = .with {
                      $0.transfer = .with {
                          $0.amount = value
                      }
                  }
              } else {
                  $0.transaction = .with {
                      $0.contractGeneric = .with {
                          $0.amount = value
                          $0.data = dataField
                      }
                  }
              }
          }

          let coin: CoinType =
              (chainName.lowercased() == "bsc") ? .smartChain : .ethereum

          let output: EthereumSigningOutput =
              AnySigner.sign(input: input, coin: coin)

          resolve([
              "success": true,
              "signedTx": "0x" + output.encoded.hexString
          ])

      } catch {
          reject("SIGN_ERROR", error.localizedDescription, error)
      }
  }

@objc
func signPersonalMessage(
    _ chainName: String,
    walletAddress: String,
    messageHex: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
) {
    authenticateForSigning { authResult in
        do {
            try authResult.get()
            self.signPersonalMessageAfterAuthentication(
                chainName,
                walletAddress: walletAddress,
                messageHex: messageHex,
                resolver: resolve,
                rejecter: reject
            )
        } catch {
            reject(self.signerAuthCode(error), error.localizedDescription, error)
        }
    }
}

private func signPersonalMessageAfterAuthentication(
    _ chainName: String,
    walletAddress: String,
    messageHex: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
) {
    do {
        guard let privateKeyHex = try getPrivateKey(for: walletAddress, chain: chainName)
        else { throw SignerError.privateKeyNotFound }

        let privateKeyData = safeHexData(privateKeyHex)
        guard let privKey = PrivateKey(data: privateKeyData)
        else { throw SignerError.invalidPrivateKey }

        let messageData: Data
        if messageHex.lowercased().hasPrefix("0x") {
            messageData = safeHexData(messageHex)
        } else {
            messageData = messageHex.data(using: .utf8) ?? Data()
        }

        let prefixStr = "\u{19}Ethereum Signed Message:\n\(messageData.count)"
        guard var prefixed = prefixStr.data(using: .utf8) else {
            throw SignerError.invalidTransactionData
        }
        prefixed.append(messageData)

        let hash = Hash.keccak256(data: prefixed)

        guard let sigData = privKey.sign(digest: hash, curve: .secp256k1),
              sigData.count == 65
        else { throw SignerError.signingFailed }

        let r = sigData[0..<32].map  { String(format: "%02x", $0) }.joined()
        let s = sigData[32..<64].map { String(format: "%02x", $0) }.joined()
        let v = String(format: "%02x", sigData[64])

        resolve(["success": true, "signature": "0x\(r)\(s)\(v)"])
    } catch {
        reject("SIGN_MESSAGE_ERROR", error.localizedDescription, error)
    }
}

@objc
func signTypedData(
    _ chainName: String,
    walletAddress: String,
    typedDataJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
) {
    authenticateForSigning { authResult in
        do {
            try authResult.get()
            self.signTypedDataAfterAuthentication(
                chainName,
                walletAddress: walletAddress,
                typedDataJson: typedDataJson,
                resolver: resolve,
                rejecter: reject
            )
        } catch {
            reject(self.signerAuthCode(error), error.localizedDescription, error)
        }
    }
}

private func signTypedDataAfterAuthentication(
    _ chainName: String,
    walletAddress: String,
    typedDataJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
) {
    do {
        guard let privateKeyHex = try getPrivateKey(for: walletAddress, chain: chainName)
        else {
            throw SignerError.privateKeyNotFound
        }

        let privateKeyData = safeHexData(privateKeyHex)

        guard let privKey = PrivateKey(data: privateKeyData) else {
            throw SignerError.privateKeyNotFound
        }

        // encodeTyped returns Data (non-optional) in this version of TW Core
        let hashData = EthereumAbi.encodeTyped(messageJson: typedDataJson)

        guard hashData.count == 32 else {
            throw SignerError.invalidRawTransaction
        }

        guard let sigData = privKey.sign(digest: hashData, curve: .secp256k1) else {
            throw SignerError.invalidRawTransaction
        }

        guard sigData.count == 65 else {
            throw SignerError.invalidRawTransaction
        }

        let r = sigData[0..<32].map  { String(format: "%02x", $0) }.joined()
        let s = sigData[32..<64].map { String(format: "%02x", $0) }.joined()
        let v = String(format: "%02x", sigData[64])

        resolve([
            "success":   true,
            "signature": "0x\(r)\(s)\(v)"
        ])

    } catch {
        reject("SIGN_TYPED_ERROR", error.localizedDescription, error)
    }
}

  
      private func dataFromHex(_ hex: String) -> Data {
          return Data(hexString: hex.replacingOccurrences(of: "0x", with: ""))!
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
      if case SignerError.authenticationUnavailable = error {
          return "AUTH_UNAVAILABLE"
      }
      return "AUTH_FAILED"
  }
    
  // MARK: - Aster (Perps) withdraw signature — SEPARATE method, existing signing untouched.
  // UNTESTED ON iOS (no Mac available when written).
  // Signs ONLY Aster's EIP-712 withdraw "Action" to the signing wallet's own address:
  //   domain.name == "Aster", primaryType == "Action", message.type == "Withdraw",
  //   message.destination == this wallet's address (case-insensitive), exact documented schema.
  // Its own EIP-712 encoding for that one schema (field names contain spaces:
  // "destination Chain", "aster chain"). Same key lookup, same PIN/biometric gate and same
  // signature format as signTypedData. Never logs the payload or the signature.

  private static let asterActionFields: [(String, String)] = [
      ("type", "string"), ("destination", "address"), ("destination Chain", "string"),
      ("token", "string"), ("amount", "string"), ("fee", "string"),
      ("nonce", "uint256"), ("aster chain", "string")
  ]
  private static let asterDomainFields: [(String, String)] = [
      ("name", "string"), ("version", "string"), ("chainId", "uint256"), ("verifyingContract", "address")
  ]

  private struct AsterRejected: LocalizedError {
      let reason: String
      var errorDescription: String? { reason }
  }

  private func asterKeccak(_ s: String) -> Data { Hash.keccak256(data: Data(s.utf8)) }

  private func asterUint256(_ any: Any?) -> Data? {
      var value: UInt64?
      if let n = any as? NSNumber { value = n.uint64Value }
      if let s = any as? String { value = s.hasPrefix("0x") ? UInt64(s.dropFirst(2), radix: 16) : UInt64(s) }
      guard let v = value else { return nil }
      var be = v.bigEndian
      return Data(repeating: 0, count: 24) + Data(bytes: &be, count: 8)
  }

  private func asterAddress32(_ any: Any?) -> Data? {
      guard let s = any as? String else { return nil }
      let hex = s.hasPrefix("0x") ? String(s.dropFirst(2)) : s
      guard hex.count == 40, let raw = Data(hexString: hex), raw.count == 20 else { return nil }
      return Data(repeating: 0, count: 12) + raw
  }

  private func asterEncodeType(_ name: String, _ fields: [(String, String)]) -> String {
      return name + "(" + fields.map { "\($0.1) \($0.0)" }.joined(separator: ",") + ")"
  }

  // Validates the request and returns (destination, EIP-712 digest).
  private func asterWithdrawDigest(_ json: String, walletAddress: String) throws -> (String, Data) {
      guard let data = json.data(using: .utf8),
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let domain = root["domain"] as? [String: Any],
            let message = root["message"] as? [String: Any],
            let types = root["types"] as? [String: Any],
            let action = types["Action"] as? [[String: Any]]
      else { throw AsterRejected(reason: "Invalid request") }

      guard (domain["name"] as? String) == "Aster" else { throw AsterRejected(reason: "Not an Aster request") }
      guard (root["primaryType"] as? String) == "Action" else { throw AsterRejected(reason: "Not an Aster Action") }
      let fields = action.map { (($0["name"] as? String) ?? "", ($0["type"] as? String) ?? "") }
      guard fields.count == Self.asterActionFields.count,
            zip(fields, Self.asterActionFields).allSatisfy({ $0.0 == $1.0 && $0.1 == $1.1 })
      else { throw AsterRejected(reason: "Unexpected Action fields") }
      guard Set(types.keys).isSubset(of: ["Action", "EIP712Domain"]) else { throw AsterRejected(reason: "Unexpected types") }
      if let domainType = types["EIP712Domain"] as? [[String: Any]] {
          let df = domainType.map { (($0["name"] as? String) ?? "", ($0["type"] as? String) ?? "") }
          guard df.count == Self.asterDomainFields.count,
                zip(df, Self.asterDomainFields).allSatisfy({ $0.0 == $1.0 && $0.1 == $1.1 })
          else { throw AsterRejected(reason: "Unexpected domain") }
      }
      guard (message["type"] as? String) == "Withdraw" else { throw AsterRejected(reason: "Not a withdraw") }
      guard let destination = message["destination"] as? String,
            destination.lowercased() == walletAddress.lowercased()
      else { throw AsterRejected(reason: "Withdraw destination must be your own address") }

      guard let dName = domain["name"] as? String, let dVersion = domain["version"] as? String,
            let dChain = asterUint256(domain["chainId"]), let dContract = asterAddress32(domain["verifyingContract"]),
            let mType = message["type"] as? String, let mDest = asterAddress32(message["destination"]),
            let mDestChain = message["destination Chain"] as? String, let mToken = message["token"] as? String,
            let mAmount = message["amount"] as? String, let mFee = message["fee"] as? String,
            let mNonce = asterUint256(message["nonce"]), let mAsterChain = message["aster chain"] as? String
      else { throw AsterRejected(reason: "Invalid request") }

      let domainSeparator = Hash.keccak256(data:
          asterKeccak(asterEncodeType("EIP712Domain", Self.asterDomainFields)) +
          asterKeccak(dName) + asterKeccak(dVersion) + dChain + dContract)
      let structHash = Hash.keccak256(data:
          asterKeccak(asterEncodeType("Action", Self.asterActionFields)) +
          asterKeccak(mType) + mDest + asterKeccak(mDestChain) + asterKeccak(mToken) +
          asterKeccak(mAmount) + asterKeccak(mFee) + mNonce + asterKeccak(mAsterChain))
      let digest = Hash.keccak256(data: Data([0x19, 0x01]) + domainSeparator + structHash)
      return (destination, digest)
  }

  @objc
  func signAsterWithdraw(
      _ chainName: String,
      walletAddress: String,
      typedDataJson: String,
      resolver resolve: @escaping RCTPromiseResolveBlock,
      rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
      let checked: (String, Data)
      do {
          checked = try asterWithdrawDigest(typedDataJson, walletAddress: walletAddress)
      } catch {
          reject("ASTER_WITHDRAW_REJECTED", error.localizedDescription, nil)
          return
      }
      authenticateForSigning { authResult in
          do {
              try authResult.get()
          } catch {
              reject(self.signerAuthCode(error), error.localizedDescription, error)
              return
          }
          do {
              guard let privateKeyHex = try self.getPrivateKey(for: walletAddress, chain: chainName),
                    let privKey = PrivateKey(data: safeHexData(privateKeyHex))
              else { throw SignerError.privateKeyNotFound }
              // The key that signs must own the destination (own-address-only withdraws).
              let own = CoinType.ethereum.deriveAddress(privateKey: privKey).lowercased()
              guard own == checked.0.lowercased(), own == walletAddress.lowercased() else {
                  reject("ASTER_WITHDRAW_REJECTED", "Withdraw destination must be your own address", nil)
                  return
              }
              guard let sigData = privKey.sign(digest: checked.1, curve: .secp256k1), sigData.count == 65
              else { throw SignerError.signingFailed }
              let r = sigData[0..<32].map  { String(format: "%02x", $0) }.joined()
              let s = sigData[32..<64].map { String(format: "%02x", $0) }.joined()
              let v = String(format: "%02x", sigData[64])
              resolve(["success": true, "signature": "0x\(r)\(s)\(v)"])
          } catch {
              reject("SIGN_ASTER_WITHDRAW_ERROR", "Could not sign the withdrawal", nil)
          }
      }
  }

  // Aster user-withdraw REQUEST signed entirely by the main wallet (no agent key), one prompt.
  // Same rules as Android TransactionSigner.signAsterWithdrawRequest (UNTESTED ON iOS).
  private static let asterRequestKeys: Set<String> = [
      "user", "signer", "chainId", "asset", "amount", "fee", "receiver", "userNonce", "nonce"
  ]

  private func asterRequestCheck(_ query: String, typedDataJson: String, walletAddress: String) throws {
      var params: [String: String] = [:]
      let allowed = CharacterSet(charactersIn: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.")
      for part in query.split(separator: "&", omittingEmptySubsequences: false) {
          guard let eq = part.firstIndex(of: "="), eq != part.startIndex else { throw AsterRejected(reason: "Invalid request") }
          let k = String(part[part.startIndex..<eq])
          let v = String(part[part.index(after: eq)...])
          guard Self.asterRequestKeys.contains(k), params[k] == nil else { throw AsterRejected(reason: "Unexpected request field") }
          guard !v.isEmpty, v.count <= 80, v.unicodeScalars.allSatisfy({ allowed.contains($0) })
          else { throw AsterRejected(reason: "Invalid request value") }
          params[k] = v
      }
      guard Set(params.keys) == Self.asterRequestKeys else { throw AsterRejected(reason: "Incomplete request") }
      guard let data = typedDataJson.data(using: .utf8),
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = root["message"] as? [String: Any]
      else { throw AsterRejected(reason: "Invalid request") }
      let w = walletAddress.lowercased()
      let nonceString: String = (message["nonce"] as? String) ?? ((message["nonce"] as? NSNumber)?.stringValue ?? "")
      guard params["user"]!.lowercased() == w else { throw AsterRejected(reason: "Request user must be your wallet") }
      guard params["signer"]!.lowercased() == w else { throw AsterRejected(reason: "Request signer must be your wallet") }
      guard params["receiver"]!.lowercased() == w,
            params["receiver"]!.lowercased() == ((message["destination"] as? String) ?? "").lowercased()
      else { throw AsterRejected(reason: "Receiver must be your own address") }
      let chainNames = ["1": "ETH", "56": "BSC", "42161": "Arbitrum"]
      guard let cid = params["chainId"], let chainName = chainNames[cid] else { throw AsterRejected(reason: "Unsupported chain") }
      let domain = root["domain"] as? [String: Any]
      let domainChain: String = (domain?["chainId"] as? NSNumber)?.stringValue ?? ((domain?["chainId"] as? String) ?? "")
      guard domainChain == cid, (message["destination Chain"] as? String) == chainName
      else { throw AsterRejected(reason: "Chain mismatch") }
      guard (message["aster chain"] as? String) == "Mainnet" else { throw AsterRejected(reason: "Unsupported network") }
      guard params["asset"] == (message["token"] as? String),
            params["amount"] == (message["amount"] as? String),
            params["fee"] == (message["fee"] as? String),
            params["userNonce"] == nonceString
      else { throw AsterRejected(reason: "Request does not match the withdrawal") }
  }

  // EIP-712 digest of Aster v3 Message{msg} (domain AsterSignTransaction, version 1, chainId 1666).
  private func asterRequestDigest(_ msg: String) -> Data {
      var chain = UInt64(1666).bigEndian
      let chainId = Data(repeating: 0, count: 24) + Data(bytes: &chain, count: 8)
      let domainSeparator = Hash.keccak256(data:
          asterKeccak(asterEncodeType("EIP712Domain", Self.asterDomainFields)) +
          asterKeccak("AsterSignTransaction") + asterKeccak("1") + chainId + Data(repeating: 0, count: 32))
      let structHash = Hash.keccak256(data: asterKeccak("Message(string msg)") + asterKeccak(msg))
      return Hash.keccak256(data: Data([0x19, 0x01]) + domainSeparator + structHash)
  }

  private func asterSigHex(_ privKey: PrivateKey, _ digest: Data) throws -> String {
      guard let sig = privKey.sign(digest: digest, curve: .secp256k1), sig.count == 65 else { throw SignerError.signingFailed }
      let r = sig[0..<32].map  { String(format: "%02x", $0) }.joined()
      let s = sig[32..<64].map { String(format: "%02x", $0) }.joined()
      let v = String(format: "%02x", sig[64])
      return "0x\(r)\(s)\(v)"
  }

  @objc
  func signAsterWithdrawRequest(
      _ chainName: String,
      walletAddress: String,
      typedDataJson: String,
      requestQuery: String,
      resolver resolve: @escaping RCTPromiseResolveBlock,
      rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
      let actionDigest: Data
      do {
          actionDigest = try asterWithdrawDigest(typedDataJson, walletAddress: walletAddress).1
          try asterRequestCheck(requestQuery, typedDataJson: typedDataJson, walletAddress: walletAddress)
      } catch {
          reject("ASTER_WITHDRAW_REJECTED", error.localizedDescription, nil)
          return
      }
      authenticateForSigning { authResult in
          do {
              try authResult.get()
          } catch {
              reject(self.signerAuthCode(error), error.localizedDescription, error)
              return
          }
          do {
              guard let privateKeyHex = try self.getPrivateKey(for: walletAddress, chain: chainName),
                    let privKey = PrivateKey(data: safeHexData(privateKeyHex))
              else { throw SignerError.privateKeyNotFound }
              guard CoinType.ethereum.deriveAddress(privateKey: privKey).lowercased() == walletAddress.lowercased() else {
                  reject("ASTER_WITHDRAW_REJECTED", "Withdraw destination must be your own address", nil)
                  return
              }
              let userSignature = try self.asterSigHex(privKey, actionDigest)
              let msg = requestQuery + "&userSignature=" + userSignature
              let signature = try self.asterSigHex(privKey, self.asterRequestDigest(msg))
              resolve(["success": true, "userSignature": userSignature, "msg": msg, "signature": signature])
          } catch {
              reject("SIGN_ASTER_WITHDRAW_ERROR", "Could not sign the withdrawal", nil)
          }
      }
  }

  private func getPrivateKey(for address: String, chain: String) throws -> String? {
      guard let walletJson = WalletKeychainPolicy.activeWallet(read: { service in
          self.retrieveFromKeychain(key: "activeUserWallet", service: service)
      }) else {
          return nil
      }

      guard let jsonData = walletJson.data(using: .utf8),
            let wallet = try? JSONSerialization.jsonObject(
                with: jsonData,
                options: []
            ) as? [String: Any] else {
          return nil
      }

      switch chain.lowercased() {
      case "ethereum", "eth", "bnb", "bsc":
          return wallet["privatekey"] as? String

      default:
          return wallet["privatekey"] as? String
      }
  }

    
    private func retrieveFromKeychain(key: String, service: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: service,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return value
    }
    
}


enum SignerError: Error, LocalizedError {
    case privateKeyNotFound
    case invalidPrivateKey
    case invalidRawTransaction
    case unsupportedChain(String)
    case signingFailed
    case invalidTransactionData
    case authenticationUnavailable
    case authenticationFailed
    
    var errorDescription: String? {
        switch self {
        case .privateKeyNotFound:
            return "Private key not found in secure storage"
        case .invalidPrivateKey:
            return "Invalid private key format"
        case .invalidRawTransaction:
            return "Invalid raw transaction format"
        case .unsupportedChain(let chain):
            return "Unsupported blockchain: \(chain)"
        case .signingFailed:
            return "Transaction signing failed"
        case .invalidTransactionData:
            return "Invalid transaction data format"
        case .authenticationUnavailable:
            return "Device authentication is not available"
        case .authenticationFailed:
            return "Authentication failed"
        }
    }
  
}
func intToData(_ value: Int) -> Data {
    var v = UInt64(value).bigEndian
    return Data(bytes: &v, count: MemoryLayout<UInt64>.size).trimLeadingZeros()
}

func dataFromHex(_ hex: String) -> Data {
    let clean = hex.replacingOccurrences(of: "0x", with: "")
    return Data(hexString: clean) ?? Data()
}
func safeHexData(_ hex: String) -> Data {
    let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
    if clean.isEmpty || clean == "0" {
        return Data()
    }
    if clean.count % 2 != 0 {
        return Data([0]) + (Data(hexString: "0" + clean) ?? Data())
    }
    return Data(hexString: clean) ?? Data()
}


extension Data {
    func trimLeadingZeros() -> Data {
        var d = self
        while d.first == 0 {
            d.removeFirst()
        }
        return d
    }
}
extension String {
    func strip0x() -> String {
        hasPrefix("0x") ? String(dropFirst(2)) : self
    }
}
