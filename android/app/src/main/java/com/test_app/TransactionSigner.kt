package org.app.swiftEx.wallet

import com.facebook.react.bridge.*
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject
import org.web3j.crypto.*
import org.web3j.utils.Numeric

class TransactionSigner(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "TransactionSigner"
    private val PREF_NAME = SecureWalletStore.PREF_NAME
    private val prefs by lazy { SecureWalletStore.open(reactApplicationContext) }

    override fun getName() = "TransactionSigner"

    private fun authenticateForSigning(promise: Promise, onAuthenticated: () -> Unit) {
        val activity = reactApplicationContext.currentActivity as? FragmentActivity
            ?: return promise.reject("ACTIVITY_UNAVAILABLE", "No active activity")

        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val canAuthenticate = BiometricManager.from(activity).canAuthenticate(authenticators)
        if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
            return promise.reject("AUTH_UNAVAILABLE", "Device authentication is not available")
        }

        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onAuthenticated()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val code = if (
                        errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                        errorCode == BiometricPrompt.ERROR_CANCELED
                    ) "AUTH_CANCELLED" else "AUTH_FAILED"
                    promise.reject(code, errString.toString())
                }

                override fun onAuthenticationFailed() {
                    Log.w(TAG, "Biometric authentication attempt failed")
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate to sign transaction")
            .setSubtitle("Confirm it is you before this wallet signs.")
            .setAllowedAuthenticators(authenticators)
            .build()

        activity.runOnUiThread {
            prompt.authenticate(promptInfo)
        }
    }

    @ReactMethod
    fun signTransaction(
        chainName: String,
        walletAddress: String,
        rawUnsignedTx: String,
        chainId: Int,
        promise: Promise
    ) {
    authenticateForSigning(promise) {
        try {
            val privateKeyHex = getPrivateKey(chainName) ?:
            return@authenticateForSigning promise.reject("PRIVATE_KEY_NOT_FOUND", "Private key not found")

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
    }

    @ReactMethod
    fun signPersonalMessage(
        chainName: String,
        walletAddress: String,
        messageHex: String,
        promise: Promise
    ) {
    authenticateForSigning(promise) {
        try {
            val privateKeyHex = getPrivateKey(chainName)
                ?: return@authenticateForSigning promise.reject("PRIVATE_KEY_NOT_FOUND", "Private key not found")

            val credentials = Credentials.create(privateKeyHex)

            val messageBytes: ByteArray = if (
                messageHex.length >= 2 &&
                messageHex[0] == '0' &&
                (messageHex[1] == 'x' || messageHex[1] == 'X')
            ) {
                Numeric.hexStringToByteArray(messageHex.substring(2))
            } else {
                messageHex.toByteArray(Charsets.UTF_8)
            }

            val prefix = "\u0019Ethereum Signed Message:\n${messageBytes.size}"
                .toByteArray(Charsets.UTF_8)

            val prefixedMsg = prefix + messageBytes
            val hash = Hash.sha3(prefixedMsg)

            val signature = Sign.signMessage(hash, credentials.ecKeyPair, false)

            val r = Numeric.toHexStringNoPrefix(signature.r).padStart(64, '0')
            val s = Numeric.toHexStringNoPrefix(signature.s).padStart(64, '0')
            val v = (signature.v[0].toInt() and 0xFF).toString(16).padStart(2, '0')

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("signature", "0x$r$s$v")
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SIGN_MESSAGE_ERROR", e.message ?: e.javaClass.simpleName)
            }
        }
    }

    @ReactMethod
    fun signTypedData(
        chainName: String,
        walletAddress: String,
        typedDataJson: String,
        promise: Promise
    ) {
        authenticateForSigning(promise) {
        try {
            val privateKeyHex = getPrivateKey(chainName) ?:
                return@authenticateForSigning promise.reject("PRIVATE_KEY_ERROR", "Private key not found")

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
    }

    private fun getPrivateKey(chainName: String): String? {
        val walletJson = prefs.all["activeUserWallet"]?.toString() ?: return null
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
