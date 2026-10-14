package org.app.swiftEx.wallet
import android.app.Dialog
import com.facebook.react.bridge.*
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.security.crypto.MasterKeys
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "StorageModule"
    private val PREF_NAME = "com_swiftEx_app_secure"
    private val PREF_NAME_V2 = "com_swiftEx_app_secure_v2"
    private val PREF_NAME_V3 = "com_swiftEx_app_secure_v3"
    private val MIGRATION_FLAG = "swiftex_h4_migrated_v1"
    private val BACKUP_VIEWED_AT = "lastWalletBackupViewedAt"
    private val PIN_BACKUP_PREFS = "com_swiftEx_app_pin_recovery_v1"
    private val PIN_BACKUP_KEY = "recoveryEnvelope"
    private val PIN_BACKUP_VERSION = 1
    private val PIN_BACKUP_ITERATIONS = 600_000
    private val APP_PIN_VERIFIER_KEY = "appPinVerifier"

    private var prefs = SecureWalletStore.open(reactApplicationContext)
    private var runtimeStoreCorrupt = false

    private fun pinBackupPrefs() = reactApplicationContext.getSharedPreferences(
        PIN_BACKUP_PREFS,
        Context.MODE_PRIVATE
    )

    private fun derivePinKey(pin: String, salt: ByteArray): ByteArray {
        require(pin.length == 6) { "PIN must contain 6 digits" }
        require(pin.all { it.isDigit() }) { "PIN must contain digits only" }
        val spec = PBEKeySpec(pin.toCharArray(), salt, PIN_BACKUP_ITERATIONS, 256)
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    }

    private fun encryptPinBackup(pin: String, payload: String): String {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, javax.crypto.spec.SecretKeySpec(derivePinKey(pin, salt), "AES"), GCMParameterSpec(128, nonce))
        val ciphertext = cipher.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        return JSONObject().apply {
            put("version", PIN_BACKUP_VERSION)
            put("kdf", "PBKDF2-HMAC-SHA256")
            put("iterations", PIN_BACKUP_ITERATIONS)
            put("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            put("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP))
            put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
        }.toString()
    }

    private fun decryptPinBackup(pin: String, envelope: String): String {
        val value = JSONObject(envelope)
        require(value.optInt("version") == PIN_BACKUP_VERSION) { "Unsupported recovery backup" }
        require(value.optString("kdf") == "PBKDF2-HMAC-SHA256") { "Unsupported recovery KDF" }
        require(value.optInt("iterations") == PIN_BACKUP_ITERATIONS) { "Unsupported recovery parameters" }
        val salt = Base64.decode(value.getString("salt"), Base64.DEFAULT)
        val nonce = Base64.decode(value.getString("nonce"), Base64.DEFAULT)
        val ciphertext = Base64.decode(value.getString("ciphertext"), Base64.DEFAULT)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, javax.crypto.spec.SecretKeySpec(derivePinKey(pin, salt), "AES"), GCMParameterSpec(128, nonce))
        return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
    }

    private fun appPinVerifier(pin: String): String {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val derived = derivePinKey(pin, salt)
        return JSONObject().apply {
            put("version", 1)
            put("kdf", "PBKDF2-HMAC-SHA256")
            put("iterations", PIN_BACKUP_ITERATIONS)
            put("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            put("verifier", Base64.encodeToString(derived, Base64.NO_WRAP))
        }.toString()
    }

    private fun validateAppPinValue(pin: String, verifier: String): Boolean {
        val value = JSONObject(verifier)
        require(value.optInt("version") == 1)
        require(value.optString("kdf") == "PBKDF2-HMAC-SHA256")
        require(value.optInt("iterations") == PIN_BACKUP_ITERATIONS)
        val salt = Base64.decode(value.getString("salt"), Base64.DEFAULT)
        val expected = Base64.decode(value.getString("verifier"), Base64.DEFAULT)
        return java.security.MessageDigest.isEqual(expected, derivePinKey(pin, salt))
    }

    private fun oldV2AuthPrefs(): android.content.SharedPreferences {
                val spec = KeyGenParameterSpec.Builder(
                    "_swiftex_master_key_v2_",
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(true)
                    .setUserAuthenticationParameters(
                        0,   // timeout=0 → auth required on every use
                        KeyProperties.AUTH_BIOMETRIC_STRONG or
                                KeyProperties.AUTH_DEVICE_CREDENTIAL
                    )
                    .setInvalidatedByBiometricEnrollment(true)
                    .build()

        val key = MasterKey.Builder(reactApplicationContext, "_swiftex_master_key_v2_")
                    .setKeyGenParameterSpec(spec)
                    .build()
            return EncryptedSharedPreferences.create(
            reactApplicationContext,
            PREF_NAME_V2,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun oldV2LegacyPrefs(): android.content.SharedPreferences {
        val keyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        return EncryptedSharedPreferences.create(
            PREF_NAME,
            keyAlias,
                reactApplicationContext,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }

    private fun oldV3Prefs(): android.content.SharedPreferences {
        val keyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        return EncryptedSharedPreferences.create(
            PREF_NAME_V3,
            keyAlias,
            reactApplicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun readMigrationValue(
        key: String,
        oldV2AuthPrefs: android.content.SharedPreferences?,
        oldV2LegacyPrefs: android.content.SharedPreferences?,
        oldV3Prefs: android.content.SharedPreferences?,
        oldPlainPrefs: android.content.SharedPreferences?
    ): String? {
        return runCatching { oldV2AuthPrefs?.getString(key, null) }.getOrNull()
            ?: runCatching { oldV2LegacyPrefs?.getString(key, null) }.getOrNull()
            ?: runCatching { oldV3Prefs?.getString(key, null) }.getOrNull()
            ?: runCatching { oldPlainPrefs?.getString(key, null) }.getOrNull()
    }

    private fun describeError(error: Throwable): String {
        return error.message?.takeIf { it.isNotBlank() }
            ?: "${error.javaClass.simpleName}: secure storage operation failed"
    }

    private fun resetRuntimeStoreFromVerifiedLegacyData() {
        SecureWalletStore.delete(reactApplicationContext)
        prefs = SecureWalletStore.open(reactApplicationContext)
        runtimeStoreCorrupt = false
    }

    private fun hasHealthyMigrationState(): Boolean {
        if (!prefs.getBoolean(MIGRATION_FLAG, false)) return false
        // Read both wallet records so a corrupt value cannot be hidden behind a valid flag.
        prefs.getString("appAllWallet", null)
        prefs.getString("activeUserWallet", null)
        return true
    }

    override fun getName() = "StorageModule"

    @ReactMethod
    fun setAppPin(pin: String, promise: Promise) {
        try {
            derivePinKey(pin, ByteArray(16))
            prefs.edit().putString(APP_PIN_VERIFIER_KEY, appPinVerifier(pin)).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PIN_STORAGE_ERROR", "Unable to store app PIN verifier", e)
        }
    }

    @ReactMethod
    fun validateAppPin(pin: String, promise: Promise) {
        try {
            val verifier = prefs.getString(APP_PIN_VERIFIER_KEY, null)
            promise.resolve(verifier != null && validateAppPinValue(pin, verifier))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun publicWalletMap(w: JSONObject): WritableMap {
        return Arguments.createMap().apply {
            putString("address",          w.optString("address"))
            putString("stellarPublicKey", w.optString("stellarPublicKey"))
            putString("name",             w.optString("name"))
            putString("walletId",         w.optString("walletId"))
            putString("walletType",       w.optString("walletType"))
            putString("dydxAddress",      w.optString("dydxAddress"))
        }
    }

    private fun formatBackupText(w: JSONObject): String {
        val mnemonic = w.optString("mnemonic")
        val privateKey = w.optString("privatekey")
        val stellarPrivateKey = w.optString("stellarPrivateKey")

        val sections = mutableListOf<String>()
        if (mnemonic.isNotBlank()) sections.add("Mnemonic Phrase\n$mnemonic")
        if (privateKey.isNotBlank()) sections.add("Private Key\n$privateKey")
        if (stellarPrivateKey.isNotBlank()) sections.add("Stellar Private Key\n$stellarPrivateKey")
        return sections.joinToString("\n\n")
    }

    private fun dp(value: Int): Int {
        return (value * reactApplicationContext.resources.displayMetrics.density).toInt()
    }

    private fun authenticateForSecretView(promise: Promise, onAuthenticated: () -> Unit) {
        val activity = reactApplicationContext.currentActivity as? FragmentActivity
            ?: return promise.reject("ACTIVITY_UNAVAILABLE", "No active activity")

        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val canAuthenticate = BiometricManager.from(activity).canAuthenticate(authenticators)
        if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
            return NativePinBottomSheet.show(
                activity,
                onSubmit = { pin ->
                    if (AppPinVerifier.validate(prefs, pin)) onAuthenticated()
                    else promise.reject("PIN_INVALID", "Invalid app PIN")
                },
                onCancel = { promise.reject("AUTH_CANCELLED", "Authentication cancelled") },
            )
        }

        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
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
            .setTitle("Authenticate to view secret backup")
            .setSubtitle("Confirm it is you before this wallet shows recovery details.")
            .setAllowedAuthenticators(authenticators)
            .build()

        activity.runOnUiThread {
            prompt.authenticate(promptInfo)
        }
    }

    private fun showBackupScreen(backupText: String) {
        val activity = reactApplicationContext.currentActivity
            ?: throw IllegalStateException("No active activity")

        activity.runOnUiThread {
            val dialog = Dialog(activity)
            dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)

            val root = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.WHITE)
                setPadding(dp(20), dp(20), dp(20), dp(20))
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }

            val header = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val title = TextView(activity).apply {
                text = "Secure Wallet Backup"
                textSize = 20f
                setTextColor(Color.rgb(20, 24, 32))
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val close = Button(activity).apply {
                text = "Close"
                setOnClickListener { dialog.dismiss() }
            }

            header.addView(title)
            header.addView(close)
            root.addView(header)

            val warning = TextView(activity).apply {
                text = "Keep these recovery details private. Anyone with access can control your wallet."
                textSize = 14f
                setTextColor(Color.rgb(91, 98, 112))
                setPadding(0, dp(18), 0, dp(16))
            }
            root.addView(warning)

            val scroll = ScrollView(activity).apply {
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f
                )
            }

            val secretText = TextView(activity).apply {
                text = backupText
                textSize = 16f
                setTextColor(Color.rgb(20, 24, 32))
                setPadding(dp(16), dp(16), dp(16), dp(16))
                setTextIsSelectable(false)
                setBackgroundColor(Color.rgb(245, 247, 250))
            }
            scroll.addView(secretText)
            root.addView(scroll)

            dialog.setContentView(root)
            dialog.window?.setLayout(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            dialog.show()
            dialog.window?.setLayout(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
    }

    @ReactMethod
    fun migrateToSecureStorage(promise: Promise) {
        try {
            val alreadyMigrated = try {
                hasHealthyMigrationState()
            } catch (storageError: Exception) {
                runtimeStoreCorrupt = true
                Log.e(TAG, "V3 storage is unreadable; migration recovery required", storageError)
                false
            }
            if (alreadyMigrated) {
                return promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("status", "already_migrated")
                })
            }
            authenticateForSecretView(promise) { performSecureStorageMigration(promise) }
        } catch (e: Exception) {
            Log.e(TAG, "Secure storage unavailable before migration", e)
            promise.reject("SECURE_STORAGE_UNAVAILABLE", describeError(e), e)
        }
    }

    private fun performSecureStorageMigration(promise: Promise) {
        try {
            val oldV2Auth = runCatching { oldV2AuthPrefs() }
                .onFailure { Log.w(TAG, "Old v2 auth storage unavailable during migration", it) }
                .getOrNull()
            val oldV2Legacy = runCatching { oldV2LegacyPrefs() }
                .onFailure { Log.w(TAG, "Old encrypted legacy storage unavailable during migration", it) }
                .getOrNull()
            val oldV3 = runCatching { oldV3Prefs() }
                .onFailure { Log.w(TAG, "Previous v3 storage unavailable during migration", it) }
                .getOrNull()
            val oldPlain = runCatching {
                reactApplicationContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            }.getOrNull()?.takeIf { it.all.isNotEmpty() }
            if (oldV2Auth == null && oldV2Legacy == null && oldV3 == null && oldPlain == null) {
                return promise.reject("MIGRATION_ERROR", "No readable legacy wallet storage found")
            }
            val legacyWallets = readMigrationValue("appAllWallet", oldV2Auth, oldV2Legacy, oldV3, oldPlain)
            val legacyActive = readMigrationValue("activeUserWallet", oldV2Auth, oldV2Legacy, oldV3, oldPlain)

            if (legacyWallets.isNullOrEmpty() && legacyActive.isNullOrEmpty()) {
                if (runtimeStoreCorrupt) {
                    return promise.reject(
                        "SECURE_STORAGE_UNAVAILABLE",
                        "Encrypted v3 storage is unreadable and no legacy wallet was found"
                    )
                }
                if (!prefs.edit().putBoolean(MIGRATION_FLAG, true).commit()) {
                    return promise.reject("MIGRATION_ERROR", "Could not mark migration complete")
                }
                return promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("status", "fresh_install")
                })
            }

            if (runtimeStoreCorrupt) {
                resetRuntimeStoreFromVerifiedLegacyData()
            }

            val editor = prefs.edit()
            if (!legacyWallets.isNullOrEmpty()) editor.putString("appAllWallet", legacyWallets)
            if (!legacyActive.isNullOrEmpty()) editor.putString("activeUserWallet", legacyActive)
            editor.putBoolean(MIGRATION_FLAG, true)
            if (!editor.commit()) {
                return promise.reject("MIGRATION_ERROR", "Could not write v3 wallet storage")
            }

            if ((!legacyWallets.isNullOrEmpty() && prefs.getString("appAllWallet", null) != legacyWallets) ||
                (!legacyActive.isNullOrEmpty() && prefs.getString("activeUserWallet", null) != legacyActive) ||
                !prefs.getBoolean(MIGRATION_FLAG, false)
            ) {
                return promise.reject("MIGRATION_ERROR", "Could not verify v3 wallet storage")
            }

            listOfNotNull(oldV2Auth, oldV2Legacy, oldV3, oldPlain).forEach { source ->
                try {
                    source.edit().clear().commit()
                } catch (cleanupError: Exception) {
                    // Keep verified v3 data usable; an unreadable old source is retained for recovery.
                    Log.w(TAG, "Could not clear old migration source; retaining it", cleanupError)
                }
            }
            Log.i(TAG, "H-4 migration: wallet data moved to encrypted v3 store")
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("status", "migrated")
            })
        } catch (e: Exception) {
            Log.e(TAG, "Migration failed; source storage preserved", e)
            promise.reject("MIGRATION_ERROR", describeError(e), e)
        }
    }

    @ReactMethod
    fun isMigrated(promise: Promise) {
        try {
            promise.resolve(hasHealthyMigrationState())
        } catch (e: Exception) {
            runtimeStoreCorrupt = true
            Log.e(TAG, "V3 storage is unreadable; migration will attempt recovery", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun createPinRecoveryBackup(pin: String, promise: Promise) {
        try {
            val wallets = prefs.getString("appAllWallet", null)
                ?: return promise.reject("RECOVERY_BACKUP_UNAVAILABLE", "No wallet data found")
            val active = prefs.getString("activeUserWallet", null)
                ?: return promise.reject("RECOVERY_BACKUP_UNAVAILABLE", "No active wallet found")
            val payload = JSONObject().apply {
                put("appAllWallet", wallets)
                put("activeUserWallet", active)
            }.toString()
            val envelope = encryptPinBackup(pin, payload)
            val verified = decryptPinBackup(pin, envelope)
            require(verified == payload) { "Recovery backup verification failed" }
            pinBackupPrefs().edit().putString(PIN_BACKUP_KEY, envelope).apply()
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("status", "created")
            })
        } catch (e: Exception) {
            Log.e(TAG, "PIN recovery backup creation failed", e)
            promise.reject("RECOVERY_BACKUP_ERROR", describeError(e), e)
        }
    }

    @ReactMethod
    fun hasPinRecoveryBackup(promise: Promise) {
        promise.resolve(pinBackupPrefs().contains(PIN_BACKUP_KEY))
    }

    @ReactMethod
    fun restoreFromPinRecoveryBackup(pin: String, promise: Promise) {
        try {
            val envelope = pinBackupPrefs().getString(PIN_BACKUP_KEY, null)
                ?: return promise.reject("RECOVERY_BACKUP_MISSING", "No PIN recovery backup found")
            val payload = JSONObject(decryptPinBackup(pin, envelope))
            val wallets = payload.getString("appAllWallet")
            val active = payload.getString("activeUserWallet")
            JSONArray(wallets)
            JSONObject(active)

            prefs.edit()
                .putString("appAllWallet", wallets)
                .putString("activeUserWallet", active)
                .putBoolean(MIGRATION_FLAG, true)
                .apply()
            require(prefs.getString("activeUserWallet", null) == active) {
                "Recovery storage verification failed"
            }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("status", "restored")
            })
        } catch (e: Exception) {
            Log.e(TAG, "PIN recovery restore failed", e)
            promise.reject("RECOVERY_RESTORE_ERROR", "PIN recovery failed", e)
        }
    }

    @ReactMethod
    fun saveWallet(value: String, promise: Promise) {
        try {
            val newUser = try { JSONObject(value) } catch (_: Exception) {
                JSONArray(value).getJSONObject(0)
            }
            val usersArray = JSONArray().apply {
                val existing = prefs.all["appAllWallet"]?.toString()
                if (!existing.isNullOrEmpty()) {
                    val arr = JSONArray(existing)
                    for (i in 0 until arr.length()) put(arr.get(i))
                }
                put(newUser)
            }
            prefs.edit().putString("appAllWallet", usersArray.toString()).apply()
            promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
        } catch (e: Exception) { promise.reject("SAVE_WALLET_ERROR", e.message) }
    }

    @ReactMethod
    fun updateActiveWallet(id: String, promise: Promise) {
        try {
            val walletDataString = prefs.all["appAllWallet"]?.toString()
            if (walletDataString.isNullOrEmpty()) return promise.reject("DECODING_ERROR", "No wallets found")
            val walletArray = JSONArray(walletDataString)
            var matched: JSONObject? = null
            for (i in 0 until walletArray.length()) {
                val w = walletArray.getJSONObject(i)
                if (w.optString("walletId") == id) { matched = w; break }
            }
            matched ?: return promise.reject("WALLET_ID_NOT_FOUND", "Wallet $id not found")
            prefs.edit().putString("activeUserWallet", matched.toString()).apply()
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true); putString("mode", "replace"); putString("walletId", id)
            })
        } catch (e: Exception) { promise.reject("UPDATE_WALLET_ERROR", e.message) }
    }

    @ReactMethod
    fun getAllWallets(promise: Promise) {
        try {
            val data = prefs.all["appAllWallet"]?.toString()
            if (data.isNullOrEmpty()) {
                return promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", false); putArray("wallets", Arguments.createArray())
                })
            }
            val arr = JSONArray(data)
            val list = Arguments.createArray()
            for (i in 0 until arr.length()) {
                val w = arr.getJSONObject(i)
                list.pushMap(Arguments.createMap().apply {
                    putString("walletId",         w.optString("walletId"))
                    putString("name",             w.optString("name"))
                    putString("address",          w.optString("address"))
                    putString("stellarPublicKey", w.optString("stellarPublicKey"))
                    putString("walletType",       w.optString("walletType"))
                    putString("dydxAddress",      w.optString("dydxAddress"))
                })
            }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true); putArray("wallets", list)
            })
        } catch (e: Exception) { promise.reject("GET_ERROR", e.message) }
    }

    @ReactMethod
    fun getWalletAddress(promise: Promise) {
        try {
            val s = prefs.all["activeUserWallet"]?.toString()
            if (s.isNullOrEmpty()) return promise.resolve(Arguments.createMap().apply {
                putBoolean("success", false); putNull("wallet")
            })
            val w = JSONObject(s)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putMap("wallet", Arguments.createMap().apply {
                    putString("address",          w.optString("address"))
                    putString("stellarPublicKey", w.optString("stellarPublicKey"))
                    putString("name",             w.optString("name"))
                    putString("walletId",         w.optString("walletId"))
                    putString("walletType",       w.optString("walletType"))
                    putString("dydxAddress",      w.optString("dydxAddress"))
                })
            })
        } catch (e: Exception) { promise.reject("GET_WALLET_ERROR", e.message) }
    }

    @ReactMethod
    fun getWalletInfo(promise: Promise) {
        try {
            val s = prefs.all["activeUserWallet"]?.toString()
            if (s.isNullOrEmpty()) return promise.resolve(Arguments.createMap().apply {
                putBoolean("success", false); putNull("wallet")
            })
            val w = JSONObject(s)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true); putMap("wallet", publicWalletMap(w))
            })
        } catch (e: Exception) { promise.reject("GET_WALLET_ERROR", e.message) }
    }

    @ReactMethod
    fun openWalletBackupScreen(promise: Promise) {
        try {
            authenticateForSecretView(promise) {
                try {
                    val s = prefs.all["activeUserWallet"]?.toString()
                    if (s.isNullOrEmpty()) return@authenticateForSecretView promise.reject(
                        "GET_WALLET_ERROR", "No active wallet found"
                    )
                    val backupText = formatBackupText(JSONObject(s))
                    if (backupText.isBlank()) return@authenticateForSecretView promise.reject(
                        "GET_WALLET_ERROR", "No backup data found"
                    )
                    prefs.edit().putLong(BACKUP_VIEWED_AT, System.currentTimeMillis()).apply()
                    showBackupScreen(backupText)
                    promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to open wallet backup", e)
                    promise.reject("OPEN_BACKUP_ERROR", describeError(e), e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start wallet backup authentication", e)
            promise.reject("OPEN_BACKUP_ERROR", describeError(e), e)
        }
    }

    @ReactMethod
    fun openWalletBackupScreenWithPin(pin: String, promise: Promise) {
        try {
            val envelope = pinBackupPrefs().getString(PIN_BACKUP_KEY, null)
                ?: return promise.reject("RECOVERY_BACKUP_MISSING", "No PIN recovery backup found")
            val payload = JSONObject(decryptPinBackup(pin, envelope))
            val active = runCatching { prefs.getString("activeUserWallet", null) }
                .getOrNull()
                ?: payload.getString("activeUserWallet")
            val backupText = formatBackupText(JSONObject(active))
            if (backupText.isBlank()) return promise.reject("GET_WALLET_ERROR", "No backup data found")
            prefs.edit().putLong(BACKUP_VIEWED_AT, System.currentTimeMillis()).apply()
            showBackupScreen(backupText)
            promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open PIN wallet backup", e)
            promise.reject("OPEN_BACKUP_ERROR", "PIN backup authentication failed", e)
        }
    }

    @ReactMethod
    fun delete(key: String, promise: Promise) {
        try {
            val data = prefs.all["appAllWallet"]?.toString()
            if (data.isNullOrEmpty()) return promise.reject("DECODING_ERROR", "No wallets found")
            val arr = JSONArray(data)
            var idx = -1
            for (i in (arr.length() - 1) downTo 0) {
                if (arr.getJSONObject(i).optString("walletId") == key) { idx = i; break }
            }
            if (idx != -1) {
                arr.remove(idx)
                prefs.edit().putString("appAllWallet", arr.toString()).apply()
                promise.resolve("wallet_removed")
            } else {
                promise.reject("DELETE_ERROR", "wallet delete failed")
            }
        } catch (e: Exception) { promise.reject("DELETE_ERROR", e.message) }
    }

    @ReactMethod
    fun renameWallet(key: String, walletName: String, promise: Promise) {
        try {
            val data = prefs.all["appAllWallet"]?.toString()
            if (data.isNullOrEmpty()) return promise.reject("DECODING_ERROR", "No wallet found")
            val arr = JSONArray(data)
            var idx = -1
            for (i in 0 until arr.length()) {
                if (arr.getJSONObject(i).optString("walletId") == key) { idx = i; break }
            }
            if (idx != -1) {
                arr.getJSONObject(idx).put("name", walletName)
                prefs.edit().putString("appAllWallet", arr.toString()).apply()
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("user wallet updated to", walletName)
                })
            } else {
                promise.reject("RENAME_ERROR", "wallet rename failed")
            }
        } catch (e: Exception) { promise.reject("RENAME_ERROR", e.message) }
    }

    @ReactMethod
    fun getAllKeys(promise: Promise) {
        try {
            val keys = Arguments.createArray()
            prefs.all.keys.forEach { keys.pushString(it) }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true); putArray("keys", keys)
            })
        } catch (e: Exception) { promise.reject("GET_ALL_KEYS_ERROR", e.message) }
    }

    @ReactMethod
    fun clearAll(promise: Promise) {
        try {
            prefs.edit().clear().apply()
            pinBackupPrefs().edit().clear().apply()
            promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
        } catch (e: Exception) { promise.reject("CLEAR_ALL_ERROR", e.message) }
    }
}
