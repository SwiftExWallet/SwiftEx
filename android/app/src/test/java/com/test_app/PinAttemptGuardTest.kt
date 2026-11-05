package org.app.swiftEx.wallet

import org.junit.Assert.assertEquals
import org.junit.Test

class PinAttemptGuardTest {
    private class MemoryStore : PinAttemptStateStore {
        var value = PinAttemptState()
        override fun load(): PinAttemptState = value
        override fun save(state: PinAttemptState) { value = state }
        override fun clear() { value = PinAttemptState() }
    }

    @Test
    fun `backoff survives guard recreation`() {
        val store = MemoryStore()
        var now = 1_000L
        val first = PinAttemptGuard(store) { now }
        repeat(5) { first.recordFailure() }

        val recreated = PinAttemptGuard(store) { now }
        val result = recreated.current()

        assertEquals(PinAttemptStatus.BACKOFF, result.status)
        assertEquals(30_000L, result.retryAfterMs)
        assertEquals(5, result.state.failureCount)
    }

    @Test
    fun `successful device authentication clears persisted hard lock`() {
        val store = MemoryStore().apply {
            value = PinAttemptState(failureCount = 10, hardLocked = true)
        }
        val guard = PinAttemptGuard(store) { 5_000L }

        guard.recordDeviceSuccess()

        assertEquals(PinAttemptState(lastObservedEpochMs = 5_000L), store.value)
    }
}
