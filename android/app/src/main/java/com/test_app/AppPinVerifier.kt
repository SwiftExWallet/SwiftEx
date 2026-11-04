package org.app.swiftEx.wallet

import android.util.Base64
import org.json.JSONObject
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object AppPinVerifier {
    private const val KEY = "appPinVerifier"
    private const val ITERATIONS = 600_000

    fun validate(prefs: android.content.SharedPreferences, pin: String): Boolean {
        return try {
            val value = JSONObject(prefs.getString(KEY, null) ?: return false)
            val salt = Base64.decode(value.getString("salt"), Base64.DEFAULT)
            val expected = Base64.decode(value.getString("verifier"), Base64.DEFAULT)
            val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, 256)
            val actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
            MessageDigest.isEqual(expected, actual)
        } catch (_: Exception) {
            false
        }
    }
}

object TransactionAuthPolicy {
    private const val KEY = "transactionAuthEnabled"
    @Volatile private var forceEnabledAfterWriteFailure = false

    @Synchronized
    fun isEnabled(prefs: android.content.SharedPreferences): Boolean {
        if (forceEnabledAfterWriteFailure) return true
        return try {
            if (!prefs.contains(KEY)) true else prefs.getBoolean(KEY, true)
        } catch (_: Exception) {
            true
        }
    }

    @Synchronized
    fun setEnabled(prefs: android.content.SharedPreferences, enabled: Boolean): Boolean {
        val hadStoredValue = prefs.contains(KEY)
        val previousValue = isEnabled(prefs)

        val committed = try {
            prefs.edit().putBoolean(KEY, enabled).commit()
        } catch (error: Exception) {
            forceEnabledAfterWriteFailure = true
            if (restorePreviousValue(prefs, hadStoredValue, previousValue)) {
                forceEnabledAfterWriteFailure = false
            }
            throw error
        }
        if (!committed) {
            forceEnabledAfterWriteFailure = true
            if (restorePreviousValue(prefs, hadStoredValue, previousValue)) {
                forceEnabledAfterWriteFailure = false
            }
            error("Unable to persist transaction authentication setting")
        }

        forceEnabledAfterWriteFailure = false
        return enabled
    }

    private fun restorePreviousValue(
        prefs: android.content.SharedPreferences,
        hadStoredValue: Boolean,
        previousValue: Boolean,
    ): Boolean {
        return try {
            val editor = prefs.edit()
            if (hadStoredValue) editor.putBoolean(KEY, previousValue) else editor.remove(KEY)
            editor.commit()
        } catch (_: Exception) {
            false
        }
    }
}
