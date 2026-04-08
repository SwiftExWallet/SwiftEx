import Foundation
import React
import Security

@objc(StorageModule)
class StorageModule: NSObject {
    
    private let serviceName = "com.appSwiftEx.appStorage"
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func saveWallet(_ value: String,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let data = value.data(using: .utf8),
                      let newUser = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    throw SecureStorageError.decodingError
                }
                var usersArray: [[String: Any]] = []
                if let existingData = try? self.getFromKeychain(key: "appAllWallet"),
                   let jsonData = existingData.data(using: .utf8),
                   let existingUsers = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
                    usersArray = existingUsers
                }
                usersArray.append(newUser)
                let updatedData = try JSONSerialization.data(withJSONObject: usersArray)
                guard let updatedString = String(data: updatedData, encoding: .utf8) else {
                    throw SecureStorageError.encodingError
                }
                try self.saveToKeychain(key: "appAllWallet", value: updatedString)
                DispatchQueue.main.async {
                    resolve([
                        "success": true
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("SAVE_WALLET_ERROR", error.localizedDescription, error)
                }
            }
        }
    }
  
    @objc
    func updateActiveWallet(_ id: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let walletDataString = try self.getFromKeychain(key: "appAllWallet") else {
                    throw SecureStorageError.decodingError
                }
                
                guard let data = walletDataString.data(using: .utf8),
                      let walletArray = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                    throw SecureStorageError.decodingError
                }
                
                var matchedWallet: [String: Any]?
                for wallet in walletArray {
                    if let walletID = wallet["walletId"] as? String, walletID == id {
                        matchedWallet = wallet
                        break
                    }
                }
                
                guard let foundWallet = matchedWallet else {
                    DispatchQueue.main.async {
                        reject("WALLET_ID_NOT_FOUND", "wallet with \(id) not found.", nil)
                    }
                    return
                }
                
                let walletInfo = try JSONSerialization.data(withJSONObject: foundWallet)
                guard let walletString = String(data: walletInfo, encoding: .utf8) else {
                    throw SecureStorageError.encodingError
                }
                
                try self.saveToKeychain(key: "activeUserWallet", value: walletString)
                
                DispatchQueue.main.async {
                    resolve([
                        "success": true,
                        "mode": "replace",
                        "walletId": id
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("UPDATE_WALLET_ERROR", error.localizedDescription, error)
                }
            }
        }
    }

    @objc
    func getAllWallets(_ resolver: @escaping RCTPromiseResolveBlock,
             rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let walletDataString = try self.getFromKeychain(key: "appAllWallet") else {
                    DispatchQueue.main.async {
                        resolver([
                            "success": false,
                            "wallets": []
                        ])
                    }
                    return
                }
                
                guard let data = walletDataString.data(using: .utf8),
                      let walletJson = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                    throw SecureStorageError.decodingError
                }
                
                let filteredWallet = walletJson.map { wallet -> [String: Any] in
                    return [
                        "walletId": wallet["walletId"] ?? NSNull(),
                        "name": wallet["name"] ?? NSNull(),
                        "address": wallet["address"] ?? NSNull(),
                        "stellarPublicKey": wallet["stellarPublicKey"] ?? NSNull(),
                        "walletType": wallet["walletType"] ?? NSNull()
                    ]
                }
                
                DispatchQueue.main.async {
                    resolver([
                        "success": true,
                        "wallets": filteredWallet
                    ])
                }
                
            } catch {
                DispatchQueue.main.async {
                    reject("GET_ERROR", error.localizedDescription, error)
                }
            }
        }
    }
  
  @objc
  func getWalletAddress(_ resolver: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {

      DispatchQueue.global(qos: .userInitiated).async {
          do {
              guard let walletString = try self.getFromKeychain(key: "activeUserWallet") else {
                  DispatchQueue.main.async {
                      resolver([
                          "success": false,
                          "wallet": NSNull()
                      ])
                  }
                  return
              }

              guard let data = walletString.data(using: .utf8),
                    let walletJson = try JSONSerialization.jsonObject(
                      with: data,
                      options: []
                    ) as? [String: Any] else {
                  throw SecureStorageError.decodingError
              }

              let response: [String: Any] = [
                  "address": walletJson["address"] ?? NSNull(),
                  "stellarPublicKey": walletJson["stellarPublicKey"] ?? NSNull(),
                  "name": walletJson["name"] ?? NSNull(),
                  "walletId": walletJson["walletId"] ?? NSNull(),
                  "walletType": walletJson["walletType"] ?? NSNull()
              ]

              DispatchQueue.main.async {
                  resolver([
                      "success": true,
                      "wallet": response
                  ])
              }

          } catch {
              DispatchQueue.main.async {
                  reject("GET_WALLET_ERROR", error.localizedDescription, error)
              }
          }
      }
  }
  
  @objc
  func getWalletInfo(_ resolver: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {

      DispatchQueue.global(qos: .userInitiated).async {
          do {
              guard let walletString = try self.getFromKeychain(key: "activeUserWallet") else {
                  DispatchQueue.main.async {
                      resolver([
                          "success": false,
                          "wallet": NSNull()
                      ])
                  }
                  return
              }

              guard let data = walletString.data(using: .utf8),
                    let walletJson = try JSONSerialization.jsonObject(
                      with: data,
                      options: []
                    ) as? [String: Any] else {
                  throw SecureStorageError.decodingError
              }

              DispatchQueue.main.async {
                  resolver([
                      "success": true,
                      "wallet": walletJson
                  ])
              }

          } catch {
              DispatchQueue.main.async {
                  reject("GET_WALLET_ERROR", error.localizedDescription, error)
              }
          }
      }
  }


    @objc
    func delete(_ id: String,
                   resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let walletDataString = try self.getFromKeychain(key: "appAllWallet") else {
                    throw SecureStorageError.decodingError
                }
                
                guard let data = walletDataString.data(using: .utf8),
                      var walletArray = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                    throw SecureStorageError.decodingError
                }
                
                guard walletArray.contains(where: { ($0["walletId"] as? String) == id }) else {
                    DispatchQueue.main.async {
                        reject("WALLET_ID_NOT_FOUND", "wallet with \(id) not found.", nil)
                    }
                    return
                }
                
                walletArray.removeAll { ($0["walletId"] as? String) == id }
                
                let updatedData = try JSONSerialization.data(withJSONObject: walletArray)
                guard let updatedString = String(data: updatedData, encoding: .utf8) else {
                    throw SecureStorageError.encodingError
                }
                
                try self.saveToKeychain(key: "appAllWallet", value: updatedString)
                
                DispatchQueue.main.async {
                    resolve([
                        "success": true,
                        "mode": "remove",
                        "wallet_removed":"wallet_removed"
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("REMOVE_WALLET_ERROR", error.localizedDescription, error)
                }
            }
        }
    }
    
    @objc
    func getAllKeys(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let keys = try self.getAllKeysFromKeychain()
                
                DispatchQueue.main.async {
                    resolve([
                        "success": true,
                        "keys": keys
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("GET_ALL_KEYS_ERROR", error.localizedDescription, error)
                }
            }
        }
    }
    
    @objc
    func clearAll(_ resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.clearAllFromKeychain()
                
                DispatchQueue.main.async {
                    resolve([
                        "success": true
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("CLEAR_ALL_ERROR", error.localizedDescription, error)
                }
            }
        }
    }

  @objc
  func renameWallet(_ id: String, name: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
      DispatchQueue.global(qos: .userInitiated).async {
          do {
              guard let walletDataString = try self.getFromKeychain(key: "appAllWallet") else {
                  throw SecureStorageError.decodingError
              }
              
              guard let data = walletDataString.data(using: .utf8),
                    var walletArray = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                  throw SecureStorageError.decodingError
              }
              
              guard let matchedIndex = walletArray.firstIndex(where: { ($0["walletId"] as? String) == id }) else {
                  DispatchQueue.main.async {
                      reject("WALLET_ID_NOT_FOUND", "wallet with \(id) not found.", nil)
                  }
                  return
              }
              
              walletArray[matchedIndex]["name"] = name
              
              let updatedData = try JSONSerialization.data(withJSONObject: walletArray)
              guard let updatedString = String(data: updatedData, encoding: .utf8) else {
                  throw SecureStorageError.encodingError
              }
              
              try self.saveToKeychain(key: "appAllWallet", value: updatedString)
              
              DispatchQueue.main.async {
                  resolve([
                      "success": true,
                      "mode": "replace"
                  ])
              }
          } catch {
              DispatchQueue.main.async {
                  reject("UPDATE_WALLET_ERROR", error.localizedDescription, error)
              }
          }
      }
  }
    
    private func saveToKeychain(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw SecureStorageError.encodingError
        }
        
        try? deleteFromKeychain(key: key)
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: serviceName,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        guard status == errSecSuccess else {
            throw SecureStorageError.keychainError(status: status)
        }
    }
    
    private func getFromKeychain(key: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: serviceName,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecItemNotFound {
            return nil
        }
        
        guard status == errSecSuccess else {
            throw SecureStorageError.keychainError(status: status)
        }
        
        guard let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw SecureStorageError.decodingError
        }
        
        return value
    }
    
    private func deleteFromKeychain(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: serviceName
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status != errSecSuccess && status != errSecItemNotFound {
            throw SecureStorageError.keychainError(status: status)
        }
    }
    
    private func getAllKeysFromKeychain() throws -> [String] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecItemNotFound {
            return []
        }
        
        guard status == errSecSuccess else {
            throw SecureStorageError.keychainError(status: status)
        }
        
        guard let items = result as? [[String: Any]] else {
            return []
        }
        
        let keys = items.compactMap { item in
            item[kSecAttrAccount as String] as? String
        }
        
        return keys
    }
    
    private func clearAllFromKeychain() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status != errSecSuccess && status != errSecItemNotFound {
            throw SecureStorageError.keychainError(status: status)
        }
    }
}

enum SecureStorageError: Error, LocalizedError {
    case encodingError
    case decodingError
    case keychainError(status: OSStatus)
    
    var errorDescription: String? {
        switch self {
        case .encodingError:
            return "Failed to encode data"
        case .decodingError:
            return "Failed to decode data"
        case .keychainError(let status):
            return "Keychain error: \(status)"
        }
    }
}

