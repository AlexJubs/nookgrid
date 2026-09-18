import XCTest

final class NookGridUITests: XCTestCase {
    private var app: XCUIApplication!
    private let places = ["Bakery", "Cafe", "Books", "Florist", "Park", "Pond", "Homes", "Bikes", "Market"]
    private let lots = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"]

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["nookgrid-reset-test-state", "nookgrid-offline"]
        app.launch()
        XCTAssertTrue(button("Lot A1, empty").waitForExistence(timeout: 60), app.debugDescription)
    }

    override func tearDownWithError() throws {
        if app.state == .runningForeground { captureScreenshot(name) }
        if app.state != .notRunning { app.terminate() }
    }

    private func captureScreenshot(_ name: String) {
        XCTContext.runActivity(named: name) { activity in
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = name
            screenshot.lifetime = .keepAlways
            activity.add(screenshot)
        }
    }

    private func button(_ label: String) -> XCUIElement { app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch }
    private func lot(_ address: String) -> XCUIElement {
        app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "Lot \(address),")).firstMatch
    }
    private func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.exists || element.waitForExistence(timeout: 5), "Missing \(element)", file: file, line: line)
        scrollTo(element)
        element.press(forDuration: 0.1)
    }
    private func scrollTo(_ element: XCUIElement) {
        let viewport = app.frame.insetBy(dx: 0, dy: 24)
        for _ in 0..<4 {
            let frame = element.frame
            if frame.minY >= viewport.minY && frame.maxY <= viewport.maxY { return }
            let isBelow = frame.maxY > viewport.maxY
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: isBelow ? 0.8 : 0.2))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: isBelow ? 0.2 : 0.8))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
    }
    private func assertLot(_ address: String, _ place: String, file: StaticString = #filePath, line: UInt = #line) {
        let target = button("Lot \(address), \(place)")
        XCTAssertTrue(target.exists || target.waitForExistence(timeout: 5), app.debugDescription, file: file, line: line)
    }
    private func place(_ name: String, at address: String) {
        tap(button("\(name), choose a lot"))
        tap(lot(address))
        assertLot(address, name)
    }
    private func openTutorial(isFresh: Bool = true) {
        tap(app.webViews.links["Tutorial"].firstMatch)
        let instruction = isFresh ? "Place Bakery in A1, the top-left square." : "Now all nine places are available. Use the full plan to finish."
        XCTAssertTrue(app.staticTexts[instruction].waitForExistence(timeout: 5))
    }
    private func reveal(_ used: Int) {
        tap(button("Hint, \(used) hint\(used == 1 ? "" : "s") used"))
        let title = app.staticTexts["Reveal a place?"]
        XCTAssertTrue(title.exists || title.waitForExistence(timeout: 5))
        tap(button("Reveal"))
    }

    func testColdLaunchPerformance() {
        app.terminate()
        app.launchArguments = ["nookgrid-offline"]
        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options) {
            app.launch()
            XCTAssertTrue(button("Lot A1, empty").waitForExistence(timeout: 10))
            app.terminate()
        }
    }

    func testSafeAreaAndBoardTouchTargets() {
        XCTAssertGreaterThanOrEqual(app.webViews.links["NookGrid home"].frame.minY, 20)
        for address in lots {
            XCTAssertGreaterThanOrEqual(lot(address).frame.width, 44)
            XCTAssertGreaterThanOrEqual(lot(address).frame.height, 44)
        }
        for name in places {
            XCTAssertGreaterThanOrEqual(button("\(name), choose a lot").frame.width, 44)
            XCTAssertGreaterThanOrEqual(button("\(name), choose a lot").frame.height, 44)
        }
        let controls = [button("How to play"), button("Menu"), button("Undo"), button("Reset"), button("Hint, 0 hints used")]
        for target in controls + lots.map(lot) + places.map({ button("\($0), choose a lot") }) {
            XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
        }
        let headerY = app.webViews.links["NookGrid home"].frame.minY
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.8))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.2)))
        XCTAssertEqual(app.webViews.links["NookGrid home"].frame.minY, headerY, accuracy: 1)
    }

    func testMovesSwapsRemovalUndoAndReset() {
        place("Bakery", at: "A1")
        place("Cafe", at: "A2")
        tap(lot("A1"))
        tap(lot("A2"))
        assertLot("A1", "Cafe")
        assertLot("A2", "Bakery")
        tap(button("Undo"))
        assertLot("A1", "Bakery")
        assertLot("A2", "Cafe")
        tap(lot("A1"))
        tap(button("Put back"))
        assertLot("A1", "empty")
        tap(button("Reset"))
        XCTAssertEqual(app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label MATCHES %@", "Lot [ABC][123], empty")).count, 9)
    }

    func testNativeDragPlacesAndMoves() {
        scrollTo(button("Bakery, choose a lot"))
        button("Bakery, choose a lot").press(forDuration: 0.15, thenDragTo: lot("A1"))
        assertLot("A1", "Bakery")
        lot("A1").press(forDuration: 0.15, thenDragTo: lot("B2"))
        assertLot("A1", "empty")
        assertLot("B2", "Bakery")
    }

    func testHintPersistsThroughResetAndProcessRestart() {
        reveal(0)
        let fixed = app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Lot ' AND label ENDSWITH 'fixed by a hint'")).firstMatch
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        let label = fixed.label
        XCTAssertFalse(fixed.isEnabled)
        tap(button("Reset"))
        XCTAssertTrue(button(label).exists)
        app.terminate()
        app.launchArguments = ["nookgrid-offline"]
        app.launch()
        XCTAssertTrue(button(label).waitForExistence(timeout: 15))
        XCTAssertTrue(button("Hint, 1 hint used").exists)
    }

    func testTutorialGuidanceAndSavedPuzzlesAreSeparate() {
        openArchive()
        place("Park", at: "C3")
        openTutorial()
        XCTAssertFalse(button("Park, choose a lot").exists)
        place("Bakery", at: "A1")
        XCTAssertTrue(app.staticTexts["Bakery fits. Place Cafe directly to its right."].exists)
        place("Cafe", at: "A2")
        place("Books", at: "A3")
        XCTAssertTrue(button("Park, choose a lot").exists)
        openArchive()
        assertLot("C3", "Park")
        assertLot("A1", "empty")
        openTutorial(isFresh: false)
        assertLot("A1", "Bakery")
        assertLot("A2", "Cafe")
        assertLot("A3", "Books")
    }

    func testTutorialCompletionAndBackgroundTimer() {
        openTutorial()
        place("Bakery", at: "A1")
        let started = Date()
        XCUIDevice.shared.press(.home)
        RunLoop.current.run(until: Date().addingTimeInterval(10))
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5))
        XCTAssertTrue(button("Cafe, choose a lot").waitForExistence(timeout: 5))
        assertLot("A1", "Bakery")
        for index in 1..<places.count { place(places[index], at: lots[index]) }
        XCTAssertTrue(app.staticTexts["Nice work!"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Solved without hints."].exists)
        let result = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Solved in '")).firstMatch.label
        let components = result.replacingOccurrences(of: "Solved in ", with: "").split(separator: ":").compactMap { Int($0) }
        XCTAssertEqual(components.count, 2)
        let elapsed = components[0] * 60 + components[1]
        XCTAssertLessThan(Double(elapsed), Date().timeIntervalSince(started) - 5, "Background time must not count toward solve time")
        XCTAssertTrue(app.webViews.links["Play today's puzzle"].exists)
    }

    private func openArchive() {
        tap(button("Menu"))
        let archive = app.webViews.otherElements.matching(NSPredicate(format: "label == 'Puzzle archive' AND value != nil")).firstMatch
        XCTAssertTrue(archive.waitForExistence(timeout: 5), app.debugDescription)
        tap(archive)
        if app.pickerWheels.firstMatch.waitForExistence(timeout: 2) {
            app.pickerWheels.firstMatch.adjust(toPickerWheelValue: "Sep 10, 2026")
            if app.buttons["Done"].exists { app.buttons["Done"].tap() }
        } else {
            tap(app.buttons["Sep 10, 2026"].firstMatch)
        }
        XCTAssertTrue(app.staticTexts["Sep 10, 2026"].waitForExistence(timeout: 5), app.debugDescription)
    }

    func testArchiveNavigation() {
        openArchive()
        place("Bakery", at: "A1")
        tap(button("Menu"))
        tap(app.webViews.links["Today's puzzle"].firstMatch)
        assertLot("A1", "empty")
    }

    func testDialogsDismiss() {
        tap(button("How to play"))
        XCTAssertTrue(button("Close how to play").waitForExistence(timeout: 5))
        captureScreenshot("How to play dialog")
        tap(button("More controls"))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Tab to move focus'")).firstMatch.exists)
        captureScreenshot("How to play expanded controls")
        tap(button("More controls"))
        tap(button("Close how to play"))
        tap(button("Menu"))
        tap(button("Settings"))
        XCTAssertTrue(button("Close settings").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Test mode: analytics are off."].exists)
        captureScreenshot("Settings")
        tap(button("Close settings"))
        tap(button("Hint, 0 hints used"))
        captureScreenshot("Hint touch focus")
        tap(button("Cancel"))
        XCTAssertFalse(app.staticTexts["Reveal a place?"].exists)
        tap(button("Menu"))
        tap(button("Feedback"))
        XCTAssertTrue(button("Close feedback").waitForExistence(timeout: 5))
        let emailFeedback = app.webViews.links["Email feedback"].firstMatch
        XCTAssertTrue(emailFeedback.exists)
        XCTAssertTrue(emailFeedback.isHittable)
        // WKWebView reports link text bounds; browser checks measure the full target.
        XCTAssertGreaterThanOrEqual(button("Close feedback").frame.width, 44)
        XCTAssertGreaterThanOrEqual(button("Close feedback").frame.height, 44)
        for target in [button("Close feedback"), emailFeedback] {
            XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
        }
        captureScreenshot("Native feedback")
        tap(button("Close feedback"))
        tap(button("Menu"))
        captureScreenshot("Menu touch focus")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.15)).tap()
        XCTAssertFalse(button("Close menu").exists)
        for page in ["How to play", "Privacy"] {
            tap(button("Menu"))
            tap(app.webViews.links[page].firstMatch)
            let returnLink = app.webViews.links["Back to puzzle"].firstMatch
            XCTAssertTrue(returnLink.waitForExistence(timeout: 5))
            let heading = page == "How to play" ? "The basics" : "iPhone app privacy"
            XCTAssertTrue(app.staticTexts[heading].exists)
            for target in [app.webViews.links["NookGrid"].firstMatch, returnLink] {
                XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
                XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
            }
            captureScreenshot(page == "How to play" ? "How to play page" : "Native privacy page")
            tap(returnLink)
            assertLot("A1", "empty")
        }
    }

    func testSolveWithHintsAndNativeShareSheet() {
        for count in 0..<9 { reveal(count) }
        XCTAssertTrue(app.staticTexts["Solved!"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["9 hints used."].exists)
        tap(button("Share result"))
        let copy = app.cells["Copy"].firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 60), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'https://nookgrid.com/' AND label CONTAINS '9 hints'")).firstMatch.exists, app.debugDescription)
        let close = app.buttons.matching(NSPredicate(format: "label ==[c] 'close'")).firstMatch
        if close.exists { close.tap() }
        else {
            let dismiss = app.otherElements["PopoverDismissRegion"].firstMatch
            XCTAssertTrue(dismiss.exists, app.debugDescription)
            dismiss.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.15)).tap()
        }
        XCTAssertTrue(copy.waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(button("Close share result").exists)
        XCTAssertTrue(button("Share result").exists)
        tap(button("Share result"))
        XCTAssertTrue(copy.waitForExistence(timeout: 60), app.debugDescription)
        copy.tap()
        XCTAssertTrue(copy.waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Solved!"].exists)
    }
}
