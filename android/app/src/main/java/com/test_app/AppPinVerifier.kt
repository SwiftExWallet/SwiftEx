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
