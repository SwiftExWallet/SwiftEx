package org.app.swiftEx.wallet

enum class PinAttemptStatus {
    SUCCESS,
    INVALID,
    BACKOFF,
    DEVICE_CREDENTIAL_REQUIRED,
    NOT_CONFIGURED,
}

data class PinAttemptState(
    val failureCount: Int = 0,
    val blockedUntilEpochMs: Long = 0,
    val hardLocked: Boolean = false,
    val lastObservedEpochMs: Long = 0,
)

data class PinAttemptResult(
    val status: PinAttemptStatus,
    val state: PinAttemptState,
    val retryAfterMs: Long = 0,
)

object PinAttemptPolicy {
    private val delaysMs = mapOf(
        5 to 30_000L,
        6 to 60_000L,
        7 to 300_000L,
        8 to 900_000L,
        9 to 3_600_000L,
    )

    fun current(state: PinAttemptState, nowEpochMs: Long): PinAttemptResult {
        val effectiveNow = maxOf(nowEpochMs, state.lastObservedEpochMs)
        val observed = state.copy(lastObservedEpochMs = effectiveNow)
        if (observed.hardLocked) {
            return PinAttemptResult(PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED, observed)
        }
        val remaining = (observed.blockedUntilEpochMs - effectiveNow).coerceAtLeast(0)
        return if (remaining > 0) {
            PinAttemptResult(PinAttemptStatus.BACKOFF, observed, remaining)
        } else {
            PinAttemptResult(PinAttemptStatus.INVALID, observed.copy(blockedUntilEpochMs = 0))
        }
    }

    fun recordFailure(state: PinAttemptState, nowEpochMs: Long): PinAttemptResult {
        val current = current(state, nowEpochMs)
        if (current.status == PinAttemptStatus.BACKOFF ||
            current.status == PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED
        ) return current

        val failures = current.state.failureCount + 1
        if (failures >= 10) {
            val locked = current.state.copy(
                failureCount = failures,
                hardLocked = true,
                blockedUntilEpochMs = 0,
            )
            return PinAttemptResult(PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED, locked)
        }

        val delay = delaysMs[failures] ?: 0
        val updated = current.state.copy(
            failureCount = failures,
            blockedUntilEpochMs = if (delay > 0) current.state.lastObservedEpochMs + delay else 0,
        )
        return PinAttemptResult(
            if (delay > 0) PinAttemptStatus.BACKOFF else PinAttemptStatus.INVALID,
            updated,
            delay,
        )
    }

    fun recordPinSuccess(state: PinAttemptState, nowEpochMs: Long): PinAttemptResult {
        val current = current(state, nowEpochMs)
        if (current.status == PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED) return current
        return PinAttemptResult(
            PinAttemptStatus.SUCCESS,
            PinAttemptState(lastObservedEpochMs = current.state.lastObservedEpochMs),
        )
    }

    fun recordDeviceSuccess(state: PinAttemptState, nowEpochMs: Long): PinAttemptResult =
        PinAttemptResult(
            PinAttemptStatus.SUCCESS,
            PinAttemptState(lastObservedEpochMs = maxOf(nowEpochMs, state.lastObservedEpochMs)),
        )
}
