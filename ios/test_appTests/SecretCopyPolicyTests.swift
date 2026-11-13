import XCTest
@testable import test_app

final class SecretCopyPolicyTests: XCTestCase {
    private let wallet: [String: Any] = [
        "mnemonic": "one two three",
        "privatekey": "0xethereum",
        "stellarPrivateKey": "Sstellar",
    ]

    func testSelectsOnlyTheRequestedSecret() {
        XCTAssertEqual(SecretCopyPolicy.value(for: wallet, type: "mnemonic"), "one two three")
        XCTAssertEqual(SecretCopyPolicy.value(for: wallet, type: "ethereumPrivateKey"), "0xethereum")
        XCTAssertEqual(SecretCopyPolicy.value(for: wallet, type: "stellarPrivateKey"), "Sstellar")
    }

    func testMissingOrUnknownSecretCannotBeCopied() {
        XCTAssertNil(SecretCopyPolicy.value(for: [:], type: "mnemonic"))
        XCTAssertNil(SecretCopyPolicy.value(for: wallet, type: "unknown"))
    }

    func testClipboardClearOnlyAppliesWhileCopiedValueIsStillPresent() {
        XCTAssertTrue(SecretCopyPolicy.canClear(current: "0xethereum", copied: "0xethereum"))
        XCTAssertFalse(SecretCopyPolicy.canClear(current: "replacement", copied: "0xethereum"))
    }
}
