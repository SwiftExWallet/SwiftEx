package org.app.swiftEx.wallet

import com.facebook.react.bridge.*
import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONObject
import org.web3j.crypto.*
import org.web3j.utils.Numeric

class TransactionSigner(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "TransactionSigner"
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

    override fun getName() = "TransactionSigner"

    @ReactMethod
    fun signTransaction(
        chainName: String,
        walletAddress: String,
        rawUnsignedTx: String,
        chainId: Int,
        promise: Promise
    ) {
        try {
            val privateKeyHex = getPrivateKey(chainName) ?:
            return promise.reject("PRIVATE_KEY_NOT_FOUND", "Private key not found")

            val credentials = Credentials.create(privateKeyHex)
            val txJson = JSONObject(rawUnsignedTx)

            val nonce = Numeric.toBigInt(Numeric.cleanHexPrefix(txJson.getString("nonce")))
            val gasPrice = Numeric.toBigInt(Numeric.cleanHexPrefix(txJson.getString("gasPrice")))
            val gasLimit = Numeric.toBigInt(Numeric.cleanHexPrefix(txJson.getString("gasLimit")))
            val value = Numeric.toBigInt(Numeric.cleanHexPrefix(txJson.getString("value")))
            val toAddress = txJson.getString("to")
            val data = Numeric.cleanHexPrefix(txJson.getString("data"))

            val rawTransaction = RawTransaction.createTransaction(
                nonce,
                gasPrice,
                gasLimit,
                toAddress,
                value,
                if (data.isEmpty()) "0x" else "0x$data"
            )

            val signedMessage = TransactionEncoder.signMessage(
                rawTransaction,
                chainId.toLong(),
                credentials
            )

            val signedTx = "0x${Numeric.toHexString(signedMessage)}"

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("signedTx", signedTx)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SIGN_ERROR", e.message)
        }
    }

    @ReactMethod
    fun signTypedData(
        chainName: String,
        walletAddress: String,
        typedDataJson: String,
        promise: Promise
    ) {
        try {
            val privateKeyHex = getPrivateKey(chainName) ?:
                return promise.reject("PRIVATE_KEY_ERROR", "Private key not found")

            val credentials = Credentials.create(privateKeyHex)
            val structuredData = StructuredDataEncoder(typedDataJson)
            val hash           = structuredData.hashStructuredData()
            val signature = Sign.signMessage(hash, credentials.ecKeyPair, false)

            val r   = Numeric.toHexStringNoPrefix(signature.r).padStart(64, '0')
            val s   = Numeric.toHexStringNoPrefix(signature.s).padStart(64, '0')
            val v   = (signature.v[0].toInt() and 0xFF).toString(16).padStart(2, '0')
            val sig = "0x$r$s$v"

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("signature", sig)
            }
            promise.resolve(result)

        } catch (e: Exception) {
            promise.reject("SIGN_TYPED_ERROR", e.message)
        }
    }

    private fun getPrivateKey(chainName: String): String? {
        val walletJson: String? = prefs.all["activeUserWallet"]?.toString() ?: return null
        return try {
            val json = JSONObject(walletJson)
            val privateKey = json.optString("privatekey")
            if (privateKey.isNullOrEmpty()) null else privateKey
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse wallet JSON", e)
            null
        }
    }
}
