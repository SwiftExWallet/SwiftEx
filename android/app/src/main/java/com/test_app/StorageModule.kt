package org.app.swiftEx.wallet
import android.app.Dialog
import com.facebook.react.bridge.*
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
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
import java.io.File
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
    // V1 could mark an unreadable authenticated source as a fresh install.
    // A new flag forces one fail-safe revalidation after users update.
    private val MIGRATION_FLAG = "swiftex_h4_migrated_v2_safe"
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

    private data class OpenedLegacySource(
        val result: LegacyWalletSourceResult,
        val preferences: android.content.SharedPreferences? = null,
    )

    private fun legacyPreferenceFileExists(name: String): Boolean {
        val directory = File(reactApplicationContext.applicationInfo.dataDir, "shared_prefs")
        return File(directory, "$name.xml").exists() || File(directory, "$name.xml.bak").exists()
    }

    private fun anyLegacyCandidateExists(): Boolean =
        listOf(PREF_NAME_V2, PREF_NAME, PREF_NAME_V3).any(::legacyPreferenceFileExists)

    private fun readLegacySource(
        source: String,
        preferenceName: String,
        open: () -> android.content.SharedPreferences,
        allowPlainFallback: Boolean = false,
    ): OpenedLegacySource {
        if (!legacyPreferenceFileExists(preferenceName)) {
            return OpenedLegacySource(LegacyWalletSourceResult.Absent(source))
        }

        return try {
            val sourcePrefs = open()
            val wallets = sourcePrefs.getString("appAllWallet", null)
            val active = sourcePrefs.getString("activeUserWallet", null)
            if (wallets == null && active == null) {
                if (allowPlainFallback) {
                    try {
                        val plain = reactApplicationContext.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
                        val plainWallets = plain.getString("appAllWallet", null)
                        val plainActive = plain.getString("activeUserWallet", null)
                        if (plainWallets != null || plainActive != null) {
                            return OpenedLegacySource(
                                LegacyWalletSourceResult.Readable(source, plainWallets, plainActive),
                                plain,
                            )
                        }
                    } catch (plainError: Exception) {
                        return OpenedLegacySource(
                            LegacyWalletSourceResult.Unreadable(source, describeError(plainError)),
                        )
                    }
                }
                OpenedLegacySource(LegacyWalletSourceResult.Absent(source), sourcePrefs)
            } else {
                OpenedLegacySource(
                    LegacyWalletSourceResult.Readable(source, wallets, active),
                    sourcePrefs,
                )
            }
        } catch (encryptedError: Exception) {
            if (allowPlainFallback) {
                try {
                    val plain = reactApplicationContext.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
                    val wallets = plain.getString("appAllWallet", null)
                    val active = plain.getString("activeUserWallet", null)
                    if (wallets != null || active != null) {
                        return OpenedLegacySource(
                            LegacyWalletSourceResult.Readable(source, wallets, active),
                            plain,
                        )
                    }
                } catch (_: Exception) {
                    // The encrypted error below is the authoritative reason this source is unreadable.
                }
            }
            OpenedLegacySource(
                LegacyWalletSourceResult.Unreadable(source, describeError(encryptedError)),
            )
        }
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
        val state = WalletMigrationPolicy.currentState(
            markerSet = prefs.getBoolean(MIGRATION_FLAG, false),
            destinationWallets = prefs.getString("appAllWallet", null),
            destinationActiveWallet = prefs.getString("activeUserWallet", null),
            legacyCandidatePresent = anyLegacyCandidateExists(),
        )
        return state == WalletMigrationCurrentState.AlreadyMigrated ||
            state == WalletMigrationCurrentState.FreshInstallComplete
    }

    override fun getName() = "StorageModule"

    @ReactMethod
    fun setAppPin(pin: String, promise: Promise) {
        try {
            if (prefs.contains(APP_PIN_VERIFIER_KEY)) {
                return promise.reject("PIN_ALREADY_SET", "Existing app PIN requires device authentication to replace")
            }
            derivePinKey(pin, ByteArray(16))
            check(prefs.edit().putString(APP_PIN_VERIFIER_KEY, appPinVerifier(pin)).commit()) {
                "Unable to persist app PIN verifier"
            }
            AppPinVerifier.guard(prefs).recordDeviceSuccess()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PIN_STORAGE_ERROR", "Unable to store app PIN verifier", e)
        }
    }

    @ReactMethod
    fun validateAppPin(pin: String, promise: Promise) {
        try {
            promise.resolve(AppPinVerifier.authenticate(prefs, pin).toWritableMap())
        } catch (e: Exception) {
            promise.reject("PIN_AUTH_ERROR", "Unable to validate app PIN", e)
        }
    }

    @ReactMethod
    fun getPinAuthState(promise: Promise) {
        try {
            val current = AppPinVerifier.guard(prefs).current()
            val status = if (!AppPinVerifier.isConfigured(prefs) &&
                current.status != PinAttemptStatus.BACKOFF &&
                current.status != PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED
            ) current.copy(status = PinAttemptStatus.NOT_CONFIGURED) else current
            promise.resolve(status.toWritableMap())
        } catch (e: Exception) {
            promise.reject("PIN_AUTH_ERROR", "Unable to read PIN authentication state", e)
        }
    }

    @ReactMethod
    fun authenticateDeviceOwner(promise: Promise) {
        val activity = reactApplicationContext.currentActivity as? FragmentActivity
            ?: return promise.reject("ACTIVITY_UNAVAILABLE", "No active activity")
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        if (BiometricManager.from(activity).canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
            return promise.reject(
                "DEVICE_CREDENTIAL_UNAVAILABLE",
                "Set up a device screen lock to continue",
            )
        }
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        AppPinVerifier.recordDeviceSuccess(prefs)
                        promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
                    } catch (e: Exception) {
                        promise.reject("PIN_AUTH_ERROR", "Unable to reset PIN lock", e)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    promise.reject("AUTH_CANCELLED", errString.toString())
                }
            },
        )
        activity.runOnUiThread {
            try {
                prompt.authenticate(
                BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Verify device screen lock")
                    .setSubtitle("Confirm it is you to unlock PIN-protected actions.")
                    .setAllowedAuthenticators(authenticators)
                    .build()
                )
            } catch (error: RuntimeException) {
                promise.reject("AUTH_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun getTransactionAuthEnabled(promise: Promise) {
        promise.resolve(TransactionAuthPolicy.isEnabled(prefs))
    }

    @ReactMethod
    fun setTransactionAuthEnabled(enabled: Boolean, promise: Promise) {
        if (enabled) {
            return try {
                promise.resolve(TransactionAuthPolicy.setEnabled(prefs, true))
            } catch (e: Exception) {
                promise.reject("TRANSACTION_AUTH_STORAGE_ERROR", e.message, e)
            }
        }

        authenticate(
            title = "Authenticate to change transaction security",
            subtitle = "Confirm it is you before signing protection is disabled.",
            promise = promise,
        ) {
            try {
                promise.resolve(TransactionAuthPolicy.setEnabled(prefs, false))
            } catch (e: Exception) {
                promise.reject("TRANSACTION_AUTH_STORAGE_ERROR", e.message, e)
            }
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

    private fun authenticate(
        title: String,
        subtitle: String,
        promise: Promise,
        onAuthenticated: () -> Unit,
    ) {
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

        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
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
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(authenticators)
            .build()

        activity.runOnUiThread {
            try { prompt.authenticate(promptInfo) } catch (error: RuntimeException) {
                promise.reject("AUTH_FAILED", error.message, error)
            }
        }
    }

    private fun authenticateForSecretView(promise: Promise, onAuthenticated: () -> Unit) {
        authenticate(
            title = "Authenticate to view secret backup",
            subtitle = "Confirm it is you before this wallet shows recovery details.",
            promise = promise,
            onAuthenticated = onAuthenticated,
        )
    }

    private fun copySecretToClipboard(
        activity: android.app.Activity,
        wallet: JSONObject,
        secretType: String,
        statusView: TextView,
    ) {
        val secret = SecretCopyPolicy.valueForType(wallet, secretType)
        if (secret == null) {
            statusView.text = "That secret is unavailable."
            return
        }

        val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val promise = PromiseImpl(
            Callback { _ -> statusView.text = "Secret copied. It will clear in 60 seconds." },
            Callback { _ -> statusView.text = "Authentication cancelled or failed." },
        )

        authenticate(
            title = "Authenticate to copy secret",
            subtitle = "Confirm it is you before copying wallet recovery details.",
            promise = promise,
        ) {
            val marker = "SwiftEx secret ${System.nanoTime()}"
            clipboard.setPrimaryClip(ClipData.newPlainText(marker, secret))
            statusView.text = "Secret copied. It will clear in 60 seconds."
            Handler(Looper.getMainLooper()).postDelayed({
                val currentMarker = clipboard.primaryClipDescription?.label?.toString()
                val currentValue = clipboard.primaryClip?.getItemAt(0)?.coerceToText(activity)?.toString()
                if (currentMarker == marker && SecretCopyPolicy.canClearClipboard(currentValue, secret)) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) clipboard.clearPrimaryClip()
                    else clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
                }
            }, SecretCopyPolicy.CLIPBOARD_CLEAR_DELAY_MS)
        }
    }

    private fun showBackupScreen(backupText: String, wallet: JSONObject) {
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

            val copyStatus = TextView(activity).apply {
                textSize = 13f
                setTextColor(Color.rgb(91, 98, 112))
                setPadding(0, dp(10), 0, dp(4))
            }
            root.addView(copyStatus)

            val copyButtons = listOf(
                SecretCopyPolicy.MNEMONIC to "Copy Mnemonic",
                SecretCopyPolicy.ETHEREUM_PRIVATE_KEY to "Copy Ethereum Private Key",
                SecretCopyPolicy.STELLAR_PRIVATE_KEY to "Copy Stellar Private Key",
            )
            copyButtons.forEach { (secretType, label) ->
                if (SecretCopyPolicy.valueForType(wallet, secretType) != null) {
                    root.addView(Button(activity).apply {
                        text = label
                        setOnClickListener {
                            copySecretToClipboard(activity, wallet, secretType, copyStatus)
                        }
                    })
                }
            }

            dialog.setContentView(root)
            dialog.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
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
            if (!anyLegacyCandidateExists()) {
                return completeMigrationWithoutLegacySource(promise)
            }
            authenticateForSecretView(promise) {
                performSecureStorageMigration(promise)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Secure storage unavailable before migration", e)
            promise.reject("SECURE_STORAGE_UNAVAILABLE", describeError(e), e)
        }
    }

    private fun completeMigrationWithoutLegacySource(promise: Promise) {
        try {
            val wallets = prefs.getString("appAllWallet", null)
            val active = prefs.getString("activeUserWallet", null)
            if (wallets != null || active != null) {
                if (wallets == null || active == null || !WalletMigrationPolicy.validate(wallets, active)) {
                    return promise.reject(
                        "MIGRATION_DESTINATION_INVALID",
                        "Existing wallet storage is incomplete; no data was changed",
                    )
                }
                if (!prefs.edit().putBoolean(MIGRATION_FLAG, true).commit()) {
                    return promise.reject("MIGRATION_ERROR", "Could not finalize verified wallet storage")
                }
                return promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("status", "migrated")
                })
            }

            if (runtimeStoreCorrupt) {
                return promise.reject(
                    "SECURE_STORAGE_UNAVAILABLE",
                    "Wallet storage is unreadable; no data was changed",
                )
            }
            if (!prefs.edit().putBoolean(MIGRATION_FLAG, true).commit()) {
                return promise.reject("MIGRATION_ERROR", "Could not mark fresh installation")
            }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("status", "fresh_install")
            })
        } catch (e: Exception) {
            Log.e(TAG, "Could not safely classify installation", e)
            promise.reject("MIGRATION_ERROR", describeError(e), e)
        }
    }

    private fun performSecureStorageMigration(promise: Promise) {
        try {
            val destination = if (runtimeStoreCorrupt) {
                LegacyWalletSourceResult.Absent("v4_destination")
            } else {
                val wallets = prefs.getString("appAllWallet", null)
                val active = prefs.getString("activeUserWallet", null)
                if (wallets == null && active == null) {
                    LegacyWalletSourceResult.Absent("v4_destination")
                } else {
                    LegacyWalletSourceResult.Readable("v4_destination", wallets, active)
                }
            }
            val legacySources = listOf(
                readLegacySource("v2_biometric", PREF_NAME_V2, ::oldV2AuthPrefs),
                readLegacySource(
                    "legacy",
                    PREF_NAME,
                    ::oldV2LegacyPrefs,
                    allowPlainFallback = true,
                ),
                readLegacySource("v3", PREF_NAME_V3, ::oldV3Prefs),
            )
            when (val decision = WalletMigrationPolicy.decide(listOf(destination) + legacySources.map { it.result })) {
                is WalletMigrationDecision.Blocked -> promise.reject(
                    "MIGRATION_SOURCE_UNREADABLE",
                    "${decision.source}: ${decision.reason}; no wallet data was changed",
                )
                WalletMigrationDecision.FreshInstall -> completeConfirmedFreshInstall(promise)
                is WalletMigrationDecision.Migrate -> completeSecureStorageMigration(
                    promise = promise,
                    decision = decision,
                    sources = legacySources,
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Migration failed; source storage preserved", e)
            promise.reject("MIGRATION_ERROR", describeError(e), e)
        }
    }

    private fun completeConfirmedFreshInstall(promise: Promise) {
        if (runtimeStoreCorrupt) {
            return promise.reject(
                "SECURE_STORAGE_UNAVAILABLE",
                "Wallet storage is unreadable; no data was changed",
            )
        }
        if (!prefs.edit().putBoolean(MIGRATION_FLAG, true).commit()) {
            return promise.reject("MIGRATION_ERROR", "Could not mark fresh installation")
        }
        promise.resolve(Arguments.createMap().apply {
            putBoolean("success", true)
            putString("status", "fresh_install")
        })
    }

    private fun completeSecureStorageMigration(
        promise: Promise,
        decision: WalletMigrationDecision.Migrate,
        sources: List<OpenedLegacySource>,
    ) {
        try {
            if (runtimeStoreCorrupt) {
                resetRuntimeStoreFromVerifiedLegacyData()
            }

            if (!prefs.edit()
                    .putString("appAllWallet", decision.wallets)
                    .putString("activeUserWallet", decision.activeWallet)
                    .remove(MIGRATION_FLAG)
                    .commit()
            ) {
                return promise.reject("MIGRATION_ERROR", "Could not write wallet storage")
            }

            val storedWallets = prefs.getString("appAllWallet", null)
            val storedActive = prefs.getString("activeUserWallet", null)
            val destinationVerified = storedWallets == decision.wallets &&
                storedActive == decision.activeWallet &&
                WalletMigrationPolicy.validate(storedWallets, storedActive)
            if (!destinationVerified) {
                return promise.reject("MIGRATION_ERROR", "Could not verify wallet storage; legacy data retained")
            }

            val markerCommitted = prefs.edit().putBoolean(MIGRATION_FLAG, true).commit() &&
                prefs.getBoolean(MIGRATION_FLAG, false)
            if (!markerCommitted) {
                return promise.reject("MIGRATION_ERROR", "Could not finalize migration; legacy data retained")
            }

            if (!WalletMigrationPolicy.canCleanup(destinationVerified, markerCommitted)) {
                return promise.reject("MIGRATION_ERROR", "Migration verification failed; legacy data retained")
            }

            sources.filter { it.result is LegacyWalletSourceResult.Readable }.forEach { source ->
                try {
                    val cleaned = source.preferences?.edit()
                        ?.remove("appAllWallet")
                        ?.remove("activeUserWallet")
                        ?.commit() ?: false
                    if (!cleaned) Log.w(TAG, "Could not clean ${source.result.source}; retaining it")
                } catch (cleanupError: Exception) {
                    Log.w(TAG, "Could not clean ${source.result.source}; retaining it", cleanupError)
                }
            }
            Log.i(TAG, "H-4 migration: wallet data moved to encrypted v4 store")
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
            val pinResult = AppPinVerifier.authenticate(prefs, pin)
            if (pinResult.status != PinAttemptStatus.SUCCESS) return promise.rejectPinAttempt(pinResult)
            val envelope = pinBackupPrefs().getString(PIN_BACKUP_KEY, null)
                ?: return promise.reject("RECOVERY_BACKUP_MISSING", "No PIN recovery backup found")
            val payload = JSONObject(decryptPinBackup(pin, envelope))
            val wallets = payload.getString("appAllWallet")
            val active = payload.getString("activeUserWallet")
            require(WalletMigrationPolicy.validate(wallets, active)) {
                "Recovery backup contains invalid wallet data"
            }

            val restored = prefs.edit()
                .putString("appAllWallet", wallets)
                .putString("activeUserWallet", active)
                .remove(MIGRATION_FLAG)
                .commit()
            require(restored &&
                prefs.getString("appAllWallet", null) == wallets &&
                prefs.getString("activeUserWallet", null) == active
            ) {
                "Recovery storage verification failed"
            }
            require(prefs.edit().putBoolean(MIGRATION_FLAG, true).commit()) {
                "Recovery migration marker could not be committed"
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
                    showBackupScreen(backupText, JSONObject(s))
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
            val pinResult = AppPinVerifier.authenticate(prefs, pin)
            if (pinResult.status != PinAttemptStatus.SUCCESS) return promise.rejectPinAttempt(pinResult)
            val envelope = pinBackupPrefs().getString(PIN_BACKUP_KEY, null)
                ?: return promise.reject("RECOVERY_BACKUP_MISSING", "No PIN recovery backup found")
            val payload = JSONObject(decryptPinBackup(pin, envelope))
            val active = runCatching { prefs.getString("activeUserWallet", null) }
                .getOrNull()
                ?: payload.getString("activeUserWallet")
            val backupText = formatBackupText(JSONObject(active))
            if (backupText.isBlank()) return promise.reject("GET_WALLET_ERROR", "No backup data found")
            prefs.edit().putLong(BACKUP_VIEWED_AT, System.currentTimeMillis()).apply()
            showBackupScreen(backupText, JSONObject(active))
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
