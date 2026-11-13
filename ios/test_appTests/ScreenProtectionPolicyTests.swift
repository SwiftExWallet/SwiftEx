import XCTest
@testable import test_app

final class ScreenProtectionPolicyTests: XCTestCase {
    func testObscuresSensitiveContentWhenInactiveOrCaptured() {
        XCTAssertTrue(ScreenProtectionPolicy.shouldObscure(isAppActive: false, isScreenCaptured: false))
        XCTAssertTrue(ScreenProtectionPolicy.shouldObscure(isAppActive: true, isScreenCaptured: true))
        XCTAssertFalse(ScreenProtectionPolicy.shouldObscure(isAppActive: true, isScreenCaptured: false))
    }
}
