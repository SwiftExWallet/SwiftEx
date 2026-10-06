package org.app.swiftEx.wallet

import com.facebook.react.bridge.*
import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONObject
import org.stellar.sdk.*
import java.security.MessageDigest


class StellarSigner(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "StellarSigner"
    private val PREF_NAME = "com_swiftEx_app_secure_v2"
    private val KEY_WALLET = "activeUserWallet"
    private val stellarServer = Server("https://horizon.stellar.org")

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

    override fun getName() = "StellarSigner"

    @ReactMethod
    fun getAssets(publicKey: String, promise: Promise) {
        Thread {
            try {
                val account = stellarServer.accounts().account(publicKey)

                val result = Arguments.createMap().apply {
                    putString("accountId", account.accountId)
                    val balances = Arguments.createArray()
                    for (balance in account.balances) {
                        val b = Arguments.createMap()
                        if (balance.assetType == "native") {
                            b.putString("assetType", "native")
                            b.putString("balance", balance.balance)
                        } else {
                            b.putString("assetType", "credit")
                            b.putString("assetCode", balance.assetCode ?: "")
                            b.putString("issuer", balance.assetIssuer ?: "")
                            b.putString("balance", balance.balance)
                        }
                        balances.pushMap(b)
                    }
                    putArray("balances", balances)
                }

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("STELLAR_ERROR", e.message)
            }
        }.start()
    }

    @ReactMethod
    fun signTransaction(transactionXDR: String, promise: Promise) {
        Thread {
            try {
                val secretKey = getPrivateKey() ?: run {
                    promise.reject("PRIVATE_KEY_NOT_FOUND", "No wallet found")
                    return@Thread
                }

                val sourceKeyPair = KeyPair.fromSecretSeed(secretKey)
                val network = Network.PUBLIC
                val envelope = Transaction.fromEnvelopeXdr(
                    transactionXDR,
                    network
                )
                envelope.sign(sourceKeyPair)
                val signedEnvelopeXDR = envelope.toEnvelopeXdrBase64()
                val hash = envelope.hash()
                val hashHex = hash.joinToString("") { "%02x".format(it) }
                val signatures = envelope.signatures
                val signatureBase64 = if (signatures.isNotEmpty()) {
                    val lastSignature = signatures[signatures.size - 1]
                    android.util.Base64.encodeToString(
                        lastSignature.signature.signature,
                        android.util.Base64.NO_WRAP
                    )
                } else {
                    ""
                }

                val result = Arguments.createMap().apply {
                    putString("signedXDR", signedEnvelopeXDR)
                    putString("signature", signatureBase64)
                    putString("publicKey", sourceKeyPair.accountId)
                    putString("hash", hashHex)
                }

                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Signing failed", e)
                promise.reject("SIGN_ERROR", "${e.message} | ${e.stackTraceToString()}")
            }
        }.start()
    }

    private fun ByteArray.toHexString(): String =
        this.joinToString("") { "%02x".format(it) }

    private fun sha256(input: ByteArray): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(input)
    }


    private fun getPrivateKey(): String? {
        val walletJson: String? = prefs.all[KEY_WALLET]?.toString()
        if (walletJson.isNullOrEmpty()) return null

        return try {
            val json = JSONObject(walletJson)
            val privateKey = json.optString("stellarPrivateKey")
            if (privateKey.isNullOrEmpty()) null else privateKey
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse stellar wallet JSON", e)
            null
        }
    }

}
