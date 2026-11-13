package org.app.swiftEx.wallet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PinAuthenticatorTest {
    private class MemoryStore : PinAttemptStateStore {
        var value = PinAttemptState()
        override fun load() = value
        override fun save(state: PinAttemptState) { value = state }
        override fun clear() { value = PinAttemptState() }
    }

    @Test
    fun `malformed pin and missing verifier do not count as wrong attempts`() {
        val store = MemoryStore()
        val guard = PinAttemptGuard(store) { 1_000L }
        val malformed = PinAuthenticator(guard, { true }, { false }).verify("12ab")
        val missing = PinAuthenticator(guard, { false }, { false }).verify("123456")

        assertEquals(PinAttemptStatus.INVALID, malformed.status)
        assertEquals(PinAttemptStatus.NOT_CONFIGURED, missing.status)
        assertEquals(0, store.value.failureCount)
    }

    @Test
    fun `different consumers accumulate failures in one global guard`() {
        val store = MemoryStore()
        val guard = PinAttemptGuard(store) { 2_000L }
        val appLock = PinAuthenticator(guard, { true }, { false })
        val signer = PinAuthenticator(guard, { true }, { false })

        repeat(3) { appLock.verify("111111") }
        val fourth = signer.verify("222222")

        assertEquals(4, fourth.state.failureCount)
        assertEquals(4, store.value.failureCount)
    }

    @Test
    fun `corrupt verifier does not count as a wrong attempt`() {
        val store = MemoryStore()
        val authenticator = PinAuthenticator(
            PinAttemptGuard(store) { 3_000L },
            { true },
            { throw IllegalStateException("corrupt verifier") },
        )

        assertThrows(IllegalStateException::class.java) {
            authenticator.verify("123456")
        }
        assertEquals(0, store.value.failureCount)
    }
}
