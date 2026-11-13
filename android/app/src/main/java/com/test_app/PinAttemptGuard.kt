package org.app.swiftEx.wallet

import android.content.SharedPreferences

interface PinAttemptStateStore {
    fun load(): PinAttemptState
    fun save(state: PinAttemptState)
    fun clear()
}

class SharedPreferencesPinAttemptStateStore(
    private val prefs: SharedPreferences,
) : PinAttemptStateStore {
    override fun load(): PinAttemptState = PinAttemptState(
        failureCount = prefs.getInt(KEY_FAILURE_COUNT, 0),
        blockedUntilEpochMs = prefs.getLong(KEY_BLOCKED_UNTIL, 0),
        hardLocked = prefs.getBoolean(KEY_HARD_LOCKED, false),
        lastObservedEpochMs = prefs.getLong(KEY_LAST_OBSERVED, 0),
    )

    override fun save(state: PinAttemptState) {
        check(
            prefs.edit()
                .putInt(KEY_FAILURE_COUNT, state.failureCount)
                .putLong(KEY_BLOCKED_UNTIL, state.blockedUntilEpochMs)
                .putBoolean(KEY_HARD_LOCKED, state.hardLocked)
                .putLong(KEY_LAST_OBSERVED, state.lastObservedEpochMs)
                .commit()
        ) { "Unable to persist PIN attempt state" }
    }

    override fun clear() {
        check(
            prefs.edit()
                .remove(KEY_FAILURE_COUNT)
                .remove(KEY_BLOCKED_UNTIL)
                .remove(KEY_HARD_LOCKED)
                .remove(KEY_LAST_OBSERVED)
                .commit()
        ) { "Unable to clear PIN attempt state" }
    }

    private companion object {
        const val KEY_FAILURE_COUNT = "pinAttempt.failureCount"
        const val KEY_BLOCKED_UNTIL = "pinAttempt.blockedUntilEpochMs"
        const val KEY_HARD_LOCKED = "pinAttempt.hardLocked"
        const val KEY_LAST_OBSERVED = "pinAttempt.lastObservedEpochMs"
    }
}

class PinAttemptGuard(
    private val store: PinAttemptStateStore,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) {
    fun current(): PinAttemptResult = synchronized(globalLock) {
        persist(PinAttemptPolicy.current(store.load(), nowEpochMs()))
    }

    fun recordFailure(): PinAttemptResult = synchronized(globalLock) {
        persist(PinAttemptPolicy.recordFailure(store.load(), nowEpochMs()))
    }

    fun recordPinSuccess(): PinAttemptResult = synchronized(globalLock) {
        persist(PinAttemptPolicy.recordPinSuccess(store.load(), nowEpochMs()))
    }

    fun recordDeviceSuccess(): PinAttemptResult = synchronized(globalLock) {
        persist(PinAttemptPolicy.recordDeviceSuccess(store.load(), nowEpochMs()))
    }

    fun clear() = synchronized(globalLock) { store.clear() }

    private fun persist(result: PinAttemptResult): PinAttemptResult {
        store.save(result.state)
        return result
    }

    private companion object {
        val globalLock = Any()
    }
}
