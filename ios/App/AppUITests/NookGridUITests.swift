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
        XCTAssertTrue(button("Play today's puzzle").waitForExistence(timeout: 60), app.debugDescription)
        tap(button("Play today's puzzle"))
        XCTAssertTrue(button("Lot A1, empty").waitForExistence(timeout: 5), app.debugDescription)
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
        let calendar = app.webViews.firstMatch.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH 'Puzzle completion history'")).firstMatch
        let helpDialog = app.webViews.firstMatch.descendants(matching: .other)
            .matching(NSPredicate(format: "label == 'How to play, web dialog'")).firstMatch
        let isCalendarLink = element.elementType == .link && calendar.exists
        let isHelpOpen = button("Close how to play").exists
        let scrollArea: XCUIElement = isCalendarLink ? calendar : isHelpOpen ? helpDialog : app
        let viewport = scrollArea.frame.intersection(app.frame).insetBy(dx: 0, dy: isCalendarLink ? 4 : 0)
        for _ in 0..<4 {
            let frame = element.frame
            if frame.minY >= viewport.minY && frame.maxY <= viewport.maxY && element.isHittable { return }
            let isBelow = frame.maxY > viewport.maxY
            let start = scrollArea.coordinate(withNormalizedOffset: CGVector(dx: isCalendarLink || isHelpOpen ? 0.5 : 0.02, dy: isBelow ? 0.8 : 0.2))
            let end = scrollArea.coordinate(withNormalizedOffset: CGVector(dx: isCalendarLink || isHelpOpen ? 0.5 : 0.02, dy: isBelow ? 0.2 : 0.8))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTAssertTrue(viewport.contains(element.frame), "Element remains outside its scroll area: \(element), frame \(element.frame), viewport \(viewport). \(app.debugDescription)")
    }
    private func viewResult() {
        let result = button("View result")
        tap(result.exists ? result : button("View today's result"))
    }
    private func assertLot(_ address: String, _ place: String, file: StaticString = #filePath, line: UInt = #line) {
        let wasResult = button("View solved puzzle").exists
        if wasResult { tap(button("View solved puzzle")) }
        let target = button("Lot \(address), \(place)")
        XCTAssertTrue(target.exists || target.waitForExistence(timeout: 5), app.debugDescription, file: file, line: line)
        if wasResult { viewResult() }
    }
    private func place(_ name: String, at address: String) {
        tap(button("\(name), choose a lot"))
        XCTAssertTrue(app.staticTexts["\(name) selected. Choose a lot."].waitForExistence(timeout: 5), "\(name) was not selected")
        tap(lot(address))
        assertLot(address, name)
    }
    private func openTutorial() {
        tap(button("How to play"))
        XCTAssertTrue(button("Close how to play").waitForExistence(timeout: 5))
        tap(app.webViews.links["Play tutorial"].firstMatch)
        XCTAssertTrue(button("Close how to play").waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Tutorial plan"].waitForExistence(timeout: 5))
        XCTAssertTrue(lot("A1").exists)
        XCTAssertTrue(button("How to play").exists)
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
            XCTAssertTrue(button("Play today's puzzle").waitForExistence(timeout: 10))
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
        let controls = [button("How to play"), button("Settings"), button("Undo"), button("Reset"), button("Hint, 0 hints used")]
        let targets = controls + lots.map(lot) + places.map { button("\($0), choose a lot") }
        let fitsInitially = targets.allSatisfy { $0.frame.minY >= 20 && $0.frame.maxY <= app.frame.maxY - 8 }
        let headerY = app.webViews.links["NookGrid home"].frame.minY
        for target in targets {
            scrollTo(target)
            XCTAssertGreaterThanOrEqual(target.frame.minX, app.frame.minX, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxX, app.frame.maxX, target.label)
            XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
        }
        if fitsInitially {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.8))
                .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.2)))
            XCTAssertEqual(app.webViews.links["NookGrid home"].frame.minY, headerY, accuracy: 1)
        }

    }

    func testHomeCalendarAndContinuePreserveNativeProgress() {
        tap(button("Back to home"))
        XCTAssertTrue(button("Play today's puzzle").waitForExistence(timeout: 5))
        XCTAssertFalse(lot("A1").exists)
        tap(button("Calendar"))
        XCTAssertTrue(button("Close calendar").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["0-day streak"].exists)
        XCTAssertTrue(getCalendarMonthTitle().exists, app.debugDescription)
        let currentMonth = getCalendarMonthTitle().label
        for label in ["Previous month", "Next month"] {
            let control = button(label)
            XCTAssertTrue(control.exists)
            XCTAssertGreaterThanOrEqual(control.frame.width, 44)
            XCTAssertGreaterThanOrEqual(control.frame.height, 44)
        }
        XCTAssertFalse(button("Next month").isEnabled)
        if button("Previous month").isEnabled {
            changeCalendarMonth("Previous month")
            XCTAssertTrue(button("Next month").isEnabled)
            changeCalendarMonth("Next month")
            XCTAssertEqual(getCalendarMonthTitle().label, currentMonth)
            XCTAssertFalse(button("Next month").isEnabled)
        }
        let today = app.webViews.links.matching(NSPredicate(format: "label CONTAINS ', Today,'")).firstMatch
        XCTAssertTrue(today.exists, app.debugDescription)
        tap(today)
        XCTAssertFalse(button("Close calendar").exists)
        place("Bakery", at: "A1")
        tap(button("Back to home"))
        XCTAssertTrue(button("Continue today's puzzle").waitForExistence(timeout: 5))
        tap(button("Continue today's puzzle"))
        assertLot("A1", "Bakery")
        app.terminate()
        app.launchArguments = ["nookgrid-offline"]
        app.launch()
        XCTAssertTrue(button("Lot A1, Bakery").waitForExistence(timeout: 15))
        XCTAssertFalse(button("Continue today's puzzle").exists)
    }

    func testMovesSwapsUndoAndReset() {
        place("Bakery", at: "A1")
        place("Cafe", at: "A2")
        tap(lot("A1"))
        tap(lot("A2"))
        assertLot("A1", "Cafe")
        assertLot("A2", "Bakery")
        tap(button("Undo"))
        assertLot("A1", "Bakery")
        assertLot("A2", "Cafe")
        XCTAssertFalse(button("Put back").exists)
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
        let trayPlace = button("Bakery, already on the board")
        scrollTo(trayPlace)
        lot("B2").press(forDuration: 0.15, thenDragTo: trayPlace)
        assertLot("B2", "empty")
        XCTAssertTrue(button("Bakery, choose a lot").isEnabled)
        XCTAssertFalse(button("Put back").exists)
        tap(button("Undo"))
        assertLot("B2", "Bakery")
        XCTAssertTrue(button("Bakery, already on the board").exists)
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

    func testDailyStreakSurvivesResetRestartAndReplay() throws {
        for count in 0..<8 { reveal(count) }
        let remainingPlace = try XCTUnwrap(places.first { button("\($0), choose a lot").exists })
        let remainingLot = try XCTUnwrap(lots.first { button("Lot \($0), empty").exists })
        place(remainingPlace, at: remainingLot)
        XCTAssertTrue(app.staticTexts["Neighborhood complete"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1-day streak"].exists)
        XCTAssertTrue(button("Reset").isEnabled)
        tap(button("Reset"))
        for address in lots { assertLot(address, "empty") }
        XCTAssertTrue(button("Hint, 0 hints used").exists)
        XCTAssertTrue(button("Undo").isEnabled)
        openCalendar()
        XCTAssertTrue(app.staticTexts["1-day streak"].exists)
        XCTAssertTrue(app.webViews.links.matching(NSPredicate(format: "label CONTAINS ', Today, completed, daily streak day'")).firstMatch.exists, app.debugDescription)
        tap(button("Close calendar"))

        app.terminate()
        app.launchArguments = ["nookgrid-offline"]
        app.launch()
        XCTAssertTrue(button("Replay today's puzzle").waitForExistence(timeout: 15))
        tap(button("Replay today's puzzle"))
        XCTAssertTrue(button("Lot \(remainingLot), empty").waitForExistence(timeout: 5))
        for address in lots { assertLot(address, "empty") }
        XCTAssertTrue(button("Hint, 0 hints used").exists)
        XCTAssertFalse(button("Undo").isEnabled)
        openCalendar()
        XCTAssertTrue(app.staticTexts["1-day streak"].exists)
        XCTAssertTrue(app.webViews.links.matching(NSPredicate(format: "label CONTAINS ', Today, completed, daily streak day'")).firstMatch.exists, app.debugDescription)
        tap(button("Close calendar"))
        reveal(0)
        let fixed = app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Lot ' AND label ENDSWITH 'fixed by a hint'")).firstMatch
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        let fixedLabel = fixed.label
        tap(button("Reset"))
        XCTAssertTrue(button(fixedLabel).exists)
        XCTAssertFalse(button(fixedLabel).isEnabled)
        XCTAssertTrue(button("Hint, 1 hint used").exists)
        for count in 1..<8 { reveal(count) }
        let replayPlace = try XCTUnwrap(places.first { button("\($0), choose a lot").exists })
        let replayLot = try XCTUnwrap(lots.first { button("Lot \($0), empty").exists })
        place(replayPlace, at: replayLot)
        XCTAssertTrue(app.staticTexts["Neighborhood complete"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1-day streak"].exists)
        XCTAssertFalse(app.staticTexts["2-day streak"].exists)
    }

    func testTutorialResetClearsAllHintsAfterCompletionAndRestart() {
        openTutorial()
        for count in 0..<9 { reveal(count) }
        XCTAssertTrue(app.staticTexts["Nice work!"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["9 hints used."].exists)
        XCTAssertTrue(button("Reset").isEnabled)
        tap(button("Reset"))
        for address in lots { assertLot(address, "empty") }
        XCTAssertTrue(button("Hint, 0 hints used").exists)
        XCTAssertTrue(button("Undo").isEnabled)
        XCTAssertFalse(app.staticTexts["Nice work!"].exists)
        tap(button("Undo"))
        XCTAssertTrue(app.staticTexts["Nice work!"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["9 hints used."].exists)
        tap(button("View solved puzzle"))
        XCTAssertEqual(app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Lot ' AND label ENDSWITH 'fixed by a hint'")).count, 9)
        viewResult()
        tap(button("Reset"))
        for address in lots { assertLot(address, "empty") }

        app.terminate()
        app.launchArguments = ["nookgrid-offline"]
        app.launch()
        XCTAssertTrue(button("Settings").waitForExistence(timeout: 15))
        openCalendar()
        XCTAssertFalse(app.webViews.links.matching(NSPredicate(format: "label CONTAINS 'Tutorial'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["0-day streak"].exists)
        tap(button("Close calendar"))
        openTutorial()
        for address in lots { assertLot(address, "empty") }
        XCTAssertTrue(button("Hint, 0 hints used").exists)
        XCTAssertFalse(button("Undo").isEnabled)
        XCTAssertTrue(button("Bakery, choose a lot").isEnabled)
    }

    func testTutorialGuidanceAndSavedPuzzlesAreSeparate() {
        openArchive()
        place("Park", at: "C3")
        tap(button("Settings"))
        tap(app.webViews.links["Privacy"].firstMatch)
        tap(app.webViews.links["Back"].firstMatch)
        XCTAssertTrue(app.staticTexts["Sep 10, 2026 plan"].waitForExistence(timeout: 5))
        assertLot("C3", "Park")
        openTutorial()
        XCTAssertFalse(button("Park, choose a lot").exists)
        place("Bakery", at: "A1")
        XCTAssertTrue(button("Cafe, choose a lot").exists)
        tap(lot("A1"))
        XCTAssertFalse(button("Put back").exists)
        place("Cafe", at: "A2")
        place("Books", at: "A3")
        XCTAssertTrue(button("Park, choose a lot").exists)
        openArchive()
        assertLot("C3", "Park")
        assertLot("A1", "empty")
        openTutorial()
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
        tap(button("Calendar"))
        XCTAssertTrue(button("Close calendar").waitForExistence(timeout: 5))
        XCTAssertFalse(app.webViews.links.matching(NSPredicate(format: "label CONTAINS 'Tutorial'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["0-day streak"].exists)
        tap(button("Close calendar"))
        XCTAssertTrue(app.staticTexts["Nice work!"].exists)
    }

    private func getCalendarMonthTitle() -> XCUIElement {
        app.webViews.firstMatch.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{4}")).firstMatch
    }

    private func changeCalendarMonth(_ label: String) {
        let previousTitle = getCalendarMonthTitle().label
        XCTAssertFalse(previousTitle.isEmpty, app.debugDescription)
        tap(button(label))
        XCTAssertTrue(app.webViews.firstMatch.staticTexts[previousTitle].waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(getCalendarMonthTitle().exists, app.debugDescription)
    }

    private func goToCalendarBoundary(_ label: String) {
        for _ in 0..<120 {
            if !button(label).isEnabled { break }
            changeCalendarMonth(label)
        }
        XCTAssertFalse(button(label).isEnabled, "Calendar exceeded the ten-year puzzle bank")
    }

    private func openCalendar() {
        tap(button("Settings"))
        XCTAssertTrue(button("Close menu").waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Menu"].exists)
        tap(button("Calendar"))
        XCTAssertTrue(button("Close calendar").waitForExistence(timeout: 5))
        XCTAssertFalse(button("Close menu").exists)
        XCTAssertTrue(getCalendarMonthTitle().exists, app.debugDescription)
        XCTAssertTrue(button("Previous month").exists)
        XCTAssertTrue(button("Next month").exists)
    }

    private func openArchive() {
        openCalendar()
        goToCalendarBoundary("Previous month")
        XCTAssertEqual(getCalendarMonthTitle().label, "September 2026")
        tap(app.webViews.links.matching(NSPredicate(format: "label BEGINSWITH 'Thursday, September 10, 2026,'")).firstMatch)
        XCTAssertTrue(app.staticTexts["Sep 10, 2026 plan"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(button("Close calendar").exists)
    }

    private func openToday() {
        openCalendar()
        goToCalendarBoundary("Next month")
        tap(app.webViews.links.matching(NSPredicate(format: "label CONTAINS ', Today,'")).firstMatch)
        XCTAssertTrue(button("How to play").waitForExistence(timeout: 5))
        XCTAssertTrue(button("Close calendar").waitForNonExistence(timeout: 5), app.debugDescription)
    }

    func testArchiveNavigation() {
        openArchive()
        place("Bakery", at: "A1")
        tap(button("How to play"))
        XCTAssertTrue(button("Close how to play").waitForExistence(timeout: 5))
        tap(button("Close how to play"))
        XCTAssertTrue(app.staticTexts["Sep 10, 2026 plan"].exists)
        assertLot("A1", "Bakery")
        openToday()
        assertLot("A1", "empty")
        openTutorial()
        XCTAssertFalse(button("Close how to play").exists)
        assertLot("A1", "empty")
    }

    func testDialogsDismiss() {
        let planTitle = app.staticTexts["Today’s plan"]
        XCTAssertTrue(planTitle.exists, app.debugDescription)
        let headerY = app.webViews.links["NookGrid home"].frame.minY
        tap(button("How to play"))
        XCTAssertTrue(button("Close how to play").waitForExistence(timeout: 5))
        XCTAssertTrue(app.webViews.links["Play tutorial"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Tab to move focus'")).firstMatch.exists)
        for label in ["Fits this layout", "Needs a change", "Directly left", "Above", "Touching"] {
            XCTAssertTrue(app.staticTexts[label].exists, label)
        }
        captureScreenshot("How to play over today's puzzle")
        tap(button("Close how to play"))
        XCTAssertFalse(button("Close how to play").exists)
        XCTAssertTrue(planTitle.exists)
        XCTAssertTrue(button("Park, choose a lot").exists)
        XCTAssertEqual(app.webViews.links["NookGrid home"].frame.minY, headerY, accuracy: 1)
        assertLot("A1", "empty")
        openTutorial()
        tap(button("How to play"))
        XCTAssertTrue(button("Close how to play").waitForExistence(timeout: 5))
        XCTAssertFalse(app.webViews.links["Play tutorial"].firstMatch.exists)
        captureScreenshot("How to play over Tutorial")
        tap(button("Close how to play"))
        XCTAssertFalse(button("Close how to play").exists)
        XCTAssertTrue(button("Bakery, choose a lot").isHittable)
        assertLot("A1", "empty")
        tap(button("How to play"))
        XCTAssertFalse(app.webViews.links["Worked example"].exists)
        tap(button("Close how to play"))
        XCTAssertTrue(button("Bakery, choose a lot").isHittable)
        assertLot("A1", "empty")
        openToday()
        tap(button("Settings"))
        let menu = app.webViews.firstMatch.descendants(matching: .other)
            .matching(NSPredicate(format: "label == 'Menu, web dialog'")).firstMatch
        tap(menu.descendants(matching: .any).matching(NSPredicate(format: "label == 'Settings'")).firstMatch)
        XCTAssertTrue(button("Close settings").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Test mode: analytics are off."].exists)
        captureScreenshot("Settings")
        tap(button("Close settings"))
        tap(button("Hint, 0 hints used"))
        captureScreenshot("Hint touch focus")
        tap(button("Cancel"))
        XCTAssertFalse(app.staticTexts["Reveal a place?"].exists)
        tap(button("Settings"))
        tap(button("Feedback"))
        XCTAssertTrue(button("Close feedback").waitForExistence(timeout: 5))
        let emailLink = app.webViews.links["Email us"].firstMatch
        XCTAssertTrue(emailLink.exists)
        XCTAssertTrue(emailLink.isHittable)
        // WKWebView reports link text bounds; browser checks measure the full target.
        XCTAssertGreaterThanOrEqual(button("Close feedback").frame.width, 44)
        XCTAssertGreaterThanOrEqual(button("Close feedback").frame.height, 44)
        for target in [button("Close feedback"), emailLink] {
            XCTAssertGreaterThanOrEqual(target.frame.minY, 20, target.label)
            XCTAssertLessThanOrEqual(target.frame.maxY, app.frame.maxY - 8, target.label)
        }
        captureScreenshot("Native feedback")
        tap(button("Close feedback"))
        openCalendar()
        captureScreenshot("Calendar")
        tap(button("Close calendar"))
        XCTAssertFalse(button("Close calendar").exists)
        tap(button("Settings"))
        captureScreenshot("Menu touch focus")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.15)).tap()
        XCTAssertFalse(button("Close menu").exists)
        tap(button("Settings"))
        tap(app.webViews.links["Privacy"].firstMatch)
        let returnLink = app.webViews.links["Back"].firstMatch
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
        XCTAssertTrue(app.staticTexts["Neighborhood complete"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["9 hints used."].exists)
        tap(button("Share result"))
        let copy = app.cells["Copy"].firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 60), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'https://nookgrid.com/' AND label CONTAINS '9 hints' AND label CONTAINS 'Solved in '")).firstMatch.exists, app.debugDescription)
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
        XCTAssertTrue(app.staticTexts["Neighborhood complete"].exists)
    }
}
