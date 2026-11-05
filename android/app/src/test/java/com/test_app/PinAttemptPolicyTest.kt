package org.app.swiftEx.wallet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinAttemptPolicyTest {
    @Test
    fun `fifth through ninth failures apply the approved delays`() {
        var state = PinAttemptState()
        var now = 1_000_000L
        val expected = listOf(
            PinAttemptStatus.INVALID to 0L,
            PinAttemptStatus.INVALID to 0L,
            PinAttemptStatus.INVALID to 0L,
            PinAttemptStatus.INVALID to 0L,
            PinAttemptStatus.BACKOFF to 30_000L,
            PinAttemptStatus.BACKOFF to 60_000L,
            PinAttemptStatus.BACKOFF to 300_000L,
            PinAttemptStatus.BACKOFF to 900_000L,
            PinAttemptStatus.BACKOFF to 3_600_000L,
        )

        expected.forEachIndexed { index, (status, delay) ->
            val result = PinAttemptPolicy.recordFailure(state, now)
            assertEquals(index + 1, result.state.failureCount)
            assertEquals(status, result.status)
            assertEquals(delay, result.retryAfterMs)
            state = result.state
            now += delay
        }
    }

    @Test
    fun `attempt during active backoff is rejected without incrementing`() {
        var state = PinAttemptState(failureCount = 4)
        val blocked = PinAttemptPolicy.recordFailure(state, 10_000L)

        val retried = PinAttemptPolicy.recordFailure(blocked.state, 20_000L)

        assertEquals(PinAttemptStatus.BACKOFF, retried.status)
        assertEquals(5, retried.state.failureCount)
        assertEquals(20_000L, retried.retryAfterMs)
    }

    @Test
    fun `tenth failure requires device credential until device success`() {
        val ninth = PinAttemptState(failureCount = 9)

        val locked = PinAttemptPolicy.recordFailure(ninth, 50_000L)
        val pinSuccess = PinAttemptPolicy.recordPinSuccess(locked.state, 60_000L)
        val deviceSuccess = PinAttemptPolicy.recordDeviceSuccess(locked.state, 60_000L)

        assertEquals(PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED, locked.status)
        assertTrue(locked.state.hardLocked)
        assertEquals(PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED, pinSuccess.status)
        assertTrue(pinSuccess.state.hardLocked)
        assertEquals(PinAttemptStatus.SUCCESS, deviceSuccess.status)
        assertFalse(deviceSuccess.state.hardLocked)
        assertEquals(0, deviceSuccess.state.failureCount)
    }

    @Test
    fun `clock rollback cannot shorten an active backoff`() {
        val blocked = PinAttemptPolicy.recordFailure(
            PinAttemptState(failureCount = 4),
            100_000L,
        )

        val rolledBack = PinAttemptPolicy.current(blocked.state, 90_000L)

        assertEquals(PinAttemptStatus.BACKOFF, rolledBack.status)
        assertEquals(30_000L, rolledBack.retryAfterMs)
        assertEquals(100_000L, rolledBack.state.lastObservedEpochMs)
    }

    @Test
    fun `successful pin resets failures before hard lock`() {
        val state = PinAttemptState(failureCount = 8, lastObservedEpochMs = 100L)

        val result = PinAttemptPolicy.recordPinSuccess(state, 200L)

        assertEquals(PinAttemptStatus.SUCCESS, result.status)
        assertEquals(PinAttemptState(lastObservedEpochMs = 200L), result.state)
    }
}
