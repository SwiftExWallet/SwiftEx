package org.app.swiftEx.wallet.ethwallet
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.security.crypto.MasterKeys
import org.web3j.crypto.Credentials;
import org.web3j.crypto.Bip32ECKeyPair;
import org.web3j.utils.Numeric;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.Arguments;
import java.security.SecureRandom;
import org.stellar.sdk.KeyPair;
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject

class EthereumWalletModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val PREF_NAME = "com_swiftEx_app_secure"
    private val PREF_NAME_V2 = "com_swiftEx_app_secure_v2"

    private val legacyKey: MasterKey by lazy {
        try {
            val alias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            MasterKey.Builder(reactApplicationContext, alias)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
        } catch (e: Exception) {
            MasterKey.Builder(reactApplicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
        }
    }

    private val secureKey: MasterKey by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val spec = KeyGenParameterSpec.Builder(
                    "_swiftex_master_key_v2_",
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(true)
                    .setUserAuthenticationParameters(
                        0,
                        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
                    )
                    .setInvalidatedByBiometricEnrollment(true)
                    .build()

                MasterKey.Builder(reactApplicationContext, "_swiftex_master_key_v2_")
                    .setKeyGenParameterSpec(spec)
                    .build()
            } catch (_: Exception) {
                legacyKey
            }
        } else {
            legacyKey
        }
    }

    private val legacyPrefs by lazy {
        try {
            EncryptedSharedPreferences.create(
                reactApplicationContext,
                PREF_NAME,
                legacyKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            reactApplicationContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        }
    }

    private val prefs by lazy {
        try {
            EncryptedSharedPreferences.create(
                reactApplicationContext,
                PREF_NAME_V2,
                secureKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            legacyPrefs
        }
    }

    override fun getName(): String {
        return "EthereumWallet"
    }

    private fun walletId(): String = (1000 + SecureRandom().nextInt(9000)).toString()

    private fun saveWalletAndActivate(wallet: JSONObject) {
        val usersArray = JSONArray().apply {
            val existing = prefs.all["appAllWallet"]?.toString()
            if (!existing.isNullOrEmpty()) {
                val arr = JSONArray(existing)
                for (i in 0 until arr.length()) put(arr.get(i))
            }
            put(wallet)
        }
        prefs.edit()
            .putString("appAllWallet", usersArray.toString())
            .putString("activeUserWallet", wallet.toString())
            .apply()
    }

    private fun publicWalletResponse(wallet: JSONObject): WritableMap {
        return Arguments.createMap().apply {
            putString("walletId", wallet.optString("walletId"))
            putString("name", wallet.optString("name"))
            putString("address", wallet.optString("address"))
            putString("stellarPublicKey", wallet.optString("stellarPublicKey"))
            putString("walletType", wallet.optString("walletType"))
            putMap("xrp", Arguments.createMap().apply {
                putString("address", "000000000")
            })
            putMap("stellarWallet", Arguments.createMap().apply {
                putString("publicKey", wallet.optString("stellarPublicKey"))
            })
        }
    }

    private fun buildStoredWallet(
        name: String,
        address: String,
        privatekey: String,
        stellarPublicKey: String,
        stellarPrivateKey: String,
        mnemonic: String
    ): JSONObject {
        return JSONObject().apply {
            put("walletId", walletId())
            put("name", name)
            put("address", address)
            put("privatekey", privatekey)
            put("stellarPublicKey", stellarPublicKey)
            put("stellarPrivateKey", stellarPrivateKey)
            put("mnemonic", mnemonic)
            put("walletType", "Multi-coin")
        }
    }

    private fun mnemonicToSeed(mnemonic: String, passphrase: String = ""): ByteArray {
        val factory = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512")
        val salt = ("mnemonic" + passphrase).toByteArray(Charsets.UTF_8)
        val spec = javax.crypto.spec.PBEKeySpec(
            mnemonic.toCharArray(),
            salt,
            2048,
            512
        )
        return factory.generateSecret(spec).encoded
    }

    private fun deriveStellarFromSeed(seed: ByteArray): Pair<String, String> {
        val hmac = javax.crypto.Mac.getInstance("HmacSHA512")
        hmac.init(javax.crypto.spec.SecretKeySpec("ed25519 seed".toByteArray(), "HmacSHA512"))
        var I = hmac.doFinal(seed)

        val path = intArrayOf(
            44 or 0x80000000.toInt(),
            148 or 0x80000000.toInt(),
            0 or 0x80000000.toInt()
        )

        for (index in path) {
            val il = I.copyOfRange(0, 32)
            val ir = I.copyOfRange(32, 64)

            val data = ByteArray(37)
            data[0] = 0x00
            System.arraycopy(il, 0, data, 1, 32)
            data[33] = (index ushr 24).toByte()
            data[34] = (index ushr 16).toByte()
            data[35] = (index ushr 8).toByte()
            data[36] = index.toByte()

            hmac.init(javax.crypto.spec.SecretKeySpec(ir, "HmacSHA512"))
            I = hmac.doFinal(data)
        }

        val privateKey32 = I.copyOfRange(0, 32)
        val stellarKeyPair = KeyPair.fromSecretSeed(privateKey32)
        return Pair(stellarKeyPair.accountId, String(stellarKeyPair.secretSeed))
    }

    @ReactMethod
    fun createWallet(name: String, promise: Promise) {
        try {
            val entropy = ByteArray(16)
            SecureRandom().nextBytes(entropy)

            val mnemonic = org.web3j.crypto.MnemonicUtils.generateMnemonic(entropy)

            val seed = mnemonicToSeed(mnemonic)
            val masterKeyPair = Bip32ECKeyPair.generateKeyPair(seed)

            // Ethereum
            val ethPath = intArrayOf(
                44 or Bip32ECKeyPair.HARDENED_BIT,
                60 or Bip32ECKeyPair.HARDENED_BIT,
                0 or Bip32ECKeyPair.HARDENED_BIT,
                0,
                0
            )
            val ethChildKeyPair = Bip32ECKeyPair.deriveKeyPair(masterKeyPair, ethPath)
            val credentials = Credentials.create(ethChildKeyPair)

            val (stellarPublicKey, stellarSecretKey) = deriveStellarFromSeed(seed)
            val wallet = buildStoredWallet(
                name,
                credentials.address,
                Numeric.toHexStringWithPrefix(ethChildKeyPair.privateKey),
                stellarPublicKey,
                stellarSecretKey,
                mnemonic
            )
            saveWalletAndActivate(wallet)
            promise.resolve(publicWalletResponse(wallet))
        } catch (e: Exception) {
            e.printStackTrace()
            promise.reject("WALLET_CREATION_ERROR", "Error creating wallet: ${e.message}", e)
        }
    }

    @ReactMethod
    fun recoverMultiChainWallet(mnemonic: String, name: String, promise: Promise) {
        try {
            val seed = mnemonicToSeed(mnemonic)
            val masterKeyPair = Bip32ECKeyPair.generateKeyPair(seed)

            // Ethereum
            val ethPath = intArrayOf(
                44 or Bip32ECKeyPair.HARDENED_BIT,
                60 or Bip32ECKeyPair.HARDENED_BIT,
                0 or Bip32ECKeyPair.HARDENED_BIT,
                0,
                0
            )
            val ethChildKeyPair = Bip32ECKeyPair.deriveKeyPair(masterKeyPair, ethPath)
            val ethCredentials = Credentials.create(ethChildKeyPair)

            val (stellarPublicKey, stellarSecretKey) = deriveStellarFromSeed(seed)
            val wallet = buildStoredWallet(
                name,
                ethCredentials.address,
                Numeric.toHexStringWithPrefix(ethChildKeyPair.privateKey),
                stellarPublicKey,
                stellarSecretKey,
                mnemonic
            )
            saveWalletAndActivate(wallet)
            promise.resolve(publicWalletResponse(wallet))
        } catch (e: Exception) {
            e.printStackTrace()
            promise.reject("WALLET_RESTORE_ERROR", "Error restoring wallet: ${e.message}", e)
        }
    }

    @ReactMethod
    fun importEthPrivateKey(privateKey: String, name: String, promise: Promise) {
        try {
            val cleanKey = privateKey.removePrefix("0x")
            if (cleanKey.length != 64) throw IllegalArgumentException("Invalid private key length")
            val privateKeyBigInt = Numeric.toBigInt(cleanKey)
            val credentials = Credentials.create(privateKeyBigInt.toString(16))
            val stellarWallet = generateFreshStellarWallet()
            val wallet = buildStoredWallet(
                name,
                credentials.address,
                privateKey,
                stellarWallet["publicKey"] ?: "",
                stellarWallet["secretKey"] ?: "",
                ""
            )
            saveWalletAndActivate(wallet)
            promise.resolve(publicWalletResponse(wallet))
        } catch (e: Exception) {
            e.printStackTrace()
            promise.reject("IMPORT_ERROR", e.message ?: "Error importing Ethereum private key", e)
        }
    }

    @ReactMethod
    fun importStellarPrivateKey(secretKey: String, name: String, promise: Promise) {
        try {
            val keyPair = KeyPair.fromSecretSeed(secretKey)
            val ethereumWallet = generateFreshEthereumWallet()
            val wallet = buildStoredWallet(
                name,
                ethereumWallet["address"] ?: "",
                ethereumWallet["privatekey"] ?: "",
                keyPair.accountId,
                secretKey,
                ""
            )
            saveWalletAndActivate(wallet)
            promise.resolve(publicWalletResponse(wallet))
        } catch (e: Exception) {
            e.printStackTrace()
            promise.reject("IMPORT_ERROR", e.message ?: "Error importing Stellar private key", e)
        }
    }

    private fun generateFreshStellarWallet(): Map<String, String> {
        val entropy = ByteArray(16)
        SecureRandom().nextBytes(entropy)
        val mnemonic = org.web3j.crypto.MnemonicUtils.generateMnemonic(entropy)
        val seed = mnemonicToSeed(mnemonic)
        val (publicKey, secretKey) = deriveStellarFromSeed(seed)
        return mapOf(
            "publicKey" to publicKey,
            "secretKey" to secretKey,
            "mnemonic" to mnemonic
        )
    }

    private fun generateFreshEthereumWallet(): Map<String, String> {
        val entropy = ByteArray(16)
        SecureRandom().nextBytes(entropy)
        val mnemonic = org.web3j.crypto.MnemonicUtils.generateMnemonic(entropy)
        val seed = mnemonicToSeed(mnemonic)
        val masterKeyPair = Bip32ECKeyPair.generateKeyPair(seed)

        val ethPath = intArrayOf(
            44 or Bip32ECKeyPair.HARDENED_BIT,
            60 or Bip32ECKeyPair.HARDENED_BIT,
            0 or Bip32ECKeyPair.HARDENED_BIT,
            0,
            0
        )
        val ethChildKeyPair = Bip32ECKeyPair.deriveKeyPair(masterKeyPair, ethPath)
        val ethCredentials = Credentials.create(ethChildKeyPair)

        return mapOf(
            "address" to ethCredentials.address,
            "privatekey" to Numeric.toHexStringWithPrefix(ethChildKeyPair.privateKey),
            "publicKey" to Numeric.toHexStringWithPrefix(ethChildKeyPair.publicKey),
            "mnemonic" to mnemonic
        )
    }
}