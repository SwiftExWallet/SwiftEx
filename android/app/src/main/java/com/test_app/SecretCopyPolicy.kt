package org.app.swiftEx.wallet

import org.json.JSONObject

internal object SecretCopyPolicy {
    const val MNEMONIC = "mnemonic"
    const val ETHEREUM_PRIVATE_KEY = "ethereumPrivateKey"
    const val STELLAR_PRIVATE_KEY = "stellarPrivateKey"
    const val CLIPBOARD_CLEAR_DELAY_MS = 60_000L

    fun valueForType(wallet: JSONObject, secretType: String): String? {
        val key = when (secretType) {
            MNEMONIC -> "mnemonic"
            ETHEREUM_PRIVATE_KEY -> "privatekey"
            STELLAR_PRIVATE_KEY -> "stellarPrivateKey"
            else -> return null
        }
        return wallet.optString(key).takeIf { it.isNotBlank() }
    }

    fun canClearClipboard(currentValue: String?, copiedValue: String): Boolean =
        currentValue == copiedValue
}
