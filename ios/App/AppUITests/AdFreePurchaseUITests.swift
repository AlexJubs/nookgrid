import XCTest
import StoreKit
import StoreKitTest

// The .storekit file belongs only to this test runner, never to the shipped app.
@MainActor
final class AdFreePurchaseUITests: XCTestCase {
    private var app: XCUIApplication!
    private var session: SKTestSession!

    override func setUp() async throws {
        continueAfterFailure = false
        let file = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "AdFreeTest", withExtension: "storekit"))
        session = try SKTestSession(contentsOf: file)
        session.resetToDefaultState()
        session.clearTransactions()
        session.disableDialogs = true
        // Session setters can log a simulator service failure without throwing. Check
        // a throwing API before launching the app so unavailable test infrastructure
        // fails here, rather than masquerading as missing production product metadata.
        guard #available(iOS 17.0, *) else {
            throw NSError(domain: "NookGridStoreKitTest", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "The StoreKit test suite requires iOS 17 or later."])
        }
        try await session.setSimulatedError(nil, forAPI: .purchase)
        app = XCUIApplication()
        app.launchArguments = ["nookgrid-reset-test-state", "nookgrid-storekit-test"]
        app.launch()
        XCTAssertTrue(element("Play today's puzzle").waitForExistence(timeout: 60), app.debugDescription)
        openSettings()
        XCTAssertTrue(purchaseButton.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(purchaseButton.isEnabled, app.debugDescription)
    }

    override func tearDownWithError() throws {
        if let app, app.state != .notRunning { app.terminate() }
        session?.clearTransactions()
        session?.resetToDefaultState()
    }

    private func element(_ label: String) -> XCUIElement {
        app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    private var purchaseButton: XCUIElement {
        app.webViews.firstMatch.descendants(matching: .button).matching(NSPredicate(format: "label BEGINSWITH 'Remove ads' ")).firstMatch
    }

    private func tap(_ control: XCUIElement) {
        XCTAssertTrue(control.waitForExistence(timeout: 10), app.debugDescription)
        if !control.isHittable { app.swipeUp() }
        XCTAssertTrue(control.isHittable, app.debugDescription)
        control.tap()
    }

    private func openSettings() {
        tap(element("Menu"))
        let menu = app.webViews.firstMatch.descendants(matching: .other).matching(NSPredicate(format: "label == 'Menu, web dialog'")).firstMatch
        tap(menu.descendants(matching: .any).matching(NSPredicate(format: "label == 'Settings'")).firstMatch)
        XCTAssertTrue(element("Close settings").waitForExistence(timeout: 10), app.debugDescription)
    }

    func testVerifiedPurchaseRelaunchRestoreAndRefund() throws {
        XCTAssertTrue(purchaseButton.label.contains("9.99"), "The local StoreKit test price must reach the UI.")
        tap(purchaseButton)
        XCTAssertTrue(element("Ad-free play is active.").waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertFalse(element("Ad-free play is active").isEnabled)
        XCTAssertEqual(session.allTransactions().filter { $0.productIdentifier == AdFreeEntitlementState.productID }.count, 1)

        app.terminate()
        app.launchArguments = ["nookgrid-storekit-test"]
        app.launch()
        XCTAssertTrue(element("Play today's puzzle").waitForExistence(timeout: 60), app.debugDescription)
        openSettings()
        XCTAssertTrue(element("Ad-free play is active.").waitForExistence(timeout: 15), app.debugDescription)
        tap(element("Restore purchases"))
        XCTAssertTrue(element("Purchase restored. Ad-free play is active.").waitForExistence(timeout: 15), app.debugDescription)
        let transaction = try XCTUnwrap(session.allTransactions().first { $0.productIdentifier == AdFreeEntitlementState.productID })
        try session.refundTransaction(identifier: transaction.identifier)
        XCTAssertTrue(purchaseButton.waitForExistence(timeout: 15), "A verified refund must remove the entitlement. \(app.debugDescription)")
        XCTAssertTrue(purchaseButton.isEnabled)
    }

    func testPendingApprovalNeverGrantsUntilVerifiedUpdate() throws {
        session.askToBuyEnabled = true
        tap(purchaseButton)
        XCTAssertTrue(element("Your purchase is awaiting approval. You can keep playing.").waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertFalse(element("Awaiting approval").isEnabled)
        XCTAssertFalse(element("Ad-free play is active.").exists)
        let pending = try XCTUnwrap(session.allTransactions().first { $0.productIdentifier == AdFreeEntitlementState.productID })
        try session.approveAskToBuyTransaction(identifier: pending.identifier)
        XCTAssertTrue(element("Ad-free play is active.").waitForExistence(timeout: 15), app.debugDescription)
    }

    func testCancelledAndFailedPurchaseKeepFreePlayAndCanRetry() async throws {
        if #available(iOS 17.0, *) {
            try await session.setSimulatedError(SKTestFailures.Purchase.generic(.userCancelled), forAPI: .purchase)
            tap(purchaseButton)
            XCTAssertTrue(element("Purchase cancelled. You can keep playing.").waitForExistence(timeout: 15), app.debugDescription)
            XCTAssertTrue(purchaseButton.isEnabled)
            XCTAssertFalse(element("Ad-free play is active.").exists)
            try await session.setSimulatedError(SKTestFailures.Purchase.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: .purchase)
            tap(purchaseButton)
            XCTAssertTrue(element("Your purchase could not be completed. Try again.").waitForExistence(timeout: 15), app.debugDescription)
            XCTAssertTrue(purchaseButton.isEnabled)
            XCTAssertTrue(session.allTransactions().isEmpty)
            try await session.setSimulatedError(nil, forAPI: .purchase)
            tap(element("Close settings"))
            tap(element("Play today's puzzle"))
            XCTAssertTrue(element("Lot A1, empty").waitForExistence(timeout: 10), "Free daily play must remain available after purchase errors.")
        } else { XCTFail("The native CI StoreKit error suite requires iOS 17 or later.") }
    }
}

final class AdFreeEntitlementPolicyTests: XCTestCase {
    private func facts(productID: String = AdFreeEntitlementState.productID,
                       bundleID: String = AdFreeEntitlementState.bundleID,
                       isNonConsumable: Bool = true, isVerified: Bool = true,
                       isRevoked: Bool = false, environmentAllowed: Bool = true) -> AdFreeEntitlementState.TransactionFacts {
        .init(productID: productID, bundleID: bundleID, isNonConsumable: isNonConsumable,
              isVerified: isVerified, isRevoked: isRevoked, environmentAllowed: environmentAllowed)
    }

    func testOnlyVerifiedMatchingNonConsumableGrantsAdFree() {
        XCTAssertEqual(AdFreeEntitlementState.resolve([]), .free)
        XCTAssertEqual(AdFreeEntitlementState.resolve([facts()]), .adFree)
        for invalid in [facts(productID: "unrelated"), facts(bundleID: "unrelated"), facts(isNonConsumable: false),
                        facts(isRevoked: true), facts(environmentAllowed: false)] {
            XCTAssertEqual(AdFreeEntitlementState.resolve([invalid]), .free)
        }
        XCTAssertEqual(AdFreeEntitlementState.resolve([facts(isVerified: false)]), .unverified)
        XCTAssertEqual(AdFreeEntitlementState.resolve([facts(isVerified: false), facts()]), .adFree)
    }

    func testUnknownUnverifiedOwnedAndStoreKitSheetsSuppressAds() {
        for state in [AdFreeEntitlementState.unknown, .unverified, .adFree] { XCTAssertFalse(state.allowsAds(operation: "idle")) }
        XCTAssertTrue(AdFreeEntitlementState.free.allowsAds(operation: "idle"))
        for operation in ["loading", "purchasing", "restoring"] { XCTAssertFalse(AdFreeEntitlementState.free.allowsAds(operation: operation)) }
    }
}
