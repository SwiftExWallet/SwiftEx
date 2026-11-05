import XCTest
@testable import test_app

final class WalletMigrationPolicyTests: XCTestCase {
    private let wallets = #"[{"walletId":"1001","name":"Main","address":"0xabc"}]"#
    private let active = #"{"walletId":"1001","name":"Main","address":"0xabc"}"#

    func testReadableValidWalletDataSelectsMigration() {
        let decision = WalletMigrationPolicy.decide([
            .readable(source: "v2", wallets: wallets, activeWallet: active),
        ])

        XCTAssertEqual(decision, .migrate(wallets: wallets, activeWallet: active))
    }

    func testOnlyConfirmedAbsentSourcesSelectFreshInstall() {
        let decision = WalletMigrationPolicy.decide([
            .absent(source: "v2"),
            .absent(source: "legacy"),
        ])

        XCTAssertEqual(decision, .freshInstall)
    }

    func testUnreadableSourceBlocksMigration() {
        let decision = WalletMigrationPolicy.decide([
            .unreadable(source: "v2", reason: "key invalidated"),
            .absent(source: "legacy"),
        ])

        guard case let .blocked(source, _) = decision else {
            return XCTFail("Expected migration to be blocked")
        }
        XCTAssertEqual(source, "v2")
    }

    func testMalformedWalletJSONBlocksMigration() {
        let decision = WalletMigrationPolicy.decide([
            .readable(source: "legacy", wallets: "not-json", activeWallet: active),
        ])

        guard case .blocked = decision else {
            return XCTFail("Expected malformed JSON to block migration")
        }
    }

    func testActiveWalletMissingFromArrayBlocksMigration() {
        let other = #"{"walletId":"9999","name":"Other","address":"0xdef"}"#
        let decision = WalletMigrationPolicy.decide([
            .readable(source: "legacy", wallets: wallets, activeWallet: other),
        ])

        guard case .blocked = decision else {
            return XCTFail("Expected inconsistent active wallet to block migration")
        }
    }

    func testDisagreeingReadableSourcesBlockInsteadOfOverwriting() {
        let newerWallets = #"[{"walletId":"2002","name":"New","address":"0xdef"}]"#
        let newerActive = #"{"walletId":"2002","name":"New","address":"0xdef"}"#
        let decision = WalletMigrationPolicy.decide([
            .readable(source: "destination", wallets: newerWallets, activeWallet: newerActive),
            .readable(source: "legacy", wallets: wallets, activeWallet: active),
        ])

        guard case .blocked = decision else {
            return XCTFail("Expected conflicting sources to block migration")
        }
    }

    func testSafeMarkerWithoutValidDestinationNeedsMigration() {
        XCTAssertEqual(
            WalletMigrationPolicy.currentState(
                markerSet: true,
                destinationWallets: wallets,
                destinationActiveWallet: nil,
                legacyCandidatePresent: true
            ),
            .needsMigration
        )
    }

    func testCleanupRequiresVerifiedDestinationAndCommittedMarker() {
        XCTAssertFalse(WalletMigrationPolicy.canCleanup(destinationVerified: false, markerCommitted: true))
        XCTAssertFalse(WalletMigrationPolicy.canCleanup(destinationVerified: true, markerCommitted: false))
        XCTAssertTrue(WalletMigrationPolicy.canCleanup(destinationVerified: true, markerCommitted: true))
    }
}
