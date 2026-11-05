import Foundation
import Security

enum PinAttemptStatus: String {
    case success
    case invalid
    case backoff
    case deviceCredentialRequired
    case notConfigured
}

struct PinAttemptState: Codable, Equatable {
    var failureCount: Int = 0
    var blockedUntilEpochMs: Int64 = 0
    var hardLocked: Bool = false
    var lastObservedEpochMs: Int64 = 0
}

struct PinAttemptResult {
    let status: PinAttemptStatus
    let state: PinAttemptState
    let retryAfterMs: Int64

    init(status: PinAttemptStatus, state: PinAttemptState, retryAfterMs: Int64 = 0) {
        self.status = status
        self.state = state
        self.retryAfterMs = retryAfterMs
    }

    var bridgeValue: [String: Any] {
        [
            "status": status.rawValue,
            "failureCount": state.failureCount,
            "retryAfterMs": retryAfterMs,
        ]
    }
}

enum PinAttemptPolicy {
    private static let delays: [Int: Int64] = [
        5: 30_000,
        6: 60_000,
        7: 300_000,
        8: 900_000,
        9: 3_600_000,
    ]

    static func current(state: PinAttemptState, nowEpochMs: Int64) -> PinAttemptResult {
        let effectiveNow = max(nowEpochMs, state.lastObservedEpochMs)
        var observed = state
        observed.lastObservedEpochMs = effectiveNow
        if observed.hardLocked {
            return PinAttemptResult(status: .deviceCredentialRequired, state: observed)
        }
        let remaining = max(0, observed.blockedUntilEpochMs - effectiveNow)
        if remaining > 0 {
            return PinAttemptResult(status: .backoff, state: observed, retryAfterMs: remaining)
        }
        observed.blockedUntilEpochMs = 0
        return PinAttemptResult(status: .invalid, state: observed)
    }

    static func recordFailure(state: PinAttemptState, nowEpochMs: Int64) -> PinAttemptResult {
        let gate = current(state: state, nowEpochMs: nowEpochMs)
        if gate.status == .backoff || gate.status == .deviceCredentialRequired { return gate }
        var updated = gate.state
        updated.failureCount += 1
        if updated.failureCount >= 10 {
            updated.hardLocked = true
            updated.blockedUntilEpochMs = 0
            return PinAttemptResult(status: .deviceCredentialRequired, state: updated)
        }
        let delay = delays[updated.failureCount] ?? 0
        updated.blockedUntilEpochMs = delay > 0 ? updated.lastObservedEpochMs + delay : 0
        return PinAttemptResult(
            status: delay > 0 ? .backoff : .invalid,
            state: updated,
            retryAfterMs: delay
        )
    }

    static func recordPinSuccess(state: PinAttemptState, nowEpochMs: Int64) -> PinAttemptResult {
        let gate = current(state: state, nowEpochMs: nowEpochMs)
        if gate.status == .deviceCredentialRequired { return gate }
        return PinAttemptResult(
            status: .success,
            state: PinAttemptState(lastObservedEpochMs: gate.state.lastObservedEpochMs)
        )
    }

    static func recordDeviceSuccess(state: PinAttemptState, nowEpochMs: Int64) -> PinAttemptResult {
        PinAttemptResult(
            status: .success,
            state: PinAttemptState(lastObservedEpochMs: max(nowEpochMs, state.lastObservedEpochMs))
        )
    }
}

protocol PinAttemptStateStore {
    func load() throws -> PinAttemptState
    func save(_ state: PinAttemptState) throws
    func clear() throws
}

final class KeychainPinAttemptStateStore: PinAttemptStateStore {
    private let service = "com.appSwiftEx.pinAttemptGuard.v1"
    private let account = "global"

    func load() throws -> PinAttemptState {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return PinAttemptState() }
        guard status == errSecSuccess, let data = result as? Data else {
            throw PinAttemptSecurityError.keychain(status)
        }
        return try JSONDecoder().decode(PinAttemptState.self, from: data)
    }

    func save(_ state: PinAttemptState) throws {
        let data = try JSONEncoder().encode(state)
        let updateStatus = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw PinAttemptSecurityError.keychain(updateStatus)
        }
        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw PinAttemptSecurityError.keychain(addStatus) }
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw PinAttemptSecurityError.keychain(status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

final class PinAttemptGuardIOS {
    static let shared = PinAttemptGuardIOS(store: KeychainPinAttemptStateStore())
    private let store: PinAttemptStateStore
    private let nowEpochMs: () -> Int64
    private let queue = DispatchQueue(label: "com.appSwiftEx.pinAttemptGuard")

    init(store: PinAttemptStateStore, nowEpochMs: @escaping () -> Int64 = {
        Int64(Date().timeIntervalSince1970 * 1000)
    }) {
        self.store = store
        self.nowEpochMs = nowEpochMs
    }

    func current() throws -> PinAttemptResult { try update(PinAttemptPolicy.current) }
    func recordFailure() throws -> PinAttemptResult { try update(PinAttemptPolicy.recordFailure) }
    func recordPinSuccess() throws -> PinAttemptResult { try update(PinAttemptPolicy.recordPinSuccess) }
    func recordDeviceSuccess() throws -> PinAttemptResult { try update(PinAttemptPolicy.recordDeviceSuccess) }
    func clear() throws { try queue.sync { try store.clear() } }

    private func update(
        _ operation: (PinAttemptState, Int64) -> PinAttemptResult
    ) throws -> PinAttemptResult {
        try queue.sync {
            let result = operation(try store.load(), nowEpochMs())
            try store.save(result.state)
            return result
        }
    }
}

enum PinAttemptSecurityError: Error {
    case keychain(OSStatus)
}
