package org.app.swiftEx.wallet

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SecretCopyPolicyTest {
    private val wallet = JSONObject().apply {
        put("mnemonic", "one two three")
        put("privatekey", "0xethereum")
        put("stellarPrivateKey", "Sstellar")
    }

    @Test
    fun `selects only the requested secret`() {
        assertEquals("one two three", SecretCopyPolicy.valueForType(wallet, "mnemonic"))
        assertEquals("0xethereum", SecretCopyPolicy.valueForType(wallet, "ethereumPrivateKey"))
        assertEquals("Sstellar", SecretCopyPolicy.valueForType(wallet, "stellarPrivateKey"))
    }

    @Test
    fun `missing or unknown secret cannot be copied`() {
        assertNull(SecretCopyPolicy.valueForType(JSONObject(), "mnemonic"))
        assertNull(SecretCopyPolicy.valueForType(wallet, "unknown"))
    }

    @Test
    fun `clipboard clear only applies while copied value is still present`() {
        assertTrue(SecretCopyPolicy.canClearClipboard("0xethereum", "0xethereum"))
        assertTrue(!SecretCopyPolicy.canClearClipboard("replacement", "0xethereum"))
    }
}
