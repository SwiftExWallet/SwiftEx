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
        if (!TransactionAuthPolicy.isEnabled(prefs)) {
            onAuthenticated()
            return
        }

        val activity = reactApplicationContext.currentActivity as? FragmentActivity
            ?: return promise.reject("ACTIVITY_UNAVAILABLE", "No active activity")

        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val canAuthenticate = BiometricManager.from(activity).canAuthenticate(authenticators)
        if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
            return NativePinBottomSheet.show(
                activity,
                onSubmit = { pin ->
                    try {
                        val result = AppPinVerifier.authenticate(prefs, pin)
                        if (result.status == PinAttemptStatus.SUCCESS) onAuthenticated()
                        else promise.rejectPinAttempt(result)
                    } catch (e: Exception) {
                        promise.reject("PIN_AUTH_ERROR", "Unable to validate app PIN", e)
                    }
                },
                onCancel = { promise.reject("AUTH_CANCELLED", "Authentication cancelled") },
            )
        }

        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        AppPinVerifier.recordDeviceSuccess(prefs)
                        onAuthenticated()
                    } catch (e: Exception) {
                        promise.reject("PIN_AUTH_ERROR", "Unable to reset PIN lock", e)
                    }
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
            try { prompt.authenticate(promptInfo) } catch (error: RuntimeException) {
                promise.reject("AUTH_FAILED", error.message, error)
            }
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

    // ---------------------------------------------------------------------------------------
    // Aster (Perps) withdraw signature — a SEPARATE method; existing signing is untouched.
    // Signs ONLY Aster's EIP-712 withdraw Action to the signing wallet's own address:
    //   domain.name == "Aster", primaryType == "Action", message.type == "Withdraw",
    //   message.destination == this wallet's address (case-insensitive). Anything else is
    //   rejected before any key is touched or the PIN/biometric prompt is shown.
    // Encoding: web3j's EIP-712 encoder with field names allowed to contain spaces
    // ("destination Chain", "aster chain") — see org.web3j.crypto.RelaxedIdentifierStructuredDataEncoder.
    // Same key lookup, same PIN/biometric gate, same signature format as signTypedData.
    // Never logs the payload or the signature.
    // Aster docs: EIP-712 "Action" for EVM withdraws (names, types and order must match exactly).
    private val ASTER_ACTION_FIELDS = listOf(
        "type" to "string", "destination" to "address", "destination Chain" to "string",
        "token" to "string", "amount" to "string", "fee" to "string",
        "nonce" to "uint256", "aster chain" to "string"
    )

    private fun asterWithdrawPayloadError(typedDataJson: String, walletAddress: String): String? {
        return try {
            val root = JSONObject(typedDataJson)
            val domain = root.optJSONObject("domain") ?: return "Missing domain"
            val message = root.optJSONObject("message") ?: return "Missing message"
            val types = root.optJSONObject("types") ?: return "Missing types"
            val action = types.optJSONArray("Action") ?: return "Missing Action type"
            val actionFields = (0 until action.length()).map {
                val f = action.getJSONObject(it)
                f.optString("name") to f.optString("type")
            }
            when {
                domain.optString("name") != "Aster" -> "Not an Aster request"
                root.optString("primaryType") != "Action" -> "Not an Aster Action"
                actionFields != ASTER_ACTION_FIELDS -> "Unexpected Action fields"
                types.keys().asSequence().any { it != "Action" && it != "EIP712Domain" } -> "Unexpected types"
                message.optString("type") != "Withdraw" -> "Not a withdraw"
                !message.optString("destination").equals(walletAddress, ignoreCase = true) ->
                    "Withdraw destination must be your own address"
                else -> null
            }
        } catch (e: Exception) {
            "Invalid request"
        }
    }

    @ReactMethod
    fun signAsterWithdraw(
        chainName: String,
        walletAddress: String,
        typedDataJson: String,
        promise: Promise
    ) {
        val payloadError = asterWithdrawPayloadError(typedDataJson, walletAddress)
        if (payloadError != null) return promise.reject("ASTER_WITHDRAW_REJECTED", payloadError)

        authenticateForSigning(promise) {
        try {
            val privateKeyHex = getPrivateKey(chainName) ?:
                return@authenticateForSigning promise.reject("PRIVATE_KEY_ERROR", "Private key not found")

            val credentials = Credentials.create(privateKeyHex)
            // The key that signs must be the destination's owner (own-address-only withdraws).
            val destination = JSONObject(typedDataJson).getJSONObject("message").getString("destination")
            if (!credentials.address.equals(destination, ignoreCase = true) ||
                !credentials.address.equals(walletAddress, ignoreCase = true)) {
                return@authenticateForSigning promise.reject(
                    "ASTER_WITHDRAW_REJECTED", "Withdraw destination must be your own address"
                )
            }

            val hash = RelaxedIdentifierStructuredDataEncoder(typedDataJson).hashStructuredData()
            val signature = Sign.signMessage(hash, credentials.ecKeyPair, false)

            val r   = Numeric.toHexStringNoPrefix(signature.r).padStart(64, '0')
            val s   = Numeric.toHexStringNoPrefix(signature.s).padStart(64, '0')
            val v   = (signature.v[0].toInt() and 0xFF).toString(16).padStart(2, '0')
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("signature", "0x$r$s$v")
            })
        } catch (e: Exception) {
            promise.reject("SIGN_ASTER_WITHDRAW_ERROR", "Could not sign the withdrawal")
        }
        }
    }

    // Aster user-withdraw REQUEST signed entirely by the main wallet (no agent key), one prompt:
    //  1. checks the withdraw Action (same rules as signAsterWithdraw) and the request query,
    //  2. signs the Action -> userSignature,
    //  3. appends "&userSignature=<sig>" to the query and signs it as Aster v3 Message{msg}
    //     (domain AsterSignTransaction / chainId 1666) with the same key.
    // The query may contain ONLY: user, signer, chainId, asset, amount, fee, receiver, userNonce,
    // nonce — each once, plain [0-9A-Za-z.] values. user == signer == receiver == this wallet,
    // chainId 56, and asset/amount/fee/receiver/userNonce must equal the signed Action.
    // Resolves { userSignature, msg, signature }: send exactly msg + "&signature=" + signature.
    private val ASTER_REQUEST_KEYS = setOf(
        "user", "signer", "chainId", "asset", "amount", "fee", "receiver", "userNonce", "nonce"
    )
    private val ASTER_PARAM_VALUE = Regex("^[0-9A-Za-z.]{1,80}$")
    // EVM withdraw chains Aster supports (chainId -> "destination Chain" name, from Aster docs).
    private val ASTER_WITHDRAW_CHAINS = mapOf("1" to "ETH", "56" to "BSC", "42161" to "Arbitrum")

    private fun asterDomainChainId(typedDataJson: String): String? = try {
        JSONObject(typedDataJson).getJSONObject("domain").get("chainId").toString()
    } catch (e: Exception) {
        null
    }

    private fun asterRequestError(query: String, typedDataJson: String, walletAddress: String): String? {
        return try {
            val params = mutableMapOf<String, String>()
            for (part in query.split("&")) {
                val i = part.indexOf('=')
                if (i <= 0) return "Invalid request"
                val k = part.substring(0, i)
                val v = part.substring(i + 1)
                if (k !in ASTER_REQUEST_KEYS || params.containsKey(k)) return "Unexpected request field"
                if (!ASTER_PARAM_VALUE.matches(v)) return "Invalid request value"
                params[k] = v
            }
            if (params.keys != ASTER_REQUEST_KEYS) return "Incomplete request"
            val message = JSONObject(typedDataJson).getJSONObject("message")
            when {
                !params["user"]!!.equals(walletAddress, ignoreCase = true) -> "Request user must be your wallet"
                !params["signer"]!!.equals(walletAddress, ignoreCase = true) -> "Request signer must be your wallet"
                !params["receiver"]!!.equals(walletAddress, ignoreCase = true) -> "Receiver must be your own address"
                !params["receiver"]!!.equals(message.optString("destination"), ignoreCase = true) -> "Receiver mismatch"
                ASTER_WITHDRAW_CHAINS[params["chainId"]] == null -> "Unsupported chain"
                // The signed Action must be for the same chain as the request (Aster docs:
                // domain.chainId = withdraw chain, "destination Chain" = that chain's name).
                asterDomainChainId(typedDataJson) != params["chainId"] -> "Chain mismatch"
                message.optString("destination Chain") != ASTER_WITHDRAW_CHAINS[params["chainId"]] -> "Chain mismatch"
                message.optString("aster chain") != "Mainnet" -> "Unsupported network"
                params["asset"] != message.optString("token") -> "Asset mismatch"
                params["amount"] != message.optString("amount") -> "Amount mismatch"
                params["fee"] != message.optString("fee") -> "Fee mismatch"
                params["userNonce"] != message.optString("nonce") -> "Nonce mismatch"
                else -> null
            }
        } catch (e: Exception) {
            "Invalid request"
        }
    }

    private fun sigHex(hash: ByteArray, credentials: Credentials): String {
        val signature = Sign.signMessage(hash, credentials.ecKeyPair, false)
        val r = Numeric.toHexStringNoPrefix(signature.r).padStart(64, '0')
        val s = Numeric.toHexStringNoPrefix(signature.s).padStart(64, '0')
        val v = (signature.v[0].toInt() and 0xFF).toString(16).padStart(2, '0')
        return "0x$r$s$v"
    }

    private fun asterRequestTypedData(msg: String): String {
        val zero = "0x0000000000000000000000000000000000000000"
        fun field(n: String, t: String) = JSONObject().put("name", n).put("type", t)
        return JSONObject()
            .put("primaryType", "Message")
            .put("types", JSONObject()
                .put("EIP712Domain", org.json.JSONArray()
                    .put(field("name", "string")).put(field("version", "string"))
                    .put(field("chainId", "uint256")).put(field("verifyingContract", "address")))
                .put("Message", org.json.JSONArray().put(field("msg", "string"))))
            .put("domain", JSONObject()
                .put("name", "AsterSignTransaction").put("version", "1")
                .put("chainId", 1666).put("verifyingContract", zero))
            .put("message", JSONObject().put("msg", msg))
            .toString()
    }

    @ReactMethod
    fun signAsterWithdrawRequest(
        chainName: String,
        walletAddress: String,
        typedDataJson: String,
        requestQuery: String,
        promise: Promise
    ) {
        val payloadError = asterWithdrawPayloadError(typedDataJson, walletAddress)
            ?: asterRequestError(requestQuery, typedDataJson, walletAddress)
        if (payloadError != null) return promise.reject("ASTER_WITHDRAW_REJECTED", payloadError)

        authenticateForSigning(promise) {
        try {
            val privateKeyHex = getPrivateKey(chainName) ?:
                return@authenticateForSigning promise.reject("PRIVATE_KEY_ERROR", "Private key not found")
            val credentials = Credentials.create(privateKeyHex)
            if (!credentials.address.equals(walletAddress, ignoreCase = true)) {
                return@authenticateForSigning promise.reject(
                    "ASTER_WITHDRAW_REJECTED", "Withdraw destination must be your own address"
                )
            }
            val userSignature = sigHex(
                RelaxedIdentifierStructuredDataEncoder(typedDataJson).hashStructuredData(), credentials
            )
            val msg = "$requestQuery&userSignature=$userSignature"
            val requestSignature = sigHex(
                StructuredDataEncoder(asterRequestTypedData(msg)).hashStructuredData(), credentials
            )
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("userSignature", userSignature)
                putString("msg", msg)
                putString("signature", requestSignature)
            })
        } catch (e: Exception) {
            promise.reject("SIGN_ASTER_WITHDRAW_ERROR", "Could not sign the withdrawal")
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
