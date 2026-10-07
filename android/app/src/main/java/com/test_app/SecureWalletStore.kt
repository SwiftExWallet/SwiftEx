package org.app.swiftEx.wallet

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Single runtime wallet store. Callers must handle initialization failure; never downgrade. */
object SecureWalletStore {
    const val PREF_NAME = "com_swiftEx_app_secure_v4"
    private const val MASTER_KEY_ALIAS = "_swiftex_master_key_v4_"

    fun open(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context, MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            PREF_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun delete(context: Context) {
        context.deleteSharedPreferences(PREF_NAME)
    }
}
