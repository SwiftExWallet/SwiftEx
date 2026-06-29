import Foundation
import React
import WalletCore
import Security

@objc(TransactionSigner)
class TransactionSigner: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
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
func signTypedData(
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
    
  private func getPrivateKey(for address: String, chain: String) throws -> String? {
      let serviceName = "com.appSwiftEx.appStorage"
      guard let walletJson = self.retrieveFromKeychain(
          key: "activeUserWallet",
          service: serviceName
      ) else {
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

