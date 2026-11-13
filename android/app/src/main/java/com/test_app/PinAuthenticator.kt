package org.app.swiftEx.wallet

class PinAuthenticator(
    private val guard: PinAttemptGuard,
    private val isConfigured: () -> Boolean,
    private val matches: (String) -> Boolean,
) {
    fun verify(pin: String): PinAttemptResult {
        val gate = guard.current()
        if (gate.status == PinAttemptStatus.BACKOFF ||
            gate.status == PinAttemptStatus.DEVICE_CREDENTIAL_REQUIRED
        ) return gate
        if (pin.length != 6 || pin.any { !it.isDigit() }) {
            return gate.copy(status = PinAttemptStatus.INVALID)
        }
        if (!isConfigured()) return gate.copy(status = PinAttemptStatus.NOT_CONFIGURED)
        return if (matches(pin)) guard.recordPinSuccess() else guard.recordFailure()
    }
}
