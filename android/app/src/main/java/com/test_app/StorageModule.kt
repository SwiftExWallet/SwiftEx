package org.app.swiftEx.wallet
import com.facebook.react.bridge.*
import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONArray
import org.json.JSONObject

class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "StorageModule"
    private val PREF_NAME = "com_swiftEx_app_secure"

    private val prefs by lazy {
        try {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                PREF_NAME,
                masterKeyAlias,
                reactApplicationContext,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to init EncryptedSharedPreferences", e)
            reactApplicationContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        }
    }

    override fun getName() = "StorageModule"

    @ReactMethod
    fun saveWallet(value: String, promise: Promise) {
        try {
            val newUser = try {
                JSONObject(value)
            } catch (e: Exception) {
                JSONArray(value).getJSONObject(0)
            }

            val usersArray = JSONArray().apply {
                val existingData: String? = prefs.all["appAllWallet"]?.toString()
                if (!existingData.isNullOrEmpty()) {
                    val existingArray = JSONArray(existingData)
                    for (i in 0 until existingArray.length()) {
                        put(existingArray.get(i))
                    }
                }
                put(newUser)
            }

            prefs.edit().putString("appAllWallet", usersArray.toString()).apply()

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SAVE_WALLET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateActiveWallet(id: String, promise: Promise) {
        try {
            val walletDataString: String? = prefs.all["appAllWallet"]?.toString()
            if (walletDataString.isNullOrEmpty()) {
                return promise.reject("DECODING_ERROR", "No wallets found")
            }

            val walletArray = JSONArray(walletDataString)
            var matchedWallet: JSONObject? = null

            for (i in 0 until walletArray.length()) {
                val wallet = walletArray.getJSONObject(i)
                if (wallet.optString("walletId") == id) {
                    matchedWallet = wallet
                    break
                }
            }

            matchedWallet ?: return promise.reject("WALLET_ID_NOT_FOUND", "Wallet with $id not found")
            prefs.edit().putString("activeUserWallet", matchedWallet.toString()).apply()

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("mode", "replace")
                putString("walletId", id)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("UPDATE_WALLET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getAllWallets(promise: Promise) {
        try {
            val walletDataString: String? = prefs.all["appAllWallet"]?.toString()
            if (walletDataString.isNullOrEmpty()) {
                val result = Arguments.createMap().apply {
                    putBoolean("success", false)
                    putArray("wallets", Arguments.createArray())
                }
                return promise.resolve(result)
            }

            val walletJson = JSONArray(walletDataString)
            val filteredWallets = Arguments.createArray()

            for (i in 0 until walletJson.length()) {
                val wallet = walletJson.getJSONObject(i)
                val filtered = Arguments.createMap().apply {
                    putString("walletId", wallet.optString("walletId"))
                    putString("name", wallet.optString("name"))
                    putString("address", wallet.optString("address"))
                    putString("stellarPublicKey", wallet.optString("stellarPublicKey"))
                    putString("walletType", wallet.optString("walletType"))
                    putString("dydxAddress", wallet.optString("dydxAddress"))
                }
                filteredWallets.pushMap(filtered)
            }

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putArray("wallets", filteredWallets)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getWalletAddress(promise: Promise) {
        try {
            val walletString: String? = prefs.all["activeUserWallet"]?.toString()
            if (walletString.isNullOrEmpty()) {
                val result = Arguments.createMap().apply {
                    putBoolean("success", false)
                    putNull("wallet")
                }
                return promise.resolve(result)
            }

            val walletJson = JSONObject(walletString)
            val response = Arguments.createMap().apply {
                putString("address", walletJson.optString("address"))
                putString("stellarPublicKey", walletJson.optString("stellarPublicKey"))
                putString("name", walletJson.optString("name"))
                putString("walletId", walletJson.optString("walletId"))
                putString("walletType", walletJson.optString("walletType"))
                putString("dydxAddress", walletJson.optString("dydxAddress"))
            }

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putMap("wallet", response)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_WALLET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getWalletInfo(promise: Promise) {
        try {
            val walletString: String? = prefs.all["activeUserWallet"]?.toString()
            if (walletString.isNullOrEmpty()) {
                val result = Arguments.createMap().apply {
                    putBoolean("success", false)
                    putNull("wallet")
                }
                return promise.resolve(result)
            }

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("wallet", walletString)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_WALLET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun delete(key: String, promise: Promise) {
        try {
            val walletDataString: String? = prefs.all["appAllWallet"]?.toString()
            if (walletDataString.isNullOrEmpty()) {
                return promise.reject("DECODING_ERROR", "No wallets found")
            }

            val walletArray = JSONArray(walletDataString)
            var walletForRemove = -1

            for (i in (walletArray.length()-1)downTo 0) {
                val wallet = walletArray.getJSONObject(i)
                if (wallet.optString("walletId") == key) {
                    walletForRemove = i
                    break
                }
            }

            if(walletForRemove != -1){
                walletArray.remove(walletForRemove)
                prefs.edit()
                .putString("appAllWallet", walletArray.toString())
                .apply()
                promise.resolve("wallet_removed")
            }
            else{
                promise.reject("DELETE_ERROR","wallet delete failed")
            }
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun renameWallet(key: String, walletName: String, promise: Promise) {
        try {
            val walletDataString: String? = prefs.all["appAllWallet"]?.toString()
            if (walletDataString.isNullOrEmpty()) {
                return promise.reject("DECODING_ERROR", "No wallet found")
            }

            val walletArray = JSONArray(walletDataString)
            var walletForRename = -1

            for (i in 0 until walletArray.length()) {
                val wallet = walletArray.getJSONObject(i)
                if (wallet.optString("walletId") == key) {
                    walletForRename = i
                    break
                }
            }

            if (walletForRename != -1) {
                val userWallet = walletArray.getJSONObject(walletForRename)
                userWallet.put("name", walletName)
                prefs.edit()
                    .putString("appAllWallet", walletArray.toString())
                    .apply()
                
                val result = Arguments.createMap().apply {
                 putBoolean("success", true)
                 putString("user wallet updated to", walletName)
                }
                promise.resolve(result)
            } else {
                promise.reject("RENAME_ERROR", "wallet rename failed")
            }
        } catch (e: Exception) {
            promise.reject("RENAME_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getAllKeys(promise: Promise) {
        try {
            val allEntries = prefs.all
            val keys = Arguments.createArray()
            allEntries.keys.forEach { keys.pushString(it) }

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putArray("keys", keys)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_ALL_KEYS_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearAll(promise: Promise) {
        try {
            prefs.edit().clear().apply()
            val result = Arguments.createMap().apply {
                putBoolean("success", true)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CLEAR_ALL_ERROR", e.message)
        }
    }
}

