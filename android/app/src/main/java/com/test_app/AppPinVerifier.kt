package org.app.swiftEx.wallet

import android.util.Base64
import com.facebook.react.bridge.Promise
import org.json.JSONObject
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object AppPinVerifier {
    private const val KEY = "appPinVerifier"
    private const val ITERATIONS = 600_000

    fun validate(prefs: android.content.SharedPreferences, pin: String): Boolean {
        val encoded = prefs.getString(KEY, null)
            ?: throw IllegalStateException("App PIN verifier is missing")
        val value = JSONObject(encoded)
        val salt = Base64.decode(value.getString("salt"), Base64.DEFAULT)
        val expected = Base64.decode(value.getString("verifier"), Base64.DEFAULT)
        require(salt.size == 16 && expected.size == 32) { "App PIN verifier is corrupt" }
        val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, 256)
        val actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        return MessageDigest.isEqual(expected, actual)
    }

    fun isConfigured(prefs: android.content.SharedPreferences): Boolean = prefs.contains(KEY)

    fun guard(prefs: android.content.SharedPreferences): PinAttemptGuard =
        PinAttemptGuard(SharedPreferencesPinAttemptStateStore(prefs))

    fun authenticate(
        prefs: android.content.SharedPreferences,
        pin: String,
    ): PinAttemptResult = PinAuthenticator(
        guard = guard(prefs),
        isConfigured = { isConfigured(prefs) },
        matches = { validate(prefs, it) },
    ).verify(pin)

    fun recordDeviceSuccess(prefs: android.content.SharedPreferences): PinAttemptResult =
        guard(prefs).recordDeviceSuccess()
}

fun PinAttemptResult.toWritableMap(): com.facebook.react.bridge.WritableMap =
    com.facebook.react.bridge.Arguments.createMap().apply {
        putString("status", when (status) {
            PinAttemptStatus.SUCCESS -> "success"
            PinAttemptStatus.INVALID -> "invalid"
            PinAttemptStatus.BACKOFF -> "backoff"
            PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED -> "deviceCredentialRequired"
            PinAttemptStatus.NOT_CONFIGURED -> "notConfigured"
        })
        putInt("failureCount", state.failureCount)
        putDouble("retryAfterMs", retryAfterMs.toDouble())
    }

fun Promise.rejectPinAttempt(result: PinAttemptResult) {
    when (result.status) {
        PinAttemptStatus.BACKOFF -> reject(
            "PIN_BACKOFF",
            "Too many PIN attempts. Try again in ${((result.retryAfterMs + 999) / 1000)} seconds.",
            result.toWritableMap(),
        )
        PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED -> reject(
            "PIN_DEVICE_CREDENTIAL_REQUIRED",
            "Verify your device screen lock to continue.",
            result.toWritableMap(),
        )
        PinAttemptStatus.NOT_CONFIGURED -> reject("PIN_NOT_CONFIGURED", "App PIN is not configured")
        else -> reject("PIN_INVALID", "Invalid app PIN", result.toWritableMap())
    }
}

object TransactionAuthPolicy {
    private const val KEY = "transactionAuthEnabled"
    @Volatile private var forceEnabledAfterWriteFailure = false

    @Synchronized
    fun isEnabled(prefs: android.content.SharedPreferences): Boolean {
        if (forceEnabledAfterWriteFailure) return true
        return try {
            if (!prefs.contains(KEY)) false else prefs.getBoolean(KEY, false)
        } catch (_: Exception) {
            false
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
