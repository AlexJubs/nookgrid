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
        XCTAssertTrue(element.isHittable, "Not hittable: \(element)", file: file, line: line)
        element.press(forDuration: 0.1)
    }
    private func scrollTo(_ element: XCUIElement) {
        let puzzleList = app.webViews.firstMatch.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH 'Choose a puzzle'")).firstMatch
        let isPuzzleLink = element.elementType == .link && puzzleList.exists
        let scrollArea: XCUIElement = isPuzzleLink ? puzzleList : app
        let viewport = scrollArea.frame.intersection(app.frame).insetBy(dx: 0, dy: isPuzzleLink ? 4 : 24)
        for _ in 0..<4 {
            let frame = element.frame
            if frame.minY >= viewport.minY && frame.maxY <= viewport.maxY && element.isHittable { return }
            let isBelow = frame.maxY > viewport.maxY
            let start = scrollArea.coordinate(withNormalizedOffset: CGVector(dx: isPuzzleLink ? 0.5 : 0.02, dy: isBelow ? 0.8 : 0.2))
            let end = scrollArea.coordinate(withNormalizedOffset: CGVector(dx: isPuzzleLink ? 0.5 : 0.02, dy: isBelow ? 0.2 : 0.8))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTAssertTrue(viewport.contains(element.frame), "Element remains outside its scroll area: \(element)")
    }
    private func assertLot(_ address: String, _ place: String, file: StaticString = #filePath, line: UInt = #line) {
        let target = button("Lot \(address), \(place)")
        XCTAssertTrue(target.exists || target.waitForExistence(timeout: 5), app.debugDescription, file: file, line: line)
    }
    private func place(_ name: String, at address: String) {
        tap(button("\(name), choose a lot"))
        XCTAssertTrue(app.staticTexts["\(name) selected. Choose a lot."].waitForExistence(timeout: 5), "\(name) was not selected")
        tap(lot(address))
        assertLot(address, name)
    }
    private func openTutorial(isFresh: Bool = true) {
        tap(app.webViews.links["Tutorial"].firstMatch)
        let instruction = isFresh ? "Tap Bakery, then A1, the outlined square." : "Finish the plan. ✓ fits; ! needs a change."
        let instructionText = app.staticTexts[instruction]
        XCTAssertTrue(instructionText.waitForExistence(timeout: 5))
        XCTAssertTrue(instructionText.isHittable)
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
        let controls = [app.webViews.buttons["Tutorial"].firstMatch, button("Menu"), button("Undo"), button("Reset"), button("Hint, 0 hints used")]
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
        tap(button("Menu"))
        tap(app.webViews.links["Privacy"].firstMatch)
        tap(app.webViews.links["Back to puzzle"].firstMatch)
        XCTAssertTrue(app.staticTexts["Sep 10, 2026"].waitForExistence(timeout: 5))
        assertLot("C3", "Park")
        openTutorial()
        XCTAssertFalse(button("Park, choose a lot").exists)
        place("Bakery", at: "A1")
        XCTAssertTrue(app.staticTexts["Place Cafe in the next square to the right of Bakery."].exists)
        tap(lot("A1"))
        XCTAssertTrue(app.staticTexts["Tap another square to move or swap, or choose Put back."].exists)
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

    private func openPuzzles() {
        tap(button("Menu"))
        XCTAssertTrue(button("Close menu").waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Menu"].exists)
        tap(button("Puzzles"))
        XCTAssertTrue(button("Close puzzles").waitForExistence(timeout: 5))
        XCTAssertFalse(button("Close menu").exists)
        XCTAssertTrue(app.webViews.links["Tutorial"].firstMatch.exists)
    }

    private func openArchive() {
        openPuzzles()
        tap(app.webViews.links["Sep 10, 2026"].firstMatch)
        XCTAssertTrue(app.staticTexts["Sep 10, 2026"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(button("Close puzzles").exists)
    }

    private func openToday() {
        openPuzzles()
        tap(app.webViews.links.matching(NSPredicate(format: "label BEGINSWITH 'Today, '")).firstMatch)
        XCTAssertTrue(app.webViews.buttons["Tutorial"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(button("Close puzzles").exists)
    }

    func testArchiveNavigation() {
        openArchive()
        place("Bakery", at: "A1")
        openToday()
        assertLot("A1", "empty")
        openPuzzles()
        openTutorial()
        XCTAssertFalse(button("Close puzzles").exists)
        assertLot("A1", "empty")
    }

    func testDialogsDismiss() {
        tap(app.webViews.buttons["Tutorial"].firstMatch)
        XCTAssertTrue(app.staticTexts["Tap Bakery, then A1, the outlined square."].waitForExistence(timeout: 5))
        XCTAssertFalse(button("Close how to play").exists)
        tap(button("Tutorial tips"))
        XCTAssertTrue(button("Back to tutorial").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Tab to move focus'")).firstMatch.exists)
        for label in ["Fits this layout", "Needs a change", "Directly left", "Above", "Touching"] {
            XCTAssertTrue(app.staticTexts[label].exists, label)
        }
        captureScreenshot("Tutorial reference")
        tap(button("Back to tutorial"))
        XCTAssertFalse(button("Back to tutorial").exists)
        XCTAssertTrue(app.staticTexts["Tap Bakery, then A1, the outlined square."].isHittable)
        tap(button("Tutorial tips"))
        tap(app.webViews.links["Worked example"].firstMatch)
        XCTAssertTrue(app.staticTexts["A quick example"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["A quick example"].isHittable)
        let exampleReturn = app.webViews.links["Back to puzzle"].firstMatch
        XCTAssertTrue(exampleReturn.waitForExistence(timeout: 5))
        scrollTo(exampleReturn)
        XCTAssertTrue(app.staticTexts["The basics"].exists)
        for target in [app.webViews.links["NookGrid"].firstMatch, exampleReturn] {
            XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
        }
        captureScreenshot("Worked example page")
        tap(exampleReturn)
        XCTAssertTrue(app.staticTexts["Tap Bakery, then A1, the outlined square."].waitForExistence(timeout: 5))
        assertLot("A1", "empty")
        openToday()
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
        openPuzzles()
        captureScreenshot("Puzzles")
        tap(button("Close puzzles"))
        XCTAssertFalse(button("Close puzzles").exists)
        tap(button("Menu"))
        captureScreenshot("Menu touch focus")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.15)).tap()
        XCTAssertFalse(button("Close menu").exists)
        tap(button("Menu"))
        tap(app.webViews.links["Privacy"].firstMatch)
        let returnLink = app.webViews.links["Back to puzzle"].firstMatch
        XCTAssertTrue(returnLink.waitForExistence(timeout: 5))
        scrollTo(returnLink)
        XCTAssertTrue(app.staticTexts["iPhone app privacy"].exists)
        for target in [app.webViews.links["NookGrid"].firstMatch, returnLink] {
            XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
        }
        captureScreenshot("Native privacy page")
        tap(returnLink)
        assertLot("A1", "empty")
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
