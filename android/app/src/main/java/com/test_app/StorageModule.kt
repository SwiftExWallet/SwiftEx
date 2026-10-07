package org.app.swiftEx.wallet
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import com.facebook.react.bridge.*
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
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

class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "StorageModule"
    private val PREF_NAME = "com_swiftEx_app_secure"
    private val PREF_NAME_V2 = "com_swiftEx_app_secure_v2"
    private val MIGRATION_FLAG = "swiftex_h4_migrated_v1"

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
                        0,   // timeout=0 → auth required on every use
                        KeyProperties.AUTH_BIOMETRIC_STRONG or
                                KeyProperties.AUTH_DEVICE_CREDENTIAL
                    )
                    .setInvalidatedByBiometricEnrollment(true)
                    .build()

                MasterKey.Builder(reactApplicationContext, "_swiftex_master_key_v2_")
                    .setKeyGenParameterSpec(spec)
                    .build()
            } catch (e: Exception) {
                Log.e(TAG, "Biometric-bound key unavailable, falling back to unbound", e)
                legacyKey
            }
        } else {
            legacyKey
        }
    }

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

    private val securePrefs by lazy {
        try {
            EncryptedSharedPreferences.create(
                reactApplicationContext,
                PREF_NAME_V2,
                secureKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "securePrefs init failed, falling back to legacyPrefs", e)
            legacyPrefs
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
        } catch (e: Exception) {
            Log.e(TAG, "legacyPrefs init failed", e)
            reactApplicationContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        }
    }

    private val prefs get() = securePrefs

    override fun getName() = "StorageModule"

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

    private fun copySecretToClipboard(secret: String) {
        val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("SwiftEx wallet backup", secret))
        Handler(Looper.getMainLooper()).postDelayed({
            clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
        }, 30000)
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
            return promise.reject("AUTH_UNAVAILABLE", "Device authentication is not available")
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
                setTextIsSelectable(true)
                setBackgroundColor(Color.rgb(245, 247, 250))
            }
            scroll.addView(secretText)
            root.addView(scroll)

            val copy = Button(activity).apply {
                text = "Copy All"
                setOnClickListener { copySecretToClipboard(backupText) }
            }
            root.addView(copy)

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
            val alreadyDone = try {
                securePrefs.getBoolean(MIGRATION_FLAG, false)
            } catch (_: Exception) { false }

            if (alreadyDone) {
                return promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("status", "already_migrated")
                })
            }

            val legacyWallets = try { legacyPrefs.getString("appAllWallet",    null) } catch (_: Exception) { null }
            val legacyActive  = try { legacyPrefs.getString("activeUserWallet", null) } catch (_: Exception) { null }

            if (legacyWallets.isNullOrEmpty() && legacyActive.isNullOrEmpty()) {
                securePrefs.edit().putBoolean(MIGRATION_FLAG, true).apply()
                return promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("status", "fresh_install")
                })
            }

            val editor = securePrefs.edit()
            if (!legacyWallets.isNullOrEmpty()) editor.putString("appAllWallet",     legacyWallets)
            if (!legacyActive.isNullOrEmpty())  editor.putString("activeUserWallet", legacyActive)
            editor.putBoolean(MIGRATION_FLAG, true)
            editor.apply()

            try { legacyPrefs.edit().clear().apply() } catch (_: Exception) {}

            Log.i(TAG, "H-4 migration: wallet data moved to biometric-bound store")
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("status", "migrated")
            })
        } catch (e: Exception) {
            Log.e(TAG, "Migration failed (non-fatal)", e)
            promise.reject("MIGRATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isMigrated(promise: Promise) {
        try {
            val done = try { securePrefs.getBoolean(MIGRATION_FLAG, false) } catch (_: Exception) { false }
            promise.resolve(done)
        } catch (e: Exception) {
            promise.reject("MIGRATION_CHECK_ERROR", e.message)
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
            val s = prefs.all["activeUserWallet"]?.toString()
            if (s.isNullOrEmpty()) return promise.reject("GET_WALLET_ERROR", "No active wallet found")
            val w = JSONObject(s)
            val backupText = formatBackupText(w)
            if (backupText.isBlank()) return promise.reject("GET_WALLET_ERROR", "No backup data found")

            authenticateForSecretView(promise) {
                try {
                    showBackupScreen(backupText)
                    promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
                } catch (e: Exception) {
                    promise.reject("OPEN_BACKUP_ERROR", e.message)
                }
            }
        } catch (e: Exception) {
            promise.reject("OPEN_BACKUP_ERROR", e.message)
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
            promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
        } catch (e: Exception) { promise.reject("CLEAR_ALL_ERROR", e.message) }
    }
}