# Native iOS checks

Run `npm run build:ios`, then `npm run test:ios` on a Mac with Xcode and an installed iPhone Simulator runtime. The runner uses two build jobs and a headless, dedicated NookGrid QA simulator. It never erases an existing device.

Use `NOOKGRID_TEST_ALL_SIZES=1 npm run test:ios` to also run the suite on an available smaller iPhone. Use `NOOKGRID_SIMULATOR_ID=<UUID>` to select a simulator explicitly. `NOOKGRID_IOS_TEST=<method>` narrows a diagnosis to one test method.

The XCTest suite drives the bundled app through iOS accessibility and touch events. It checks tap placement, swapping, removal, undo, reset, dragging, fixed hints, process restart, Tutorial guidance, saved boards, background timer behavior, dialog dismissal, completion and the native share sheet. Launch metrics and screenshots are saved with the results.

Every test launches Debug with remote HTTP/HTTPS requests blocked. Debug also disables analytics. The runner rejects live-reload URLs and analytics-enabled bundles before launching. Test state is cleared inside this app only, using a launch argument compiled out of Release builds.

Results are in `artifacts/ios/NookGrid.xcresult` and `artifacts/ios/xcodebuild-1.log`. A second device writes `NookGrid-2.xcresult` and `xcodebuild-2.log`. Browser scenarios and exhaustive puzzle validation run separately through `npm run test:e2e` and `npm test`.

Simulator checks do not replace a physical iPhone pass for gestures, sharing and lifecycle behavior before App Store submission.

## Current coverage

The suite now contains fourteen scenarios, including Home press behavior, calendar/continue, saved streaks, fresh Tutorial replay and native background timing. The September 24 source passed all fourteen in CI without retries. Verify the run for each new release commit; that result does not establish delivery or a physical-device pass.

## Historical measurements, September 17, 2026

| Simulator | Native scenarios | Responsive launch, three-run mean |
| --- | --- | --- |
| iPhone SE, third generation, iOS 18.2 | 10 passed | 0.84 seconds |
| iPhone 16 Pro, iOS 18.6 | 10 passed | 0.93 seconds |
| iPhone 17 Pro, iOS 26.4 | 10 passed | 1.09 seconds |

The stacked layout keeps the plan, board, items and actions in reading order. Small screens scroll vertically; test gestures scroll through the empty gutter before interacting with offscreen controls. Empty, scrolled and solved screenshots were visually inspected; the fixed status-bar background stays clear of game content. The suite includes explicit foreground readiness and share-sheet dismissal waits. Launch numbers describe this simulator environment, not physical-device performance.

The iOS 26.4 run verified the larger mobile tray and shared Phosphor icons inside WKWebView. It completed all ten scenarios in 168 seconds, including native share dismissal, reopening and copying. The runner waits for simulator boot readiness before testing. Native share controls use direct taps and support both a Close button and the newer popover dismissal region.

Physical-device, minimum-supported-OS, iPad, rotation, text-scaling and VoiceOver checks remain gates before public App Store submission. A signed internal TestFlight beta is available for owner testing.
