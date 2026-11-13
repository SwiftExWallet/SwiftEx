import XCTest
@testable import test_app

final class PinAttemptPolicyTests: XCTestCase {
    func testApprovedDelaysAndHardLock() {
        var state = PinAttemptState()
        var now: Int64 = 1_000_000
        let delays: [Int64] = [0, 0, 0, 0, 30_000, 60_000, 300_000, 900_000, 3_600_000]

        for (index, delay) in delays.enumerated() {
            let result = PinAttemptPolicy.recordFailure(state: state, nowEpochMs: now)
            XCTAssertEqual(result.state.failureCount, index + 1)
            XCTAssertEqual(result.retryAfterMs, delay)
            state = result.state
            now += delay
        }

        let locked = PinAttemptPolicy.recordFailure(state: state, nowEpochMs: now)
        XCTAssertEqual(locked.status, .deviceCredentialRequired)
        XCTAssertTrue(locked.state.hardLocked)
    }

    func testBackoffPersistsAndClockRollbackCannotShortenIt() {
        let blocked = PinAttemptPolicy.recordFailure(
            state: PinAttemptState(failureCount: 4),
            nowEpochMs: 100_000
        )

        let rolledBack = PinAttemptPolicy.current(state: blocked.state, nowEpochMs: 90_000)

        XCTAssertEqual(rolledBack.status, .backoff)
        XCTAssertEqual(rolledBack.retryAfterMs, 30_000)
        XCTAssertEqual(rolledBack.state.failureCount, 5)
    }

    func testOnlyDeviceAuthenticationClearsHardLock() {
        let locked = PinAttemptState(failureCount: 10, hardLocked: true)

        XCTAssertEqual(
            PinAttemptPolicy.recordPinSuccess(state: locked, nowEpochMs: 2_000).status,
            .deviceCredentialRequired
        )
        XCTAssertEqual(
            PinAttemptPolicy.recordDeviceSuccess(state: locked, nowEpochMs: 2_000).state,
            PinAttemptState(lastObservedEpochMs: 2_000)
        )
    }
}
